import Phaser from 'phaser';
import { game } from './game';
import { gadgetDef, roomDef } from './config';
import type { RoomDef } from './config';

const TW = 64;
const TH = 32;
const WALL = 96;
let ox = 0;
let oy = 0;
let zoom = 1;

type G = Phaser.GameObjects.Graphics;
type Pt = { x: number; y: number };

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

/** Quader mit Basis z0 und Höhe h. Sichtbar: Oberseite, Front-Flächen. */
function box(g: G, u: number, v: number, du: number, dv: number, h: number, c: number, z0 = 0) {
  const t = z0 + h;
  const top = [P(u, v, t), P(u + du, v, t), P(u + du, v + dv, t), P(u, v + dv, t)];
  const right = [P(u + du, v, z0), P(u + du, v + dv, z0), P(u + du, v + dv, t), P(u + du, v, t)];
  const left = [P(u, v + dv, z0), P(u + du, v + dv, z0), P(u + du, v + dv, t), P(u, v + dv, t)];
  g.fillStyle(shade(c, 0.78), 1);
  g.fillPoints(left, true);
  g.fillStyle(shade(c, 0.92), 1);
  g.fillPoints(right, true);
  g.fillStyle(shade(c, 1.15), 1);
  g.fillPoints(top, true);
  g.lineStyle(1, 0x000000, 0.25);
  g.strokePoints(top, true);
}

type Kind = 'bed' | 'desk' | 'rack' | 'plant' | 'crate' | 'bench';
interface Deco { kind: Kind; u: number; v: number; du: number; dv: number; }

const DECOR: Record<string, Deco[]> = {
  kid: [
    { kind: 'bed', u: 0.4, v: 0.3, du: 2.0, dv: 1.6 },
    { kind: 'desk', u: 3.6, v: 0.2, du: 2.0, dv: 1.0 },
    { kind: 'rack', u: 0.3, v: 2.4, du: 0.9, dv: 0.9 },
    { kind: 'plant', u: 5.0, v: 4.9, du: 0.7, dv: 0.7 },
  ],
  store: [
    { kind: 'crate', u: 0.4, v: 0.4, du: 1.4, dv: 1.4 },
    { kind: 'crate', u: 2.2, v: 0.4, du: 1.2, dv: 1.2 },
    { kind: 'rack', u: 6.0, v: 0.3, du: 1.0, dv: 1.0 },
    { kind: 'plant', u: 0.4, v: 6.6, du: 0.7, dv: 0.7 },
  ],
  garage: [
    { kind: 'bench', u: 0.3, v: 0.3, du: 3.0, dv: 1.0 },
    { kind: 'rack', u: 8.0, v: 0.3, du: 1.0, dv: 1.0 },
    { kind: 'rack', u: 8.0, v: 1.8, du: 1.0, dv: 1.0 },
    { kind: 'crate', u: 0.4, v: 8.0, du: 1.4, dv: 1.4 },
    { kind: 'plant', u: 9.0, v: 9.0, du: 0.7, dv: 0.7 },
  ],
};

function drawDeco(g: G, d: Deco) {
  const { u, v, du, dv } = d;
  switch (d.kind) {
    case 'bed':
      box(g, u, v, du, dv, 10, 0x8c90c0);
      box(g, u + 0.1, v + 0.1, du * 0.35, dv - 0.2, 6, 0xf2f2f7, 10);
      break;
    case 'desk':
      box(g, u, v, du, dv, 16, 0x8c90c0);
      box(g, u + du - 0.55, v + 0.15, 0.4, 0.6, 28, 0x2b2e36, 16);
      box(g, u + 0.3, v + 0.1, du - 1.2, 0.14, 26, 0x1f2430, 16);
      break;
    case 'rack':
      box(g, u, v, du, dv, 62, 0x3a3d44);
      break;
    case 'crate':
      box(g, u, v, du, dv, 22, 0xb8862b);
      break;
    case 'bench':
      box(g, u, v, du, dv, 20, 0x6b5a4a);
      break;
    case 'plant': {
      box(g, u, v, du, dv, 12, 0xa0522d);
      const c = P(u + du / 2, v + dv / 2, 12);
      g.fillStyle(0x3e9142, 1);
      g.fillCircle(c.x, c.y - 12 * zoom, 15 * zoom);
      g.fillStyle(0x4caf50, 1);
      g.fillCircle(c.x - 5 * zoom, c.y - 18 * zoom, 10 * zoom);
      break;
    }
  }
}

interface Led { x: number; y: number; c: number; phase: number; }
interface Hit { x: number; y: number; idx: number; }

export class MainScene extends Phaser.Scene {
  private bg!: G;
  private room!: G;
  private leds!: G;
  private ledPts: Led[] = [];
  private hits: Hit[] = [];
  private t = 0;

  constructor() {
    super('main');
  }

  create() {
    this.bg = this.add.graphics();
    this.room = this.add.graphics();
    this.leds = this.add.graphics();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPress(p));
    this.scale.on('resize', () => this.refresh());
    game.on('change', () => this.refresh());
    this.refresh();
  }

  update(_time: number, delta: number) {
    game.update(delta / 1000);
    this.t += delta / 1000;
    const powered = game.s.cash > 0;
    this.leds.clear();
    for (const l of this.ledPts) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 5 + l.phase);
      const a = powered ? 0.45 + 0.55 * pulse : 0.15;
      this.leds.fillStyle(l.c, a);
      this.leds.fillCircle(l.x, l.y, 3 * zoom);
      this.leds.fillStyle(l.c, a * 0.25);
      this.leds.fillCircle(l.x, l.y, 7 * zoom);
    }
  }

  private refresh() {
    this.layout();
    this.drawBg();
    this.drawRoom(roomDef(game.s.active));
  }

  private layout() {
    const w = this.scale.width;
    const h = this.scale.height;
    const wide = w >= 700;
    const room = roomDef(game.s.active);
    const W = room.size;
    const left = 0;
    const right = wide ? w - 340 : w;
    const top = 72;
    const bottom = wide ? h - 90 : h * 0.55;
    zoom = Math.min(((right - left) * 0.9) / (W * TW), ((bottom - top) * 0.85) / (WALL + W * TH), 2.2);
    ox = (left + right) / 2;
    oy = (top + bottom) / 2 - ((W * TH - WALL) * zoom) / 2;
  }

  private drawBg() {
    const w = this.scale.width;
    const h = this.scale.height;
    const g = this.bg;
    g.clear();
    g.lineStyle(1, 0x4fd1c5, 0.05);
    for (let x = 0; x < w; x += 48) line(g, { x, y: 0 }, { x, y: h });
    for (let y = 0; y < h; y += 48) line(g, { x: 0, y }, { x: w, y });
  }

  private drawRoom(room: RoomDef) {
    const g = this.room;
    g.clear();
    this.ledPts = [];
    this.hits = [];
    const W = room.size;
    const hot = (game.roomStats[room.id]?.throttle ?? 1) < 1;

    // Boden mit Dielen
    g.fillStyle(0xa87a2c, 1);
    g.fillPoints([P(0, 0), P(W, 0), P(W, W), P(0, W)], true);
    g.lineStyle(1, 0x000000, 0.16);
    for (let i = 1; i < W; i++) line(g, P(i, 0), P(i, W));

    // Wände (hinten links und rechts)
    g.fillStyle(0xbfc4cd, 1);
    g.fillPoints([P(0, 0), P(0, W), P(0, W, WALL), P(0, 0, WALL)], true);
    g.fillStyle(0xd6d9df, 1);
    g.fillPoints([P(0, 0), P(W, 0), P(W, 0, WALL), P(0, 0, WALL)], true);

    // Fenster auf der rechten Wand
    const wa = W * 0.2;
    const wb = wa + 1.6;
    const fw = [P(wa, 0, 40), P(wb, 0, 40), P(wb, 0, 80), P(wa, 0, 80)];
    g.fillStyle(0x7fb8e6, 1);
    g.fillPoints(fw, true);
    g.lineStyle(3, 0x8c90c0, 1);
    g.strokePoints(fw, true, true);
    line(g, P((wa + wb) / 2, 0, 40), P((wa + wb) / 2, 0, 80));

    // Bild auf der linken Wand
    const pa = W * 0.45;
    const pb = pa + 1.8;
    g.fillStyle(0xe0553a, 1);
    g.fillPoints([P(0, pa, 42), P(0, pb, 42), P(0, pb, 82), P(0, pa, 82)], true);
    g.fillStyle(0xffb36b, 0.6);
    g.fillPoints([P(0, pa + 0.3, 50), P(0, pb - 0.4, 50), P(0, pb - 0.4, 74), P(0, pa + 0.3, 74)], true);

    // Wandkanten und Sockel
    g.lineStyle(2, 0xf2f3f5, 1);
    line(g, P(0, 0, WALL), P(W, 0, WALL));
    line(g, P(0, 0, WALL), P(0, W, WALL));
    g.lineStyle(4, 0xe8e8ea, 1);
    line(g, P(0, 0), P(W, 0));
    line(g, P(0, 0), P(0, W));

    // Objekte, nach Tiefe sortiert
    const items: { d: number; draw: () => void }[] = [];
    for (const d of DECOR[room.id] ?? []) {
      items.push({ d: d.u + d.v + (d.du + d.dv) / 2, draw: () => drawDeco(g, d) });
    }
    const slots = game.s.rooms[room.id] ?? [];
    room.spots.forEach(([u, v], idx) => {
      items.push({ d: u + v + 1.2, draw: () => this.drawSlot(g, u, v, idx, slots[idx] ?? null, hot) });
    });
    items.sort((a, b) => a.d - b.d).forEach((it) => it.draw());
  }

  private drawSlot(g: G, u: number, v: number, idx: number, id: string | null, hot: boolean) {
    box(g, u, v, 1.2, 1.2, 3, 0x262b38);
    if (id) {
      const gd = gadgetDef(id);
      box(g, u + 0.15, v + 0.15, 0.9, 0.9, gd.size, gd.color, 3);
      const f = P(u + 0.6, v + 0.6, 3 + gd.size + 1);
      g.fillStyle(shade(gd.color, 0.45), 1);
      g.fillEllipse(f.x, f.y, 16 * zoom, 8 * zoom);
      const led = P(u + 1.05, v + 0.6, 3 + gd.size * 0.6);
      this.ledPts.push({ x: led.x, y: led.y, c: hot ? 0xff6a3d : gd.ledColor, phase: idx * 1.3 });
    } else {
      g.lineStyle(1.5, 0x4fd1c5, 0.5);
      g.strokePoints([P(u, v, 3), P(u + 1.2, v, 3), P(u + 1.2, v + 1.2, 3), P(u, v + 1.2, 3)], true, true);
    }
    const c = P(u + 0.6, v + 0.6);
    this.hits.push({ x: c.x, y: c.y - 20 * zoom, idx });
  }

  private onPress(p: Phaser.Input.Pointer) {
    if (!game.s.rooms[game.s.active]) return;
    const hit = this.hits.find((h) => Math.abs(p.x - h.x) < 36 * zoom && Math.abs(p.y - h.y) < 40 * zoom);
    if (hit) {
      game.toggleSlot(hit.idx);
      return;
    }
    const gain = game.click();
    this.floatText(p.x, p.y, `+${gain.toFixed(4)} BIT`);
  }

  private floatText(x: number, y: number, msg: string) {
    const t = this.add
      .text(x, y, msg, { fontFamily: 'monospace', fontSize: '14px', color: '#4fd1c5' })
      .setOrigin(0.5);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }
}
