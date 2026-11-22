import { settings } from './settings';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let arpBus: GainNode | null = null;
let humGain: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
let intensity = 0;
let nextTime = 0;
let step = 0;
let timer: number | undefined;
try {
  muted = localStorage.getItem('cf.mute') === '1';
} catch {
  /* ignorieren */
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
const ARP = [0, 1, 2, 1, 2, 1, 0, 2];
const BPM = 84;

function osc(f: number, d: number, type: OscillatorType, vol: number, t: number, dest: AudioNode, to?: number, attack = 0.005) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + d + 0.05);
}

function noise(d: number, vol: number, t: number, dest: AudioNode, hp = 800) {
  if (!ctx || !noiseBuf) return;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(f);
  f.connect(g);
  g.connect(dest);
  s.start(t);
  s.stop(t + d + 0.02);
}

function tone(f: number, d: number, type: OscillatorType = 'sine', vol = 0.15, to?: number, delay = 0) {
  if (!ctx || !sfxBus || muted) return;
  osc(f, d, type, vol, ctx.currentTime + delay, sfxBus, to);
}

function hit(d: number, vol: number, delay = 0, hp = 800) {
  if (!ctx || !sfxBus || muted) return;
  noise(d, vol, ctx.currentTime + delay, sfxBus, hp);
}

function playStep(n: number, t: number) {
  if (!ctx || !musicBus || !arpBus) return;
  const chord = CHORDS[Math.floor(n / 8) % 4];
  const i = n % 8;
  if (i === 0 || i === 4) osc(mtof(chord[0] - 12), 0.7, 'sine', 0.55, t, musicBus, undefined, 0.02);
  if (i === 0) for (const m of chord) osc(mtof(m), 2.8, 'triangle', 0.06, t, musicBus, undefined, 0.6);
  const lv = 0.07 + intensity * 0.12;
  osc(mtof(chord[ARP[i]] + 12), 0.42, 'triangle', lv, t, arpBus);
  if (intensity > 0.15 && i % 2 === 1 && noiseBuf) noise(0.05, 0.05 * intensity, t, musicBus, 6000);
  if (intensity > 0.5 && (i === 2 || i === 6)) osc(mtof(chord[(i / 2) % 3] + 24), 0.3, 'square', 0.03 * intensity, t, arpBus);
}

function scheduler() {
  if (!ctx) return;
  while (nextTime < ctx.currentTime + 0.4) {
    playStep(step, nextTime);
    nextTime += 60 / BPM / 2;
    step++;
  }
}

function startHum() {
  if (!ctx || !sfxBus || humGain) return;
  humGain = ctx.createGain();
  humGain.gain.value = 0;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 220;
  for (const fr of [55, 55.6, 110]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = fr;
    o.connect(f);
    o.start();
  }
  f.connect(humGain);
  humGain.connect(sfxBus);
}

const chime = (base: number, n: number, gap = 0.08, type: OscillatorType = 'triangle') => {
  for (let i = 0; i < n; i++) tone(base * Math.pow(1.25, i), 0.2, type, 0.11, undefined, i * gap);
};

export const sfx = {
  /** Muss nach einer Nutzer-Geste aufgerufen werden (Browser-Autoplay-Regel). */
  unlock() {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.connect(master);
      arpBus = ctx.createGain();
      arpBus.connect(musicBus);
      const delay = ctx.createDelay(1);
      delay.delayTime.value = (60 / BPM) * 0.75;
      const fb = ctx.createGain();
      fb.gain.value = 0.38;
      arpBus.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(musicBus);
      const len = Math.floor(ctx.sampleRate * 0.4);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      startHum();
      this.applySettings();
      nextTime = ctx.currentTime + 0.2;
      timer = window.setInterval(scheduler, 110);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  },
  applySettings() {
    if (!ctx || !sfxBus || !musicBus) return;
    sfxBus.gain.setTargetAtTime(settings.sfx, ctx.currentTime, 0.05);
    musicBus.gain.setTargetAtTime(settings.music * 0.55, ctx.currentTime, 0.05);
  },
  click() { tone(520 + Math.random() * 200, 0.08, 'triangle', 0.14, 240); },
  tab() { tone(760, 0.05, 'sine', 0.07, 900); },
  place() { tone(300, 0.1, 'square', 0.07, 200); tone(600, 0.08, 'triangle', 0.08, undefined, 0.05); },
  buy() { tone(440, 0.09, 'square', 0.07); tone(660, 0.14, 'square', 0.07, undefined, 0.08); },
  sell() { for (let i = 0; i < 5; i++) tone(1200 + Math.random() * 900, 0.09, 'triangle', 0.1, undefined, i * 0.05); tone(1760, 0.25, 'sine', 0.1, undefined, 0.26); },
  error() { tone(180, 0.18, 'sawtooth', 0.09, 120); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, undefined, i * 0.09)); },
  /** Event- und Spiel-Effekte nach Namen. */
  fx(name: string) {
    switch (name) {
      case 'outage': tone(420, 1, 'sawtooth', 0.15, 50); hit(0.4, 0.15, 0, 200); break;
      case 'end-outage': chime(500, 4, 0.07); break;
      case 'crash': tone(320, 0.7, 'sawtooth', 0.15, 60); hit(0.5, 0.12, 0, 300); break;
      case 'boom': chime(400, 6, 0.07, 'square'); break;
      case 'hack': for (let i = 0; i < 6; i++) tone(i % 2 ? 660 : 880, 0.14, 'square', 0.1, undefined, i * 0.16); break;
      case 'sale': chime(700, 3, 0.1); break;
      case 'heat': tone(90, 1.1, 'sawtooth', 0.1, 70); break;
      case 'fail': hit(0.25, 0.2, 0, 400); tone(160, 0.3, 'square', 0.1, 70, 0.02); break;
      case 'block': chime(660, 5, 0.06); tone(1320, 0.5, 'sine', 0.08, undefined, 0.35); break;
      case 'research': chime(440, 6, 0.09); break;
      case 'loan': hit(0.08, 0.2, 0, 3000); tone(1500, 0.12, 'triangle', 0.1, undefined, 0.07); tone(2000, 0.3, 'triangle', 0.1, undefined, 0.14); break;
      case 'repair': for (let i = 0; i < 3; i++) { hit(0.06, 0.25, i * 0.12, 1500); tone(260, 0.06, 'square', 0.05, undefined, i * 0.12); } break;
      case 'prestige': chime(200, 9, 0.11, 'sawtooth'); tone(80, 1.6, 'sine', 0.2, 320); break;
      case 'autosell': tone(1568, 0.1, 'triangle', 0.07); break;
      case 'win': this.win(); break;
      case 'bonus': chime(880, 5, 0.05, 'triangle'); break;
      case 'crit': tone(1320, 0.12, 'square', 0.09); tone(1760, 0.2, 'triangle', 0.09, undefined, 0.06); break;
      case 'overdrive': chime(330, 8, 0.05, 'sawtooth'); tone(110, 1.2, 'sine', 0.18, 440); break;
      case 'news-up': tone(880, 0.12, 'triangle', 0.08); tone(1175, 0.18, 'triangle', 0.08, undefined, 0.1); break;
      case 'news-down': tone(520, 0.14, 'triangle', 0.08); tone(390, 0.22, 'triangle', 0.08, undefined, 0.12); break;
    }
  },
  setHum(level: number) {
    intensity = Math.min(1, level);
    if (humGain && ctx) humGain.gain.setTargetAtTime(0.008 + intensity * 0.05, ctx.currentTime, 0.6);
  },
  isMuted: () => muted,
  toggleMute(): boolean {
    muted = !muted;
    try {
      localStorage.setItem('cf.mute', muted ? '1' : '0');
    } catch {
      /* ignorieren */
    }
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
    return muted;
  },
  stop() {
    if (timer) window.clearInterval(timer);
  },
};
