import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BELT_CELLS, BELT_LENGTH, BELT_STEP, LANES, ROWS, TILES } from './game.js';
import { Refraction } from './refraction.js';

const CELL = 1.06;
const RAMP_RISE = .168;
const HALF_WIDTH = LANES * CELL / 2;
const RAMP_ANGLE = Math.atan(RAMP_RISE);
const RAMP_PITCH = BELT_STEP / Math.cos(RAMP_ANGLE);
const TILE_HEIGHT = .218;
const TILE_DEPTH = RAMP_PITCH - TILE_HEIGHT;
const TILE_BEVEL = .047;
const BIN_TOP = .085;
const BIN_STEP = TILE_DEPTH + .026;
const BIN_Z = 1.56;
const BIN_ROTATION = Math.PI / 2;
const TAU = Math.PI * 2;
const ENTRY_TIME = .40;
const PALETTES = [
  ['#8c8aff', '#64dfff', '#d774ff'],
  ['#ed79ff', '#e19dff', '#ff7894'],
  ['#50e6ce', '#a3e9fc', '#c194ff'],
  ['#55b7ff', '#7de3ff', '#6290ff'],
  ['#ff9c73', '#ffc585', '#f074c4'],
  ['#a594ff', '#71deff', '#f4caff']
];

const laneX = lane => (lane - 2) * CELL;
const binY = row => BIN_TOP - (ROWS - row - .5) * BIN_STEP;
const rampY = distance => .38 + distance * RAMP_RISE;
const point = (x, y, z) => new THREE.Vector3(x, y, z);
const binPoint = (lane, row) => point(laneX(lane), binY(row), BIN_Z);
const stackPoint = (x, index) => point(x, .43 + index * .237, .49);

function beltPose(lane, distance, reduced) {
  const progress = THREE.MathUtils.clamp((BELT_LENGTH - distance) / BELT_STEP, 0, BELT_CELLS);
  const cell = Math.floor(progress + 1e-8);
  const phase = progress - cell;
  const start = (cell - BELT_CELLS + .5) * RAMP_PITCH;
  let y = TILE_HEIGHT / 2;
  let z = start + phase * RAMP_PITCH;
  let turn = 0;
  if (!reduced) {
    // Roll around the leading bottom edge, then the next bottom edge.
    const standing = phase >= .61;
    const step = standing ? (phase - .61) / .39 : THREE.MathUtils.smoothstep(phase, .18, .61);
    const angle = (standing ? step * step : step) * Math.PI / 2;
    const forward = standing ? TILE_HEIGHT : TILE_DEPTH;
    const height = standing ? TILE_DEPTH : TILE_HEIGHT;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const pivot = start + TILE_DEPTH / 2 + (standing ? TILE_HEIGHT : 0);
    y = height / 2 * cos + forward / 2 * sin - TILE_BEVEL * (cos + sin - 1);
    z = pivot + height / 2 * sin - forward / 2 * cos;
    turn = cell % 2 * Math.PI + (standing ? Math.PI / 2 : 0) + angle;
  }
  const cos = Math.cos(RAMP_ANGLE);
  const sin = Math.sin(RAMP_ANGLE);
  return {
    position: point(laneX(lane), rampY(0) + y * cos - z * sin, y * sin + z * cos),
    rotation: RAMP_ANGLE + turn
  };
}

function surface(color, metalness = .2, roughness = .42) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function luminous(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color, transparent: opacity < 1, opacity, depthWrite: opacity === 1, toneMapped: false
  });
}

function mesh(parent, geometry, material, x, y, z) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}

function box(parent, material, x, y, z, width, height, depth) {
  return mesh(parent, new THREE.BoxGeometry(width, height, depth), material, x, y, z);
}

function batchBoxes(parent, movable = []) {
  const groups = new Map();
  for (const object of parent.children) {
    if (object.geometry?.type !== 'BoxGeometry' || movable.includes(object)) continue;
    if (!groups.has(object.material)) groups.set(object.material, []);
    groups.get(object.material).push(object);
  }
  for (const [material, objects] of groups) {
    if (objects.length < 2) continue;
    const shapes = objects.map(object => {
      object.updateMatrix();
      return object.geometry.clone().applyMatrix4(object.matrix);
    });
    mesh(parent, mergeGeometries(shapes), material, 0, 0, 0);
    for (const object of objects) object.removeFromParent();
    for (const shape of shapes) shape.dispose();
  }
}

function canvasTexture(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  draw(canvas.getContext('2d'));
  return new THREE.CanvasTexture(canvas);
}

function makeGlow() {
  return canvasTexture(ctx => {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(.16, 'rgba(255,255,255,.52)');
    gradient.addColorStop(.47, 'rgba(255,255,255,.16)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  });
}

function makeTileFace(symbol) {
  return canvasTexture(ctx => {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 51px "Segoe UI Symbol", sans-serif';
    ctx.strokeStyle = 'rgba(255,255,255,.61)';
    ctx.lineWidth = 2;
    ctx.strokeRect(9, 9, 110, 110);
    ctx.fillStyle = 'rgba(10,12,38,.72)';
    ctx.fillText(symbol, 64, 66);
    ctx.fillStyle = 'rgba(255,255,255,.74)';
    for (const x of [15, 110]) {
      for (const y of [15, 110]) ctx.fillRect(x, y, 3, 3);
    }
  });
}

function seededRandom() {
  let seed = 276291;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function makeFog() {
  const random = seededRandom();
  const layers = [5, 9, 17, 33].map(size => ({
    size, values: Float32Array.from({ length: size * size }, random)
  }));
  const weights = [.48, .27, .16, .09];
  return canvasTexture(ctx => {
    const { width, height } = ctx.canvas;
    const image = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const u = x / (width - 1);
        const v = y / (height - 1);
        const edge = Math.max(0, 1 - Math.hypot(u * 2 - 1, v * 2 - 1));
        let cloud = 0;
        for (const [index, { size, values }] of layers.entries()) {
          const sx = u * (size - 1);
          const sy = v * (size - 1);
          const ix = Math.min(size - 2, Math.floor(sx));
          const iy = Math.min(size - 2, Math.floor(sy));
          const tx = THREE.MathUtils.smoothstep(sx - ix, 0, 1);
          const ty = THREE.MathUtils.smoothstep(sy - iy, 0, 1);
          const offset = iy * size + ix;
          const top = THREE.MathUtils.lerp(values[offset], values[offset + 1], tx);
          const bottom = THREE.MathUtils.lerp(values[offset + size], values[offset + size + 1], tx);
          cloud += weights[index] * THREE.MathUtils.lerp(top, bottom, ty);
        }
        const pixel = (y * width + x) * 4;
        image.data[pixel] = image.data[pixel + 1] = image.data[pixel + 2] = 255;
        image.data[pixel + 3] = 255 * THREE.MathUtils.smoothstep(cloud, .27, .74) * edge ** 1.25;
      }
    }
    ctx.putImageData(image, 0, 0);
  });
}

export class StageScene {
  constructor(viewport) {
    this.viewport = viewport;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    viewport.append(this.renderer.domElement);
    this.refraction = new Refraction(this.renderer);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, .1, 120);
    this.camera.position.set(0, 7.3, 14.5);
    this.camera.lookAt(0, .4, -3.05);
    this.scene.add(new THREE.HemisphereLight(0xc9dfff, 0x27144f, 2.3));
    this.addLight(0x98c7ff, 3.1, -3, 8, 3);
    this.addLight(0xd68fff, 2.1, 5, 3, -7);
    this.addLight(0xd1dbff, 1.45, .5, 1.1, 8);
    this.glowTexture = makeGlow();
    this.parts = new Map();
    this.flights = new Map();
    this.entries = new Map();
    this.sparks = [];
    this.rings = [];
    this.charge = null;
    this.ripple = null;
    this.tempo = 0;
    this.clock = 0;
    this.pulse = 0;
    this.beatGlow = 0;
    this.shake = 0;
    this.paddleX = 0;
    this.core = luminous(PALETTES[0][0]);
    this.secondary = luminous(PALETTES[0][1]);
    this.tertiary = luminous(PALETTES[0][2]);
    this.board = new THREE.Group();
    this.scene.add(this.board);
    this.buildBelt();
    this.buildBins();
    batchBoxes(this.board, this.selected);
    this.buildAtmosphere();
    this.makePieces();
    this.theme(1);
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(viewport);
  }

  addLight(color, intensity, x, y, z) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    this.scene.add(light);
  }

  glow(parent, color, x, y, z, sx, sy, opacity) {
    const material = new THREE.SpriteMaterial({
      map: this.glowTexture, color, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(sx, sy, 1);
    parent.add(sprite);
    return sprite;
  }

  buildBelt() {
    const ramp = new THREE.Group();
    ramp.position.set(0, rampY(BELT_LENGTH / 2), -BELT_LENGTH / 2);
    ramp.rotation.x = RAMP_ANGLE;
    this.board.add(ramp);
    const length = BELT_CELLS * RAMP_PITCH;
    const chassis = surface('#121735', .56);
    const raised = surface('#252b58', .44);
    const slate = surface('#192340', .39);
    const slateAlt = surface('#232650', .4);
    const divider = luminous('#3d4b85');
    const seam = luminous('#5465b2', .48);
    const panelGeometry = new THREE.BoxGeometry(CELL - .075, .028, RAMP_PITCH - .055);
    box(ramp, chassis, 0, -.22, 0, HALF_WIDTH * 2 + .35, .36, length + .18);
    for (let lane = 0; lane < LANES; lane++) {
      for (let i = 0; i < BELT_CELLS; i++) {
        const z = (i - (BELT_CELLS - 1) / 2) * RAMP_PITCH;
        mesh(ramp, panelGeometry, (lane + i) % 3 ? slate : slateAlt, laneX(lane), -.017, z);
        box(ramp, seam, laneX(lane), .003, z + RAMP_PITCH / 2 - .045, CELL - .17, .005, .012);
      }
    }
    for (let lane = 1; lane < LANES; lane++) {
      box(ramp, divider, -HALF_WIDTH + lane * CELL, .007, 0, .013, .012, length);
    }
    for (const side of [-1, 1]) {
      const x = side * (HALF_WIDTH + .1);
      const light = side < 0 ? this.tertiary : this.secondary;
      box(ramp, raised, x, .05, 0, .18, .16, length + .22);
      box(ramp, light, x - side * .066, .133, 0, .027, .008, length + .21);
      box(ramp, this.core, x + side * .09, -.095, 0, .012, .026, length + .21);
      for (let i = 0; i < BELT_CELLS; i++) {
        box(ramp, light, x + side * .11, .04, (i - (BELT_CELLS - 1) / 2) * RAMP_PITCH, .032, .042, .15);
      }
    }
    for (const z of [-length / 2, length / 2]) {
      box(ramp, raised, 0, -.062, z, HALF_WIDTH * 2 + .16, .11, .13);
      box(ramp, this.core, 0, -.006, z, HALF_WIDTH * 2 + .12, .016, .035);
    }
    batchBoxes(ramp);
    this.gateGlow = this.glow(this.board, PALETTES[0][0], 0, rampY(BELT_LENGTH), -BELT_LENGTH - .2, 8.2, 2.8, .53);
    this.runners = [];
    for (const x of [-HALF_WIDTH - .17, HALF_WIDTH + .17]) {
      const runner = this.glow(this.board, '#e1d5ff', x, .6, -2, 1.5, .92, .57);
      this.runners.push(runner);
    }
  }

  buildBins() {
    const chassis = surface('#151834', .42);
    const edge = surface('#262548', .38);
    const cell = surface('#0d142c', .18);
    const cellAlt = surface('#161b37', .24);
    const cellGeometry = new THREE.BoxGeometry(CELL - .13, BIN_STEP - .06, .042);
    const rim = luminous('#55487f', .75);
    const height = ROWS * BIN_STEP;
    const bottom = BIN_TOP - height;
    const mid = BIN_TOP - height / 2;
    const back = BIN_Z - .31;
    box(this.board, chassis, 0, mid, back - .16, HALF_WIDTH * 2 + .35, height + .18, .27);
    box(this.board, edge, 0, bottom - .083, BIN_Z - .05, HALF_WIDTH * 2 + .36, .17, .63);
    box(this.board, this.core, 0, bottom - .10, BIN_Z + .269, HALF_WIDTH * 2 + .32, .023, .012);
    box(this.board, edge, 0, BIN_TOP + .035, back - .022, HALF_WIDTH * 2 + .32, .10, .16);
    this.selected = [];
    for (let lane = 0; lane < LANES; lane++) {
      const x = laneX(lane);
      for (let row = 0; row < ROWS; row++) {
        const y = binY(row);
        mesh(this.board, cellGeometry, row % 2 ? cellAlt : cell, x, y, back);
        box(this.board, rim, x, y - BIN_STEP / 2 + .036, back + .024, CELL - .13, .012, .009);
      }
      const mark = box(this.board, this.secondary, x, bottom - .047, BIN_Z + .270, .24, .036, .013);
      this.selected.push(mark);
    }
    for (let lane = 1; lane < LANES; lane++) {
      const x = -HALF_WIDTH + lane * CELL;
      box(this.board, edge, x, mid, BIN_Z - .10, .067, height + .035, .43);
      box(this.board, rim, x, mid, BIN_Z + .117, .019, height, .009);
    }
    for (const side of [-1, 1]) {
      const x = side * (HALF_WIDTH + .072);
      box(this.board, edge, x, mid, BIN_Z - .10, .15, height + .17, .50);
      box(this.board, this.core, x, mid, BIN_Z + .154, .022, height, .010);
    }
    box(this.board, surface('#08091c'), 0, -.32, .59, HALF_WIDTH * 2 + .1, .12, 1.04);
    box(this.board, edge, 0, -.03, .49, HALF_WIDTH * 2 + .17, .10, .29);
    this.paddle = new THREE.Group();
    this.board.add(this.paddle);
    const paddleBase = surface('#344275', .42);
    box(this.paddle, paddleBase, 0, .18, .45, CELL - .04, .19, .82);
    box(this.paddle, this.secondary, 0, .23, .854, CELL - .08, .067, .026);
    box(this.paddle, this.secondary, 0, .28, .50, CELL - .12, .015, .48);
    box(this.paddle, luminous('#2a3f67'), 0, .29, .50, CELL - .23, .008, .39);
    for (const x of [-.46, .46]) box(this.paddle, this.secondary, x, .249, .5, .026, .037, .63);
    this.paddleGlow = this.glow(this.paddle, PALETTES[0][1], 0, .14, .91, 2.1, .87, .43);
    this.placement = mesh(this.board, new THREE.PlaneGeometry(.90, BIN_STEP - .09), new THREE.MeshBasicMaterial({
      color: '#7ae5ff', transparent: true, opacity: .14, depthWrite: false, toneMapped: false
    }), 0, 0, back + .036);
  }

  buildAtmosphere() {
    const random = seededRandom();
    this.fogScene = new THREE.Scene();
    this.fogCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 12);
    this.fogCamera.position.z = 5;
    const fogMap = makeFog();
    this.fog = Array.from({ length: 24 }, (_, i) => {
      const material = new THREE.SpriteMaterial({
        map: fogMap, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: false, toneMapped: false
      });
      const sprite = new THREE.Sprite(material);
      const x = (i % 6) * .37 - .92 + (random() - .5) * .38;
      const y = Math.floor(i / 6) * .52 - .73 + (random() - .5) * .32;
      const scale = .68 + random() * .67;
      sprite.scale.set(scale * 1.6, scale * (.6 + random() * .45), 1);
      this.fogScene.add(sprite);
      return {
        sprite, x, y, speed: .092 + random() * .15, phase: random() * TAU,
        opacity: .17 + random() * .22, angle: (random() - .5) * 1.6,
        tint: x < -.18 ? 0 : x > .24 ? 2 : 1
      };
    });
    this.dust = [];
    for (let layer = 0; layer < 3; layer++) {
      const positions = [];
      const colors = [];
      const count = [270, 125, 35][layer];
      for (let i = 0; i < count; i++) {
        const x = (random() - .5) * 49;
        const y = (random() - .56) * 22;
        const z = (random() - .73) * 42;
        const tint = new THREE.Color(x < 0 ? '#859dff' : '#e495fa');
        tint.multiplyScalar(.43 + random() * .57);
        positions.push(x, y, z);
        colors.push(tint.r, tint.g, tint.b);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const stars = new THREE.Points(geometry, new THREE.PointsMaterial({
        map: this.glowTexture, size: [.11, .23, .43][layer], opacity: [.85, .7, .56][layer], transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, toneMapped: false
      }));
      this.scene.add(stars);
      this.dust.push(stars);
    }
    this.fieldGlow = this.glow(this.scene, PALETTES[0][2], 3, .2, -13, 18, 13, .35);
    this.glow(this.scene, '#3752ff', -6, 1, -15, 15, 13, .39);
    this.frontGlow = this.glow(this.board, PALETTES[0][0], 0, BIN_TOP - ROWS * BIN_STEP - .12, BIN_Z + .28, 7, 1.8, .24);
    this.sparkGeometry = new THREE.OctahedronGeometry(.05);
    this.shardGeometry = new THREE.OctahedronGeometry(.11).scale(.72, 1.65, .45);
    this.sparkMaterials = TILES.map(tile => luminous(tile.color));
    this.ringGeometry = new THREE.RingGeometry(.91, 1, 72);
    const x = .442;
    const y = (BIN_STEP - .028) / 2;
    this.chargeFrame = new THREE.BufferGeometry().setFromPoints([
      point(-x, -y, 0), point(x, -y, 0), point(x, y, 0), point(-x, y, 0)
    ]);
  }

  makePieces() {
    this.pieceBody = new RoundedBoxGeometry(.83, TILE_HEIGHT, TILE_DEPTH, 2, TILE_BEVEL);
    this.pieceTrim = new RoundedBoxGeometry(.795, .06, TILE_DEPTH - .035, 2, .03);
    this.pieceFace = new THREE.PlaneGeometry(.69, TILE_DEPTH - .13);
    this.pieceGlint = new THREE.BoxGeometry(.66, .012, .018);
    this.tileMaterials = TILES.map(({ color, symbol }) => {
      const crystal = new THREE.Color(color);
      const trimColor = crystal.clone().lerp(new THREE.Color('#ffffff'), .31);
      return {
        body: new THREE.MeshStandardMaterial({
          color: crystal.clone().multiplyScalar(.42), metalness: .5, roughness: .26,
          emissive: crystal, emissiveIntensity: .19
        }),
        trim: new THREE.MeshStandardMaterial({
          color: trimColor, metalness: .3, roughness: .33, emissive: crystal, emissiveIntensity: .52
        }),
        glint: luminous(trimColor),
        face: new THREE.MeshBasicMaterial({ map: makeTileFace(symbol), transparent: true, depthWrite: false, toneMapped: false })
      };
    });
  }

  getPart(tile) {
    let part = this.parts.get(tile.id);
    if (part) return part;
    part = new THREE.Group();
    this.board.add(part);
    const mats = this.tileMaterials[tile.color];
    mesh(part, this.pieceBody, mats.body, 0, 0, 0);
    for (const side of [-1, 1]) {
      mesh(part, this.pieceTrim, mats.trim, 0, side * .082, 0);
      mesh(part, this.pieceGlint, mats.glint, 0, side * .112, TILE_DEPTH / 2 - .045);
      const decal = mesh(part, this.pieceFace, mats.face, 0, side * .115, 0);
      decal.rotation.x = -side * Math.PI / 2;
    }
    this.glow(part, TILES[tile.color].color, 0, 0, 0, 1.58, 1.18, .27);
    this.parts.set(tile.id, part);
    return part;
  }

  theme(wave) {
    const [primary, second, third] = PALETTES[(wave - 1) % PALETTES.length];
    this.core.color.set(primary);
    this.secondary.color.set(second);
    this.tertiary.color.set(third);
    this.gateGlow.material.color.set(primary);
    this.paddleGlow.material.color.set(second);
    this.fieldGlow.material.color.set(third);
    this.frontGlow.material.color.set(primary);
    this.placement.material.color.set(second);
    const fogTints = [new THREE.Color('#3338e4').lerp(new THREE.Color(second), .25), new THREE.Color(primary), new THREE.Color(third)];
    for (const fog of this.fog) fog.sprite.material.color.copy(fogTints[fog.tint]);
  }

  resize() {
    const w = this.viewport.clientWidth;
    const h = this.viewport.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const camera = this.camera;
    camera.aspect = w / h;
    camera.clearViewOffset();
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const corners = [];
    for (const x of [-HALF_WIDTH - .25, HALF_WIDTH + .25]) {
      corners.push(point(x, rampY(BELT_LENGTH) + .52, -BELT_LENGTH),
        point(x, BIN_TOP - ROWS * BIN_STEP - .17, BIN_Z + .30), point(x, 1.51, .45));
    }
    const projected = corners.map(corner => corner.project(camera));
    const left = Math.min(...projected.map(p => p.x));
    const right = Math.max(...projected.map(p => p.x));
    const low = Math.min(...projected.map(p => p.y));
    const high = Math.max(...projected.map(p => p.y));
    const topInset = w < 520 ? 42 : 62;
    const bottomInset = w < 520 ? 89 : 120;
    const usable = (h - topInset - bottomInset) / h;
    camera.zoom = Math.min((w < 520 ? 1.79 : 1.63) / (right - left), 2 * usable / (high - low));
    const desiredY = (bottomInset - topInset) / h;
    const viewX = (left + right) * camera.zoom * w / 4;
    const viewY = (desiredY - (low + high) * camera.zoom / 2) * h / 2;
    camera.setViewOffset(w, h, viewX, viewY, w, h);
    const edge = HALF_WIDTH + .18;
    const poolFront = BIN_Z + .15;
    const poolBottom = BIN_TOP - ROWS * BIN_STEP - .17;
    this.pointerRegions = [
      ['throw', [point(-edge, rampY(BELT_LENGTH), -BELT_LENGTH), point(-edge, .19, .09),
        point(edge, .19, .09), point(edge, rampY(BELT_LENGTH), -BELT_LENGTH)]],
      ['place', [point(-edge, BIN_TOP + .085, poolFront), point(-edge, poolBottom, poolFront),
        point(edge, poolBottom, poolFront), point(edge, BIN_TOP + .085, poolFront)]]
    ].map(([action, corners]) => [action, corners.map(corner => corner.project(camera))]);
    const [[, belt], [, pool]] = this.pointerRegions;
    this.pointerRegions.push(['paddle', [belt[1], pool[0], pool[3], belt[2]]]);
    const first = point(laneX(0), .28, .48).project(camera).x;
    const last = point(laneX(LANES - 1), .28, .48).project(camera).x;
    this.pointerLaneOrigin = (first + 1) * w / 2;
    this.pointerLaneWidth = (last - first) * w / (2 * (LANES - 1));
  }

  pointerAction(clientX, clientY) {
    const bounds = this.viewport.getBoundingClientRect();
    const x = (clientX - bounds.left) / bounds.width * 2 - 1;
    const y = 1 - (clientY - bounds.top) / bounds.height * 2;
    for (const [action, corners] of this.pointerRegions ?? []) {
      const inside = corners.every((a, i) => {
        const b = corners[(i + 1) % corners.length];
        return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0;
      });
      if (inside) return action;
    }
    return null;
  }

  pointerLane(clientX) {
    const x = clientX - this.viewport.getBoundingClientRect().left;
    return THREE.MathUtils.clamp(Math.round((x - this.pointerLaneOrigin) / this.pointerLaneWidth), 0, LANES - 1);
  }

  startEntry(tile) {
    const part = this.getPart(tile);
    const originals = part.children.map(child => child.material);
    const copies = new Map();
    part.children.forEach((child, index) => {
      const original = originals[index];
      if (!copies.has(original)) {
        const material = original.clone();
        material.transparent = true;
        material.depthWrite = false;
        material.opacity = 0;
        copies.set(original, material);
      }
      child.material = copies.get(original);
    });
    const p = beltPose(tile.lane, tile.distance, this.reduced.matches).position;
    let light;
    if (!this.reduced.matches) {
      light = this.glow(this.board, TILES[tile.color].color, p.x, p.y + .13, p.z, 1.30, .92, .37);
      this.burst(p, tile.color, 6, .55);
    }
    this.entries.set(tile.id, { part, originals, copies, light, age: 0 });
  }

  finishEntry(id, { part, originals, copies, light }) {
    part.children.forEach((child, index) => { child.material = originals[index]; });
    for (const material of copies.values()) material.dispose();
    if (light) {
      light.removeFromParent();
      light.material.dispose();
    }
    this.entries.delete(id);
  }

  animateTile(tile, from, to, duration, { lift = 0, startAngle = 0, endAngle = 0, entry, remove = false } = {}) {
    this.flights.set(tile.id, { tile, from, to, duration, age: 0, lift, startAngle, endAngle, entry, remove });
  }

  beginCharge(cells, duration) {
    this.endCharge();
    this.charge = { tiles: new Map(), duration, age: 0, lift: 0, scale: 1 };
    this.addChargeCells(cells);
  }

  addChargeCells(cells) {
    for (const { tile, lane, row } of cells) {
      const base = binPoint(lane, row);
      base.z += .15;
      const color = new THREE.Color(TILES[tile.color].color).lerp(new THREE.Color('#ffffff'), .38);
      const outline = new THREE.LineLoop(this.chargeFrame, new THREE.LineBasicMaterial({
        color, opacity: .58, transparent: true, depthWrite: false, toneMapped: false
      }));
      outline.position.copy(base);
      this.board.add(outline);
      const halo = this.glow(this.board, color, base.x, base.y, base.z, 1.62, 1.37, .20);
      this.charge.tiles.set(tile.id, { base, outline, halo });
    }
  }

  updateCharge(dt, reduced) {
    if (!this.charge) return;
    const charge = this.charge;
    charge.age += dt;
    const power = reduced ? .35 : THREE.MathUtils.smoothstep(charge.age, 0, charge.duration);
    charge.lift = reduced ? 0 : .14 * power;
    charge.scale = reduced ? 1 : 1 + .075 * power;
    for (const { base, outline, halo } of charge.tiles.values()) {
      outline.position.z = halo.position.z = base.z + charge.lift;
      outline.scale.setScalar(charge.scale);
      outline.material.opacity = .44 + .55 * power;
      halo.material.opacity = .14 + .68 * power;
    }
  }

  endCharge() {
    if (!this.charge) return;
    for (const { outline, halo } of this.charge.tiles.values()) {
      outline.removeFromParent();
      outline.material.dispose();
      halo.removeFromParent();
      halo.material.dispose();
    }
    this.charge = null;
  }

  event(type, data, game) {
    switch (type) {
      case 'start':
        this.resetEffects();
        this.theme(game.wave);
        this.paddleX = laneX(game.lane);
        this.beatGlow = 1;
        for (const tile of game.belt) this.startEntry(tile);
        break;
      case 'spawn':
        this.startEntry(data.tile);
        break;
      case 'catch': {
        const { tile, slot } = data;
        const to = stackPoint(laneX(game.lane), slot);
        const pose = beltPose(tile.lane, 0, this.reduced.matches);
        this.animateTile(tile, pose.position, to, .10, { lift: .13, startAngle: pose.rotation });
        this.burst(to, tile.color, 11, .62);
        break;
      }
      case 'place': {
        const { tile, lane, row, from, duration } = data;
        const catching = this.flights.has(tile.id) ? this.parts.get(tile.id) : undefined;
        this.animateTile(tile, catching?.position.clone() ?? stackPoint(this.paddleX, from), binPoint(lane, row), duration, {
          startAngle: catching?.rotation.x ?? 0,
          endAngle: BIN_ROTATION,
          entry: point(laneX(lane), BIN_TOP + TILE_DEPTH / 2 + .08, BIN_Z)
        });
        break;
      }
      case 'throw': {
        const { tile, from, duration } = data;
        const pose = beltPose(tile.lane, tile.distance, this.reduced.matches);
        this.animateTile(tile, stackPoint(this.paddleX, from), pose.position, duration, { lift: 1.58, endAngle: pose.rotation + TAU });
        break;
      }
      case 'miss': {
        const { tile } = data;
        const x = laneX(tile.lane);
        const pose = beltPose(tile.lane, 0, this.reduced.matches);
        this.animateTile(tile, pose.position, point(x, -2.1, .91), .4, {
          lift: .10, startAngle: pose.rotation, endAngle: TAU * 1.3, remove: true
        });
        this.burst(point(x, .1, .26), tile.color, 12, .85);
        this.shake = .17;
        break;
      }
      case 'highlight':
        this.beginCharge(data.cells, data.duration);
        break;
      case 'extend':
        this.addChargeCells(data.cells);
        break;
      case 'match': {
        this.endCharge();
        const center = point(0, 0, 0);
        for (const { tile, lane, row } of data.cells) {
          this.flights.delete(tile.id);
          const p = binPoint(lane, row);
          p.z += .23;
          this.burst(p, tile.color, 24, 2.8, 6);
          center.add(p);
        }
        center.divideScalar(data.cells.length);
        const color = TILES[data.cells[0].tile.color].color;
        this.ring(center, color, 0);
        this.ripple = {
          center, color, age: 0, duration: data.duration, strength: Math.min(1.26, 1 + (data.chain - 1) * .10)
        };
        for (const { tile, lane, row, from } of data.shifts) {
          this.animateTile(tile, binPoint(lane, from), binPoint(lane, row), .34, {
            startAngle: BIN_ROTATION, endAngle: BIN_ROTATION
          });
        }
        this.pulse = 1;
        this.shake = .20;
        break;
      }
      case 'over':
        this.endCharge();
        break;
      case 'clear':
        this.pulse = 1;
        this.ring(point(0, .22, 2), this.secondary.color);
        break;
      case 'blocked':
        this.shake = .08;
        break;
    }
  }

  resetEffects() {
    this.endCharge();
    this.ripple = null;
    for (const [id, entry] of this.entries) this.finishEntry(id, entry);
    for (const p of this.sparks) p.mesh.removeFromParent();
    for (const r of this.rings) {
      r.mesh.removeFromParent();
      r.mesh.material.dispose();
    }
    this.sparks.length = 0;
    this.rings.length = 0;
    this.flights.clear();
    this.pulse = this.shake = this.beatGlow = 0;
  }

  burst(origin, color, count, velocity, shards = 0) {
    if (this.reduced.matches) return;
    for (let i = 0; i < count + shards; i++) {
      const geometry = i < count ? this.sparkGeometry : this.shardGeometry;
      const spark = mesh(this.board, geometry, this.sparkMaterials[color], origin.x, origin.y + .14, origin.z);
      const angle = Math.random() * TAU;
      const speed = (.4 + Math.random()) * velocity;
      spark.rotation.set(angle, angle * .47, angle * .83);
      this.sparks.push({
        mesh: spark,
        velocity: point(Math.sin(angle) * speed, (.15 + Math.random()) * velocity, Math.cos(angle) * speed),
        life: .38 + Math.random() * .49,
        scale: .5 + Math.random() * 1.15
      });
    }
  }

  ring(p, color, rotation = -Math.PI / 2) {
    if (this.reduced.matches) return;
    const ring = mesh(this.board, this.ringGeometry, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    }), p.x, p.y, p.z);
    ring.rotation.x = rotation;
    this.rings.push({ mesh: ring, age: 0 });
  }

  showTile(tile, position, rotation, active) {
    const part = this.getPart(tile);
    active.add(tile.id);
    part.position.copy(position);
    part.rotation.set(rotation, 0, 0);
    part.scale.setScalar(1);
    return part;
  }

  showBelt(tile, active) {
    if (this.flights.has(tile.id)) return;
    const pose = beltPose(tile.lane, tile.distance, this.reduced.matches);
    this.showTile(tile, pose.position, pose.rotation, active);
  }

  render(game, dt, fast) {
    const motion = this.reduced.matches;
    const playing = game.phase === 'playing';
    const effectDt = game.phase === 'paused' ? 0 : dt;
    this.updateCharge(effectDt, motion);
    this.clock += effectDt;
    this.pulse = Math.max(0, this.pulse - effectDt * 1.35);
    this.beatGlow = Math.max(0, this.beatGlow - effectDt * 4);
    this.shake = Math.max(0, this.shake - effectDt);
    if (!game.conveyorPaused) this.tempo += effectDt * (fast ? 4 : 1.25);
    this.board.position.x = motion ? 0 : Math.sin(this.clock * 72) * this.shake * .22;
    this.gateGlow.material.opacity = .51 + this.pulse * .35 + (motion ? 0 : this.beatGlow * .20);
    this.fieldGlow.material.opacity = .34 + this.pulse * .38;
    this.frontGlow.material.opacity = .24 + this.pulse * .38;
    for (const fog of this.fog) {
      const t = fog.phase + (motion ? 0 : this.clock * fog.speed);
      fog.sprite.position.set(fog.x + Math.sin(t) * .30, fog.y + Math.cos(t * .86) * .19, 0);
      fog.sprite.material.rotation = fog.angle + Math.sin(t * .7) * .39;
      fog.sprite.material.opacity = fog.opacity * (.72 + .28 * Math.cos(t * 1.34)) + this.pulse * .055;
    }
    for (const [index, dust] of this.dust.entries()) {
      dust.rotation.z = motion ? 0 : Math.sin(this.clock * .09 + index) * .025;
      dust.position.y = motion ? 0 : Math.sin(this.clock * .22 + index) * .33;
    }
    for (const runner of this.runners) {
      const distance = BELT_LENGTH - this.tempo % BELT_LENGTH;
      runner.position.set(runner.position.x, rampY(distance) + .12, -distance);
      runner.visible = !motion;
    }
    this.paddleX = THREE.MathUtils.lerp(this.paddleX, laneX(game.lane), motion ? 1 : 1 - Math.exp(-dt * 32));
    this.paddle.position.x = this.paddleX;
    this.paddleGlow.material.opacity = .36 + .085 * game.stack.length;
    this.selected.forEach((mark, lane) => { mark.visible = lane === game.lane; });
    const nextRow = game.board[game.lane].length;
    this.placement.visible = playing && nextRow < ROWS;
    this.placement.position.x = laneX(game.lane);
    this.placement.position.y = binY(nextRow);
    this.placement.material.opacity = game.stack.length ? .28 : .11;

    const active = new Set();
    for (const tile of game.belt) this.showBelt(tile, active);
    game.stack.forEach((tile, i) => {
      if (!this.flights.has(tile.id)) this.showTile(tile, stackPoint(this.paddleX, i), 0, active);
    });
    game.board.forEach((column, lane) => column.forEach((tile, row) => {
      if (this.flights.has(tile.id)) return;
      const part = this.showTile(tile, binPoint(lane, row), BIN_ROTATION, active);
      if (this.charge?.tiles.has(tile.id)) {
        part.position.z += this.charge.lift;
        part.scale.setScalar(this.charge.scale);
      }
    }));
    for (const [id, flight] of this.flights) {
      flight.age += effectDt;
      const t = Math.min(1, flight.age / flight.duration);
      let pos;
      let turn = t;
      if (flight.entry) {
        const hop = .38;
        turn = Math.min(1, t / hop);
        pos = t < hop
          ? flight.from.clone().lerp(flight.entry, turn)
          : flight.entry.clone().lerp(flight.to, ((t - hop) / (1 - hop)) ** 2);
        if (!motion) pos.y += Math.sin(turn * Math.PI) * .16;
      } else {
        pos = flight.from.clone().lerp(flight.to, flight.lift ? t : t * t);
        if (!motion) pos.y += Math.sin(t * Math.PI) * flight.lift;
      }
      const angle = motion ? flight.endAngle % Math.PI : THREE.MathUtils.lerp(flight.startAngle, flight.endAngle, turn);
      const part = this.showTile(flight.tile, pos, angle, active);
      if (flight.remove) part.scale.setScalar(1 - .84 * t);
      if (t >= 1) this.flights.delete(id);
    }
    for (const [id, entry] of this.entries) {
      entry.age += effectDt;
      if (entry.age >= ENTRY_TIME || !active.has(id)) {
        this.finishEntry(id, entry);
        continue;
      }
      const opacity = THREE.MathUtils.smoothstep(entry.age, 0, ENTRY_TIME);
      for (const [original, material] of entry.copies) material.opacity = original.opacity * opacity;
      if (entry.light) entry.light.material.opacity = .37 * (1 - opacity);
    }
    for (const [id, part] of this.parts) {
      if (active.has(id)) continue;
      part.children.at(-1).material.dispose();
      part.removeFromParent();
      this.parts.delete(id);
    }
    this.sparks = this.sparks.filter(spark => {
      spark.life -= effectDt;
      spark.velocity.y -= effectDt * 3.15;
      spark.mesh.position.addScaledVector(spark.velocity, effectDt);
      spark.mesh.rotation.x += effectDt * 5;
      spark.mesh.rotation.y += effectDt * 2.1;
      spark.mesh.scale.setScalar(spark.scale * Math.min(1, spark.life * 3.8));
      if (spark.life > 0) return true;
      spark.mesh.removeFromParent();
      return false;
    });
    this.rings = this.rings.filter(ring => {
      ring.age += effectDt;
      ring.mesh.scale.setScalar(.19 + ring.age * 4.2);
      ring.mesh.material.opacity = Math.max(0, .8 - ring.age * 1.5);
      if (ring.age < .57) return true;
      ring.mesh.removeFromParent();
      ring.mesh.material.dispose();
      return false;
    });
    this.renderer.clear();
    this.renderer.render(this.fogScene, this.fogCamera);
    this.renderer.render(this.scene, this.camera);
    if (this.ripple) {
      const wave = this.ripple;
      wave.age += effectDt;
      if (wave.age >= wave.duration) {
        this.ripple = null;
      } else if (!motion) {
        const origin = wave.center.clone().add(this.board.position);
        this.refraction.render(origin, this.camera, wave.age / wave.duration, wave.color, wave.strength);
      }
    }
  }
}
