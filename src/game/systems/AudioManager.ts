import type { Side } from '../levels/LevelDefinition';

/**
 * All sound is synthesised with the Web Audio API – no audio files, nothing to license or download.
 *
 *   sfx    footsteps (solid thumps above, airy whispers below), switch sweep, jump, slide, coin, crystal,
 *          lever click, light warning, portal shimmer, checkpoint chime, hit, level complete, failure
 *   music  a generative loop (bass, arpeggio, pad) at a steady running tempo; it turns darker and
 *          muffled while the shadow is active
 *
 * The context is created lazily on the first user gesture (autoplay rules) and every call is a no-op
 * while audio is unavailable or disabled, so the game never depends on sound.
 */

type AudioCtor = typeof AudioContext;

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Bars of the music loop: [bass root, arpeggio notes]. */
const PROGRESSION: [number, number[]][] = [
  [45, [57, 60, 64, 69]], // A minor
  [41, [53, 57, 60, 65]], // F
  [48, [55, 60, 64, 67]], // C
  [43, [55, 59, 62, 67]], // G
];

class AudioManagerImpl {
  soundEnabled = true;
  musicEnabled = true;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private failed = false;
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private musicWanted = false;
  private shadowMood = false;
  private lastStep = 0;

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.failed) return;
    try {
      if (!this.ctx) this.create();
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
      this.syncMusic();
    } catch {
      this.failed = true;
      this.ctx = null;
    }
  }

  get available(): boolean {
    return this.ctx !== null;
  }

  private create(): void {
    const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) {
      this.failed = true;
      return;
    }
    const ctx = new Ctor();
    this.ctx = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.ratio.value = 4;
    compressor.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(compressor);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.soundEnabled ? 0.8 : 0;
    this.sfx.connect(this.master);
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 5200;
    this.musicFilter.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.musicFilter);

    const length = Math.floor(ctx.sampleRate * 1.5);
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  setSound(on: boolean): void {
    this.soundEnabled = on;
    if (this.ctx) this.sfx.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  setMusic(on: boolean): void {
    this.musicEnabled = on;
    this.syncMusic();
  }

  /** Scenes ask for music (menus and gameplay); it only plays when the setting allows it. */
  playMusic(on: boolean): void {
    this.musicWanted = on;
    this.syncMusic();
  }

  /** Darker, muffled music while the shadow is active. */
  setMood(side: Side): void {
    this.shadowMood = side === 'shadow';
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicFilter.frequency.setTargetAtTime(this.shadowMood ? 900 : 5200, t, 0.12);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  // ───────────────────────── voices ─────────────────────────

  private tone(freq: number, start: number, duration: number, type: OscillatorType, level: number, bus?: AudioNode, endFreq?: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + Math.min(0.012, duration / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(bus ?? this.sfx);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private burst(start: number, duration: number, filter: BiquadFilterType, freq: number, level: number, q = 1, endFreq?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, start);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
    f.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(f).connect(gain).connect(this.sfx);
    src.start(start, Math.random() * 0.8);
    src.stop(start + duration + 0.02);
  }

  private ready(): boolean {
    return this.ctx !== null && this.soundEnabled && this.ctx.state === 'running';
  }

  /** Footstep for the active form; call once per stride. */
  footstep(side: Side): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    if (t - this.lastStep < 0.12) return;
    this.lastStep = t;
    if (side === 'real') {
      this.burst(t, 0.06, 'lowpass', 600, 0.12);
      this.tone(110, t, 0.06, 'sine', 0.08, undefined, 70);
    } else {
      this.burst(t, 0.09, 'bandpass', 2600, 0.05, 2.5, 1600);
    }
  }

  switchTo(side: Side): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    if (side === 'shadow') {
      this.tone(660, t, 0.22, 'sine', 0.16, undefined, 220);
      this.tone(990, t + 0.02, 0.2, 'triangle', 0.05, undefined, 330);
      this.burst(t, 0.25, 'bandpass', 3000, 0.08, 3, 500);
    } else {
      this.tone(260, t, 0.2, 'sine', 0.16, undefined, 780);
      this.tone(390, t + 0.02, 0.18, 'triangle', 0.06, undefined, 1170);
      this.burst(t, 0.2, 'bandpass', 600, 0.06, 3, 3600);
    }
  }

  switchBlocked(): void {
    if (!this.ready()) return;
    this.tone(180, this.ctx!.currentTime, 0.06, 'square', 0.03);
  }

  jump(side: Side): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(side === 'real' ? 320 : 420, t, 0.16, 'triangle', 0.12, undefined, side === 'real' ? 720 : 900);
  }

  slide(): void {
    if (!this.ready()) return;
    this.burst(this.ctx!.currentTime, 0.3, 'bandpass', 1800, 0.1, 1.2, 600);
  }

  land(): void {
    if (!this.ready()) return;
    this.burst(this.ctx!.currentTime, 0.07, 'lowpass', 500, 0.1);
  }

  coin(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(1320, t, 0.08, 'square', 0.05);
    this.tone(1760, t + 0.06, 0.14, 'square', 0.05);
  }

  crystal(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(2093, t, 0.35, 'sine', 0.09);
    this.tone(3136, t + 0.03, 0.3, 'sine', 0.05);
    this.tone(1568, t, 0.25, 'triangle', 0.04);
  }

  key(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    [988, 1319, 1661, 1976].forEach((f, i) => this.tone(f, t + i * 0.05, 0.25, 'triangle', 0.08));
  }

  lever(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.burst(t, 0.04, 'highpass', 2500, 0.15);
    this.tone(240, t + 0.03, 0.12, 'square', 0.06, undefined, 480);
    this.tone(523, t + 0.12, 0.3, 'sine', 0.08, undefined, 1046);
  }

  lightWarning(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(1046, t, 0.07, 'square', 0.04);
    this.tone(1046, t + 0.1, 0.07, 'square', 0.04);
  }

  portal(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(220, t, 0.5, 'sine', 0.12, undefined, 880);
    this.burst(t, 0.5, 'bandpass', 800, 0.06, 4, 5000);
  }

  checkpoint(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    [784, 988, 1175].forEach((f, i) => this.tone(f, t + i * 0.08, 0.3, 'triangle', 0.08));
  }

  nearMiss(): void {
    if (!this.ready()) return;
    this.burst(this.ctx!.currentTime, 0.18, 'bandpass', 1200, 0.07, 1.5, 4000);
  }

  hit(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.burst(t, 0.35, 'lowpass', 1400, 0.3, 1, 200);
    this.tone(160, t, 0.35, 'sawtooth', 0.12, undefined, 50);
  }

  complete(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    [523, 659, 784, 1046, 1319].forEach((f, i) => this.tone(f, t + i * 0.09, 0.45, 'triangle', 0.1));
    this.tone(1568, t + 0.5, 0.8, 'sine', 0.06);
  }

  failure(): void {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    [392, 330, 262].forEach((f, i) => this.tone(f, t + i * 0.16, 0.32, 'triangle', 0.1));
  }

  star(index: number): void {
    if (!this.ready()) return;
    this.tone(880 * Math.pow(1.26, index), this.ctx!.currentTime, 0.3, 'triangle', 0.1);
  }

  button(): void {
    if (!this.ready()) return;
    this.tone(660, this.ctx!.currentTime, 0.06, 'triangle', 0.07, undefined, 880);
  }

  // ───────────────────────── music ─────────────────────────

  private syncMusic(): void {
    const on = this.musicEnabled && this.musicWanted && this.ctx !== null;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.3);
    if (on && this.musicTimer === null) {
      this.nextNoteTime = this.ctx.currentTime + 0.1;
      this.musicTimer = window.setInterval(() => this.schedule(), 100);
    } else if (!on && this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /** Look-ahead scheduler: eighth notes at 112 bpm. */
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const eighth = 60 / 112 / 2;
    while (this.nextNoteTime < ctx.currentTime + 0.3) {
      const bar = Math.floor(this.step / 8) % PROGRESSION.length;
      const beat = this.step % 8;
      const [root, chord] = PROGRESSION[bar];
      const t = this.nextNoteTime;
      const shift = this.shadowMood ? -12 : 0;
      if (beat % 4 === 0) this.tone(midiToHz(root + shift), t, eighth * 1.8, 'triangle', 0.16, this.musicBus);
      if (beat % 4 === 2) this.tone(midiToHz(root + 7 + shift), t, eighth * 0.9, 'triangle', 0.08, this.musicBus);
      const note = chord[(beat * 3 + bar) % chord.length] + 12;
      this.tone(midiToHz(note + shift), t, eighth * 0.8, this.shadowMood ? 'sine' : 'square', this.shadowMood ? 0.05 : 0.025, this.musicBus);
      if (beat === 0) for (const n of chord) this.tone(midiToHz(n + shift), t, eighth * 7.5, 'sine', 0.018, this.musicBus);
      if (beat % 2 === 1) this.burstMusic(t);
      this.nextNoteTime += eighth;
      this.step++;
    }
  }

  private burstMusic(t: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.025, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f).connect(g).connect(this.musicBus);
    src.start(t, Math.random());
    src.stop(t + 0.06);
  }
}

export const AudioManager = new AudioManagerImpl();
