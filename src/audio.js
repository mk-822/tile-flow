const STEPS = [0, 2, 3, 7, 9, 12, 14, 16, 19];
const MASTER_GAIN = .68;
const MUSIC_GAIN = .18;
export const TRACKS = [
  { title: 'Firmament2_Calm', file: 'firmament2-calm.mp3', bpm: 128, source: 'https://peritune.com/blog/2018/05/16/firmament2/' },
  { title: 'Cyber_Noir', file: 'cyber-noir.mp3', bpm: 100, source: 'https://peritune.com/blog/2021/08/31/cyber_noir/' },
  { title: 'Machinery', file: 'machinery.mp3', bpm: 128, source: 'https://peritune.com/blog/2016/08/05/machinery/' },
  { title: 'Polar_Lights', file: 'polar-lights.mp3', bpm: 110, source: 'https://peritune.com/blog/2021/12/01/polar_lights/' },
  { title: 'Cyberpunk_City', file: 'cyberpunk-city.mp3', bpm: 138, source: 'https://peritune.com/blog/2020/05/22/cyberpunk_city/' },
  { title: 'Soaring', file: 'soaring.mp3', bpm: 137, source: 'https://peritune.com/blog/2021/01/01/soaring/' },
  { title: 'Unknown_Cities', file: 'unknown-cities.mp3', bpm: 140, source: 'https://peritune.com/blog/2022/06/05/unknown_cities/' },
  { title: 'Irregular', file: 'irregular.mp3', bpm: 165, source: 'https://peritune.com/blog/2020/02/28/irregular/' },
  { title: 'Dream_and_Reality', file: 'dream-and-reality.mp3', bpm: 88, source: 'https://peritune.com/blog/2022/03/16/dream_and_reality/' },
  { title: 'Awayuki', file: 'awayuki.mp3', bpm: 85, source: 'https://peritune.com/blog/2023/01/07/awayuki/' },
  { title: 'SnowChill', file: 'snowchill.mp3', bpm: 90, source: 'https://peritune.com/blog/2022/12/08/snowchill/' },
  { title: 'Glimmering_Woods', file: 'glimmering-woods.mp3', bpm: 135, source: 'https://peritune.com/blog/2022/05/25/glimmering_woods/' },
  { title: 'Cerulean_Relics', file: 'cerulean-relics.mp3', bpm: 100, source: 'https://peritune.com/blog/2023/07/21/cerulean_relics/' },
  { title: 'Quiet_Ocean', file: 'quiet-ocean.mp3', bpm: 92, source: 'https://peritune.com/blog/2023/08/09/quiet_ocean/' },
  { title: 'Limpid_Water', file: 'limpid-water.mp3', bpm: 88, source: 'https://peritune.com/blog/2022/04/12/limpid_water/' }
];
const hz = midi => 440 * 2 ** ((midi - 69) / 12);

export class GameAudio {
  constructor(player, enabled, volume = 1) {
    this.player = player;
    this.enabled = enabled;
    this.setVolume(volume);
    this.running = false;
    this.beat = 0;
    this.wave = 1;
    this.playlist = [];
    this.track = null;
    this.lastBeat = -1;
  }

  async unlock() {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        this.ctx = new Audio();
        this.master = this.ctx.createGain();
        this.master.gain.value = MASTER_GAIN * this.volume;
        const limiter = this.ctx.createDynamicsCompressor();
        this.master.connect(limiter).connect(this.ctx.destination);
        const music = this.ctx.createGain();
        music.gain.value = MUSIC_GAIN;
        this.ctx.createMediaElementSource(this.player).connect(music).connect(this.master);
        this.mediaConnected = true;
        this.player.volume = 1;
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    } catch {
      // The visual game remains available on browsers with audio disabled.
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) void this.unlock();
    this.setVolume(this.volume);
    this.syncPlayback();
  }

  setVolume(volume) {
    this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
    const gain = MASTER_GAIN * this.volume;
    this.master?.gain.setTargetAtTime(this.enabled ? gain : 0, this.ctx.currentTime, .045);
    if (!this.mediaConnected) this.player.volume = gain * MUSIC_GAIN;
  }

  setRunning(running, wave = this.wave) {
    this.running = running;
    this.wave = wave;
    this.syncPlayback();
  }

  syncPlayback() {
    if (this.enabled && this.running && this.track) {
      void this.player.play().catch(() => {
        // Playback may need another gesture after the browser suspends audio.
      });
    } else {
      this.player.pause();
    }
  }

  nextTrack() {
    if (!this.playlist.length) {
      this.playlist = [...TRACKS];
      for (let i = this.playlist.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.playlist[i], this.playlist[j]] = [this.playlist[j], this.playlist[i]];
      }
      const last = this.playlist.length - 1;
      if (this.playlist[last] === this.track) {
        [this.playlist[0], this.playlist[last]] = [this.playlist[last], this.playlist[0]];
      }
    }
    this.track = this.playlist.pop();
    this.player.pause();
    this.player.src = `bgm/${this.track.file}`;
    this.lastBeat = -1;
    return this.track;
  }

  tone(midi, at, duration, gain, type = 'sine', output = this.master, attack = .012, to = midi) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(hz(midi), at);
    if (midi !== to) osc.frequency.exponentialRampToValueAtTime(hz(to), at + duration * .75);
    env.gain.setValueAtTime(.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + attack);
    env.gain.exponentialRampToValueAtTime(.0001, at + duration);
    osc.connect(env).connect(output);
    osc.start(at);
    osc.stop(at + duration + .018);
    osc.onended = () => { osc.disconnect(); env.disconnect(); };
  }

  event(type, data) {
    if (!this.enabled || this.ctx?.state !== 'running') return;
    const time = this.ctx.currentTime + .008;
    const root = 60 + (this.wave - 1) % 5;
    const chainPitch = 5 * ((data?.chain ?? 1) - 1);
    switch (type) {
      case 'move':
        this.tone(root + 12 + STEPS[data.lane], time, .073, .035);
        break;
      case 'catch': {
        const pitch = root + 12 + STEPS[data.tile.color];
        this.tone(pitch, time, .31, .095, 'triangle');
        this.tone(pitch + 12, time + .028, .34, .037);
        break;
      }
      case 'tumble': {
        const pitch = root + STEPS[data.tile.color] - 5;
        this.tone(pitch + 7, time, .084, .076, 'triangle', this.master, .005, pitch);
        this.tone(39, time, .061, .05, 'sine', this.master, .004, 31);
        break;
      }
      case 'place':
        this.tone(root + STEPS[data.tile.color], time, .21, .11, 'triangle');
        this.tone(40, time, .13, .12, 'sine', this.master, .009, 28);
        break;
      case 'throw':
        this.tone(root + 7, time, .25, .073, 'sine', this.master, .028, root + 24);
        break;
      case 'highlight':
        this.tone(root + chainPitch + 7, time, data.duration + .06, .073, 'sine', this.master, .16, root + chainPitch + 26);
        break;
      case 'match':
      case 'start': {
        if (type === 'match') this.tone(45, time, .34, .19, 'sine', this.master, .008, 25);
        const notes = type === 'start' ? [0, 7, 14] : [0, 7, 12, 15, 19, 24];
        notes.forEach((n, i) => this.tone(root + n + chainPitch, time + i * .055, .65, .12, i % 3 ? 'sine' : 'triangle'));
        break;
      }
      case 'clear': {
        const melody = [[7, 0], [12, .16], [16, .32], [19, .51], [21, .70], [19, .87], [24, 1.02]];
        melody.forEach(([note, offset], index) => {
          const last = index === melody.length - 1;
          this.tone(root + note, time + offset, last ? .55 : .27, .105, 'triangle', this.master, .024);
        });
        this.tone(root - 12, time + .51, .60, .075);
        for (const note of [0, 4, 7, 14]) {
          this.tone(root + note, time + 1.02, .58, .048, 'sine', this.master, .035);
        }
        break;
      }
      case 'miss':
      case 'blocked':
        this.tone(type === 'miss' ? 51 : 44, time, .29, .12, 'triangle', this.master, .014, 29);
        break;
      case 'over':
        [0, -4, -7, -12].forEach((n, i) => this.tone(root + n, time + .09 + i * .12, .49, .12));
        break;
    }
  }

  tick() {
    if (!this.track || this.player.paused || this.player.readyState < 2) return;
    const beat = Math.floor(this.player.currentTime * this.track.bpm / 60);
    if (beat === this.lastBeat) return;
    this.lastBeat = beat;
    this.beat++;
  }
}
