import * as THREE from 'three';

const vertex = `
  varying vec2 screenUv;

  void main() {
    screenUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragment = `
  uniform sampler2D frame;
  uniform vec2 center;
  uniform float aspect;
  uniform float progress;
  uniform float strength;
  uniform vec3 tint;
  varying vec2 screenUv;

  float gaussian(float x) {
    return exp(-x * x);
  }

  void main() {
    vec2 metric = vec2(aspect, 1.0);
    vec2 delta = (screenUv - center) * metric;
    float distance = length(delta);
    float radius = mix(0.022, 1.02, pow(progress, 0.77));
    float edge = distance - radius;
    float band = edge / mix(0.045, 0.026, progress);
    float envelope = smoothstep(0.0, 0.075, progress)
      * (1.0 - smoothstep(0.25, 1.0, progress)) * strength;
    float lens = gaussian(band * 1.15);
    float crest = gaussian((edge + 0.001) / 0.005);
    float echo = gaussian((edge + 0.054) / 0.009);
    vec2 radial = delta / max(distance, 0.0001) / metric;

    // Opposite sides of the crest bend in opposite directions like a moving lens.
    vec2 sampleUv = screenUv + radial * (0.070 * band * lens * envelope);
    vec4 color = texture2D(frame, sampleUv);
    if (lens * envelope > 0.008) {
      vec2 spread = radial * (0.010 * lens * envelope);
      vec4 red = texture2D(frame, sampleUv + spread);
      vec4 blue = texture2D(frame, sampleUv - spread);
      color = vec4(red.r, color.g, blue.b, max(color.a, max(red.a, blue.a)));
    }
    float light = envelope * (crest * 0.31 + echo * 0.082 + lens * 0.052);
    color.rgb += mix(tint, vec3(0.94, 0.99, 1.0), crest * 0.6) * light;
    color.a = min(1.0, color.a + light * 0.24);
    gl_FragColor = color;
  }
`;

export class Refraction {
  constructor(renderer) {
    this.renderer = renderer;
    this.size = new THREE.Vector2();
    this.projected = new THREE.Vector3();
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();
    this.uniforms = {
      frame: { value: null },
      center: { value: new THREE.Vector2() },
      aspect: { value: 1 },
      progress: { value: 0 },
      strength: { value: 1 },
      tint: { value: new THREE.Color() }
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: vertex, fragmentShader: fragment,
      depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  render(origin, camera, progress, color, strength) {
    const { x: width, y: height } = this.renderer.getDrawingBufferSize(this.size);
    if (!width || !height) return;
    const uniforms = this.uniforms;
    const current = uniforms.frame.value;
    if (current?.image.width !== width || current?.image.height !== height) {
      current?.dispose();
      const frame = new THREE.FramebufferTexture(width, height);
      frame.minFilter = frame.magFilter = THREE.LinearFilter;
      uniforms.frame.value = frame;
    }
    const { x, y } = this.projected.copy(origin).project(camera);
    uniforms.center.value.set((x + 1) / 2, (y + 1) / 2);
    uniforms.aspect.value = width / height;
    uniforms.progress.value = progress;
    uniforms.strength.value = strength;
    uniforms.tint.value.set(color).convertLinearToSRGB();

    // The copied canvas is already in output color space.
    this.renderer.copyFramebufferToTexture(uniforms.frame.value);
    this.renderer.render(this.scene, this.camera);
  }
}
