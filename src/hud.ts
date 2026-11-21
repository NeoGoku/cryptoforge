import { game, MISSIONS, ACHIEVEMENTS } from './game';
import { GADGETS, ROOMS, UPGRADES, upgradeCost } from './config';

type Tab = 'shop' | 'inv' | 'upg' | 'mis' | 'ach' | 'rooms';
const TABS: [Tab, string][] = [
  ['shop', 'Shop'], ['inv', 'Inventar'], ['upg', 'Upgrades'], ['mis', 'Missionen'], ['ach', 'Erfolge'], ['rooms', 'Räume'],
];

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const num = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = (n: number) => `${num(n, Math.abs(n) < 100 ? 2 : 0)} €`;

export class HUD {
  private tab: Tab = 'shop';

  constructor() {
    $('tabs').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (b) {
        this.tab = b.dataset.tab as Tab;
        this.renderAll();
      }
    });
    $('content').addEventListener('click', (e) => this.onAction(e));
    $('footer').addEventListener('click', (e) => this.onAction(e));
    $('reset').addEventListener('click', () => {
      if (confirm('Spielstand wirklich löschen?')) game.reset();
    });
    game.on('change', () => this.renderAll());
    game.on('toast', (m) => this.toast(m ?? ''));
    setInterval(() => this.updateStats(), 200);
    this.renderAll();
  }

  toast(msg: string) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = msg;
    $('toasts').appendChild(d);
    setTimeout(() => d.remove(), 3200);
  }

  private onAction(e: Event) {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b || b.hasAttribute('disabled')) return;
    const id = b.dataset.id ?? '';
    switch (b.dataset.act) {
      case 'buy-gadget': game.buyGadget(id); break;
      case 'place': game.placeItem(); break;
      case 'buy-upg': game.buyUpgrade(id); break;
      case 'buy-room': game.buyRoom(id); break;
      case 'room': game.setRoom(id); break;
      case 'sell': game.sell(Number(b.dataset.f)); break;
    }
  }

  private renderAll() {
    this.renderTabs();
    this.renderContent();
    this.renderRooms();
    this.updateStats();
  }

  private renderTabs() {
    $('tabs').innerHTML = TABS.map(([k, l]) => `<button data-tab="${k}" class="${k === this.tab ? 'on' : ''}">${l}</button>`).join('');
  }

  private renderContent() {
    const cash = game.s.cash;
    let h = '';
    switch (this.tab) {
      case 'shop':
        h = GADGETS.map((g, i) => `
          <div class="card">
            <div class="row"><b>${g.name}</b><span class="tag">Tier ${i + 1}</span></div>
            <div class="muted">Hash ${num(g.hash)} H/s · ${num(g.watts)} W · Hitze ${num(g.heat)}</div>
            <div class="row">
              <span class="muted">Besitz: ${game.owned(g.id)}</span>
              <button data-act="buy-gadget" data-id="${g.id}" ${cash < g.cost ? 'disabled' : ''}>${eur(g.cost)}</button>
            </div>
          </div>`).join('');
        break;
      case 'inv': {
        const rows = GADGETS.filter((g) => (game.s.inv[g.id] ?? 0) > 0)
          .map((g) => `<div class="row"><span>${g.name}</span><b>× ${game.s.inv[g.id]}</b></div>`).join('');
        const room = ROOMS.find((r) => r.id === game.s.active)!;
        const slots = game.s.rooms[room.id] ?? [];
        const free = slots.filter((s) => s === null).length;
        const hasInv = GADGETS.some((g) => (game.s.inv[g.id] ?? 0) > 0);
        h = `<div class="card">
          <div class="muted">Raum: ${room.name} · freie Slots: ${free}/${slots.length}</div>
          <div class="row" style="margin-top:8px">
            <span class="muted">Im Inventar</span>
            <button data-act="place" ${free === 0 || !hasInv ? 'disabled' : ''}>Platzieren</button>
          </div>
          <div style="margin-top:6px">${rows || '<div class="muted">Kein Gadget im Inventar.</div>'}</div>
          <div class="muted" style="margin-top:8px">Klick auf einen belegten Slot im Raum nimmt das Gadget heraus.</div>
        </div>`;
        break;
      }
      case 'upg':
        h = UPGRADES.map((u) => {
          const lvl = game.s.upgrades[u.id] ?? 0;
          const cost = upgradeCost(u, lvl);
          const btn = lvl >= u.max
            ? '<span class="tag">Max</span>'
            : `<button data-act="buy-upg" data-id="${u.id}" ${cash < cost ? 'disabled' : ''}>${eur(cost)}</button>`;
          return `<div class="card">
            <div class="row"><b>${u.name}</b><span class="muted">Stufe ${lvl}/${u.max}</span></div>
            <div class="muted">${u.desc}</div>
            <div class="row" style="justify-content:flex-end">${btn}</div>
          </div>`;
        }).join('');
        break;
      case 'mis':
        h = MISSIONS.map((m, i) => {
          const state = i < game.s.mission ? 'done' : i === game.s.mission ? 'cur' : 'lock';
          const mark = state === 'done' ? '✓' : state === 'cur' ? '▶' : '·';
          return `<div class="card ${state}">
            <div class="row"><b>${mark} ${m.title}</b><span class="muted">+${num(m.reward)} €</span></div>
            <div class="muted">${m.desc}</div>
          </div>`;
        }).join('');
        break;
      case 'ach':
        h = `<div class="muted" style="margin-bottom:8px">${game.s.ach.length}/${ACHIEVEMENTS.length} freigeschaltet</div>` +
          ACHIEVEMENTS.map((a) => {
            const ok = game.s.ach.includes(a.id);
            return `<div class="card ${ok ? 'done' : 'lock'}">
              <div class="row"><b>${ok ? '🏆' : '🔒'} ${a.name}</b></div>
              <div class="muted">${a.desc}</div>
            </div>`;
          }).join('');
        break;
      case 'rooms':
        h = ROOMS.map((r) => {
          const owned = !!game.s.rooms[r.id];
          const btn = owned
            ? `<button data-act="room" data-id="${r.id}" class="${game.s.active === r.id ? 'on' : ''}">${game.s.active === r.id ? 'Aktiv' : 'Wechseln'}</button>`
            : `<button data-act="buy-room" data-id="${r.id}" ${cash < r.cost ? 'disabled' : ''}>${eur(r.cost)}</button>`;
          return `<div class="card">
            <div class="row"><b>${r.name}</b>${btn}</div>
            <div class="muted">${r.spots.length} Slots · Hitzelimit ${num(r.maxHeat)}</div>
          </div>`;
        }).join('');
        break;
    }
    $('content').innerHTML = h;
  }

  private renderRooms() {
    $('rooms').innerHTML = ROOMS.filter((r) => game.s.rooms[r.id])
      .map((r) => `<button data-act="room" data-id="${r.id}" class="${r.id === game.s.active ? 'on' : ''}">${r.name}</button>`)
      .join('');
  }

  updateStats() {
    const cash = $('cash');
    cash.textContent = eur(game.s.cash);
    cash.classList.toggle('neg', game.s.cash < 0);
    $('coins').textContent = `${num(game.s.coins, 4)} BIT`;
    $('price').textContent = eur(game.price);
    $('hash').textContent = `${num(game.hashTotal)} H/s`;
    const net = game.bitPerSec * game.price - game.powerEurPerSec;
    const netEl = $('net');
    netEl.textContent = game.s.cash < 0 ? 'Strom gesperrt' : `${net >= 0 ? '+' : ''}${num(net, 4)} €/s`;
    netEl.classList.toggle('neg', game.s.cash < 0 || net < 0);
    this.drawSpark();
    this.renderRoomInfo();
  }

  private renderRoomInfo() {
    const st = game.roomStats[game.s.active];
    const room = ROOMS.find((r) => r.id === game.s.active)!;
    $('roomInfo').innerHTML = st
      ? `${room.name}: Hitze <b>${num(st.heat)}/${num(room.maxHeat)}</b> · Effizienz <b>${num(st.throttle * 100)} %</b> · ${num(st.power)} W`
      : '';
  }

  private drawSpark() {
    const c = document.getElementById('spark') as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const pts = game.priceHistory;
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = game.price >= pts[0] ? '#4fd1c5' : '#ff6a3d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = (i / Math.max(1, pts.length - 1)) * c.width;
      const y = c.height - ((p - min) / (max - min || 1)) * (c.height - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
