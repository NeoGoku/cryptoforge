import Phaser from 'phaser';
import { game } from './game';
import { coinDef, DEFAULT_COIN, roomDef } from './config';
import { partDef } from './hardware';
import type { RoomDef } from './config';
import { sfx } from './audio';
import { DPR } from './env';
import { settings } from './settings';

const TW = 64;
const TH = 32;
const WALL = 96;
let ox = 0;
let oy = 0;
let zoom = 1;

type G = Phaser.GameObjects.Graphics;
type Pt = { x: number; y: number };
type LedFn = (x: number, y: number, c: number, phase: number) => void;

/** Kachel (u,v) mit Höhe z in Bildschirmkoordinaten (isometrisch). */
const P = (u: number, v: number, z = 0): Pt => ({
  x: ox + (((u - v) * TW) / 2) * zoom,
  y: oy + (((u + v) * TH) / 2 - z) * zoom,
});

const shade = (c: number, f: number): number => {
  const ch = (x: number) => Math.min(255, Math.round(x * f));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
};

const line = (g: G, a: Pt, b: Pt) => g.lineBetween(a.x, a.y, b.x, b.y);

/** Quader mit Basis z0 und Höhe h. Sichtbar: Oberseite und die beiden Frontflächen. */
function box(g: G, u: number, v: number, du: number, dv: number, h: number, c: number, z0 = 0, vents = 0) {
  const t = z0 + h;
  const top = [P(u, v, t), P(u + du, v, t), P(u + du, v + dv, t), P(u, v + dv, t)];
  const right = [P(u + du, v, z0), P(u + du, v + dv, z0), P(u + du, v + dv, t), P(u + du, v, t)];
  const left = [P(u, v + dv, z0), P(u + du, v + dv, z0), P(u + du, v + dv, t), P(u, v + dv, t)];
  g.fillStyle(shade(c, 0.74), 1);
  g.fillPoints(left, true);
  g.fillStyle(shade(c, 0.9), 1);
  g.fillPoints(right, true);
  g.fillStyle(shade(c, 1.18), 1);
  g.fillPoints(top, true);
  g.lineStyle(1 * DPR, 0x000000, 0.35);
  g.strokePoints(top, true);
  g.strokePoints(left, true);
  g.strokePoints(right, true);
  g.lineStyle(1 * DPR, 0xffffff, 0.22);
  line(g, top[3], top[2]);
  line(g, top[2], top[1]);
  if (vents > 0) {
    g.lineStyle(1 * DPR, 0x000000, 0.4);
    for (let k = 1; k <= vents; k++) {
      const z = z0 + (h * k) / (vents + 1);
      line(g, P(u, v + dv, z), P(u + du, v + dv, z));
      line(g, P(u + du, v, z), P(u + du, v + dv, z));
    }
  }
}

type Kind = 'bed' | 'desk' | 'rack' | 'plant' | 'crate' | 'bench' | 'chair' | 'tank';
interface Deco { kind: Kind; u: number; v: number; du: number; dv: number; }

const DECOR: Record<string, Deco[]> = {
  kid: [
    { kind: 'bed', u: 0.4, v: 0.3, du: 2.0, dv: 1.6 },
    { kind: 'desk', u: 3.6, v: 0.2, du: 2.0, dv: 1.0 },
    { kind: 'chair', u: 4.0, v: 1.5, du: 0.9, dv: 0.9 },
    { kind: 'rack', u: 0.3, v: 2.4, du: 0.9, dv: 0.9 },
    { kind: 'plant', u: 5.0, v: 4.9, du: 0.7, dv: 0.7 },
  ],
  store: [
    { kind: 'crate', u: 0.4, v: 0.4, du: 1.4, dv: 1.4 },
    { kind: 'crate', u: 2.2, v: 0.4, du: 1.2, dv: 1.2 },
    { kind: 'rack', u: 6.0, v: 0.3, du: 1.0, dv: 1.0 },
    { kind: 'plant', u: 0.4, v: 6.6, du: 0.7, dv: 0.7 },
  ],
  basement: [
    { kind: 'rack', u: 0.4, v: 0.3, du: 1.0, dv: 1.0 },
    { kind: 'rack', u: 1.6, v: 0.3, du: 1.0, dv: 1.0 },
    { kind: 'rack', u: 2.8, v: 0.3, du: 1.0, dv: 1.0 },
    { kind: 'crate', u: 8.2, v: 0.4, du: 1.4, dv: 1.4 },
    { kind: 'tank', u: 0.5, v: 8.4, du: 1.0, dv: 1.0 },
    { kind: 'plant', u: 8.8, v: 8.8, du: 0.7, dv: 0.7 },
  ],
  hall: [
    { kind: 'rack', u: 0.4, v: 0.3, du: 1.0, dv: 1.0 },
    { kind: 'rack', u: 1.6, v: 0.3, du: 1.0, dv: 1.0 },
    { kind: 'rack', u: 2.8, v: 0.3, du: 1.0, dv: 1.0 },
    { kind: 'rack', u: 4.0, v: 0.3, du: 1.0, dv: 1.0 },
    { kind: 'tank', u: 10.4, v: 0.4, du: 1.0, dv: 1.0 },
    { kind: 'bench', u: 0.3, v: 10.2, du: 3.0, dv: 1.0 },
    { kind: 'crate', u: 10.0, v: 10.0, du: 1.4, dv: 1.4 },
  ],
  dc: [
    { kind: 'rack', u: 0.4, v: 0.3, du: 1.0, dv: 1.0 },
    { kind: 'rack', u: 1.6, v: 0.3, du: 1.0, dv: 1.0 },
    { kind: 'rack', u: 2.8, v: 0.3, du: 1.0, dv: 1.0 },
    { kind: 'rack', u: 4.0, v: 0.3, du: 1.0, dv: 1.0 },
    { kind: 'rack', u: 5.2, v: 0.3, du: 1.0, dv: 1.0 },
    { kind: 'rack', u: 6.4, v: 0.3, du: 1.0, dv: 1.0 },
    { kind: 'tank', u: 12.2, v: 0.4, du: 1.0, dv: 1.0 },
    { kind: 'tank', u: 12.2, v: 2.0, du: 1.0, dv: 1.0 },
    { kind: 'crate', u: 0.4, v: 12.2, du: 1.4, dv: 1.4 },
    { kind: 'plant', u: 12.8, v: 12.8, du: 0.7, dv: 0.7 },
  ],
  garage: [
    { kind: 'bench', u: 0.3, v: 0.3, du: 3.0, dv: 1.0 },
    { kind: 'rack', u: 8.0, v: 0.3, du: 1.0, dv: 1.0 },
    { kind: 'rack', u: 8.0, v: 1.8, du: 1.0, dv: 1.0 },
    { kind: 'crate', u: 0.4, v: 8.0, du: 1.4, dv: 1.4 },
    { kind: 'plant', u: 9.0, v: 9.0, du: 0.7, dv: 0.7 },
  ],
};

function drawDeco(g: G, d: Deco, led: LedFn) {
  const { u, v, du, dv } = d;
  switch (d.kind) {
    case 'bed':
      box(g, u, v, du, dv, 10, 0x8c90c0);
      box(g, u + 0.1, v + 0.1, du * 0.35, dv - 0.2, 6, 0xf2f2f7, 10);
      box(g, u + du * 0.5, v + 0.05, du * 0.48, dv - 0.1, 3, 0x6d73b0, 10);
      break;
    case 'desk':
      box(g, u, v, du, dv, 16, 0x8c90c0, 0, 1);
      box(g, u + du - 0.55, v + 0.15, 0.4, 0.6, 28, 0x2b2e36, 16);
      box(g, u + 0.3, v + 0.1, du - 1.2, 0.14, 26, 0x1f2430, 16);
      led(P(u + 0.3 + (du - 1.2) / 2, v + 0.24, 33).x, P(u + 0.3 + (du - 1.2) / 2, v + 0.24, 33).y, 0x5dff9c, 0.5);
      break;
    case 'chair':
      box(g, u, v, du, dv, 8, 0x4a4f78);
      box(g, u, v + dv - 0.12, du, 0.12, 14, 0x3a3e62, 8);
      break;
    case 'rack':
      box(g, u, v, du, dv, 62, 0x3a3d44, 0, 6);
      for (let k = 1; k <= 6; k++) {
        const p = P(u + du * 0.82, v + dv, (62 * k) / 7);
        led(p.x, p.y, k % 3 === 0 ? 0xffc857 : 0x4fd1c5, k * 0.9 + u);
      }
      break;
    case 'crate':
      box(g, u, v, du, dv, 22, 0xb8862b, 0, 2);
      break;
    case 'tank': {
      box(g, u, v, du, dv, 40, 0x4a6fa5, 0, 2);
      box(g, u + 0.15, v + 0.15, du - 0.3, dv - 0.3, 6, 0x7fb0e0, 40);
      const p = P(u + du, v + dv * 0.5, 22);
      led(p.x, p.y, 0x7af5ff, u);
      break;
    }
    case 'bench':
      box(g, u, v, du, dv, 20, 0x6b5a4a, 0, 1);
      box(g, u + 0.3, v + 0.2, 0.5, 0.5, 8, 0x9aa0b4, 20);
      break;
    case 'plant': {
      box(g, u, v, du, dv, 12, 0xa0522d);
      const c = P(u + du / 2, v + dv / 2, 12);
      g.fillStyle(0x2d7a37, 1);
      g.fillCircle(c.x, c.y - 12 * zoom, 15 * zoom);
      g.fillStyle(0x4caf50, 1);
      g.fillCircle(c.x - 5 * zoom, c.y - 18 * zoom, 10 * zoom);
      g.fillStyle(0x7ed67f, 0.8);
      g.fillCircle(c.x - 8 * zoom, c.y - 22 * zoom, 4 * zoom);
      break;
    }
  }
}

interface Led { x: number; y: number; c: number; phase: number; }
interface Fan { x: number; y: number; hot: boolean; s?: number; }
interface Hit { x: number; y: number; idx: number; poly: Pt[]; }
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; c: number; r: number; ring?: boolean; }

export class MainScene extends Phaser.Scene {
  private room!: G;
  private dyn!: G;
  private ledPts: Led[] = [];
  private fans: Fan[] = [];
  private hits: Hit[] = [];
  private parts: Part[] = [];
  private dust: { x: number; y: number; s: number; sp: number; ph: number }[] = [];
  private hover = -1;
  private t = 0;
  private fanAngle = 0;
  private spawnAcc = 0;
  private sparkAcc = 0;
  private humTimer = 0;
  private lastRoom = '';
  private charPos: Pt | null = null;
  private dark = 0;
  private smokeAcc = 0;

  constructor() {
    super('main');
  }

  create() {
    this.room = this.add.graphics();
    this.dyn = this.add.graphics();
    for (let i = 0; i < 46; i++) {
      this.dust.push({ x: Math.random(), y: Math.random(), s: 1 + Math.random() * 2, sp: 0.01 + Math.random() * 0.03, ph: Math.random() * 6 });
    }
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPress(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const h = this.findHit(p);
      this.hover = h ? h.idx : -1;
      this.input.setDefaultCursor(h ? 'pointer' : 'default');
    });
    this.scale.on('resize', () => this.refresh());
    let layoutFrame = 0;
    const scheduleLayout = () => {
      if (layoutFrame) return;
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = 0;
        this.refresh();
      });
    };
    const layout = new ResizeObserver(scheduleLayout);
    window.addEventListener('cryptoforge:layout', scheduleLayout);
    for (const id of ['top', 'dock', 'panel']) {
      const element = document.getElementById(id);
      if (element) layout.observe(element);
    }
    this.events.once('shutdown', () => {
      layout.disconnect();
      cancelAnimationFrame(layoutFrame);
      window.removeEventListener('cryptoforge:layout', scheduleLayout);
    });
    game.on('change', () => this.refresh());
    game.on('fx', (n) => this.onFx(n ?? ''));
    this.refresh();
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;
    game.update(dt);
    this.t += dt;
    if (!settings.scene || (window.innerWidth < 900 && document.body.classList.contains('operations-open'))) return;
    const powered = game.running() && game.grid.throttle > 0;
    const w = this.scale.width;
    const h = this.scale.height;
    const g = this.dyn;
    g.clear();

    // Schwebende Partikel im Hintergrund
    for (const d of settings.quality === 'low' ? [] : this.dust) {
      d.y -= d.sp * dt;
      if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); }
      g.fillStyle(0x4fd1c5, 0.12 + 0.12 * Math.sin(this.t * 1.4 + d.ph));
      g.fillCircle(d.x * w + Math.sin(this.t * 0.5 + d.ph) * 10 * DPR, d.y * h, d.s * DPR);
    }

    // Leere Slots: pulsierende Umrandung, Hover-Highlight
    for (const hit of this.hits) {
      const slot = game.s.rooms[game.s.active]?.[hit.idx];
      if (!slot) {
        g.lineStyle(2 * DPR, 0x4fd1c5, 0.35 + 0.35 * Math.sin(this.t * 3 + hit.idx));
        g.strokePoints(hit.poly, true, true);
        g.fillStyle(0x4fd1c5, 0.06 + 0.05 * Math.sin(this.t * 3 + hit.idx));
        g.fillPoints(hit.poly, true);
        const c = hit.poly.reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4 }), { x: 0, y: 0 });
        g.lineStyle(2.5 * zoom, 0x4fd1c5, 0.7);
        g.lineBetween(c.x - 6 * zoom, c.y, c.x + 6 * zoom, c.y);
        g.lineBetween(c.x, c.y - 4 * zoom, c.x, c.y + 4 * zoom);
      }
      if (hit.idx === this.hover) {
        g.lineStyle(2.5 * DPR, 0xffffff, 0.8);
        g.strokePoints(hit.poly, true, true);
      }
    }

    // Lüfter
    const rate = powered ? 9 : 0;
    this.fanAngle += dt * rate;
    for (const f of this.fans) {
      const a = this.fanAngle * (f.hot ? 1.7 : 1);
      const rx = 17 * zoom * (f.s ?? 1);
      const ry = 8.5 * zoom * (f.s ?? 1);
      g.lineStyle(2.4 * zoom, f.hot ? 0xff9a6b : 0xb8c4e0, powered ? 0.85 : 0.35);
      for (let k = 0; k < 3; k++) {
        const ang = a + (k * Math.PI * 2) / 3;
        g.lineBetween(f.x, f.y, f.x + Math.cos(ang) * rx, f.y + Math.sin(ang) * ry);
      }
      g.fillStyle(0x10131c, 1);
      g.fillCircle(f.x, f.y, 2.5 * zoom);
    }

    // LEDs
    for (const l of this.ledPts) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 5 + l.phase);
      const a = powered ? 0.5 + 0.5 * pulse : 0.12;
      g.fillStyle(l.c, a * 0.22);
      g.fillCircle(l.x, l.y, 7 * zoom);
      g.fillStyle(l.c, a);
      g.fillCircle(l.x, l.y, 2.6 * zoom);
    }

    // Operator am Schreibtisch
    if (this.charPos) {
      const c = this.charPos;
      const z = zoom;
      const bob = powered ? Math.sin(this.t * 7) * 0.8 * z : 0;
      const type = powered ? Math.sin(this.t * 18) * 1.6 * z : 0;
      g.fillStyle(0x000000, 0.18);
      g.fillEllipse(c.x, c.y + 2 * z, 18 * z, 7 * z);
      g.fillStyle(0xa66bd6, 1);
      g.fillRoundedRect(c.x - 7 * z, c.y - 20 * z + bob, 14 * z, 18 * z, 4 * z);
      g.lineStyle(3 * z, 0xf0c9a0, 1);
      g.lineBetween(c.x + 5 * z, c.y - 15 * z + bob, c.x + 13 * z, c.y - 19 * z + type);
      g.fillStyle(0x1a1a2e, 1);
      g.fillCircle(c.x, c.y - 29 * z + bob, 8 * z);
      g.fillStyle(0xf0c9a0, 1);
      g.fillCircle(c.x + 1 * z, c.y - 26 * z + bob, 6 * z);
      g.fillStyle(0x1a1a2e, 1);
      g.fillCircle(c.x - 3 * z, c.y - 31 * z + bob, 5 * z);
    }

    this.updateParticles(dt, powered);
    this.dark += ((game.s.ev?.id === 'outage' ? 1 : 0) - this.dark) * Math.min(1, dt * 3);
    if (this.dark > 0.01) {
      g.fillStyle(0x02030a, 0.62 * this.dark);
      g.fillRect(0, 0, w, h);
      g.lineStyle(6 * DPR, 0xff3b30, this.dark * (0.25 + 0.25 * Math.sin(this.t * 6)));
      g.strokeRect(3 * DPR, 3 * DPR, w - 6 * DPR, h - 6 * DPR);
    }
    this.humTimer += dt;
    if (this.humTimer > 1) {
      this.humTimer = 0;
      sfx.setHum(game.hashTotal / 1500);
    }
  }

  private updateParticles(dt: number, powered: boolean) {
    const room = roomDef(game.s.active);
    const st = game.roomStats[room.id];
    const ratio = st ? st.heat / room.maxHeat : 0;
    if (powered && this.fans.length) {
      this.spawnAcc += dt * (ratio > 0.6 ? 3 + 14 * (ratio - 0.6) : 0);
      this.sparkAcc += dt * Math.min(8, 1 + this.fans.length * 1.2);
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        const f = this.fans[Math.floor(Math.random() * this.fans.length)];
        const max = 1.2 + Math.random() * 0.8;
        this.parts.push({ x: f.x + (Math.random() - 0.5) * 20 * zoom, y: f.y - 4 * zoom, vx: (Math.random() - 0.5) * 8, vy: -22 - Math.random() * 18, life: max, max, c: ratio > 1 ? 0xff9a6b : 0xc9d1e6, r: (3 + Math.random() * 3) * zoom });
      }
      while (this.sparkAcc >= 1) {
        this.sparkAcc -= 1;
        const f = this.fans[Math.floor(Math.random() * this.fans.length)];
        this.parts.push({ x: f.x, y: f.y - 6 * zoom, vx: (Math.random() - 0.5) * 14, vy: -40 - Math.random() * 25, life: 1.1, max: 1.1, c: 0x4fd1c5, r: 1.8 * zoom });
      }
    }
    const cond = st ? st.cond : 100;
    if (powered && cond < 45 && this.fans.length) {
      this.smokeAcc += dt * (45 - cond) * 0.12;
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
        const f = this.fans[Math.floor(Math.random() * this.fans.length)];
        this.parts.push({ x: f.x, y: f.y - 4 * zoom, vx: (Math.random() - 0.5) * 16, vy: -26, life: 1.4, max: 1.4, c: 0x555a66, r: 5 * zoom });
        if (Math.random() < 0.5) this.parts.push({ x: f.x, y: f.y - 6 * zoom, vx: (Math.random() - 0.5) * 60, vy: -50 - Math.random() * 30, life: 0.5, max: 0.5, c: 0xffe066, r: 1.6 * zoom });
      }
    }
    const cap = settings.quality === 'low' ? 60 : 180;
    if (this.parts.length > cap) this.parts.splice(0, this.parts.length - cap);
    const g = this.dyn;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt * DPR;
      p.y += p.vy * dt * DPR;
      const k = p.life / p.max;
      if (p.ring) {
        g.lineStyle(2 * DPR, p.c, k * 0.8);
        g.strokeCircle(p.x, p.y, p.r * (2 - k) * 2.2);
      } else {
        g.fillStyle(p.c, k * (p.c === 0x4fd1c5 || p.c === 0xffe066 ? 0.9 : 0.35));
        g.fillCircle(p.x, p.y, p.r * (p.c === 0x4fd1c5 || p.c === 0xffe066 ? 1 : 1.6 - k * 0.6));
      }
    }
  }

  private burst(x: number, y: number, c: number, n: number) {
    this.parts.push({ x, y, vx: 0, vy: 0, life: 0.45, max: 0.45, c, r: 8 * zoom, ring: true });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 90;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: 0.7, max: 0.7, c, r: 2 * zoom });
    }
  }

  private refresh() {
    this.layout();
    this.drawRoom(roomDef(game.s.active));
    if (this.lastRoom !== game.s.active) {
      this.lastRoom = game.s.active;
      this.room.setAlpha(0);
      this.tweens.add({ targets: this.room, alpha: 1, duration: 300 });
    }
  }

  private layout() {
    const w = this.scale.width / DPR;
    const h = this.scale.height / DPR;
    const wide = w >= 900;
    const room = roomDef(game.s.active);
    const bounds = (id: string) => document.getElementById(id)?.getBoundingClientRect();
    const panel = bounds('panel');
    const quest = bounds('quest');
    const dock = bounds('dock');
    const right = wide ? Math.max(40, (panel?.left ?? w) - 8) : w;
    const left = wide && right >= 670 ? Math.min(280, (quest?.right ?? 0) + 10) : 0;
    const top = Math.max(0, (bounds('top')?.bottom ?? 78) + 8, wide && left === 0 ? (quest?.bottom ?? 0) + 6 : 0);
    const bottom = Math.min(h, dock?.top ?? h) - 6;
    const z = Math.max(0.12, Math.min(((right - left) * 0.92) / (room.size * TW), ((bottom - top) * 0.94) / (WALL + room.size * TH), 2.2));
    const W = room.size;
    zoom = z * DPR;
    ox = ((left + right) / 2) * DPR;
    oy = ((top + bottom) / 2 - ((W * TH - WALL) * z) / 2) * DPR;
  }

  private drawRoom(room: RoomDef) {
    const g = this.room;
    g.clear();
    this.ledPts = [];
    this.fans = [];
    this.hits = [];
    this.charPos = null;
    const W = room.size;
    const hot = (game.roomStats[room.id]?.throttle ?? 1) < 1;

    // Schatten
    for (let i = 4; i >= 1; i--) {
      g.fillStyle(0x000000, 0.1);
      g.fillPoints([P(-0.2 * i, W + 0.2 * i, -10), P(W + 0.2 * i, W + 0.2 * i, -10), P(W + 0.2 * i, -0.2 * i, -10), P(W + 0.9 + 0.2 * i, W + 0.9, -34), P(-0.9, W + 0.9 + 0.2 * i, -34)], true);
    }

    // Bodenplatte (Dicke) wie in der Referenz
    g.fillStyle(0x6b707c, 1);
    g.fillPoints([P(0, W, 0), P(W, W, 0), P(W, W, -12), P(0, W, -12)], true);
    g.fillStyle(0x8a8f9c, 1);
    g.fillPoints([P(W, 0, 0), P(W, W, 0), P(W, W, -12), P(W, 0, -12)], true);

    // Boden mit Dielen
    g.fillStyle(0xa87a2c, 1);
    g.fillPoints([P(0, 0), P(W, 0), P(W, W), P(0, W)], true);
    for (let i = 0; i < W; i++) {
      g.fillStyle(i % 2 ? 0xb98932 : 0x9c7027, 0.55);
      g.fillPoints([P(i, 0), P(i + 1, 0), P(i + 1, W), P(i, W)], true);
    }
    g.lineStyle(1 * DPR, 0x000000, 0.16);
    for (let i = 1; i < W; i++) line(g, P(i, 0), P(i, W));

    // Lichtkegel vom Fenster
    const wa = W * 0.2;
    const wb = wa + 1.6;
    g.fillStyle(0xfff3c4, 0.1);
    g.fillPoints([P(wa, 0), P(wb, 0), P(wb + 2.2, 3.4), P(wa + 2.2, 3.4)], true);

    // Wände
    g.fillStyle(0xbfc4cd, 1);
    g.fillPoints([P(0, 0), P(0, W), P(0, W, WALL), P(0, 0, WALL)], true);
    g.fillStyle(0xd6d9df, 1);
    g.fillPoints([P(0, 0), P(W, 0), P(W, 0, WALL), P(0, 0, WALL)], true);
    g.fillStyle(0x9ea4b2, 1);
    g.fillPoints([P(0, 0), P(0, W), P(0, W, 7), P(0, 0, 7)], true);
    g.fillStyle(0xb4b9c4, 1);
    g.fillPoints([P(0, 0), P(W, 0), P(W, 0, 7), P(0, 0, 7)], true);

    // Fenster
    const fw = [P(wa, 0, 40), P(wb, 0, 40), P(wb, 0, 80), P(wa, 0, 80)];
    g.fillStyle(0x7fb8e6, 1);
    g.fillPoints(fw, true);
    g.fillStyle(0xcfe8ff, 0.55);
    g.fillPoints([P(wa + 0.1, 0, 60), P(wa + 0.45, 0, 60), P(wa + 0.45, 0, 78), P(wa + 0.1, 0, 78)], true);
    g.lineStyle(3 * DPR, 0x8c90c0, 1);
    g.strokePoints(fw, true, true);
    line(g, P((wa + wb) / 2, 0, 40), P((wa + wb) / 2, 0, 80));
    line(g, P(wa, 0, 60), P(wb, 0, 60));

    // Bild
    const pa = W * 0.45;
    const pb = pa + 1.8;
    g.fillStyle(0x3a2a22, 1);
    g.fillPoints([P(0, pa - 0.08, 40), P(0, pb + 0.08, 40), P(0, pb + 0.08, 84), P(0, pa - 0.08, 84)], true);
    g.fillStyle(0xe0553a, 1);
    g.fillPoints([P(0, pa, 42), P(0, pb, 42), P(0, pb, 82), P(0, pa, 82)], true);
    g.fillStyle(0xffb36b, 0.7);
    g.fillPoints([P(0, pa + 0.3, 50), P(0, pb - 0.4, 50), P(0, pb - 0.4, 74), P(0, pa + 0.3, 74)], true);
    g.fillStyle(0x2b1d2e, 0.8);
    g.fillPoints([P(0, pa + 0.9, 42), P(0, pb, 42), P(0, pb, 60), P(0, pa + 0.9, 62)], true);

    // Kanten
    g.lineStyle(2 * DPR, 0xf2f3f5, 1);
    line(g, P(0, 0, WALL), P(W, 0, WALL));
    line(g, P(0, 0, WALL), P(0, W, WALL));
    g.lineStyle(4 * DPR, 0xf4f4f6, 1);
    line(g, P(0, 0), P(W, 0));
    line(g, P(0, 0), P(0, W));
    line(g, P(0, W), P(W, W));
    line(g, P(W, W), P(W, 0));

    // Objekte, nach Tiefe sortiert
    const led: LedFn = (x, y, c, phase) => this.ledPts.push({ x, y, c, phase });
    const items: { d: number; draw: () => void }[] = [];
    const decor = DECOR[room.id] ?? DECOR.dc.filter((d) => d.v < 2.1);
    for (const d of decor) {
      items.push({ d: d.u + d.v + (d.du + d.dv) / 2, draw: () => drawDeco(g, d, led) });
      if (room.id === 'kid' && d.kind === 'chair') {
        const p = P(d.u + d.du / 2, d.v + d.dv / 2 + 0.1, 11);
        this.charPos = { x: p.x, y: p.y };
      }
    }
    const slots = game.s.rooms[room.id] ?? [];
    room.spots.forEach(([u, v], idx) => {
      items.push({ d: u + v + 1.2, draw: () => this.drawSlot(g, u, v, idx, slots[idx] ?? null, hot) });
    });
    items.sort((a, b) => a.d - b.d).forEach((it) => it.draw());
  }

  private drawSlot(g: G, u: number, v: number, idx: number, id: string | null, hot: boolean) {
    box(g, u, v, 1.2, 1.2, 3, 0x262b38);
    const poly = [P(u, v, 3), P(u + 1.2, v, 3), P(u + 1.2, v + 1.2, 3), P(u, v + 1.2, 3)];
    if (id && game.s.machines[id]) {
      const st = game.mstat(id);
      const defaultCoin = coinDef(game.s.roomCoin[game.s.active] ?? DEFAULT_COIN);
      const idle = !game.canMine(id, game.ops.rigCoin(id, defaultCoin).id);
      const led = idle ? 0x3a3f4f : hot ? 0xff6a3d : st.ledColor;
      const fan = (x: number, y: number, sc: number) => {
        g.fillStyle(0x10131c, 1);
        g.fillEllipse(x, y, 40 * zoom * sc, 20 * zoom * sc);
        g.lineStyle(1.2 * DPR, shade(st.color, 1.3), 0.8);
        g.strokeEllipse(x, y, 40 * zoom * sc, 20 * zoom * sc);
        if (!idle) this.fans.push({ x, y, hot, s: sc });
      };
      const addLed = (p: Pt, k: number) => this.ledPts.push({ x: p.x, y: p.y, c: led, phase: idx * 1.3 + k });
      switch (st.model) {
        case 'tower': {
          const H = 44;
          box(g, u + 0.35, v + 0.2, 0.5, 0.8, H, st.color, 3, 0);
          // Glasseite mit Grafikkarten
          const z0 = 3;
          const win = [P(u + 0.4, v + 1.0, z0 + 6), P(u + 0.8, v + 1.0, z0 + 6), P(u + 0.8, v + 1.0, z0 + H - 6), P(u + 0.4, v + 1.0, z0 + H - 6)];
          g.fillStyle(0x0b0e16, 0.9);
          g.fillPoints(win, true);
          g.fillStyle(led, idle ? 0.05 : 0.22);
          g.fillPoints(win, true);
          st.gpus.forEach((gid, k) => {
            const z = z0 + 12 + k * 10;
            g.lineStyle(4 * zoom, partDef(gid).color === 0x111318 ? 0x3a3f4f : partDef(gid).color, 1);
            line(g, P(u + 0.44, v + 1.0, z), P(u + 0.76, v + 1.0, z));
          });
          g.lineStyle(1 * DPR, 0xffffff, 0.25);
          g.strokePoints(win, true);
          fan(P(u + 0.6, v + 0.6, z0 + H).x, P(u + 0.6, v + 0.6, z0 + H).y, 0.42);
          addLed(P(u + 0.85, v + 0.35, z0 + H - 8), 0);
          addLed(P(u + 0.85, v + 0.35, z0 + 8), 1);
          break;
        }
        case 'rig': {
          const n = Math.max(1, st.gpus.length);
          const fc = st.color;
          box(g, u + 0.08, v + 0.08, 1.04, 1.04, 4, shade(fc, 0.6), 3);
          // hintere Pfosten
          box(g, u + 0.08, v + 0.08, 0.07, 0.07, 30, fc, 7);
          box(g, u + 1.05, v + 0.08, 0.07, 0.07, 30, fc, 7);
          box(g, u + 0.08, v + 1.05, 0.07, 0.07, 30, fc, 7);
          // Mainboard hinten
          box(g, u + 0.2, v + 0.12, 0.8, 0.12, 16, 0x2f5b6b, 7);
          const w = 0.88 / n;
          st.gpus.forEach((gid, k) => {
            const cu = u + 0.16 + k * w;
            const col = partDef(gid).color;
            box(g, cu, v + 0.32, w * 0.62, 0.62, 20, col === 0x111318 ? 0x2a2f38 : col, 9);
            if (n <= 6 || k % 2 === 0) {
              const p = P(cu + w * 0.31, v + 0.63, 29);
              fan(p.x, p.y, Math.min(0.3, 0.9 / n + 0.08));
            }
            addLed(P(cu + w * 0.31, v + 0.94, 26), k);
          });
          // vorderer Pfosten und obere Schiene
          box(g, u + 1.05, v + 1.05, 0.07, 0.07, 30, fc, 7);
          box(g, u + 0.08, v + 1.05, 1.04, 0.07, 2, fc, 37);
          box(g, u + 1.05, v + 0.08, 0.07, 1.04, 2, fc, 37);
          break;
        }
        case 'asic': {
          const H = st.hash >= 2000 ? 50 : st.hash >= 800 ? 46 : 34;
          box(g, u + 0.15, v + 0.15, 0.9, 0.9, H, st.color, 3, 3);
          const f = P(u + 0.6, v + 0.6, 3 + H);
          fan(f.x, f.y, 1);
          if (st.hash >= 2000) {
            g.lineStyle(3 * zoom, 0x7ab8ff, 0.9);
            line(g, P(u + 1.05, v + 0.3, 10), P(u + 1.05, v + 0.3, H - 4));
            line(g, P(u + 1.05, v + 0.8, 10), P(u + 1.05, v + 0.8, H - 4));
          }
          for (let k = 0; k < 2; k++) addLed(P(u + 1.05, v + 0.3 + k * 0.45, 3 + H * 0.55), k);
          break;
        }
        default: {
          const H = st.model === 'fusion' ? 64 : 56;
          box(g, u + 0.15, v + 0.15, 0.9, 0.9, H, st.color, 3, 3);
          const f = P(u + 0.6, v + 0.6, 3 + H);
          g.fillStyle(led, idle ? 0.1 : 0.35);
          g.fillEllipse(f.x, f.y, 46 * zoom, 23 * zoom);
          fan(f.x, f.y, 0.8);
          for (let k = 0; k < 3; k++) addLed(P(u + 1.05, v + 0.25 + k * 0.3, 3 + H * 0.6), k);
        }
      }
    }
    const c = P(u + 0.6, v + 0.6);
    this.hits.push({ x: c.x, y: c.y - 14 * zoom, idx, poly });
  }

  private findHit(p: Phaser.Input.Pointer): Hit | undefined {
    if (!game.s.rooms[game.s.active]) return undefined;
    const slots = game.s.rooms[game.s.active];
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const hit = this.hits[i];
      const x = Math.abs(p.x - hit.x) / zoom;
      const y = (p.y - hit.y) / zoom - 11;
      if (x / (TW * 0.6) + Math.abs(y) / (TH * 0.6) <= 1) return hit;
      if (slots[hit.idx] && x <= 22 && y < 0 && y >= -64) return hit;
    }
    return undefined;
  }

  private onPress(p: Phaser.Input.Pointer) {
    sfx.unlock();
    const hit = this.findHit(p);
    if (hit) {
      const slots = game.s.rooms[game.s.active];
      const before = slots[hit.idx];
      game.toggleSlot(hit.idx);
      if (game.s.rooms[game.s.active][hit.idx] !== before) {
        sfx.place();
        this.burst(hit.x, hit.y, before ? 0xffc857 : 0x4fd1c5, 14);
      }
      return;
    }
    const r = game.click();
    sfx.click();
    if (r.crit) sfx.fx('crit');
    this.burst(p.x, p.y, r.crit ? 0xffc857 : 0x4fd1c5, r.crit ? 18 : 8);
    const amt = r.amt < 0.01 ? r.amt.toFixed(5) : r.amt < 10 ? r.amt.toFixed(3) : r.amt.toFixed(1);
    this.floatText(p.x, p.y, `${r.crit ? 'KRIT! ' : ''}+${amt} ${r.coin}${r.combo >= 5 ? ` ×${(1 + r.combo * 0.04).toFixed(2)}` : ''}`, r.crit ? '#ffd479' : '#7af5e8');
  }

  private center(): Pt {
    const W = roomDef(game.s.active).size;
    return P(W / 2, W / 2, 24);
  }

  private shake(ms: number, k: number) {
    if (settings.shake) this.cameras.main.shake(ms, k);
  }

  private onFx(name: string) {
    sfx.fx(name);
    const c = this.center();
    switch (name) {
      case 'hack': this.cameras.main.flash(250, 255, 40, 40); this.shake(400, 0.01); break;
      case 'crash': this.cameras.main.flash(200, 255, 80, 60); this.shake(500, 0.008); break;
      case 'boom': this.cameras.main.flash(200, 255, 220, 100); this.burst(c.x, c.y, 0xffc857, 30); break;
      case 'outage': this.shake(300, 0.005); break;
      case 'end-outage': this.cameras.main.flash(250, 120, 255, 240); break;
      case 'fail': this.shake(250, 0.007); this.burst(c.x, c.y, 0xffe066, 14); break;
      case 'block': this.burst(c.x, c.y, 0xffc857, 24); this.floatText(c.x, c.y - 30 * DPR, 'BLOCK GEFUNDEN!', '#ffd479'); break;
      case 'research': this.burst(c.x, c.y, 0x8c7bff, 24); break;
      case 'repair': this.burst(c.x, c.y, 0x7ee787, 16); break;
      case 'overdrive': this.cameras.main.flash(250, 255, 120, 60); this.burst(c.x, c.y, 0xff6a3d, 30); this.floatText(c.x, c.y - 30 * DPR, 'OVERDRIVE!', '#ff9a6b'); break;
      case 'bonus': this.burst(c.x, c.y, 0xffc857, 22); break;
      case 'prestige': this.burst(c.x, c.y, 0xffffff, 40); break;
      case 'win': this.burst(c.x, c.y, 0xffc857, 18); break;
    }
  }

  private floatText(x: number, y: number, msg: string, color = '#7af5e8') {
    const t = this.add
      .text(x, y - 8 * DPR, msg, { fontFamily: 'Inter, system-ui, sans-serif', fontSize: `${15 * DPR}px`, fontStyle: 'bold', color, stroke: '#06201d', strokeThickness: 4 * DPR })
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({ targets: t, y: y - 60 * DPR, alpha: 0, scale: 1.2, duration: 800, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }
}
