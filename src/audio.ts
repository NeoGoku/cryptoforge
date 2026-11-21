let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let humGain: GainNode | null = null;
let muted = false;
try {
  muted = localStorage.getItem('cf.mute') === '1';
} catch {
  /* ignorieren */
}

function tone(f: number, d: number, type: OscillatorType = 'sine', vol = 0.15, to?: number, delay = 0) {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + d + 0.02);
}

function startHum() {
  if (!ctx || !master || humGain) return;
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
  humGain.connect(master);
}

export const sfx = {
  /** Muss nach einer Nutzer-Geste aufgerufen werden (Browser-Autoplay-Regel). */
  unlock() {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(ctx.destination);
      startHum();
    }
    if (ctx.state === 'suspended') void ctx.resume();
  },
  click() { tone(520 + Math.random() * 200, 0.08, 'triangle', 0.14, 240); },
  place() { tone(300, 0.1, 'square', 0.07, 200); tone(600, 0.08, 'triangle', 0.08, undefined, 0.05); },
  buy() { tone(440, 0.09, 'square', 0.07); tone(660, 0.14, 'square', 0.07, undefined, 0.08); },
  sell() { tone(880, 0.1, 'triangle', 0.12); tone(1175, 0.1, 'triangle', 0.12, undefined, 0.08); tone(1480, 0.18, 'triangle', 0.12, undefined, 0.16); },
  error() { tone(180, 0.18, 'sawtooth', 0.09, 120); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, undefined, i * 0.09)); },
  setHum(level: number) {
    if (humGain && ctx) humGain.gain.setTargetAtTime(0.008 + Math.min(1, level) * 0.05, ctx.currentTime, 0.6);
  },
  isMuted: () => muted,
  toggleMute(): boolean {
    muted = !muted;
    try {
      localStorage.setItem('cf.mute', muted ? '1' : '0');
    } catch {
      /* ignorieren */
    }
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.6, ctx.currentTime, 0.05);
    return muted;
  },
};
