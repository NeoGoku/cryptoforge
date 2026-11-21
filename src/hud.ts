import { game, MISSIONS, ACHIEVEMENTS, INSURE_RATE, LOAN_RATE, POOL_FEE } from './game';
import { GADGETS, ROOMS, UPGRADES, STAFF, TECHS, COINS, LOANS, upgradeCost, staffCost, coinDef, techDef } from './config';
import type { GadgetDef } from './config';
import { sfx } from './audio';
import { settings, saveSettings } from './settings';

type Tab = 'shop' | 'inv' | 'market' | 'bank' | 'tech' | 'tasks' | 'ach' | 'rooms' | 'more';
const TABS: [Tab, string, string][] = [
  ['shop', '🛒', 'Shop'], ['inv', '🎒', 'Lager'], ['market', '📊', 'Markt'], ['bank', '🏦', 'Bank'],
  ['tech', '🔬', 'Tech'], ['tasks', '🎯', 'Aufgaben'], ['ach', '🏆', 'Erfolge'], ['rooms', '🏠', 'Räume'], ['more', '⚙️', 'Mehr'],
];

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const num = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = (n: number) => `${num(n, Math.abs(n) < 100 ? 2 : 0)} €`;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : s >= 60 ? `${Math.floor(s / 60)} min ${Math.floor(s % 60)} s` : `${Math.ceil(s)} s`);

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
  const n = Math.min(4, i + 2);
  const r = n > 3 ? 5 : 7;
  const fans = Array.from({ length: n }, (_, k) => {
    const cx = n === 2 ? 20 + k * 24 : 14 + k * (36 / (n - 1));
    return `<circle cx="${cx}" cy="20" r="${r + 1.5}" fill="#161a26"/><g class="spin" style="animation-duration:${0.6 + k * 0.1}s"><path d="M${cx} ${20 - r}V${20 + r}M${cx - r} 20H${cx + r}" stroke="${hex(g.ledColor)}" stroke-width="2" stroke-linecap="round"/></g>`;
  }).join('');
  return `<svg width="58" height="46" viewBox="0 0 64 48"><rect x="3" y="4" width="58" height="34" rx="6" fill="${hex(g.color)}" stroke="#0006" stroke-width="1.5"/><rect x="3" y="4" width="58" height="8" rx="6" fill="#fff2"/>${fans}<circle class="blink" cx="55" cy="9" r="2.4" fill="${hex(g.ledColor)}"/><path d="M8 42h48M8 45h48" stroke="${hex(g.color)}" stroke-width="2" opacity=".6"/></svg>`;
}

const bar = (label: string, v: number, max: number, val: string, color: string) =>
  `<div class="sr"><span>${label}</span><div class="track"><div class="fill" style="width:${Math.min(100, Math.max(0, (v / (max || 1)) * 100))}%;--b:${color}"></div></div><em>${val}</em></div>`;

const kv = (k: string, v: string) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
const title = (t: string) => `<div class="sectitle">${t}</div>`;

function drawLine(c: HTMLCanvasElement, pts: number[], color: string, fill = true) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = c.clientWidth || c.width;
  const h = c.clientHeight || c.height;
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const ctx = c.getContext('2d');
  if (!ctx || pts.length < 2) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const xy = (p: number, i: number): [number, number] => [(i / (pts.length - 1)) * w, h - 3 - ((p - min) / (max - min || 1)) * (h - 6)];
  ctx.beginPath();
  pts.forEach((p, i) => { const [x, y] = xy(p, i); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  if (fill) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `${color}55`);
    grad.addColorStop(1, `${color}00`);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

const QUIET = new Set(['loan', 'daily', 'prestige', 'repair', 'insure', 'mode', 'room', 'room-coin', 'autosell', 'settings', 'tutorial', 'toggle']);

export class HUD {
  private tab: Tab = 'shop';
  private cash = new Counter($('cash'), eur, true);
  private coins = new Counter($('coins'), (n) => num(n, 4));
  private price = new Counter($('price'), (n) => (n < 10 ? `${num(n, 2)} €` : eur(n)));
  private hash = new Counter($('hash'), (n) => `${num(n)} H/s`);
  private debt = new Counter($('debt'), eur);
  private slow = 0;
  private lastTs = performance.now();

  constructor() {
    $('tabs').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (b) {
        sfx.tab();
        this.tab = b.dataset.tab as Tab;
        this.renderAll();
        $('content').scrollTop = 0;
      }
    });
    $('content').addEventListener('click', (e) => this.onAction(e));
    $('content').addEventListener('pointerdown', () => { this.pressed = true; });
    window.addEventListener('pointerup', () => { setTimeout(() => { this.pressed = false; }, 50); });
    $('dock').addEventListener('click', (e) => this.onAction(e));
    $('quest').addEventListener('click', () => { this.tab = 'tasks'; this.renderAll(); });
    $('reset').addEventListener('click', () => this.settingsModal());
    const mute = $('mute');
    mute.textContent = sfx.isMuted() ? '🔇' : '🔊';
    mute.addEventListener('click', () => {
      sfx.unlock();
      mute.textContent = sfx.toggleMute() ? '🔇' : '🔊';
    });
    game.on('change', () => this.renderAll());
    game.on('toast', (m) => this.toast(m ?? ''));
    this.renderAll();
    if (!game.s.tutorial) this.tutorial(0);
    requestAnimationFrame(() => this.loop());
  }

  toast(msg: string) {
    const gold = /^(Mission|Erfolg|Tagesbonus|Forschung abgeschlossen)/.test(msg);
    const err = /^(Zu wenig|Raum ist voll|Kein|Keine|Noch nicht|Stromausfall|Marktcrash|Hack!|Defekt|Kreditlimit)/.test(msg);
    if (/^(Mission|Erfolg)/.test(msg)) sfx.win();
    if (/^(Zu wenig|Raum ist voll|Kein|Keine|Noch nicht|Kreditlimit)/.test(msg)) sfx.error();
    const d = document.createElement('div');
    d.className = `toast ${gold ? 'gold' : err ? 'err' : ''}`;
    d.textContent = `${gold ? (msg.startsWith('Mission') ? '🎯 ' : msg.startsWith('Erfolg') ? '🏆 ' : '⭐ ') : err ? '⚠️ ' : '🔔 '}${msg}`;
    const box = $('toasts');
    box.appendChild(d);
    while (box.children.length > 4) box.firstElementChild?.remove();
    setTimeout(() => d.remove(), 3300);
  }

  // ---- Modals ----

  private modal(html: string, bind?: (root: HTMLElement) => void) {
    const m = $('modal');
    m.innerHTML = `<div class="dlg glass">${html}</div>`;
    m.style.display = 'grid';
    m.onclick = (e) => { if (e.target === m) this.closeModal(); };
    bind?.(m);
  }

  private closeModal() {
    const m = $('modal');
    m.style.display = 'none';
    m.innerHTML = '';
  }

  private tutorial(step: number) {
    const steps = [
      ['Willkommen bei CryptoForge ⛏️', 'Baue dein Krypto-Mining-Imperium auf – vom Kinderzimmer bis zum Rechenzentrum.'],
      ['Mining & Gadgets 🖥️', 'Tippe in den Raum, um zu minen. Kaufe im Shop Gadgets und tippe auf einen leeren Slot, um sie aufzustellen.'],
      ['Verkaufen & Kosten 💶', 'Verkaufe Coins im Dock unten. Achte auf Hitze, Strom und Miete. Das Netto oben zeigt, ob du Gewinn machst.'],
      ['Mehr entdecken 🚀', 'Mehrere Münzen, Pool oder Solo, Kredite, Versicherung, Personal, Forschung, Events und Prestige warten auf dich. Missionen führen dich durch.'],
    ];
    const [t, p] = steps[step];
    const last = step === steps.length - 1;
    this.modal(`<h2>${t}</h2><p>${p}</p><div class="dots">${steps.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>
      <div class="btns" style="margin-top:14px"><button id="tskip">Überspringen</button><button class="primary" id="tnext">${last ? 'Los geht’s' : 'Weiter'}</button></div>`, (m) => {
      const done = () => { game.s.tutorial = true; game.save(); this.closeModal(); };
      m.querySelector('#tskip')!.addEventListener('click', done);
      m.querySelector('#tnext')!.addEventListener('click', () => { sfx.unlock(); if (last) done(); else this.tutorial(step + 1); });
    });
  }

  private settingsModal() {
    const code = game.exportSave();
    this.modal(`<h2>Einstellungen</h2>
      <label><span>Musik</span><b id="mv">${Math.round(settings.music * 100)} %</b></label><input type="range" id="music" min="0" max="100" value="${settings.music * 100}">
      <label><span>Soundeffekte</span><b id="sv">${Math.round(settings.sfx * 100)} %</b></label><input type="range" id="sfxv" min="0" max="100" value="${settings.sfx * 100}">
      <div class="seg" style="margin-top:14px"><button data-q="high" class="${settings.quality === 'high' ? 'on' : ''}">Grafik hoch</button><button data-q="low" class="${settings.quality === 'low' ? 'on' : ''}">Grafik sparsam</button></div>
      <div class="seg"><button id="shake" class="${settings.shake ? 'on' : ''}">Bildschirm-Wackeln ${settings.shake ? 'an' : 'aus'}</button></div>
      <label><span>Spielstand sichern (Code)</span></label><textarea id="exp" readonly>${code}</textarea>
      <div class="btns"><button id="copy">Code kopieren</button></div>
      <label><span>Spielstand laden</span></label><textarea id="imp" placeholder="Code hier einfügen"></textarea>
      <div class="btns"><button id="doimp">Laden</button><button id="tut">Anleitung</button></div>
      <p class="muted" style="margin-top:12px">Tipp: Im Browser-Menü „Zum Startbildschirm hinzufügen“ installiert das Spiel wie eine App.</p>
      <div class="btns" style="margin-top:10px"><button id="rst" class="bad" style="color:var(--hot)">Spielstand löschen</button><button class="primary" id="close">Schließen</button></div>`, (m) => {
      const q = (id: string) => m.querySelector(id) as HTMLElement;
      q('#music').addEventListener('input', (e) => { settings.music = Number((e.target as HTMLInputElement).value) / 100; q('#mv').textContent = `${Math.round(settings.music * 100)} %`; saveSettings(); sfx.applySettings(); });
      q('#sfxv').addEventListener('input', (e) => { settings.sfx = Number((e.target as HTMLInputElement).value) / 100; q('#sv').textContent = `${Math.round(settings.sfx * 100)} %`; saveSettings(); sfx.applySettings(); });
      q('#sfxv').addEventListener('change', () => sfx.buy());
      m.querySelectorAll<HTMLElement>('[data-q]').forEach((b) => b.addEventListener('click', () => { settings.quality = b.dataset.q as 'high' | 'low'; saveSettings(); this.settingsModal(); }));
      q('#shake').addEventListener('click', () => { settings.shake = !settings.shake; saveSettings(); this.settingsModal(); });
      q('#copy').addEventListener('click', () => { void navigator.clipboard?.writeText(code); this.toast('Code kopiert.'); });
      q('#doimp').addEventListener('click', () => { if (!game.importSave((q('#imp') as HTMLTextAreaElement).value)) this.toast('Kein gültiger Code.'); });
      q('#tut').addEventListener('click', () => this.tutorial(0));
      let armed = false;
      q('#rst').addEventListener('click', (e) => { if (!armed) { armed = true; (e.target as HTMLElement).textContent = 'Wirklich löschen?'; } else game.reset(); });
      q('#close').addEventListener('click', () => this.closeModal());
    });
  }

  private prestigeModal() {
    const gain = game.prestigeGain();
    const can = game.canPrestige();
    this.modal(`<h2>Prestige-Neustart ✨</h2>
      <p>Du startest von vorn (Gadgets, Räume, Geld, Forschung werden zurückgesetzt). Erfolge, Serie und Forge-Punkte bleiben. Jeder Punkt gibt dauerhaft <b>+5 % Hash und Klickertrag</b>.</p>
      ${kv('Aktuelle Punkte', `${game.s.prestige.points}`)}${kv('Neue Punkte durch Neustart', `+${Math.max(0, gain)}`)}${kv('Vermögen', `${eur(game.netWorth())} / 20.000 €`)}
      <div class="btns" style="margin-top:14px"><button id="no">Abbrechen</button><button class="primary" id="yes" ${can ? '' : 'disabled'}>Neustart</button></div>`, (m) => {
      m.querySelector('#no')!.addEventListener('click', () => this.closeModal());
      m.querySelector('#yes')!.addEventListener('click', () => { this.closeModal(); game.doPrestige(); });
    });
  }

  // ---- Aktionen ----

  private onAction(e: Event) {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b || b.hasAttribute('disabled')) return;
    const d = b.dataset;
    const id = d.id ?? '';
    const act = d.act ?? '';
    const before = game.s.cash;
    switch (act) {
      case 'buy-gadget': game.buyGadget(id); break;
      case 'sell-gadget': game.sellGadget(id); break;
      case 'place': game.placeItem(); break;
      case 'buy-upg': game.buyUpgrade(id); break;
      case 'hire': game.hire(id); break;
      case 'research': game.startResearch(id); break;
      case 'buy-room': game.buyRoom(id); break;
      case 'room': game.setRoom(id); break;
      case 'room-coin': game.setRoomCoin(id, d.coin ?? 'BIT'); break;
      case 'sell': game.sell(d.coin ?? 'BIT', Number(d.f)); break;
      case 'sell-all': game.sellAll(Number(d.f)); break;
      case 'stake': game.stake(d.coin ?? 'BIT', Number(d.f)); break;
      case 'unstake': game.unstake(d.coin ?? 'BIT', 1); break;
      case 'mode': game.setMode(d.m as 'pool' | 'solo'); break;
      case 'autosell': game.setAutoSell(d.on === '1', Number(d.min)); break;
      case 'loan': game.takeLoan(Number(d.amt)); break;
      case 'repay': game.repay(Number(d.f)); break;
      case 'insure': game.toggleInsurance(); break;
      case 'repair': game.repairRoom(id); break;
      case 'daily': game.claimDaily(); break;
      case 'prestige': this.prestigeModal(); break;
      case 'settings': this.settingsModal(); break;
      case 'tutorial': this.tutorial(0); break;
    }
    if (QUIET.has(act)) return;
    if (game.s.cash < before) sfx.buy();
    else if (game.s.cash > before) sfx.sell();
    else if (act === 'place') sfx.place();
    else if (act === 'stake' || act === 'unstake') sfx.place();
  }

  private renderAll() {
    this.renderTabs();
    this.renderContent();
    this.renderRooms();
    this.renderQuest();
    this.updateAfford();
    this.drawMinis();
  }

  private renderTabs() {
    const inv = Object.values(game.s.inv).reduce((a, b) => a + b, 0);
    const badge = (k: Tab): string => {
      if (k === 'inv' && inv > 0) return `<em class="badge">${inv}</em>`;
      if (k === 'tasks' && game.dailyReady()) return '<em class="badge">!</em>';
      if (k === 'more' && game.canPrestige()) return '<em class="badge">✨</em>';
      return '';
    };
    const sc = $('tabs').scrollLeft;
    $('tabs').innerHTML = TABS.map(([k, ic, l]) => `<button data-tab="${k}" class="${k === this.tab ? 'on' : ''}"><i>${ic}</i><span>${l}</span>${badge(k)}</button>`).join('');
    $('tabs').scrollLeft = sc;
  }

  private renderContent() {
    const el = $('content');
    const scroll = el.scrollTop;
    let h = '';
    switch (this.tab) {
      case 'shop': h = this.shop(); break;
      case 'inv': h = this.inventory(); break;
      case 'market': h = this.market(); break;
      case 'bank': h = this.bank(); break;
      case 'tech': h = this.tech(); break;
      case 'tasks': h = this.tasks(); break;
      case 'rooms': h = this.rooms(); break;
      case 'ach': h = this.achievements(); break;
      case 'more': h = this.more(); break;
    }
    el.innerHTML = h;
    el.scrollTop = scroll;
  }

  private shop(): string {
    const maxH = Math.max(...GADGETS.map((g) => g.hash));
    const maxW = Math.max(...GADGETS.map((g) => g.watts));
    const maxT = Math.max(...GADGETS.map((g) => g.heat));
    const rar = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'];
    const sale = game.s.ev?.id === 'sale';
    const full = game.totalGadgets() >= game.maxGadgets();
    const coins = COINS.filter((c) => game.coinUnlocked(c));
    const head = full ? `<div class="lockmsg" style="margin-bottom:8px">Alle ${game.maxGadgets()} Plätze belegt – verkaufe ein Gadget oder erweitere einen Raum.</div>` : '';
    return head + GADGETS.map((g, i) => {
      const locked = !game.gadgetUnlocked(g);
      const cost = game.gadgetCost(g);
      const lines = coins.map((c) => {
        const n = game.netPerSec(g.id, c.id);
        return `<span style="color:${c.color}">${c.id}</span> <span class="${n >= 0 ? 'good' : 'bad'}">${n >= 0 ? '+' : ''}${num(n, n < 10 ? 2 : 0)}</span>`;
      }).join(' · ');
      const best = Math.max(...coins.map((c) => game.netPerSec(g.id, c.id)));
      const roi = best > 0 ? `<span class="good">Amortisation ca. ${num(cost / best / 60, 1)} min</span>` : '<span class="bad">Bei aktuellem Kurs unrentabel</span>';
      return `<div class="card ${locked ? 'lock' : ''}" style="--c:${hex(g.ledColor)}">
        <div class="head">${icon(g, i)}
          <div style="flex:1"><div class="row"><span class="name">${g.name}</span><span class="tag">${rar[i] ?? 'Epic'}</span></div>
          <div class="muted">Besitz: ${game.owned(g.id)} · Typ ${g.kind.toUpperCase()}</div></div>
        </div>
        <div class="bars">
          ${bar('Hash', g.hash, maxH, `${num(g.hash)} H/s`, '#8c7bff')}
          ${bar('Strom', g.watts, maxW, `${num(g.watts)} W`, '#ffc857')}
          ${bar('Hitze', g.heat, maxT, num(g.heat), '#ff6a3d')}
        </div>
        ${locked ? `<div class="lockmsg">🔒 Erforsche „${techDef(g.unlock!).name}“ im Tech-Tab.</div>` : ''}
        <div class="row"><span class="roi">${roi}<br><span class="muted">Netto €/s: ${lines}</span></span>
          <div class="btns" style="margin:0;flex-wrap:nowrap"><button data-act="sell-gadget" data-id="${g.id}" ${(game.s.inv[g.id] ?? 0) < 1 ? 'disabled' : ''}>Verk. ${eur(Math.round(g.cost * 0.5))}</button><button class="buy" data-act="buy-gadget" data-id="${g.id}" data-cost="${cost}" data-locked="${locked || full ? 1 : 0}" ${locked || full ? 'disabled' : ''}>${sale ? `<span class="old">${eur(g.cost)}</span>` : ''}${eur(cost)}</button></div></div>
      </div>`;
    }).join('');
  }

  private inventory(): string {
    const room = ROOMS.find((r) => r.id === game.s.active)!;
    const slots = game.s.rooms[room.id] ?? [];
    const free = slots.filter((s) => s === null).length;
    const items = GADGETS.map((g, i) => ({ g, i, n: game.s.inv[g.id] ?? 0 })).filter((x) => x.n > 0);
    const list = items.map(({ g, i, n }) => `<div class="card" style="--c:${hex(g.ledColor)}"><div class="head">${icon(g, i)}<div style="flex:1"><div class="name">${g.name}</div><div class="muted">${num(g.hash)} H/s · ${num(g.watts)} W</div></div><b style="font-size:18px">× ${n}</b></div><div class="row" style="justify-content:flex-end;margin-top:8px"><button data-act="sell-gadget" data-id="${g.id}">Verkaufen ${eur(Math.round(g.cost * 0.5))}</button></div></div>`).join('');
    return `<div class="sect">${room.name} · ${slots.length - free}/${slots.length} Slots belegt</div>
      <button class="primary" style="width:100%;margin-bottom:10px" data-act="place" ${free === 0 || items.length === 0 ? 'disabled' : ''}>Bestes Gadget platzieren</button>
      ${list || '<div class="muted" style="padding:14px 4px">Kein Gadget im Lager. Kaufe eins im Shop.</div>'}
      <div class="muted" style="margin-top:6px">Tipp: Tippe im Raum auf einen Slot, um ein Gadget zu setzen oder herauszunehmen.</div>`;
  }

  private market(): string {
    const solo = game.s.mode === 'solo';
    let h = `<div class="seg"><button data-act="mode" data-m="pool" class="${!solo ? 'on' : ''}">⛏️ Pool</button><button data-act="mode" data-m="solo" class="${solo ? 'on' : ''}">🎰 Solo</button></div>
      <div class="muted" style="margin:-4px 2px 10px">${solo ? 'Solo: Blockfunde alle ca. 25 s, im Schnitt +12 % Ertrag, aber unregelmäßig.' : `Pool: stetiger Ertrag, ${Math.round(POOL_FEE * 100)} % Gebühr.`}</div>`;
    for (const c of COINS) {
      const locked = !game.coinUnlocked(c);
      const hs = game.history[c.id];
      const chg = (game.prices[c.id] / hs[0] - 1) * 100;
      const w = game.s.wallet[c.id] ?? 0;
      const st = game.s.staked[c.id] ?? 0;
      const value = (w + st) * game.prices[c.id];
      h += `<div class="card ${locked ? 'lock' : ''}" style="--c:${c.color}">
        <div class="row"><span class="name"><span style="color:${c.color}">●</span> ${c.name} <span class="muted">${c.id}</span></span>
          <span><b>${game.prices[c.id] < 10 ? num(game.prices[c.id], 2) : num(game.prices[c.id], 1)} €</b> <span class="${chg >= 0 ? 'good' : 'bad'}" style="font-size:11px">${chg >= 0 ? '▲' : '▼'} ${num(Math.abs(chg), 1)} %</span></span></div>
        <div class="muted">${c.desc}</div>
        ${locked ? `<div class="lockmsg">🔒 Erforsche „${techDef(c.unlock!).name}“.</div>` : `<canvas class="mini" data-coin="${c.id}"></canvas>
        ${kv('Wallet', `${num(w, 4)} ${c.id}`)}${kv('Gestaked (+0,25 %/min)', `${num(st, 4)} ${c.id}`)}${kv('Wert gesamt', eur(value))}
        <div class="btns">
          <button data-act="sell" data-coin="${c.id}" data-f="0.5" ${w < 1e-6 ? 'disabled' : ''}>50 % verk.</button>
          <button class="primary" data-act="sell" data-coin="${c.id}" data-f="1" ${w < 1e-6 ? 'disabled' : ''}>Alles verk.</button>
          <button data-act="stake" data-coin="${c.id}" data-f="1" ${w < 1e-6 ? 'disabled' : ''}>Staken</button>
          <button data-act="unstake" data-coin="${c.id}" ${st < 1e-6 ? 'disabled' : ''}>Abheben</button>
        </div>`}
      </div>`;
    }
    if (game.has('auto')) {
      const a = game.s.autoSell;
      h += `<div class="card" style="--c:var(--acc)"><div class="row"><span class="name">🤖 Auto-Verkauf</span><button data-act="autosell" data-on="${a.on ? 0 : 1}" data-min="${a.min}" class="${a.on ? 'on' : ''}">${a.on ? 'An' : 'Aus'}</button></div>
        <div class="muted">Verkauft alle Coins, sobald ihr Wert den Schwellwert erreicht.</div>
        <div class="chips">${[50, 200, 1000, 5000].map((m) => `<button data-act="autosell" data-on="${a.on ? 1 : 0}" data-min="${m}" class="${a.min === m ? 'on' : ''}">ab ${num(m)} €</button>`).join('')}</div></div>`;
    }
    return h;
  }

  private bank(): string {
    const s = game.s;
    const lim = game.loanLimit();
    const cost = game.costPerSec();
    const income = game.running() ? game.incomeEurPerSec : 0;
    const maxBar = Math.max(income, cost + game.interestPerSec, 0.001);
    const prem = game.gadgetValue() * INSURE_RATE;
    return `${title('Kredit')}
      <div class="card" style="--c:#ff6a3d">
        ${kv('Schulden', `<span class="${s.debt > 0 ? 'bad' : ''}">${eur(s.debt)}</span>`)}${kv('Zinsen', `6 % je 10 min (${num(s.debt * LOAN_RATE, 3)} €/s)`)}${kv('Verfügbares Limit', eur(lim))}
        <div class="btns">${LOANS.map((a) => `<button class="buy" data-act="loan" data-amt="${a}" data-lim="${a}" ${a > lim ? 'disabled' : ''}>+${num(a)} €</button>`).join('')}</div>
        <div class="btns"><button data-act="repay" data-f="0.25" ${s.debt <= 0 ? 'disabled' : ''}>25 % tilgen</button><button data-act="repay" data-f="0.5" ${s.debt <= 0 ? 'disabled' : ''}>50 %</button><button class="primary" data-act="repay" data-f="1" ${s.debt <= 0 ? 'disabled' : ''}>Alles tilgen</button></div>
        <div class="muted" style="margin-top:6px">Zinsen wachsen auf die Schuld. Offline fallen Zinsen höchstens 30 Minuten an.</div>
      </div>
      ${title('Versicherung')}
      <div class="card" style="--c:${s.insured ? 'var(--acc)' : '#3a4a7a'}">
        <div class="row"><span class="name">🛡️ Geräteversicherung</span><button data-act="insure" class="${s.insured ? 'on' : ''}">${s.insured ? 'Aktiv' : 'Abschließen'}</button></div>
        <div class="muted" style="margin-top:4px">Erstattet 70 % bei Hack-Diebstahl und übernimmt Defekte. Prämie: ${num(prem, 3)} €/s bei aktuellem Gerätewert.</div>
      </div>
      ${title('Laufende Bilanz (€/s)')}
      <div class="card" style="--c:var(--gold)"><div class="bars">
        ${bar('Einnahmen', income, maxBar, `+${num(income, 3)}`, '#7ee787')}
        ${bar('Strom', game.s.ev?.id === 'outage' ? 0 : game.powerEurPerSec, maxBar, `−${num(game.s.ev?.id === 'outage' ? 0 : game.powerEurPerSec, 3)}`, '#ffc857')}
        ${bar('Miete', game.rentPerSec, maxBar, `−${num(game.rentPerSec, 3)}`, '#8c7bff')}
        ${bar('Personal', game.salaryPerSec, maxBar, `−${num(game.salaryPerSec, 3)}`, '#4fd1c5')}
        ${bar('Versich.', game.premiumPerSec, maxBar, `−${num(game.premiumPerSec, 3)}`, '#5ad1ff')}
        ${bar('Zinsen', game.interestPerSec, maxBar, `−${num(game.interestPerSec, 3)}`, '#ff6a3d')}
      </div>${kv('Netto', `<span class="${game.netEurPerSec() >= 0 ? 'good' : 'bad'}">${game.netEurPerSec() >= 0 ? '+' : ''}${num(game.netEurPerSec(), 3)} €/s</span>`)}</div>`;
  }

  private tech(): string {
    let h = title('Upgrades');
    h += UPGRADES.map((u) => {
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
    h += title('Forschung');
    const cur = game.s.researching;
    h += TECHS.map((t) => {
      const done = game.has(t.id);
      const active = cur?.id === t.id;
      const reqOk = !t.req || game.has(t.req);
      const blocked = !!cur && !active;
      let right = '';
      if (done) right = '<span class="tag" style="--c:var(--acc)">Erforscht</span>';
      else if (active) right = `<span class="tag" style="--c:var(--gold)" data-resleft>läuft</span>`;
      else right = `<button class="buy" data-act="research" data-id="${t.id}" data-cost="${t.cost}" data-locked="${!reqOk || blocked ? 1 : 0}" ${!reqOk || blocked ? 'disabled' : ''}>${eur(t.cost)}</button>`;
      return `<div class="card ${!reqOk ? 'lock' : ''}" style="--c:${done ? 'var(--acc)' : active ? 'var(--gold)' : '#8c7bff'}">
        <div class="row"><span class="name">${done ? '✅' : '🔬'} ${t.name}</span>${right}</div>
        <div class="muted" style="margin-top:3px">${t.desc} · Dauer ${dur(t.secs)}</div>
        ${active ? '<div class="track" style="margin-top:7px"><div class="fill" data-resbar style="width:0;--b:var(--gold)"></div></div>' : ''}
        ${!reqOk ? `<div class="lockmsg">🔒 Benötigt: ${techDef(t.req!).name}</div>` : ''}
      </div>`;
    }).join('');
    h += title('Personal');
    h += STAFF.map((st) => {
      const lvl = game.s.staff[st.id] ?? 0;
      const cost = staffCost(st, lvl);
      const btn = lvl >= st.max ? '<span class="tag" style="--c:var(--acc)">Max</span>' : `<button class="buy" data-act="hire" data-id="${st.id}" data-cost="${cost}">Einstellen ${eur(cost)}</button>`;
      return `<div class="card" style="--c:#4fd1c5">
        <div class="row"><span class="name">👷 ${st.name}</span><span class="muted">Stufe ${lvl}/${st.max}</span></div>
        <div class="muted" style="margin:3px 0 6px">${st.desc}</div>
        <div class="row"><span class="muted">Gehalt ${num(lvl * st.salary, 2)} €/s</span>${btn}</div>
      </div>`;
    }).join('');
    return h;
  }

  private tasks(): string {
    const ready = game.dailyReady();
    let h = `<div class="card" style="--c:${ready ? 'var(--gold)' : '#3a4a7a'}"><div class="row"><span class="name">📅 Tagesbonus</span>
      <button class="buy" data-act="daily" ${ready ? '' : 'disabled'}>${ready ? `+${num(game.dailyReward())} €` : 'Morgen wieder'}</button></div>
      <div class="muted" style="margin-top:3px">Serie: ${game.s.streak.count} Tag(e). Je länger die Serie (bis 7), desto größer der Bonus.</div></div>`;
    h += title('Missionen');
    const order = Array.from({ length: MISSIONS.length }, (_, k) => k).sort((a, b) => (a < game.s.mission ? 1 : 0) - (b < game.s.mission ? 1 : 0) || a - b);
    h += order.map((i) => {
      const m = MISSIONS[i];
      const state = i < game.s.mission ? 'done' : i === game.s.mission ? 'cur' : 'lock';
      const [c, t] = m.prog(game);
      const pct = state === 'done' ? 100 : (c / t) * 100;
      return `<div class="card ${state}">
        <div class="row"><span class="name">${state === 'done' ? '✅' : state === 'cur' ? '▶️' : '🔒'} ${m.title}</span><span class="tag" style="--c:var(--gold)">+${num(m.reward)} €</span></div>
        <div class="muted" style="margin:3px 0 7px">${m.desc}</div>
        <div class="track"><div class="fill" style="width:${pct}%;--b:var(--gold)"></div></div>
      </div>`;
    }).join('');
    return h;
  }

  private achievements(): string {
    const n = game.s.ach.length;
    const list = [...ACHIEVEMENTS].sort((a, b) => Number(game.s.ach.includes(b.id)) - Number(game.s.ach.includes(a.id)));
    return `<div class="card" style="--c:var(--gold)"><div class="row"><span class="name">🏆 Fortschritt</span><span class="muted">${n} / ${ACHIEVEMENTS.length}</span></div>
      <div class="track" style="margin-top:8px"><div class="fill" style="width:${(n / ACHIEVEMENTS.length) * 100}%;--b:var(--gold)"></div></div></div>` + list.map((a) => {
      const ok = game.s.ach.includes(a.id);
      return `<div class="card ${ok ? 'done' : 'lock'}"><div class="row"><span class="name">${ok ? '🏆' : '🔒'} ${a.name}</span>${ok ? '<span class="tag" style="--c:var(--acc)">Erreicht</span>' : ''}</div><div class="muted">${a.desc}</div></div>`;
    }).join('');
  }

  private rooms(): string {
    return ROOMS.map((r) => {
      const owned = !!game.s.rooms[r.id];
      const active = game.s.active === r.id;
      if (!owned) {
        return `<div class="card lock" style="--c:#3a4a7a"><div class="row"><span class="name">🔒 ${r.name}</span><button class="buy" data-act="buy-room" data-id="${r.id}" data-cost="${r.cost}">${eur(r.cost)}</button></div>
          <div class="bars">${bar('Slots', r.spots.length, 20, `${r.spots.length}`, '#8c7bff')}${bar('Kühlung', r.maxHeat, 5200, num(r.maxHeat), '#4fd1c5')}</div>${kv('Miete', `${num(r.rent, 2)} €/s`)}</div>`;
      }
      const cond = game.s.cond[r.id] ?? 100;
      const rc = game.repairCost(r.id);
      const cur = game.s.roomCoin[r.id] ?? 'BIT';
      return `<div class="card" style="--c:${active ? 'var(--acc)' : '#3a4a7a'}">
        <div class="row"><span class="name">🏠 ${r.name}</span><button data-act="room" data-id="${r.id}" class="${active ? 'on' : ''}">${active ? 'Aktiv' : 'Wechseln'}</button></div>
        <div class="bars">${bar('Slots', r.spots.length, 20, `${r.spots.length}`, '#8c7bff')}${bar('Kühlung', r.maxHeat, 5200, num(r.maxHeat), '#4fd1c5')}${bar('Zustand', cond, 100, `${num(cond)} %`, cond < 40 ? '#ff6a3d' : cond < 70 ? '#ffc857' : '#7ee787')}</div>
        ${kv('Miete', `${num(r.rent, 2)} €/s`)}
        <div class="row" style="margin-top:4px"><span class="muted">Mining-Münze</span></div>
        <div class="chips">${COINS.filter((c) => game.coinUnlocked(c)).map((c) => `<button data-act="room-coin" data-id="${r.id}" data-coin="${c.id}" class="${cur === c.id ? 'on' : ''}" style="${cur === c.id ? '' : `color:${c.color}`}">${c.id}</button>`).join('')}</div>
        <div class="row" style="margin-top:8px"><span class="muted">Reparatur</span><button data-act="repair" data-id="${r.id}" data-cost="${rc}" ${rc <= 0 ? 'disabled' : ''}>${rc <= 0 ? 'Top Zustand' : `Reparieren ${eur(rc)}`}</button></div>
      </div>`;
    }).join('');
  }

  private more(): string {
    const s = game.s;
    const st = s.stats;
    const p = s.prestige;
    return `${title('Vermögen')}<div class="card" style="--c:var(--gold)">${kv('Vermögen gesamt', `<b>${eur(game.netWorth())}</b>`)}<canvas class="mini" id="netchart" style="height:70px"></canvas>
        ${kv('Geräte (60 %)', eur(game.gadgetValue() * 0.6))}${kv('Coins', eur(game.coinValue()))}${kv('Bargeld', eur(s.cash))}${kv('Schulden', eur(s.debt))}</div>
      ${title('Prestige')}
      <div class="card" style="--c:#c88bff"><div class="row"><span class="name">✨ Forge-Punkte: ${p.points}</span><span class="tag" style="--c:#c88bff">+${num(p.points * 5)} %</span></div>
        <div class="muted" style="margin:4px 0">Neustart gibt dauerhaft +5 % Hash und Klickertrag je Punkt. Benötigt 20.000 € Vermögen. Mögliche neue Punkte: <b>+${Math.max(0, game.prestigeGain())}</b></div>
        <button class="primary" style="width:100%" data-act="prestige" ${game.canPrestige() ? '' : 'disabled'}>Neustart planen</button></div>
      ${title('Statistik')}
      <div class="card" style="--c:#3a4a7a">${kv('Spielzeit', dur(s.playSec))}${kv('Gemint gesamt', num(s.minedTotal, 2))}${kv('Verkauft', eur(s.soldEur))}${kv('Strom bezahlt', eur(st.powerSpent))}${kv('Miete bezahlt', eur(st.rentPaid))}${kv('Gehälter', eur(st.salaryPaid))}${kv('Zinsen', eur(st.interestPaid))}${kv('Klicks', num(st.clicks))}${kv('Events', num(st.events))}${kv('Blöcke (Solo)', num(st.blocks))}${kv('Hacks erlitten', num(st.hacked))}</div>
      <div class="btns"><button data-act="settings">⚙️ Einstellungen</button><button data-act="tutorial">❓ Anleitung</button></div>`;
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
    const lim = game.loanLimit();
    document.querySelectorAll<HTMLElement>('[data-cost]').forEach((b) => {
      b.toggleAttribute('disabled', cash < Number(b.dataset.cost) || b.dataset.locked === '1');
    });
    document.querySelectorAll<HTMLElement>('[data-lim]').forEach((b) => b.toggleAttribute('disabled', Number(b.dataset.lim) > lim));
  }

  private drawMinis() {
    document.querySelectorAll<HTMLCanvasElement>('canvas.mini[data-coin]').forEach((c) => {
      const hs = game.history[c.dataset.coin!];
      drawLine(c, hs, coinDef(c.dataset.coin!).color);
    });
    const nc = document.getElementById('netchart') as HTMLCanvasElement | null;
    if (nc) drawLine(nc, game.s.netHistory.length > 1 ? game.s.netHistory : [0, 0], '#ffc857');
  }

  private loop() {
    const now = performance.now();
    const dt = (now - this.lastTs) / 1000;
    this.lastTs = now;
    const coin = game.s.roomCoin[game.s.active] ?? 'BIT';
    this.cash.set(game.s.cash);
    this.coins.set(game.s.wallet[coin] ?? 0);
    this.price.set(game.prices[coin]);
    this.hash.set(game.hashTotal);
    this.debt.set(game.s.debt);
    this.cash.tick(); this.coins.tick(); this.price.tick(); this.hash.tick(); this.debt.tick();
    $('cash').classList.toggle('neg', game.s.cash < 0);

    this.slow += dt;
    if (this.slow >= 0.25) {
      this.slow = 0;
      this.updateSlow(coin);
    }
    requestAnimationFrame(() => this.loop());
  }

  private lastKey = '';
  private liveT = 0;
  private pressed = false;

  private updateSlow(coin: string) {
    const net = game.netEurPerSec();
    const netEl = $('net');
    netEl.textContent = game.s.cash <= 0 ? 'Strom gesperrt' : game.s.ev?.id === 'outage' ? 'Stromausfall' : `${net >= 0 ? '+' : ''}${num(net, 3)} €/s`;
    netEl.classList.toggle('neg', game.s.cash <= 0 || net < 0);
    netEl.classList.toggle('up', game.s.cash > 0 && net > 0);
    $('debtPill').style.display = game.s.debt > 0.01 ? '' : 'none';
    ($('coins').parentElement!.querySelector('small') as HTMLElement).textContent = coin;

    const pts = game.history[coin];
    const chg = (game.prices[coin] / pts[0] - 1) * 100;
    const ch = $('chg');
    ch.textContent = ` ${chg >= 0 ? '▲' : '▼'} ${num(Math.abs(chg), 1)} %`;
    ch.style.color = chg >= 0 ? '#7ee787' : '#ff6a3d';
    $('regime').textContent = `${coin} · ${game.regime === 'bull' ? 'Bullenmarkt' : game.regime === 'bear' ? 'Bärenmarkt' : 'Seitwärts'}`;
    drawLine($('spark') as HTMLCanvasElement, pts, chg >= 0 ? '#4fd1c5' : '#ff6a3d');
    if (this.tab === 'market' || this.tab === 'more') this.drawMinis();

    // Event-Leiste
    const ev = game.evInfo();
    const eb = $('evbar');
    if (ev) {
      eb.style.display = '';
      eb.className = `glass ${ev.id === 'sale' ? '' : 'bad'}`;
      eb.innerHTML = `${ev.icon} ${ev.name} · ${Math.ceil(ev.left)} s<div class="track"><div class="fill" style="width:${(ev.left / ev.total) * 100}%;--b:${ev.id === 'sale' ? 'var(--gold)' : 'var(--hot)'}"></div></div>`;
    } else if (eb.style.display !== 'none') {
      eb.style.display = 'none';
    }

    // Live-Tabs periodisch neu zeichnen (nicht während eines Klicks)
    this.liveT += 0.25;
    if (this.liveT >= 1.5 && !this.pressed && (this.tab === 'market' || this.tab === 'bank' || this.tab === 'more' || this.tab === 'rooms')) {
      this.liveT = 0;
      this.renderContent();
      this.drawMinis();
    }

    // Forschung: Fortschritt
    const r = game.s.researching;
    if (r) {
      const t = techDef(r.id);
      const left = Math.max(0, (r.end - Date.now()) / 1000);
      const bar = document.querySelector<HTMLElement>('[data-resbar]');
      if (bar) bar.style.width = `${(1 - left / t.secs) * 100}%`;
      const lbl = document.querySelector<HTMLElement>('[data-resleft]');
      if (lbl) lbl.textContent = `noch ${dur(left)}`;
    }

    // Dock
    const room = ROOMS.find((x) => x.id === game.s.active)!;
    const st = game.roomStats[room.id];
    if (st) {
      const ratio = st.heat / st.limit;
      const fill = $('heatFill');
      fill.style.width = `${Math.min(100, ratio * 100)}%`;
      fill.className = `fill ${ratio >= 1 ? 'hot' : ratio > 0.7 ? 'warn' : 'ok'}`;
      $('roomName').innerHTML = `<b>${room.name}</b>`;
      $('heatTxt').textContent = `Hitze ${num(st.heat)} / ${num(st.limit)}${st.throttle < 1 ? ` · gedrosselt ${num(st.throttle * 100)} %` : ''}`;
      $('roomSub').textContent = `${num(st.hash)} H/s · ${num(st.power)} W · Zustand ${num(st.cond)} % · ${coin}`;
    }
    const total = game.coinValue() - COINS.reduce((a, c) => a + (game.s.staked[c.id] ?? 0) * game.prices[c.id], 0);
    $('sell50').textContent = `50 % · ${eur(total * 0.5)}`;
    $('sellAll').textContent = `Alles verkaufen · ${eur(total)}`;
    ($('sell50') as HTMLButtonElement).disabled = total < 0.01;
    const all = $('sellAll') as HTMLButtonElement;
    all.disabled = total < 0.01;
    all.classList.toggle('pulse', total >= 20);
    this.updateAfford();

    // Tabs/Inhalte periodisch aktualisieren, wenn sich der Zustand ändert, der nicht über change-Events läuft
    const key = `${game.dailyReady()}|${game.canPrestige()}|${game.s.ev?.id ?? ''}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.renderTabs();
      if (this.tab === 'shop' || this.tab === 'bank') this.renderContent();
    }
    sfx.setHum(game.hashTotal / 3000);
  }
}
