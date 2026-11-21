import { game, MISSIONS, ACHIEVEMENTS } from './game';
import { GADGETS, ROOMS, UPGRADES, upgradeCost } from './config';
import type { GadgetDef } from './config';
import { sfx } from './audio';

type Tab = 'shop' | 'inv' | 'upg' | 'mis' | 'ach' | 'rooms';
const TABS: [Tab, string, string][] = [
  ['shop', '🛒', 'Shop'], ['inv', '🎒', 'Lager'], ['upg', '🔧', 'Upgrades'],
  ['mis', '🎯', 'Missionen'], ['ach', '🏆', 'Erfolge'], ['rooms', '🏠', 'Räume'],
];

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const num = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = (n: number) => `${num(n, Math.abs(n) < 100 ? 2 : 0)} €`;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Zahl, die weich zum Zielwert läuft. */
class Counter {
  cur = NaN;
  target = 0;
  constructor(private el: HTMLElement, private fmt: (n: number) => string, private flash = false) {}
  set(t: number) {
    if (Number.isNaN(this.cur)) this.cur = t;
    if (this.flash && Math.abs(t - this.target) > 0.5) {
      const up = t > this.target;
      this.el.classList.remove('up', 'down');
      void this.el.offsetWidth;
      this.el.classList.add(up ? 'up' : 'down');
      setTimeout(() => this.el.classList.remove('up', 'down'), 500);
    }
    this.target = t;
  }
  tick() {
    const d = this.target - this.cur;
    this.cur = Math.abs(d) < 1e-7 ? this.target : this.cur + d * 0.16;
    this.el.textContent = this.fmt(this.cur);
  }
}

function icon(g: GadgetDef, i: number): string {
  const n = i + 2;
  const r = n > 3 ? 5 : 7;
  const fans = Array.from({ length: n }, (_, k) => {
    const cx = n === 2 ? 20 + k * 24 : 14 + k * (36 / (n - 1));
    return `<circle cx="${cx}" cy="20" r="${r + 1.5}" fill="#161a26"/><g class="spin" style="animation-duration:${0.6 + k * 0.1}s"><path d="M${cx} ${20 - r}V${20 + r}M${cx - r} 20H${cx + r}" stroke="${hex(g.ledColor)}" stroke-width="2" stroke-linecap="round"/></g>`;
  }).join('');
  return `<svg width="58" height="46" viewBox="0 0 64 48"><rect x="3" y="4" width="58" height="34" rx="6" fill="${hex(g.color)}" stroke="#0006" stroke-width="1.5"/><rect x="3" y="4" width="58" height="8" rx="6" fill="#fff2"/>${fans}<circle class="blink" cx="55" cy="9" r="2.4" fill="${hex(g.ledColor)}"/><path d="M8 42h48M8 45h48" stroke="${hex(g.color)}" stroke-width="2" opacity=".6"/></svg>`;
}

const bar = (label: string, v: number, max: number, val: string, color: string) =>
  `<div class="sr"><span>${label}</span><div class="track"><div class="fill" style="width:${Math.min(100, (v / max) * 100)}%;--b:${color}"></div></div><em>${val}</em></div>`;

export class HUD {
  private tab: Tab = 'shop';
  private cash = new Counter($('cash'), eur, true);
  private coins = new Counter($('coins'), (n) => num(n, 4));
  private price = new Counter($('price'), eur);
  private hash = new Counter($('hash'), (n) => `${num(n)} H/s`);
  private slow = 0;
  private lastTs = performance.now();

  constructor() {
    $('tabs').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (b) {
        this.tab = b.dataset.tab as Tab;
        this.renderAll();
      }
    });
    $('content').addEventListener('click', (e) => this.onAction(e));
    $('dock').addEventListener('click', (e) => this.onAction(e));
    $('reset').addEventListener('click', () => {
      if (confirm('Spielstand wirklich löschen?')) game.reset();
    });
    const mute = $('mute');
    mute.textContent = sfx.isMuted() ? '🔇' : '🔊';
    mute.addEventListener('click', () => {
      sfx.unlock();
      mute.textContent = sfx.toggleMute() ? '🔇' : '🔊';
    });
    game.on('change', () => this.renderAll());
    game.on('toast', (m) => this.toast(m ?? ''));
    this.renderAll();
    requestAnimationFrame(() => this.loop());
  }

  toast(msg: string) {
    const gold = /^(Mission|Erfolg)/.test(msg);
    const err = /^(Zu wenig|Raum ist voll|Kein|Keine)/.test(msg);
    if (gold) sfx.win();
    if (err) sfx.error();
    const d = document.createElement('div');
    d.className = `toast ${gold ? 'gold' : err ? 'err' : ''}`;
    d.textContent = `${gold ? (msg.startsWith('Mission') ? '🎯 ' : '🏆 ') : err ? '⚠️ ' : '🔔 '}${msg}`;
    $('toasts').appendChild(d);
    setTimeout(() => d.remove(), 3300);
  }

  private onAction(e: Event) {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b || b.hasAttribute('disabled')) return;
    const id = b.dataset.id ?? '';
    const before = game.s.cash;
    switch (b.dataset.act) {
      case 'buy-gadget': game.buyGadget(id); break;
      case 'place': game.placeItem(); break;
      case 'buy-upg': game.buyUpgrade(id); break;
      case 'buy-room': game.buyRoom(id); break;
      case 'room': game.setRoom(id); break;
      case 'sell': game.sell(Number(b.dataset.f)); break;
    }
    if (game.s.cash < before) sfx.buy();
    else if (game.s.cash > before) sfx.sell();
    else if (b.dataset.act === 'place') sfx.place();
  }

  private renderAll() {
    this.renderTabs();
    this.renderContent();
    this.renderRooms();
    this.renderQuest();
    this.updateAfford();
  }

  private renderTabs() {
    const inv = Object.values(game.s.inv).reduce((a, b) => a + b, 0);
    $('tabs').innerHTML = TABS.map(([k, ic, l]) =>
      `<button data-tab="${k}" class="${k === this.tab ? 'on' : ''}"><i>${ic}</i><span>${l}</span>${k === 'inv' && inv > 0 ? `<em class="badge">${inv}</em>` : ''}</button>`).join('');
  }

  private renderContent() {
    const el = $('content');
    const scroll = el.scrollTop;
    let h = '';
    switch (this.tab) {
      case 'shop': h = this.shop(); break;
      case 'inv': h = this.inventory(); break;
      case 'upg': h = this.upgrades(); break;
      case 'mis': h = this.missions(); break;
      case 'ach': h = this.achievements(); break;
      case 'rooms': h = this.rooms(); break;
    }
    el.innerHTML = h;
    el.scrollTop = scroll;
  }

  private shop(): string {
    const maxH = Math.max(...GADGETS.map((g) => g.hash));
    const maxW = Math.max(...GADGETS.map((g) => g.watts));
    const maxT = Math.max(...GADGETS.map((g) => g.heat));
    const rar = ['Common', 'Rare', 'Epic'];
    return GADGETS.map((g, i) => {
      const net = game.netPerSec(g.hash, g.watts);
      const roi = net > 0 ? `<span class="good">Amortisation ca. ${num(g.cost / net / 60, 1)} min</span>` : '<span class="bad">Bei aktuellem Kurs unrentabel</span>';
      return `<div class="card" style="--c:${hex(g.ledColor)}">
        <div class="head">${icon(g, i)}
          <div style="flex:1"><div class="row"><span class="name">${g.name}</span><span class="tag">${rar[i] ?? 'Epic'}</span></div>
          <div class="muted">Besitz: ${game.owned(g.id)}</div></div>
        </div>
        <div class="bars">
          ${bar('Hash', g.hash, maxH, `${num(g.hash)} H/s`, '#8c7bff')}
          ${bar('Strom', g.watts, maxW, `${num(g.watts)} W`, '#ffc857')}
          ${bar('Hitze', g.heat, maxT, num(g.heat), '#ff6a3d')}
        </div>
        <div class="row"><span class="roi">${roi}<br><span class="muted">Netto ${net >= 0 ? '+' : ''}${num(net, 3)} €/s</span></span>
          <button class="buy" data-act="buy-gadget" data-id="${g.id}" data-cost="${g.cost}">${eur(g.cost)}</button></div>
      </div>`;
    }).join('');
  }

  private inventory(): string {
    const room = ROOMS.find((r) => r.id === game.s.active)!;
    const slots = game.s.rooms[room.id] ?? [];
    const free = slots.filter((s) => s === null).length;
    const items = GADGETS.map((g, i) => ({ g, i, n: game.s.inv[g.id] ?? 0 })).filter((x) => x.n > 0);
    const list = items.map(({ g, i, n }) => `<div class="card" style="--c:${hex(g.ledColor)}"><div class="head">${icon(g, i)}<div style="flex:1"><div class="name">${g.name}</div><div class="muted">${num(g.hash)} H/s · ${num(g.watts)} W</div></div><b style="font-size:18px">× ${n}</b></div></div>`).join('');
    return `<div class="sect">${room.name} · ${slots.length - free}/${slots.length} Slots belegt</div>
      <button class="primary" style="width:100%;margin-bottom:10px" data-act="place" ${free === 0 || items.length === 0 ? 'disabled' : ''}>Bestes Gadget platzieren</button>
      ${list || '<div class="muted" style="padding:14px 4px">Kein Gadget im Lager. Kaufe eins im Shop.</div>'}
      <div class="muted" style="margin-top:6px">Tipp: Klicke im Raum auf einen Slot, um ein Gadget zu setzen oder herauszunehmen.</div>`;
  }

  private upgrades(): string {
    return UPGRADES.map((u) => {
      const lvl = game.s.upgrades[u.id] ?? 0;
      const cost = upgradeCost(u, lvl);
      const pips = Array.from({ length: u.max }, (_, k) => `<span style="flex:1;height:6px;border-radius:3px;background:${k < lvl ? 'var(--acc)' : 'rgba(255,255,255,.08)'}"></span>`).join('');
      const btn = lvl >= u.max ? '<span class="tag" style="--c:var(--acc)">Max</span>' : `<button class="buy" data-act="buy-upg" data-id="${u.id}" data-cost="${cost}">${eur(cost)}</button>`;
      return `<div class="card" style="--c:${lvl >= u.max ? 'var(--acc)' : '#8c7bff'}">
        <div class="row"><span class="name">${u.name}</span><span class="muted">Stufe ${lvl}/${u.max}</span></div>
        <div class="muted" style="margin:3px 0 8px">${u.desc}</div>
        <div style="display:flex;gap:4px;margin-bottom:8px">${pips}</div>
        <div class="row" style="justify-content:flex-end">${btn}</div>
      </div>`;
    }).join('');
  }

  private missions(): string {
    return MISSIONS.map((m, i) => {
      const state = i < game.s.mission ? 'done' : i === game.s.mission ? 'cur' : 'lock';
      const [c, t] = m.prog(game);
      const pct = state === 'done' ? 100 : (c / t) * 100;
      return `<div class="card ${state}">
        <div class="row"><span class="name">${state === 'done' ? '✅' : state === 'cur' ? '▶️' : '🔒'} ${m.title}</span><span class="tag" style="--c:var(--gold)">+${num(m.reward)} €</span></div>
        <div class="muted" style="margin:3px 0 7px">${m.desc}</div>
        <div class="track"><div class="fill" style="width:${pct}%;--b:var(--gold)"></div></div>
      </div>`;
    }).join('');
  }

  private achievements(): string {
    return `<div class="sect">${game.s.ach.length} von ${ACHIEVEMENTS.length} freigeschaltet</div>` + ACHIEVEMENTS.map((a) => {
      const ok = game.s.ach.includes(a.id);
      return `<div class="card ${ok ? 'done' : 'lock'}"><div class="row"><span class="name">${ok ? '🏆' : '🔒'} ${a.name}</span></div><div class="muted">${a.desc}</div></div>`;
    }).join('');
  }

  private rooms(): string {
    return ROOMS.map((r) => {
      const owned = !!game.s.rooms[r.id];
      const active = game.s.active === r.id;
      const btn = owned
        ? `<button data-act="room" data-id="${r.id}" class="${active ? 'on' : ''}">${active ? 'Aktiv' : 'Wechseln'}</button>`
        : `<button class="buy" data-act="buy-room" data-id="${r.id}" data-cost="${r.cost}">${eur(r.cost)}</button>`;
      return `<div class="card ${owned ? '' : 'lock'}" style="--c:${active ? 'var(--acc)' : '#3a4a7a'}">
        <div class="row"><span class="name">${owned ? '🏠' : '🔒'} ${r.name}</span>${btn}</div>
        <div class="bars">${bar('Slots', r.spots.length, 6, `${r.spots.length}`, '#8c7bff')}${bar('Kühlung', r.maxHeat, 700, num(r.maxHeat), '#4fd1c5')}</div>
      </div>`;
    }).join('');
  }

  private renderRooms() {
    $('rooms').innerHTML = ROOMS.filter((r) => game.s.rooms[r.id])
      .map((r) => `<button class="chip glass ${r.id === game.s.active ? 'on' : ''}" data-act="room" data-id="${r.id}">${r.name}</button>`)
      .join('');
  }

  private renderQuest() {
    const m = MISSIONS[game.s.mission];
    if (!m) {
      $('quest').innerHTML = '<small>Missionen</small><div class="t">Alle erledigt 🎉</div>';
      return;
    }
    const [c, t] = m.prog(game);
    $('quest').innerHTML = `<small>Aktuelle Mission</small><div class="t">${m.title}</div><div class="d">${m.desc}</div>
      <div class="track"><div class="fill" style="width:${(c / t) * 100}%;--b:var(--gold)"></div></div>
      <div class="row muted" style="margin-top:5px"><span>${num(c, c % 1 ? 1 : 0)} / ${num(t)}</span><span>+${num(m.reward)} €</span></div>`;
  }

  private updateAfford() {
    const cash = game.s.cash;
    document.querySelectorAll<HTMLElement>('[data-cost]').forEach((b) => {
      b.toggleAttribute('disabled', cash < Number(b.dataset.cost));
    });
  }

  private loop() {
    const now = performance.now();
    const dt = (now - this.lastTs) / 1000;
    this.lastTs = now;
    this.cash.set(game.s.cash);
    this.coins.set(game.s.coins);
    this.price.set(game.price);
    this.hash.set(game.hashTotal);
    this.cash.tick(); this.coins.tick(); this.price.tick(); this.hash.tick();
    $('cash').classList.toggle('neg', game.s.cash < 0);

    this.slow += dt;
    if (this.slow >= 0.25) {
      this.slow = 0;
      this.updateSlow();
    }
    requestAnimationFrame(() => this.loop());
  }

  private updateSlow() {
    const net = game.bitPerSec * game.price - game.powerEurPerSec;
    const netEl = $('net');
    netEl.textContent = game.s.cash < 0 ? 'Strom gesperrt' : `${net >= 0 ? '+' : ''}${num(net, 3)} €/s`;
    netEl.classList.toggle('neg', game.s.cash < 0 || net < 0);
    netEl.classList.toggle('up', game.s.cash >= 0 && net > 0);

    const pts = game.priceHistory;
    const chg = (game.price / pts[0] - 1) * 100;
    const ch = $('chg');
    ch.textContent = ` ${chg >= 0 ? '▲' : '▼'} ${num(Math.abs(chg), 1)} %`;
    ch.style.color = chg >= 0 ? '#7ee787' : '#ff6a3d';
    $('regime').textContent = game.regime === 'bull' ? '· Bullenmarkt' : game.regime === 'bear' ? '· Bärenmarkt' : '· Seitwärts';
    this.drawSpark(pts, chg >= 0);

    const room = ROOMS.find((r) => r.id === game.s.active)!;
    const st = game.roomStats[room.id];
    if (st) {
      const ratio = st.heat / room.maxHeat;
      const fill = $('heatFill');
      fill.style.width = `${Math.min(100, ratio * 100)}%`;
      fill.className = `fill ${ratio >= 1 ? 'hot' : ratio > 0.7 ? 'warn' : 'ok'}`;
      $('roomName').innerHTML = `<b>${room.name}</b>`;
      $('heatTxt').textContent = `Hitze ${num(st.heat)} / ${num(room.maxHeat)}${st.throttle < 1 ? ` · gedrosselt auf ${num(st.throttle * 100)} %` : ''}`;
      $('roomSub').textContent = `${num(st.hash)} H/s · ${num(st.power)} W Verbrauch · Strom ${num(game.powerEurPerSec, 3)} €/s`;
    }
    const c = game.s.coins;
    $('sell50').textContent = `50 % · ${eur(c * 0.5 * game.price)}`;
    $('sellAll').textContent = `Alles verkaufen · ${eur(c * game.price)}`;
    ($('sell50') as HTMLButtonElement).disabled = c < 1e-6;
    const all = $('sellAll') as HTMLButtonElement;
    all.disabled = c < 1e-6;
    all.classList.toggle('pulse', c * game.price >= 20);
    this.updateAfford();
    sfx.setHum(game.hashTotal / 1500);
  }

  private drawSpark(pts: number[], up: boolean) {
    const c = document.getElementById('spark') as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const col = up ? '#4fd1c5' : '#ff6a3d';
    ctx.clearRect(0, 0, c.width, c.height);
    const xy = (p: number, i: number): [number, number] => [(i / Math.max(1, pts.length - 1)) * c.width, c.height - 3 - ((p - min) / (max - min || 1)) * (c.height - 6)];
    const grad = ctx.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, `${col}55`);
    grad.addColorStop(1, `${col}00`);
    ctx.beginPath();
    pts.forEach((p, i) => { const [x, y] = xy(p, i); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.lineTo(c.width, c.height);
    ctx.lineTo(0, c.height);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  /** Von der Szene genutzt: Layout-Breite für Panel-Bereich. */
  static isWide(): boolean {
    return window.innerWidth >= 900;
  }
}
