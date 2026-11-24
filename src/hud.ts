import { game, MISSIONS, ACHIEVEMENTS, INSURE_RATE, LOAN_RATE, POOL_FEE, BOOST_INFO, OD_MAX, OFFLINE_CAP } from './game';
import type { OfflineReport } from './game';
import { ROOMS, UPGRADES, STAFF, TECHS, COINS, LOANS, DEFAULT_COIN, upgradeCost, staffCost, coinDef, techDef } from './config';
import type { Kind } from './config';
import { BUILD_PRESETS, PARTS, PREBUILT, CATS, CAT_ORDER, partDef, prebuiltDef, partLabel, partIcon, machineIcon, machineStats, buildStats, cloneBuild, buildPartList } from './hardware';
import type { PartCat, PartDef, HwMarket, MachineStat } from './hardware';
import { holderValue, shortAddr } from './world';
import { sfx } from './audio';
import { settings, saveSettings } from './settings';
import { escapeHtml, isOpsTab, opsLink, performOpsAction, renderOperations } from './operations-ui';
import type { OpsTab } from './operations-ui';
import { CONSUMABLES } from './operations-data';
import { keys } from './operations-state';
import { SAVE_SLOTS, slotPreview } from './save-slots';
import { GRID_SHORTAGE, GRID_WARNING, WorkshopJobs } from './activities';

type Tab = 'shop' | 'build' | 'orders' | 'inv' | 'market' | 'chain' | 'bank' | 'tech' | 'tasks' | 'ach' | 'rooms' | 'ops' | 'more';
const TABS: [Tab, string, string][] = [
  ['ops', '⚡', 'Betrieb'], ['shop', '🛒', 'Shop'], ['build', '🛠️', 'Werkstatt'], ['orders', '📋', 'Aufträge'], ['inv', '🎒', 'Lager'], ['market', '📊', 'Markt'], ['chain', '🌐', 'Explorer'],
  ['bank', '🏦', 'Bank'], ['tech', '🔬', 'Tech'], ['tasks', '🎯', 'Aufgaben'], ['ach', '🏆', 'Erfolge'], ['rooms', '🏠', 'Räume'], ['more', '⚙️', 'Mehr'],
];
const KIND_NAME: Record<Kind, string> = { cpu: 'CPU', gpu: 'GPU', asic: 'ASIC', quantum: 'Quantum', fusion: 'Fusion' };
const HW_LABEL: Record<HwMarket, string> = { gpu: 'GPUs', asic: 'ASICs', parts: 'PC-Teile' };
const shortName = (p: PartDef) => p.name.replace(/ (DDR\d|Bronze|Gold|Platinum|Titanium|Lüfter-Set|Wasserkühlung)$/, '');

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const num = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = (n: number) => `${num(n, Math.abs(n) < 100 ? 2 : 0)} €`;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : s >= 60 ? `${Math.floor(s / 60)} min ${Math.floor(s % 60)} s` : `${Math.ceil(s)} s`);

/** Zahl, die weich zum Zielwert läuft. */
class Counter {
  cur = NaN;
  target = 0;
  private displayed = '';
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
    const text = this.fmt(this.cur);
    if (text !== this.displayed) this.el.textContent = this.displayed = text;
  }
}

const bar = (label: string, v: number, max: number, val: string, color: string) =>
  `<div class="sr"><span>${label}</span><div class="track"><div class="fill" style="width:${Math.min(100, Math.max(0, (v / (max || 1)) * 100))}%;--b:${color}"></div></div><em>${val}</em></div>`;

const kv = (k: string, v: string) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
const title = (t: string) => `<div class="sectitle">${t}</div>`;

function drawLine(c: HTMLCanvasElement, pts: number[], color: string, fill = true) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (!w || !h) return;
  const width = Math.min(2048, Math.round(w * dpr));
  const height = Math.min(256, Math.round(h * dpr));
  if (c.width !== width) c.width = width;
  if (c.height !== height) c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx || pts.length < 2) return;
  ctx.setTransform(width / w, 0, 0, height / h, 0, 0);
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

const QUIET = new Set(['deal-skip', 'shop-seg', 'shop-cat', 'draft-set', 'draft-none', 'draft-gpu-add', 'draft-gpu-rm', 'draft-gpu-sub', 'draft-gpu-fill', 'draft-clear', 'bp-save', 'bp-load', 'bp-del', 'bp-from', 'edit-m', 'place-m', 'unplace', 'draft-part', 'loan', 'daily', 'prestige', 'repair', 'insure', 'mode', 'room', 'room-coin', 'autosell', 'settings', 'tutorial', 'toggle']);

export class HUD {
  private tab: Tab = /^#betrieb(?:\/|$)/.test(location.hash) ? 'ops' : 'shop';
  private opsTab: OpsTab = 'grid';
  private shopSeg: 'parts' | 'pre' = 'parts';
  private shopCat: PartCat = 'gpu';
  private bpName = '';
  private cash = new Counter($('cash'), eur, true);
  private coins = new Counter($('coins'), (n) => num(n, 2));
  private price = new Counter($('price'), (n) => (n < 10 ? `${num(n, 2)} €` : eur(n)));
  private hash = new Counter($('hash'), (n) => `${num(n)} H/s`);
  private debt = new Counter($('debt'), eur);
  private slow = 0;
  private lastTs = performance.now();

  private setTabsOpen(open: boolean) {
    $('panel').classList.toggle('tabs-open', open);
    $('tab-toggle').setAttribute('aria-expanded', String(open));
  }

  constructor() {
    $('tab-toggle').addEventListener('click', () => this.setTabsOpen(!$('panel').classList.contains('tabs-open')));
    $('panel').addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !$('panel').classList.contains('tabs-open')) return;
      this.setTabsOpen(false);
      $('tab-toggle').focus();
    });
    window.matchMedia('(max-width: 899px)').addEventListener('change', () => this.setTabsOpen(false));
    $('tabs').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (b) {
        sfx.tab();
        this.tab = b.dataset.tab as Tab;
        if ($('panel').classList.contains('tabs-open')) $('tab-toggle').focus();
        this.setTabsOpen(false);
        this.renderAll();
        $('content').scrollTop = 0;
      }
    });
    $('content').addEventListener('click', (e) => this.onAction(e));
    $('content').addEventListener('submit', (e) => this.submitOperation(e));
    $('content').addEventListener('change', (e) => {
      const select = e.target;
      if (!(select instanceof HTMLSelectElement) || !select.dataset.opSelect) return;
      game.ops.setTarget(select.dataset.rig ?? '', select.value || undefined, select.dataset.opSelect === 'secondary');
    });
    $('content').addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'bpname') this.bpName = t.value;
    });
    $('content').addEventListener('pointerdown', () => { this.pressed = true; });
    for (const event of ['pointerup', 'pointercancel']) {
      window.addEventListener(event, () => { setTimeout(() => { this.pressed = false; }, 50); });
    }
    $('dock').addEventListener('click', (e) => this.onAction(e));
    $('deal').addEventListener('click', (e) => this.onAction(e));
    $('quest').addEventListener('click', () => { this.tab = 'tasks'; this.renderAll(); });
    $('reset').addEventListener('click', () => this.settingsModal());
    // Raum-Ansicht ein-/ausblenden
    const scene = $('scene');
    const applyScene = () => {
      document.body.classList.toggle('noscene', !settings.scene);
      scene.textContent = settings.scene ? '👁️' : '🙈';
      scene.title = settings.scene ? 'Raum ausblenden' : 'Raum einblenden';
      this.fitPanel();
    };
    scene.addEventListener('click', () => { settings.scene = !settings.scene; saveSettings(); sfx.tab(); applyScene(); });
    applyScene();
    const layout = new ResizeObserver(() => this.fitPanel());
    layout.observe($('dock'));
    layout.observe($('top'));
    window.addEventListener('resize', () => this.fitPanel());
    // Manuelles Minen über den Button (funktioniert auch bei ausgeblendetem Raum)
    const mine = $('mineBtn');
    let holdTimer: number | undefined;
    let repeatTimer: number | undefined;
    const stopHolding = () => {
      window.clearTimeout(holdTimer);
      window.clearInterval(repeatTimer);
      holdTimer = repeatTimer = undefined;
    };
    const mineOnce = (hold: boolean) => {
      if ($('modal').style.display !== 'none' || document.hidden) { stopHolding(); return; }
      sfx.unlock();
      const r = game.click(hold);
      sfx.click();
      if (r.crit) sfx.fx('crit');
      const b = mine.getBoundingClientRect();
      const amt = r.amt < 0.01 ? r.amt.toFixed(5) : r.amt < 10 ? r.amt.toFixed(3) : r.amt.toFixed(1);
      this.floaty(b.left + b.width / 2 + (Math.random() - 0.5) * 30, b.top - 6, `${r.crit ? 'KRIT! ' : ''}+${amt} ${r.coin}`);
    };
    mine.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || e.button !== 0) return;
      e.preventDefault();
      stopHolding();
      mine.setPointerCapture(e.pointerId);
      mineOnce(false);
      holdTimer = window.setTimeout(() => {
        repeatTimer = window.setInterval(() => mineOnce(true), 260);
        mineOnce(true);
      }, 420);
    });
    mine.addEventListener('click', (e) => { if (e.detail === 0) mineOnce(false); });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) mine.addEventListener(event, stopHolding);
    window.addEventListener('blur', stopHolding);
    document.addEventListener('visibilitychange', stopHolding);
    const mute = $('mute');
    mute.textContent = sfx.isMuted() ? '🔇' : '🔊';
    mute.addEventListener('click', () => {
      sfx.unlock();
      mute.textContent = sfx.toggleMute() ? '🔇' : '🔊';
    });
    game.on('change', () => this.renderAll());
    game.on('toast', (m) => this.toast(m ?? ''));
    this.renderAll();
    if (game.saveWarning) this.settingsModal();
    else if (!game.s.tutorial) this.tutorial(0);
    requestAnimationFrame(() => this.loop());
  }

  toast(msg: string) {
    const gold = /^(Mission|Erfolg|Tagesbonus|Forschung abgeschlossen|Bonus|Zusammengebaut|Blueprint gespeichert)/.test(msg);
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

  showOfflineReport(report: OfflineReport) {
    const rows = COINS.filter((coin) => report.coins[coin.id] > 0)
      .map((coin) => kv(coin.name, `${num(report.coins[coin.id], 4)} ${coin.id}`)).join('');
    if ($('modal').style.display === 'grid') {
      this.toast(`Offline · ${dur(report.miningTime)} gemint${report.research ? ' · Forschung fertig' : ''}`);
      return;
    }
    this.modal(`<h2>Offline-Fortschritt</h2>
      <p>${dur(report.elapsed)} abwesend · ${dur(report.miningTime)} Mining</p>
      ${report.elapsed > OFFLINE_CAP ? `<p>Es zählen höchstens ${dur(OFFLINE_CAP)} Abwesenheit.</p>` : ''}
      ${rows || '<p>Keine Coins gemint.</p>'}
      ${kv('Automatisch verkauft', eur(report.sold))}
      ${kv('Laufende Kosten', eur(report.costs))}
      ${report.research ? kv('Forschung abgeschlossen', escapeHtml(report.research)) : ''}
      ${report.notices.map((notice) => `<p>${escapeHtml(notice)}</p>`).join('')}
      <div class="btns"><button class="primary" id="offline-close">Weiterspielen</button></div>`,
    (m) => m.querySelector('#offline-close')?.addEventListener('click', () => this.closeModal()));
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
      ['Dein erster Miner 🖥️', 'Im Kinderzimmer steht der alte Familien-PC. Öffne im Lager „Bearbeiten“, setze in der Werkstatt eine Grafikkarte ein und baue ihn neu zusammen.'],
      ['Werkstatt & Shop 🛠️', 'Stelle PCs und offene Rigs aus Gehäuse, Mainboard, CPU, RAM, SSD, Netzteil und Grafikkarten zusammen. Fehlende Teile werden beim Bauen gekauft. Gute Konfigurationen speicherst du als Blueprint.'],
      ['Coins & Hardware 📈', 'Jeder Coin braucht eine Mindest-Hashrate und den passenden Gerätetyp. Hardware-Preise schwanken mit dem Markt und mit News – kauf günstig, verkauf teuer.'],
      ['Aktiv minen ⛏️', 'Tippe in den Raum oder auf „Minen“: Jeder Klick bringt einen Anteil deiner Produktion. Schnelle Klicks bauen eine Combo bis ×3 auf, Krits geben ×8, und die Klickleiste lädt einen Overdrive mit doppelter Hashrate auf.'],
      ['Verkaufen & Kosten 💶', 'Verkaufe Coins im Dock unten. Achte auf Hitze, Strom und Miete. Das Netto oben zeigt, ob du Gewinn machst.'],
      ['Betrieb & Stromnetz ⚡', 'Im Betriebsmenü stellst du Versorger und Akku ein, weist Crews zu und installierst Rig-Mods. Dort findest du auch das Zins-Wallet, Limit-Orders und zusätzliche Aufträge.'],
    ];
    const [t, p] = steps[step];
    const last = step === steps.length - 1;
    const nickField = step === 0 ? `<label style="margin-top:10px"><span>Dein Nickname</span></label><input id="tnick" class="txt" maxlength="20" placeholder="z. B. HashKing" value="${escapeHtml(game.s.nick)}">` : '';
    this.modal(`<h2>${t}</h2><p>${p}</p>${nickField}<div class="dots">${steps.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>
      <div class="btns" style="margin-top:14px"><button id="tskip">Überspringen</button><button class="primary" id="tnext">${last ? 'Los geht’s' : 'Weiter'}</button></div>`, (m) => {
      const saveNick = () => { const i = m.querySelector<HTMLInputElement>('#tnick'); if (i && i.value.trim()) game.setNick(i.value); };
      const done = () => { saveNick(); game.s.tutorial = true; game.save(); this.closeModal(); };
      m.querySelector('#tskip')!.addEventListener('click', done);
      m.querySelector('#tnext')!.addEventListener('click', () => { sfx.unlock(); saveNick(); if (last) done(); else this.tutorial(step + 1); });
    });
  }

  private settingsModal() {
    const code = game.exportSave();
    const warning = game.saveWarning;
    this.modal(`<h2>Einstellungen</h2>
      ${warning ? `<p role="alert">${escapeHtml(warning)}</p>` : ''}
      <label><span>Nickname</span></label><input id="nick" class="txt" maxlength="20" placeholder="Dein Name" value="${game.s.nick}">
      <label><span>Musik</span><b id="mv">${Math.round(settings.music * 100)} %</b></label><input type="range" id="music" min="0" max="100" value="${settings.music * 100}">
      <label><span>Soundeffekte</span><b id="sv">${Math.round(settings.sfx * 100)} %</b></label><input type="range" id="sfxv" min="0" max="100" value="${settings.sfx * 100}">
      <div class="seg" style="margin-top:14px"><button data-q="high" class="${settings.quality === 'high' ? 'on' : ''}">Grafik hoch</button><button data-q="low" class="${settings.quality === 'low' ? 'on' : ''}">Grafik sparsam</button></div>
      <div class="seg"><button id="shake" class="${settings.shake ? 'on' : ''}">Bildschirm-Wackeln ${settings.shake ? 'an' : 'aus'}</button></div>
      <label><span>Speicherplätze</span><b>Platz ${game.slot} aktiv</b></label>
      <div class="btns">${SAVE_SLOTS.map((slot) => {
        const preview = slotPreview(slot);
        return `<button data-slot="${slot}" ${slot === game.slot ? 'disabled' : ''}>${slot} · ${preview ? escapeHtml(preview.nick || eur(preview.cash)) : 'Neu'}</button>`;
      }).join('')}</div>
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
      for (const slot of SAVE_SLOTS) {
        m.querySelector(`[data-slot="${slot}"]`)?.addEventListener('click', () => {
          if (!game.switchSlot(slot)) this.toast('Speicherplatz konnte nicht geöffnet werden.');
        });
      }
      q('#doimp').addEventListener('click', () => {
        if (!game.importSave((q('#imp') as HTMLTextAreaElement).value)) this.toast('Spielstand konnte nicht geladen werden.');
      });
      q('#tut').addEventListener('click', () => this.tutorial(0));
      q('#nick').addEventListener('change', (e) => { game.setNick((e.target as HTMLInputElement).value); this.toast('Nickname gespeichert.'); });
      let armed = false;
      q('#rst').addEventListener('click', (e) => { if (!armed) { armed = true; (e.target as HTMLElement).textContent = 'Wirklich löschen?'; } else game.reset(); });
      q('#close').addEventListener('click', () => this.closeModal());
    });
  }

  private placementModal(id: string) {
    const machine = game.s.machines[id];
    if (!machine) return;
    const rooms = ROOMS.filter((room) => game.s.rooms[room.id]);
    const source = game.roomOf(id);
    const activeHasSpace = game.s.rooms[game.s.active]?.includes(null);
    const initial = activeHasSpace ? game.s.active : rooms.find((room) => game.s.rooms[room.id].includes(null))?.id ?? game.s.active;
    this.modal(`<h2>${source ? 'Miner umziehen' : 'Miner aufstellen'}</h2>
      <p>${escapeHtml(machine.name)}</p>
      <label class="placement-field">Zielraum<select id="placement-room">${rooms.map((room) => {
        const free = game.s.rooms[room.id].filter((slot) => slot === null).length;
        return `<option value="${room.id}" ${room.id === initial ? 'selected' : ''}>${room.name} · ${free} frei</option>`;
      }).join('')}</select></label>
      <p class="muted">Wähle einen Stellplatz. Bei einem belegten Platz wird getauscht. Stand dein Miner im Lager, kommt der andere Miner dorthin.</p>
      <div class="slot-grid" id="placement-slots"></div>
      <div class="btns"><button id="cancel-place">Abbrechen</button></div>`, (root) => {
      const room = root.querySelector<HTMLSelectElement>('#placement-room')!;
      const slots = root.querySelector<HTMLElement>('#placement-slots')!;
      const render = () => {
        slots.innerHTML = game.s.rooms[room.value].map((occupant, idx) => `
          <button data-slot-index="${idx}" ${occupant === id ? 'disabled' : !occupant ? 'class="primary"' : ''}>
            Platz ${idx + 1}<span class="placement-status">${occupant === id ? 'Hier aufgestellt' : occupant ? `Tausch · ${escapeHtml(game.s.machines[occupant]?.name ?? '')}` : 'Frei'}</span>
          </button>`).join('');
      };
      room.addEventListener('change', render);
      slots.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) return;
        const button = event.target.closest<HTMLButtonElement>('button[data-slot-index]');
        if (!button || button.disabled) return;
        if (game.placeItem(id, room.value, Number(button.dataset.slotIndex), true)) {
          this.closeModal();
          sfx.place();
          this.toast(`Aufgestellt in ${ROOMS.find((entry) => entry.id === room.value)!.name}.`);
        }
      });
      root.querySelector('#cancel-place')!.addEventListener('click', () => this.closeModal());
      render();
    });
  }

  private restructureModal() {
    this.modal(`<h2>Betrieb neu aufbauen</h2>
      <p>35 % deiner eigenen Miner (aufgerundet, Starter-PC ausgenommen) werden eingezogen. Leasinggeräte gehen zurück und die Rig-Crew wird aufgelöst. Du wechselst ins Kinderzimmer und erhältst mindestens 350 € Bargeld. Betriebsrückstände entfallen. Bankkredite laufen weiter.</p>
      <div class="btns"><button id="cancel-restructure">Abbrechen</button><button class="primary" id="confirm-restructure">Wiederaufbau starten</button></div>`, (root) => {
      root.querySelector('#cancel-restructure')!.addEventListener('click', () => this.closeModal());
      root.querySelector('#confirm-restructure')!.addEventListener('click', () => { this.closeModal(); game.ops.restructure(); });
    });
  }

  private prestigeModal() {
    const gain = game.prestigeGain();
    const can = game.canPrestige();
    this.modal(`<h2>Prestige-Neustart ✨</h2>
      <p>Du startest von vorn (Miner, Teile, Räume, Geld, Forschung werden zurückgesetzt). Erfolge, Serie, Forge-Punkte, Chips und Skills bleiben. Neue Forge-Punkte bringen je einen Chip. Jeder Punkt gibt dauerhaft <b>+5 % Hash und Klickertrag</b>.</p>
      ${kv('Aktuelle Punkte', `${game.s.prestige.points}`)}${kv('Neue Punkte durch Neustart', `+${Math.max(0, gain)}`)}${kv('Vermögen', `${eur(game.netWorth())} / 20.000 €`)}
      <div class="btns" style="margin-top:14px"><button id="no">Abbrechen</button><button class="primary" id="yes" ${can ? '' : 'disabled'}>Neustart</button></div>`, (m) => {
      m.querySelector('#no')!.addEventListener('click', () => this.closeModal());
      m.querySelector('#yes')!.addEventListener('click', () => { this.closeModal(); game.doPrestige(); });
    });
  }

  private submitOperation(e: SubmitEvent) {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.opForm) return;
    e.preventDefault();
    const data = new FormData(form, e.submitter);
    const coin = String(data.get('coin') ?? '');
    const amount = Number(data.get('amount'));
    if (form.dataset.opForm === 'order') {
      game.ops.placeOrder(coin, data.get('side') === 'sell' ? 'sell' : 'buy', amount, Number(data.get('limit')));
    } else if (e.submitter) {
      game.ops.transfer(coin, amount, data.get('direction') === 'withdraw');
    }
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
      case 'shop-seg': this.shopSeg = d.seg as 'parts' | 'pre'; this.renderContent(); break;
      case 'shop-cat': this.shopCat = d.cat as PartCat; this.renderContent(); break;
      case 'forecast-pre': this.previewPurchase('pre', id); break;
      case 'forecast-part': this.previewPurchase('part', id); break;
      case 'forecast-build': this.previewPurchase('build'); break;
      case 'open-workshop':
      case 'open-workshop-orders':
        this.tab = act === 'open-workshop' ? 'build' : 'orders';
        this.renderAll();
        $('content').scrollTop = 0;
        break;
      case 'workshop-deliver': game.deliverWorkshopOrder(id); break;
      case 'buy-part': game.buyPart(id); break;
      case 'sell-part': game.sellPart(id); break;
      case 'buy-pre': game.buyPrebuilt(id); break;
      case 'lease-pre': game.buyPrebuilt(id, true); break;
      case 'open-ops':
        if (isOpsTab(id)) {
          this.opsTab = id;
          this.tab = 'ops';
          this.renderAll();
          $('content').scrollTop = 0;
        }
        break;
      case 'ops':
        if (d.op === 'restructure') {
          if (game.ops.canRestructure()) this.restructureModal();
        } else if (d.op === 'tab' && isOpsTab(id)) {
          this.opsTab = id;
          this.renderContent();
          $('content').scrollTop = 0;
        } else if (d.op) performOpsAction(game, d.op, id);
        break;
      case 'draft-part': {
        const p = partDef(id);
        if (p.cat === 'gpu') game.addDraftGpu(id); else game.setDraftPart(p.cat, id);
        this.tab = 'build';
        this.renderAll();
        break;
      }
      case 'draft-set': game.setDraftPart(d.cat as PartCat, id); break;
      case 'draft-none': game.clearDraftPart(d.cat as PartCat); break;
      case 'draft-gpu-add': game.addDraftGpu(id); break;
      case 'draft-gpu-rm': game.removeDraftGpu(Number(d.i)); break;
      case 'draft-gpu-sub': game.removeDraftGpuOf(id); break;
      case 'draft-gpu-fill': game.fillDraftGpu(id); break;
      case 'draft-clear': game.clearDraft(); break;
      case 'draft-preset': game.loadBuildPreset(id); break;
      case 'build':
        if (game.buildDraft(this.bpName)) {
          this.bpName = '';
          const name = document.querySelector<HTMLInputElement>('#bpname');
          if (name) name.value = '';
        }
        break;
      case 'bp-save': game.saveBlueprint(this.bpName); this.bpName = ''; break;
      case 'bp-load': game.loadBlueprint(id); break;
      case 'bp-build': game.buildBlueprint(id); break;
      case 'bp-del': game.deleteBlueprint(id); break;
      case 'bp-from': game.blueprintFrom(id); break;
      case 'open-inventory': this.tab = 'inv'; this.renderAll(); $('content').scrollTop = 0; break;
      case 'place': game.placeItem(); break;
      case 'place-m': this.placementModal(id); break;
      case 'unplace': game.unplace(id); break;
      case 'edit-m': game.dismantle(id, true); this.tab = 'build'; this.renderAll(); break;
      case 'dismantle': game.dismantle(id); break;
      case 'sell-m': game.sellMachine(id); break;
      case 'buy-upg': game.buyUpgrade(id); break;
      case 'hire': game.hire(id); break;
      case 'research': game.startResearch(id); break;
      case 'buy-room': game.buyRoom(id); break;
      case 'room': game.setRoom(id); break;
      case 'room-coin': game.setRoomCoin(id, d.coin ?? 'BIT'); break;
      case 'sell': game.sell(d.coin ?? 'BIT', Number(d.f)); break;
      case 'sell-all': game.sellAll(Number(d.f)); break;
      case 'deal-take': game.takeDeal(); break;
      case 'deal-skip': game.skipDeal(); break;
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
    document.body.classList.toggle('operations-open', this.tab === 'ops');
    this.fitPanel();
    this.renderTabs();
    this.renderContent();
    this.renderRooms();
    this.renderQuest();
    this.updateDock(game.s.roomCoin[game.s.active] ?? DEFAULT_COIN);
    this.updateAfford();
    this.drawMinis();
  }

  private tabsHtml = '';

  private renderTabs() {
    const inv = game.unplaced().length;
    const badge = (k: Tab): string => {
      if (k === 'inv' && inv > 0) return `<em class="badge">${inv}</em>`;
      if (k === 'tasks' && game.dailyReady()) return '<em class="badge">!</em>';
      if (k === 'more' && game.canPrestige()) return '<em class="badge">✨</em>';
      return '';
    };
    const html = TABS.map(([k, icon, label]) => {
      const selected = k === this.tab;
      return `<button type="button" data-tab="${k}"${selected ? ' class="on" aria-current="true"' : ''}><i aria-hidden="true">${icon}</i><span>${label}</span>${badge(k)}</button>`;
    }).join('');
    if (html !== this.tabsHtml) {
      $('tabs').innerHTML = this.tabsHtml = html;
    }
    const label = TABS.find(([id]) => id === this.tab)?.[2] ?? '';
    if ($('current-tab').textContent !== label) $('current-tab').textContent = label;
  }

  private renderContent(live = false) {
    const el = $('content');
    el.classList.toggle('live-refresh', live);
    const scroll = el.scrollTop;
    let h = '';
    switch (this.tab) {
      case 'ops': h = renderOperations(game, this.opsTab); break;
      case 'shop': h = this.shop(); break;
      case 'build': h = this.workshop(); break;
      case 'orders': h = this.workshopJobs(); break;
      case 'chain': h = this.explorer(); break;
      case 'inv': h = this.inventory(); break;
      case 'market': h = this.market(); break;
      case 'bank': h = this.bank(); break;
      case 'tech': h = this.tech(); break;
      case 'tasks': h = this.tasks(); break;
      case 'rooms': h = this.rooms(); break;
      case 'ach': h = this.achievements(); break;
      case 'more': h = this.more(); break;
    }
    const forms = new Map(Array.from(el.querySelectorAll<HTMLFormElement>('form[data-op-form]'), (form) => [
      form.dataset.opForm, new Map(Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input:not([type=hidden]), select'), (field) => [field.name, field.value])),
    ]));
    const focus = document.activeElement;
    const focusForm = focus instanceof HTMLInputElement || focus instanceof HTMLSelectElement ? focus.form?.dataset.opForm : undefined;
    const focusName = focusForm && focus instanceof HTMLElement ? focus.getAttribute('name') : null;
    el.innerHTML = h;
    for (const form of el.querySelectorAll<HTMLFormElement>('form[data-op-form]')) {
      const values = forms.get(form.dataset.opForm);
      if (!values) continue;
      for (const field of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input:not([type=hidden]), select')) {
        const value = values.get(field.name);
        if (value !== undefined && (!(field instanceof HTMLSelectElement) || Array.from(field.options).some((option) => option.value === value))) field.value = value;
        if (focusForm === form.dataset.opForm && focusName === field.name) field.focus({ preventScroll: true });
      }
    }
    el.scrollTop = scroll;
  }

  /** Coins, die ein Gerät minen kann, mit Netto-€/s. */
  private coinLines(st: { hash: number; kind: Kind; watts: number }): { html: string; best: number } {
    const coins = COINS.filter((c) => game.coinUnlocked(c));
    const ok = coins.filter((c) => game.canMine(st, c.id));
    const best = Math.max(-Infinity, ...ok.map((c) => game.netPerSec(st, c.id)));
    const no = coins.filter((c) => !game.canMine(st, c.id)).map((c) => c.id);
    const html = (ok.length ? ok.map((c) => {
      const n = game.netPerSec(st, c.id);
      return `<span style="color:${c.color}">${c.id}</span> <span class="${n >= 0 ? 'good' : 'bad'}">${n >= 0 ? '+' : ''}${num(n, Math.abs(n) < 10 ? 2 : 0)}</span>`;
    }).join(' · ') : '<span class="bad">kein freigeschalteter Coin</span>') + (no.length ? `<br><span style="opacity:.7">Nicht möglich: ${no.join(', ')}</span>` : '');
    return { html, best };
  }

  private hwIndex(): string {
    return `<div class="hwrow">${(['gpu', 'asic', 'parts'] as HwMarket[]).map((k) => {
      const v = game.hw[k];
      const cls = v > 1.03 ? 'bad' : v < 0.97 ? 'good' : '';
      return `<div class="hwpill"><small>${HW_LABEL[k]}</small><b class="${cls}" data-hwv="${k}">${num(v * 100)} %</b><canvas class="mini hw" data-hw="${k}"></canvas></div>`;
    }).join('')}</div>`;
  }

  private partStats(p: PartDef): string {
    switch (p.cat) {
      case 'gpu': case 'cpu': return `${num(p.hash ?? 0)} H/s · ${num(p.watts ?? 0)} W · Hitze ${num(p.heat ?? 0)}`;
      case 'case': return `${p.slots} GPU-Plätze · ${p.rig ? 'offener Rahmen' : 'Tower'} · Hitze ×${num(p.heatMul ?? 1, 2)}`;
      case 'board': return `${p.slots} PCIe-Slot${(p.slots ?? 1) > 1 ? 's' : ''}`;
      case 'psu': return `${num(p.cap ?? 0)} W · Wirkungsgrad ${num((p.eff ?? 0) * 100)} %`;
      case 'cool': return `Hitze ×${num(p.heatMul ?? 1, 2)} · ${num(p.watts ?? 0)} W`;
      default: return (p.hashMul ?? 1) > 1 ? `Hash +${num(((p.hashMul ?? 1) - 1) * 100)} %` : 'Basis';
    }
  }

  private previewPurchase(target: 'pre' | 'part' | 'build', id = '') {
    let stats: MachineStat;
    let cost: number;
    let insuredValue: number;
    let partPrice: number | null = null;
    if (target === 'pre') {
      const device = prebuiltDef(id);
      if (!device) return;
      stats = machineStats({ id: '', name: device.name, pre: id });
      cost = insuredValue = game.prePrice(id);
    } else {
      const draft = cloneBuild(game.s.draft);
      if (target === 'part') {
        const part = partDef(id);
        if (!part) return;
        partPrice = game.partPrice(id);
        if (part.cat === 'gpu') draft.gpus.push(id);
        else draft.parts[part.cat] = id;
      }
      const build = buildStats(draft);
      if (build.problems.length) {
        this.modal(`<h2>Kaufvorschau</h2><p>Vervollständige zuerst die Konfiguration in der Werkstatt.</p>
          ${build.problems.map((problem) => `<p>${escapeHtml(problem)}</p>`).join('')}
          <div class="btns"><button class="primary" id="close-forecast">Schließen</button></div>`,
        (modal) => modal.querySelector('#close-forecast')?.addEventListener('click', () => this.closeModal()));
        return;
      }
      stats = build;
      cost = game.missingCost(draft).cost;
      insuredValue = buildPartList(draft).reduce((sum, part) => sum + game.partPrice(part), 0);
    }
    const rows = game.purchaseForecast(stats, insuredValue, target !== 'pre').map((forecast) => {
      const { room, free } = forecast;
      const active = room.id === game.s.active ? ' · aktuell ausgewählt' : '';
      const details = 'net' in forecast && forecast.net !== undefined
        ? kv('Zusätzlich netto', `${forecast.net >= 0 ? '+' : ''}${num(forecast.net, 3)} €/s · ${forecast.coin}`)
          + kv('Netzreserve danach', `${num(forecast.gridReserve, 2)} kW`)
          + kv('Kühlreserve danach', `${num(forecast.heatReserve, 1)} Hitzeeinheiten`)
          + kv('Verfügbare Leistung', `${num(forecast.throttle * 100)} %`)
        : `<p>${!free ? 'Kein freier Stellplatz.' : 'Kein kompatibler Coin freigeschaltet.'}</p>`;
      return `<div class="card"><b>${room.name}${active}</b>${details}</div>`;
    }).join('');
    this.modal(`<h2>Kaufvorschau · ${escapeHtml(stats.name)}</h2>
      <p>${target === 'pre' ? `${eur(cost)} Kaufpreis` : `${partPrice !== null ? `Einzelteil ${eur(partPrice)} · ` : ''}${eur(cost)} fehlende Teile`}</p>
      <p>Prognose bei aktuellem Kurs, Tarif und Raumzustand. Negative Reserven zeigen Überlastung.</p>
      ${rows}<div class="btns"><button class="primary" id="close-forecast">Schließen</button></div>`,
    (modal) => modal.querySelector('#close-forecast')?.addEventListener('click', () => this.closeModal()));
  }

  private workshopJobs(): string {
    return title('Kunden-PC-Aufträge')
      + '<p class="muted">Konfiguriere einen PC in der Werkstatt und liefere ihn hier an den Kunden. Jeder Auftrag ist einmal pro Spieltag verfügbar.</p>'
      + '<div class="btns"><button type="button" data-act="open-workshop">Zur Werkstatt</button></div>'
      + WorkshopJobs.map(({ id }) => {
      const offer = game.workshopOffer(id)!;
      const { job, cost, catalog, done, locked, fits } = offer;
      const status = done ? 'Heute geliefert' : locked ? 'Benötigt Effizienz-Firmware'
        : !fits ? 'Aktuelle Konfiguration passt noch nicht' : game.s.cash < cost ? 'Bargeld für fehlende Teile fehlt' : 'Bereit zur Lieferung';
      return `<div class="card"><div class="name">${job.name} · ${job.description}</div>
        <div class="muted">Mind. ${job.minHash} H/s · max. ${job.maxWatts} W · Katalogbudget ${eur(job.budget)}</div>
        ${kv('Teilewert der Konfiguration', eur(catalog))}
        ${kv('Kosten für fehlende Teile', eur(cost))}
        ${kv('Auftragszahlung', eur(job.reward))}
        <div class="muted">${status}</div>
        <div class="btns"><button data-act="workshop-deliver" data-id="${id}" ${done || locked || !fits || game.s.cash < cost ? 'disabled' : ''}>Bauen &amp; an Kunden liefern</button></div>
      </div>`;
    }).join('');
  }

  private shop(): string {
    const sale = game.s.ev?.id === 'sale';
    let h = this.hwIndex() + `<div class="seg"><button data-act="shop-seg" data-seg="parts" class="${this.shopSeg === 'parts' ? 'on' : ''}">🧩 Komponenten</button><button data-act="shop-seg" data-seg="pre" class="${this.shopSeg === 'pre' ? 'on' : ''}">📦 Fertig-Miner</button></div>`;
    if (sale) h += '<div class="lockmsg" style="color:var(--gold);margin-bottom:8px">🏷️ Hardware-Sale: alles −30 %!</div>';
    if (this.shopSeg === 'pre') {
      const full = game.totalGadgets() >= game.machineLimit();
      if (full) h += `<div class="lockmsg" style="margin-bottom:8px">Lagerreserve voll · ${game.machineLimit()} Miner gesamt</div>`;
      return h + PREBUILT.map((p) => {
        const locked = !game.unlocked(p);
        const cost = game.prePrice(p.id);
        const lease = game.ops.leaseQuote(p.id);
        const st: MachineStat = { name: p.name, kind: p.kind, model: p.model, hash: p.hash, watts: p.watts, heat: p.heat, color: p.color, ledColor: p.ledColor, gpus: [], maxGpu: 0 };
        const { html, best } = this.coinLines(st);
        return `<div class="card ${locked ? 'lock' : ''}" style="--c:${hex(p.ledColor)}">
          <div class="head">${machineIcon(st)}<div style="flex:1"><div class="row"><span class="name">${p.name}</span><span class="tag">${KIND_NAME[p.kind]}</span></div><div class="muted">${p.brand} · Besitz: ${game.owned(p.id)}</div></div></div>
          <div class="muted" style="margin:6px 0">${p.desc}</div>
          ${kv('Leistung', `${num(p.hash)} H/s · ${num(p.watts)} W · Hitze ${num(p.heat)}`)}
          ${locked ? `<div class="lockmsg">🔒 Erforsche „${techDef(p.unlock!).name}“.</div>` : ''}
          <div class="row"><span class="roi">${best > 0 ? `<span class="good">Amortisation ca. ${num(cost / best / 60, 1)} min</span>` : '<span class="bad">Aktuell unrentabel</span>'}<br><span class="muted">Netto €/s: ${html}</span></span>
            <button class="buy" data-act="buy-pre" data-id="${p.id}" data-ppre="${p.id}" data-cost="${cost}" data-locked="${locked || full ? 1 : 0}" ${locked || full ? 'disabled' : ''}>${eur(cost)}</button></div>
          <div class="btns"><button data-act="forecast-pre" data-id="${p.id}">Raumprognose</button><button data-act="lease-pre" data-id="${p.id}" data-lease="${p.id}" data-cost="${lease.deposit}" data-locked="${locked || full ? 1 : 0}" ${locked || full || game.s.cash < lease.deposit ? 'disabled' : ''}>Leasing · ${eur(lease.deposit)} + 3 × ${eur(lease.payment)}</button></div>
        </div>`;
      }).join('');
    }
    h += `<div class="chips" style="margin:0 0 10px">${CAT_ORDER.map((c) => `<button data-act="shop-cat" data-cat="${c}" class="${this.shopCat === c ? 'on' : ''}">${CATS[c].icon} ${CATS[c].name}</button>`).join('')}</div>`;
    return h + PARTS.filter((p) => p.cat === this.shopCat)
      .map((p) => ({ part: p, price: game.partPrice(p.id) }))
      .sort((a, b) => a.price - b.price || a.part.name.localeCompare(b.part.name, 'de'))
      .map(({ part: p, price: cost }) => {
      const locked = !game.unlocked(p);
      const have = game.s.parts[p.id] ?? 0;
      return `<div class="card ${locked ? 'lock' : ''}" style="--c:${hex(p.color)}">
        <div class="head">${partIcon(p)}<div style="flex:1"><div class="row"><span class="name">${p.name}</span>${have ? `<span class="tag" style="--c:var(--acc)">Lager ${have}</span>` : ''}</div><div class="muted">${p.brand} · ${this.partStats(p)}</div></div></div>
        <div class="muted" style="margin:6px 0">${p.desc}</div>
        ${locked ? `<div class="lockmsg">🔒 Erforsche „${techDef(p.unlock!).name}“.</div>` : ''}
        <div class="btns" style="margin:0;justify-content:flex-end">
          <button data-act="sell-part" data-id="${p.id}" ${have < 1 ? 'disabled' : ''}>Verk. ${eur(game.partSellValue(p.id))}</button>
          <button data-act="forecast-part" data-id="${p.id}" ${locked ? 'disabled' : ''}>Prognose im PC</button>
          <button data-act="draft-part" data-id="${p.id}" ${locked ? 'disabled' : ''}>➜ Werkstatt</button>
          <button class="buy" data-act="buy-part" data-id="${p.id}" data-pp="${p.id}" data-cost="${cost}" data-locked="${locked ? 1 : 0}" ${locked ? 'disabled' : ''}>${sale ? `<span class="old">${eur(Math.round(p.cost * game.hw[CATS[p.cat].market]))}</span>` : ''}${eur(cost)}</button>
        </div>
      </div>`;
    }).join('');
  }

  private workshop(): string {
    const d = game.s.draft;
    const st = buildStats(d);
    const { cost, missing } = game.missingCost(d);
    const row = (cat: PartCat) => {
      const opts = PARTS.filter((p) => p.cat === cat);
      const cur = d.parts[cat];
      const chips = opts.map((p) => {
        const locked = !game.unlocked(p);
        const have = game.s.parts[p.id] ?? 0;
        return `<button data-act="draft-set" data-cat="${cat}" data-id="${p.id}" class="${cur === p.id ? 'on' : ''}" ${locked ? 'disabled' : ''}>${locked ? '🔒 ' : ''}${shortName(p)} <small>${have ? `Lager ${have}` : eur(game.partPrice(p.id))}</small></button>`;
      }).join('');
      const none = CATS[cat].req ? '' : `<button data-act="draft-none" data-cat="${cat}" class="${cur ? '' : 'on'}">Keine</button>`;
      return `<div class="wsrow"><div class="row"><span class="name">${CATS[cat].icon} ${CATS[cat].name}${CATS[cat].req ? '' : ' <small class="muted">optional</small>'}</span><span class="muted">${cur ? partLabel(partDef(cur)) : CATS[cat].req ? '<span class="bad">fehlt</span>' : '–'}</span></div><div class="chips">${none}${chips}</div></div>`;
    };
    const gpuRow = () => {
      const max = st.maxGpu;
      const full = !max || d.gpus.length >= max;
      const rows = PARTS.filter((p) => p.cat === 'gpu').map((p) => {
        const n = d.gpus.filter((x) => x === p.id).length;
        const have = game.s.parts[p.id] ?? 0;
        return `<div class="gpurow"><div class="gi"><b>${p.brand} ${p.name}</b><small>${num(p.hash ?? 0)} H/s · ${num(p.watts ?? 0)} W · ${have ? `Lager ${have}` : eur(game.partPrice(p.id))}</small></div>
          <div class="step ${n ? 'on' : ''}"><button data-act="draft-gpu-sub" data-id="${p.id}" ${n ? '' : 'disabled'}>−</button><b>${n}</b><button data-act="draft-gpu-add" data-id="${p.id}" ${full ? 'disabled' : ''}>+</button></div></div>`;
      }).join('');
      const last = d.gpus[d.gpus.length - 1];
      return `<div class="wsrow"><div class="row"><span class="name">🎮 Grafikkarten</span><span class="muted">${d.gpus.length} / ${max || '–'} Plätze</span></div>
        ${max ? rows : '<div class="muted" style="margin-top:4px">Wähle zuerst Gehäuse und Mainboard.</div>'}
        ${max && last && d.gpus.length < max ? `<button style="margin-top:6px;width:100%" data-act="draft-gpu-fill" data-id="${last}">Restliche ${max - d.gpus.length} Plätze mit ${shortName(partDef(last))} füllen</button>` : ''}</div>`;
    };
    const { html, best } = this.coinLines(st);
    const loadRatio = st.cap ? st.dc / st.cap : 0;
    const ok = st.problems.length === 0;
    let h = `<div class="muted" style="margin:0 2px 8px">Wähle die Teile. Vorhandene Lagerteile werden zuerst verbaut, fehlende Teile beim Zusammenbau gekauft.</div>`;
    h += `<div class="chips" aria-label="Bauvorlagen">${BUILD_PRESETS.map((preset) => `
      <button data-act="draft-preset" data-id="${preset.id}">${preset.name} <small>${eur(game.missingCost(preset.build).cost)}</small></button>
    `).join('')}</div>`;
    h += `<div class="card" style="--c:${ok ? 'var(--acc)' : 'var(--hot)'}">
      <div class="head">${machineIcon(st)}<div style="flex:1"><div class="name">${st.name}</div><div class="muted">${KIND_NAME[st.kind]} · ${st.model === 'rig' ? 'offener Rig' : 'Tower-PC'}</div></div></div>
      <div class="bars" style="margin-top:6px">
        ${bar('Hash', st.hash, Math.max(50, st.hash), `${num(st.hash, 1)} H/s`, '#8c7bff')}
        ${bar('Netzteil', st.dc, st.cap || st.dc || 1, st.cap ? `${num(st.dc)} / ${num(st.cap)} W` : `${num(st.dc)} W`, loadRatio > 1 ? '#ff6a3d' : loadRatio > 0.85 ? '#ffc857' : '#7ee787')}
        ${bar('Hitze', st.heat, Math.max(100, st.heat), num(st.heat, 1), '#ff6a3d')}
      </div>
      ${kv('Strom aus der Steckdose', `${num(st.watts)} W`)}
      ${st.problems.map((p) => `<div class="lockmsg">⚠️ ${p}</div>`).join('')}
      <div class="muted" style="margin-top:6px">Netto €/s: ${html}</div>
      ${ok && best > 0 && cost > 0 ? `<div class="muted">Amortisation der neuen Teile ca. ${num(cost / best / 60, 1)} min</div>` : ''}
      <input id="bpname" class="txt" placeholder="Name (optional)" maxlength="32" value="${escapeHtml(this.bpName)}">
      <div class="btns">
        <button class="primary" data-act="build" ${ok ? '' : 'disabled'} data-cost="${cost}" data-locked="${ok ? 0 : 1}">🔧 Zusammenbauen${missing.length ? ` · ${eur(cost)}` : ' (alles im Lager)'}</button>
        <button data-act="forecast-build" ${ok ? '' : 'disabled'}>Raumprognose</button>
        <button data-act="bp-save" ${ok ? '' : 'disabled'}>💾 Blueprint</button>
        <button data-act="draft-clear">Leeren</button>
        <button data-act="open-inventory">Lager &amp; Stellplätze</button>
      </div>
      ${missing.length ? `<div class="muted" style="margin-top:4px">Wird gekauft: ${missing.map((id) => shortName(partDef(id))).join(', ')}</div>` : ''}
    </div>`;
    h += '<div class="btns"><button type="button" data-act="open-workshop-orders">Zu den Kunden-PC-Aufträgen</button></div>';
    h += CAT_ORDER.filter((c) => c !== 'gpu' && c !== 'cool').map(row).join('') + gpuRow() + row('cool');
    h += title(`Blueprints ${game.s.blueprints.length}/12`);
    h += game.s.blueprints.length ? game.s.blueprints.map((bp) => {
      const bs = buildStats(bp.build);
      const mc = game.missingCost(bp.build).cost;
      return `<div class="card" style="--c:${hex(bs.ledColor)}"><div class="head">${machineIcon(bs)}<div style="flex:1"><div class="name">${escapeHtml(bp.name)}</div><div class="muted">${num(bs.hash, 1)} H/s · ${num(bs.watts)} W · Hitze ${num(bs.heat, 1)}</div></div></div>
        <div class="btns"><button class="buy" data-act="bp-build" data-id="${bp.id}" data-cost="${mc}">Bauen · ${eur(mc)}</button><button data-act="bp-load" data-id="${bp.id}">Laden</button><button data-act="bp-del" data-id="${bp.id}">🗑</button></div></div>`;
    }).join('') : '<div class="muted" style="padding:6px 2px">Noch keine Blueprints. Speichere eine gültige Konfiguration.</div>';
    return h;
  }

  private inventory(): string {
    const room = ROOMS.find((r) => r.id === game.s.active)!;
    const slots = game.s.rooms[room.id] ?? [];
    const free = slots.filter((s) => s === null).length;
    const loose = game.unplaced();
    const card = (id: string, placed: string | null) => {
      const m = game.s.machines[id];
      const st = game.mstat(id);
      const status = placed ? { idle: 'Pausiert', throttled: 'Gedrosselt', running: 'In Betrieb' }[game.rigStatus(id, placed)] : '';
      const parts = m.build ? [...Object.values(m.build.parts).map((p) => shortName(partDef(p!))), m.build.gpus.length ? `${m.build.gpus.length}× GPU` : ''].filter(Boolean).join(' · ') : prebuiltDef(m.pre!).brand;
      return `<div class="card" style="--c:${hex(st.ledColor)}"><div class="head">${machineIcon(st)}<div style="flex:1"><div class="name">${escapeHtml(m.name)}</div><div class="muted">${num(st.hash, 1)} H/s · ${num(st.watts)} W · Hitze ${num(st.heat, 1)} · ${KIND_NAME[st.kind]}</div><div class="muted" style="font-size:11px">${parts}</div></div></div>
        ${placed ? `<div class="muted placement-status">Platz ${game.s.rooms[placed].indexOf(id) + 1} · Coin ${game.ops.rigCoin(id, coinDef(game.s.roomCoin[placed] ?? DEFAULT_COIN)).id} · ${status}</div>` : ''}
        <div class="btns"><button class="primary" data-act="place-m" data-id="${id}">${placed ? 'Umziehen / tauschen' : 'Aufstellen'}</button>${placed ? `<button data-act="unplace" data-id="${id}">Ins Lager</button>` : ''}
        ${m.build ? `<button data-act="edit-m" data-id="${id}">Bearbeiten</button><button data-act="bp-from" data-id="${id}">💾</button>${placed ? '' : `<button data-act="dismantle" data-id="${id}">Zerlegen</button>`}` : ''}
        ${game.s.ops.leases[id] ? opsLink('rigs', 'Leasing verwalten') : placed ? '' : `<button data-act="sell-m" data-id="${id}">Verk. ${eur(game.machineSellValue(m))}</button>`}</div></div>`;
    };
    let h = `<div class="sect">${game.placedCount()}/${game.maxGadgets()} Stellplätze belegt · ${game.totalGadgets()}/${game.machineLimit()} Miner gesamt</div>
      <div class="chips" aria-label="Freie Stellplätze">${ROOMS.filter((r) => game.s.rooms[r.id]).map((r) => `<button data-act="room" data-id="${r.id}" class="${r.id === room.id ? 'on' : ''}">${r.name} · ${game.s.rooms[r.id].filter((id) => id === null).length} frei</button>`).join('')}</div>
      ${free > 0 && loose.length > 0 ? `<div class="btns"><button data-act="place">Besten Miner direkt in ${room.name} aufstellen</button></div>` : ''}`;
    h += title(`Miner im Lager (${loose.length})`) + (loose.map((m) => card(m.id, null)).join('') || '<div class="muted" style="padding:6px 2px">Keine freien Miner im Lager. Bereits aufgestellte PCs stehen in der Raumliste.</div>');
    for (const r of ROOMS) {
      const ids = (game.s.rooms[r.id] ?? []).filter((x): x is string => !!x);
      if (ids.length) h += title(`${r.name} (${ids.length})`) + ids.map((id) => card(id, r.id)).join('');
    }
    const parts = Object.entries(game.s.parts).sort((a, b) => CAT_ORDER.indexOf(partDef(a[0]).cat) - CAT_ORDER.indexOf(partDef(b[0]).cat));
    h += title(`Einzelteile (${game.partsCount()})`) + (parts.map(([id, n]) => {
      const p = partDef(id);
      return `<div class="card" style="--c:${hex(p.color)}"><div class="head">${partIcon(p)}<div style="flex:1"><div class="name">${p.name}</div><div class="muted">${p.brand} · ${CATS[p.cat].name}</div></div><b style="font-size:18px">× ${n}</b></div>
        <div class="btns" style="justify-content:flex-end"><button data-act="draft-part" data-id="${id}">➜ Werkstatt</button><button data-act="sell-part" data-id="${id}">Verk. ${eur(game.partSellValue(id))}</button></div></div>`;
    }).join('') || '<div class="muted" style="padding:6px 2px">Keine losen Teile.</div>');
    return h + '<div class="muted" style="margin-top:6px">Tipp: Tippe im Raum auf einen Slot, um einen Miner aufzustellen oder ins Lager zu nehmen.</div>';
  }

  private explorer(): string {
    const me = game.netWorth();
    const rank = game.myRank();
    const rows = game.holders.map((h) => ({ h, v: holderValue(h, game.prices) })).sort((a, b) => b.v - a.v);
    const icon = { person: '👤', fund: '🏦', exchange: '🏛️', whale: '🐋' } as const;
    const nick = game.s.nick || 'Du';
    let out = `<div class="card" style="--c:var(--gold)"><div class="row"><span class="name">👛 ${game.s.nick || 'Deine Wallet'}</span><span class="tag" style="--c:var(--gold)">Platz ${rank}</span></div>
      <div class="mono">${game.s.addr}</div>${kv('Vermögen', `<b>${eur(me)}</b>`)}
      <div class="muted">${rank > 1 ? `Bis Platz ${rank - 1}: ${eur(rows[rank - 2].v - me)}` : 'Du bist die reichste Wallet der Welt.'}</div></div>`;
    out += title('Rich List · FX-Chain');
    let shown = false;
    rows.forEach((r, i) => {
      if (!shown && i === rank - 1) { out += this.richRow(rank, '⭐', nick, 'Deine Wallet', game.s.addr, me, 0, true); shown = true; }
      const top = COINS.reduce((a, c) => ((r.h.hold[c.id] ?? 0) * game.prices[c.id] > (r.h.hold[a.id] ?? 0) * game.prices[a.id] ? c : a), COINS[0]);
      out += this.richRow(i + 1 + (shown ? 1 : 0), icon[r.h.kind], r.h.name, `${r.h.tag} · ${num(r.h.txs)} Tx · meist ${top.id}`, r.h.addr, r.v, r.h.prev ? r.v / r.h.prev - 1 : 0, false);
    });
    if (!shown) out += this.richRow(rank, '⭐', nick, 'Deine Wallet', game.s.addr, me, 0, true);
    if (!game.s.nick) out = `<div class="muted" style="margin-bottom:8px">Tipp: Lege in den Einstellungen einen Nickname fest.</div>` + out;
    return out + '<div class="muted" style="margin-top:6px">Alle Personen, Firmen und Adressen sind frei erfunden.</div>';
  }

  private richRow(rank: number, icon: string, name: string, sub: string, addr: string, v: number, chg: number, me: boolean): string {
    return `<div class="rich ${me ? 'me' : ''}"><span class="rk">#${rank}</span><span class="av">${icon}</span><div style="flex:1;min-width:0"><div class="name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div><div class="muted" style="font-size:11px">${shortAddr(addr)} · ${sub}</div></div>
      <div style="text-align:right"><b>${eur(v)}</b>${me ? '' : `<div class="${chg >= 0 ? 'good' : 'bad'}" style="font-size:11px">${chg >= 0 ? '▲' : '▼'} ${num(Math.abs(chg) * 100, 1)} %</div>`}</div></div>`;
  }

  private market(): string {
    const solo = game.s.mode === 'solo';
    let h = `<div class="btns" style="margin-bottom:8px">${opsLink('treasury', 'Zins-Wallet & Limit-Orders')}${opsLink('traders')}</div><div class="seg"><button data-act="mode" data-m="pool" class="${!solo ? 'on' : ''}">⛏️ Pool</button><button data-act="mode" data-m="solo" class="${solo ? 'on' : ''}">🎰 Solo</button></div>
      <div class="muted" style="margin:-4px 2px 10px">${solo ? 'Solo: Blockfunde alle ca. 25 s, im Schnitt +12 % Ertrag, aber unregelmäßig.' : `Pool: stetiger Ertrag, ${Math.round(POOL_FEE * 100)} % Gebühr.`}</div>`;
    if (game.news.length) {
      h += `<div class="card" style="--c:#3a4a7a"><div class="row"><span class="name">📰 Börsen-News</span></div>${game.news.map((n) => `<div class="muted" style="margin-top:4px"><span class="${n.up ? 'good' : 'bad'}">${n.up ? '▲' : '▼'}</span> ${n.msg} <span style="opacity:.6">· vor ${dur((Date.now() - n.at) / 1000)}</span></div>`).join('')}</div>`;
    }
    for (const c of COINS) {
      const locked = !game.coinUnlocked(c);
      const hs = game.history[c.id];
      const chg = (game.prices[c.id] / hs[0] - 1) * 100;
      const w = game.s.wallet[c.id] ?? 0;
      const st = game.s.staked[c.id] ?? 0;
      const reserved = game.s.ops.treasury[c.id]?.amount ?? 0;
      const listed = game.s.ops.orders.filter((o) => o.side === 'sell' && o.coin === c.id).reduce((n, o) => n + o.amount, 0);
      const value = (w + st + reserved + listed) * game.prices[c.id];
      h += `<div class="card ${locked ? 'lock' : ''}" style="--c:${c.color}">
        <div class="row"><span class="name"><span style="color:${c.color}">●</span> ${c.name} <span class="muted">${c.id}</span></span>
          <span><b>${game.prices[c.id] < 10 ? num(game.prices[c.id], 2) : num(game.prices[c.id], 1)} €</b> <span class="${chg >= 0 ? 'good' : 'bad'}" style="font-size:11px">${chg >= 0 ? '▲' : '▼'} ${num(Math.abs(chg), 1)} %</span></span></div>
        <div class="muted">${c.desc}</div>
        <div class="muted" style="margin-top:3px">⛏️ Min. ${num(c.minHash)} H/s je Gerät · Algorithmus für: ${(Object.keys(KIND_NAME) as Kind[]).filter((k) => c.mult[k] > 0).map((k) => KIND_NAME[k]).join(', ')}</div>
        ${locked ? `<div class="lockmsg">🔒 Erforsche „${techDef(c.unlock!).name}“.</div>` : `<canvas class="mini" data-coin="${c.id}"></canvas>
        ${kv('Frei verfügbar', `${num(w, 4)} ${c.id}`)}${reserved || listed ? kv('Zins-Wallet / Orders', `${num(reserved, 4)} / ${num(listed, 4)} ${c.id}`) : ''}${kv('Gestaked (+0,25 %/min)', `${num(st, 4)} ${c.id}`)}${kv('Wert gesamt', eur(value))}
        <div class="btns">
          <button data-act="sell" data-coin="${c.id}" data-f="0.5" ${w < 1e-6 ? 'disabled' : ''}>50 % verk.</button>
          <button class="primary" data-act="sell" data-coin="${c.id}" data-f="1" ${w < 1e-6 ? 'disabled' : ''}>Alles verk.</button>
          <button data-act="stake" data-coin="${c.id}" data-f="1" ${w < 1e-6 ? 'disabled' : ''}>Staken</button>
          <button data-act="unstake" data-coin="${c.id}" ${st < 1e-6 ? 'disabled' : ''}>Abheben</button>
          ${game.has('auto') ? `<button data-act="ops" data-op="auto-coin" data-id="${c.id}" aria-pressed="${game.s.ops.autoCoins[c.id] !== false}">Auto-Verkauf ${game.s.ops.autoCoins[c.id] === false ? 'aus' : 'an'}</button>` : ''}
        </div>`}
      </div>`;
    }
    if (game.has('auto')) {
      const a = game.s.autoSell;
      h += `<div class="card" style="--c:var(--acc)"><div class="row"><span class="name">🤖 Auto-Verkauf</span><button data-act="autosell" data-on="${a.on ? 0 : 1}" data-min="${a.min}" class="${a.on ? 'on' : ''}">${a.on ? 'An' : 'Aus'}</button></div>
        <div class="muted">Verkauft ausgewählte freie Coins ab dem eingestellten Gesamtwert.</div>
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
      <div class="btns">${opsLink('grid')}${opsLink('rigs', 'Leasing verwalten')}</div>
      ${title('Versicherung')}
      <div class="card" style="--c:${s.insured ? 'var(--acc)' : '#3a4a7a'}">
        <div class="row"><span class="name">🛡️ Geräteversicherung</span><button data-act="insure" class="${s.insured ? 'on' : ''}">${s.insured ? 'Aktiv' : 'Abschließen'}</button></div>
        <div class="muted" style="margin-top:4px">Erstattet 70 % bei Hack-Diebstahl und übernimmt Defekte. Prämie: ${num(prem, 3)} €/s bei aktuellem Gerätewert.</div>
      </div>
      ${title('Laufende Bilanz (€/s)')}
      <div class="card" style="--c:var(--gold)"><div class="bars">
        ${bar('Einnahmen', income, maxBar, `+${num(income, 3)}`, '#7ee787')}
        ${bar('Strom', game.gridCostPerSec(), maxBar, `−${num(game.gridCostPerSec(), 3)}`, '#ffc857')}
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
    let h = `<div class="btns" style="margin-bottom:8px">${opsLink('tasks', 'Tages-Challenges, Weeklies & Projekte')}</div><div class="card" style="--c:${ready ? 'var(--gold)' : '#3a4a7a'}"><div class="row"><span class="name">📅 Tagesbonus</span>
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
      const requirement = game.roomRequirement(r.id);
      if (!owned) {
        return `<div class="card lock" style="--c:#3a4a7a"><div class="row"><span class="name">🔒 ${r.name}</span><button class="buy" data-act="buy-room" data-id="${r.id}" data-cost="${r.cost}" data-locked="${requirement ? 1 : 0}">${eur(r.cost)}</button></div>
          ${requirement ? `<div class="lockmsg">Benötigt: ${requirement}</div>` : ''}<div class="bars">${bar('Slots', r.spots.length, 20, `${r.spots.length}`, '#8c7bff')}${bar('Kühlung', r.maxHeat, 5200, num(r.maxHeat), '#4fd1c5')}</div>${kv('Miete', `${num(r.rent, 2)} €/s`)}</div>`;
      }
      const cond = game.s.cond[r.id] ?? 100;
      const rc = game.repairCost(r.id);
      const cur = game.s.roomCoin[r.id] ?? DEFAULT_COIN;
      return `<div class="card" style="--c:${active ? 'var(--acc)' : '#3a4a7a'}">
        <div class="row"><span class="name">🏠 ${r.name}</span><button data-act="room" data-id="${r.id}" class="${active ? 'on' : ''}">${active ? 'Aktiv' : 'Wechseln'}</button></div>
        <div class="bars">${bar('Slots', r.spots.length, 20, `${r.spots.length}`, '#8c7bff')}${bar('Kühlung', r.maxHeat, 5200, num(r.maxHeat), '#4fd1c5')}${bar('Zustand', cond, 100, `${num(cond)} %`, cond < 40 ? '#ff6a3d' : cond < 70 ? '#ffc857' : '#7ee787')}</div>
        ${kv('Miete', `${num(r.rent, 2)} €/s`)}
        <div class="row" style="margin-top:4px"><span class="muted">Mining-Münze</span></div>
        ${this.coinChips(r.id)}
        <div class="row" style="margin-top:8px"><span class="muted">Reparatur</span><button data-act="repair" data-id="${r.id}" data-cost="${rc}" ${rc <= 0 ? 'disabled' : ''}>${rc <= 0 ? 'Top Zustand' : `Reparieren ${eur(rc)}`}</button></div>
      </div>`;
    }).join('');
  }

  private more(): string {
    const s = game.s;
    const st = s.stats;
    const p = s.prestige;
    return `${title('Vermögen')}<div class="card" style="--c:var(--gold)">${kv('Vermögen gesamt', `<b>${eur(game.netWorth())}</b>`)}<canvas class="mini" id="netchart" style="height:70px"></canvas>
        ${kv('Geräte (60 %)', eur(game.gadgetValue() * 0.6))}${kv('Coins', eur(game.coinValue()))}${kv('Bargeld', eur(s.cash))}${kv('Für Orders reserviert', eur(game.ops.orderCash))}${kv('Bankschulden', eur(s.debt))}${kv('Betriebsrückstände', eur(s.ops.arrears))}</div>
      ${title('Prestige')}
      <div class="btns" style="margin-bottom:8px">${opsLink('meta', 'Sammlungen, Skilltree & Chip-Shop')}</div>
      <div class="card" style="--c:#c88bff"><div class="row"><span class="name">✨ Forge-Punkte: ${p.points}</span><span class="tag" style="--c:#c88bff">+${num(p.points * 5)} %</span></div>
        <div class="muted" style="margin:4px 0">Neustart gibt dauerhaft +5 % Hash und Klickertrag je Punkt. Benötigt 20.000 € Vermögen. Mögliche neue Punkte: <b>+${Math.max(0, game.prestigeGain())}</b></div>
        <button class="primary" style="width:100%" data-act="prestige" ${game.canPrestige() ? '' : 'disabled'}>Neustart planen</button></div>
      ${title('Statistik')}
      <div class="card" style="--c:#3a4a7a">${kv('Spielzeit', dur(s.playSec))}${kv('Gemint gesamt', num(s.minedTotal, 2))}${kv('Verkauft', eur(s.soldEur))}${kv('Strom bezahlt', eur(st.powerSpent))}${kv('Miete bezahlt', eur(st.rentPaid))}${kv('Gehälter', eur(st.salaryPaid))}${kv('Zinsen', eur(st.interestPaid))}${kv('Klicks', num(st.clicks))}${kv('Events', num(st.events))}${kv('Blöcke (Solo)', num(st.blocks))}${kv('Hacks erlitten', num(st.hacked))}</div>
      <div class="btns"><button data-act="settings">⚙️ Einstellungen</button><button data-act="tutorial">❓ Anleitung</button></div>`;
  }

  /** Coin-Auswahl eines Raums; Coins, die kein Gerät im Raum schafft, sind gedimmt. */
  private coinChips(roomId: string): string {
    const cur = game.s.roomCoin[roomId] ?? DEFAULT_COIN;
    const items = (game.s.rooms[roomId] ?? []).filter((x): x is string => !!x);
    return `<div class="chips">${COINS.filter((c) => game.coinUnlocked(c)).map((c) => {
      const ok = items.filter((g) => game.canMine(g, c.id)).length;
      const weak = items.length > 0 && ok === 0;
      return `<button data-act="room-coin" data-id="${roomId}" data-coin="${c.id}" class="${cur === c.id ? 'on' : ''} ${weak ? 'weak' : ''}" style="${cur === c.id ? '' : `color:${c.color}`}" title="min. ${c.minHash} H/s je Gerät · ${ok}/${items.length} Geräte geeignet">${c.id}${c.minHash ? `<small> ${num(c.minHash)}+</small>` : ''}</button>`;
    }).join('')}</div>`;
  }

  private renderRooms() {
    const owned = ROOMS.filter((r) => game.s.rooms[r.id]);
    const next = ROOMS.find((r) => !game.s.rooms[r.id]);
    const chips = owned.map((r) => {
      const slots = game.s.rooms[r.id];
      const n = slots.filter(Boolean).length;
      return `<button class="chip glass ${r.id === game.s.active ? 'on' : ''}" data-act="room" data-id="${r.id}">🏠 ${r.name} <small>${n}/${slots.length}</small></button>`;
    });
    if (next && !game.roomRequirement(next.id)) chips.push(`<button class="chip glass buy" data-act="buy-room" data-id="${next.id}" data-cost="${next.cost}">＋ ${next.name} · ${eur(next.cost)}</button>`);
    const i = owned.findIndex((r) => r.id === game.s.active);
    const prev = owned[(i - 1 + owned.length) % owned.length].id;
    const nxt = owned[(i + 1) % owned.length].id;
    const arrows = owned.length > 1 ? [`<button class="chip glass arrow" data-act="room" data-id="${prev}" title="Vorheriger Raum">◀</button>`, `<button class="chip glass arrow" data-act="room" data-id="${nxt}" title="Nächster Raum">▶</button>`] : [];
    $('rooms').innerHTML = `<div class="roomrow">${arrows[0] ?? ''}${chips.join('')}${arrows[1] ?? ''}</div><div class="coinrow"><span class="muted">⛏️ Mint:</span>${this.coinChips(game.s.active).replace('<div class="chips">', '').replace(/<\/div>$/, '')}</div>`;
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
    document.querySelectorAll<HTMLCanvasElement>('canvas.mini[data-hw]').forEach((c) => {
      const k = c.dataset.hw as HwMarket;
      const v = game.hw[k];
      drawLine(c, game.hwHistory[k], v > 1.03 ? '#ff6a3d' : v < 0.97 ? '#7ee787' : '#8c7bff', false);
    });
    const nc = document.getElementById('netchart') as HTMLCanvasElement | null;
    if (nc) drawLine(nc, game.s.netHistory.length > 1 ? game.s.netHistory : [0, 0], '#ffc857');
  }

  private flyEl: HTMLButtonElement | null = null;
  private flyY = 0;

  /** Fliegende Bonus-Drohne über der Szene bewegen, anklickbar. */
  private updateFlyer() {
    const f = game.flyer;
    if (!f) {
      if (this.flyEl) { const el = this.flyEl; this.flyEl = null; el.classList.add('gone'); setTimeout(() => el.remove(), 400); }
      return;
    }
    const mobile = window.innerWidth < 900;
    const W = mobile ? window.innerWidth : window.innerWidth - 356;
    if (!this.flyEl) {
      const el = document.createElement('button');
      el.className = 'flyer';
      el.innerHTML = '<span>🛸</span><i>🎁</i>';
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const r = el.getBoundingClientRect();
        const msg = game.catchFlyer();
        if (!msg) return;
        sfx.win();
        this.floaty(r.left + r.width / 2, r.top, msg);
        this.toast(`Bonus: ${msg}`);
        el.remove();
        this.flyEl = null;
      });
      $('hud').appendChild(el);
      this.flyEl = el;
      const H = window.innerHeight;
      this.flyY = mobile ? H * (0.2 + Math.random() * 0.15) : H * (0.25 + Math.random() * 0.3);
    }
    const p = 1 - f.t / f.total;
    const x = -70 + (W + 140) * p;
    const y = this.flyY + Math.sin(p * Math.PI * 6) * 22;
    this.flyEl.style.transform = `translate(${x}px, ${y}px) rotate(${Math.sin(p * Math.PI * 12) * 8}deg)`;
  }

  private floaty(x: number, y: number, text: string) {
    const d = document.createElement('div');
    d.className = 'floaty';
    d.textContent = text;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    $('hud').appendChild(d);
    setTimeout(() => d.remove(), 1600);
  }

  /** Mobil ohne Raum: Panel direkt unter dem Dock beginnen lassen. */
  private fitPanel() {
    const p = $('panel');
    const top = Math.ceil($('top').getBoundingClientRect().bottom + 8);
    document.body.style.setProperty('--hud-start', `${top}px`);
    const mobileOps = this.tab === 'ops' && window.innerWidth < 900;
    $('dock').style.top = mobileOps ? `${top}px` : '';
    if (mobileOps || (!settings.scene && window.innerWidth < 900)) p.style.top = `${Math.round($('dock').getBoundingClientRect().bottom + 6)}px`;
    else p.style.top = '';
    window.dispatchEvent(new Event('cryptoforge:layout'));
  }

  private dealKey = '';

  /** Händler-Angebot / Insider-Tipp als Banner; Text nur bei neuem Angebot neu aufbauen. */
  private renderDeal() {
    const el = $('deal');
    const d = game.deal;
    if (!d) {
      if (this.dealKey) { this.dealKey = ''; el.style.display = 'none'; el.innerHTML = ''; }
      return;
    }
    const key = `${d.kind}${d.id}${d.coin ?? ''}${d.price}`;
    if (key !== this.dealKey) {
      this.dealKey = key;
      el.style.display = '';
      if (d.kind === 'trade') {
        const p = partDef(d.id);
        const reg = game.partPrice(d.id);
        el.innerHTML = `<b>🚚 Händler-Angebot</b>${p.brand} ${p.name}<br><span class="muted">statt ${eur(reg)} nur ${eur(d.price)} (−40 %)</span><div class="track"><div class="fill" data-dealbar style="--b:var(--gold)"></div></div>
          <div class="btns"><button class="buy" data-act="deal-take" data-cost="${d.price}">Kaufen · ${eur(d.price)}</button><button data-act="deal-skip">Nein danke</button></div>`;
      } else {
        const c = coinDef(d.coin!);
        el.innerHTML = `<b>🕵️ Insider-Tipp</b>„${c.name} wird bald steigen.“<br><span class="muted">Kostet ${eur(d.price)}. Meist stimmt er, manchmal nicht.</span><div class="track"><div class="fill" data-dealbar style="--b:var(--gold)"></div></div>
          <div class="btns"><button class="buy" data-act="deal-take" data-cost="${d.price}">Tipp kaufen · ${eur(d.price)}</button><button data-act="deal-skip">Ablehnen</button></div>`;
      }
    }
    const bar = el.querySelector<HTMLElement>('[data-dealbar]');
    if (bar) bar.style.width = `${(d.t / d.total) * 100}%`;
  }

  private effectCards = new Map<string, { card: HTMLElement; time: HTMLElement; fill: HTMLElement }>();

  private renderEffects() {
    const active = Object.entries(BOOST_INFO).map(([id, boost]) => ({
      id, ...boost, left: game.boostLeft(id), bad: false,
    }));
    for (const id of keys(CONSUMABLES)) {
      const effect = CONSUMABLES[id];
      active.push({ id: `ops-${id}`, name: effect.name, icon: '⚡', total: effect.sec, left: game.ops.effect(id), bad: false });
    }
    const event = game.evInfo();
    if (event) active.unshift({ ...event, id: `event-${event.id}`, bad: event.id !== 'sale' });

    const alert = game.gridAlertInfo();
    if (alert) active.unshift({
      id: alert.pending ? 'event-grid-warning' : 'event-grid-shortage',
      name: alert.pending ? 'Stromengpass angekündigt' : 'Stromengpass',
      icon: '⚡', left: alert.left, total: alert.pending ? GRID_WARNING : GRID_SHORTAGE, bad: true,
    });

    const visible = new Set<string>();
    for (const effect of active) {
      if (effect.left <= 0) continue;
      visible.add(effect.id);
      let view = this.effectCards.get(effect.id);
      if (!view) {
        const card = document.createElement('div');
        card.className = effect.bad ? 'boost glass bad' : 'boost glass';
        card.dataset.effect = effect.id;
        card.innerHTML = `<div class="boost-label"><b>${effect.icon} ${effect.name}</b><time></time></div><div class="track" aria-hidden="true"><div class="fill"></div></div>`;
        if (effect.id.startsWith('event-grid-')) card.insertAdjacentHTML('beforeend', opsLink('grid'));
        const time = card.querySelector('time')!;
        const fill = card.querySelector<HTMLElement>('.fill')!;
        fill.style.setProperty('--b', effect.bad ? 'var(--hot)' : 'var(--gold)');
        view = { card, time, fill };
        this.effectCards.set(effect.id, view);
        if (effect.id.startsWith('event-')) $('boosts').prepend(card);
        else $('boosts').append(card);
      }
      const seconds = Math.ceil(effect.left);
      const label = `${seconds} s`;
      if (view.time.textContent !== label) {
        view.time.textContent = label;
        view.time.setAttribute('datetime', `PT${seconds}S`);
      }
      view.fill.style.width = `${Math.min(100, effect.left / effect.total * 100)}%`;
    }
    for (const [id, view] of this.effectCards) {
      if (visible.has(id)) continue;
      view.card.remove();
      this.effectCards.delete(id);
    }
  }

  private loop() {
    const now = performance.now();
    const dt = (now - this.lastTs) / 1000;
    this.lastTs = now;
    const coin = game.s.roomCoin[game.s.active] ?? DEFAULT_COIN;
    this.cash.set(game.s.cash);
    this.coins.set(game.s.wallet[coin] ?? 0);
    this.price.set(game.prices[coin]);
    this.hash.set(game.hashTotal);
    this.debt.set(game.s.debt);
    this.cash.tick(); this.coins.tick(); this.price.tick(); this.hash.tick(); this.debt.tick();
    $('coinLbl').textContent = coin;
    // Klick-Anzeige
    const odOn = game.boostOn('od');
    const odF = $('odFill');
    odF.style.width = `${odOn ? (game.boostLeft('od') / BOOST_INFO.od.total) * 100 : (game.od / OD_MAX) * 100}%`;
    odF.classList.toggle('on', odOn);
    $('comboTxt').textContent = `Combo ×${num(game.comboMult(), 2)}`;
    $('mineBtn').classList.toggle('hot', game.combo >= 10);
    this.updateFlyer();
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
    netEl.textContent = game.ops.debtStage().output === 0 ? 'Netz gesperrt' : game.s.cash <= 0 ? 'Strom gesperrt' : game.s.ev?.id === 'outage' ? 'Stromausfall' : `${net >= 0 ? '+' : ''}${num(net, 3)} €/s`;
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

    // Live-Tabs periodisch neu zeichnen (nicht während eines Klicks)
    this.liveT += 0.25;
    // Hardware-Preise im Shop ohne Neuaufbau aktualisieren
    if (this.tab === 'shop') {
      document.querySelectorAll<HTMLElement>('[data-pp]').forEach((b) => {
        const c = game.partPrice(b.dataset.pp!);
        if (Number(b.dataset.cost) !== c) { b.dataset.cost = String(c); if (!b.querySelector('.old')) b.textContent = eur(c); }
      });
      document.querySelectorAll<HTMLElement>('[data-ppre]').forEach((b) => {
        const c = game.prePrice(b.dataset.ppre!);
        if (Number(b.dataset.cost) !== c) { b.dataset.cost = String(c); if (!b.querySelector('.old')) b.textContent = eur(c); }
      });
      document.querySelectorAll<HTMLElement>('[data-lease]').forEach((b) => {
        const quote = game.ops.leaseQuote(b.dataset.lease!);
        if (Number(b.dataset.cost) !== quote.deposit || b.dataset.payment !== String(quote.payment)) {
          b.dataset.cost = String(quote.deposit);
          b.dataset.payment = String(quote.payment);
          b.textContent = `Leasing · ${eur(quote.deposit)} + 3 × ${eur(quote.payment)}`;
        }
      });
      document.querySelectorAll<HTMLElement>('[data-hwv]').forEach((b) => {
        const v = game.hw[b.dataset.hwv as HwMarket];
        b.textContent = `${num(v * 100)} %`;
        b.className = v > 1.03 ? 'bad' : v < 0.97 ? 'good' : '';
      });
      if (this.liveT >= 1.25) this.drawMinis();
    }
    if (this.liveT >= 1.5 && !this.pressed && (this.tab === 'market' || this.tab === 'bank' || this.tab === 'more' || this.tab === 'rooms' || this.tab === 'chain')) {
      this.liveT = 0;
      this.renderContent(true);
      this.drawMinis();
    }
    if (this.tab === 'ops' && this.liveT >= 1.5 && !this.pressed && !$('content').contains(document.activeElement?.closest('input,select,button:focus-visible') ?? null)) {
      this.liveT = 0;
      this.renderContent(true);
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

    this.renderEffects();
    this.renderDeal();
    const cv = game.clickBase() * game.comboMult() * (game.boostOn('click') ? 10 : 1);
    $('clickVal').textContent = `≈ ${eur(cv)}`;

    this.updateDock(coin);
  }

  private updateDock(coin: string) {
    const room = ROOMS.find((x) => x.id === game.s.active)!;
    const st = game.roomStats[room.id];
    if (st) {
      const ratio = st.heat / st.limit;
      const fill = $('heatFill');
      fill.style.width = `${Math.min(100, ratio * 100)}%`;
      fill.className = `fill ${ratio >= 1 ? 'hot' : ratio > 0.7 ? 'warn' : 'ok'}`;
      $('roomName').innerHTML = `<b>${room.name}</b>`;
      $('heatTxt').textContent = `Hitze ${num(st.heat)} / ${num(st.limit)}${st.throttle < 1 ? ` · gedrosselt ${num(st.throttle * 100)} %` : ''}`;
      $('roomSub').innerHTML = `${num(st.hash)} H/s · ${num(st.power)} W · Zustand ${num(st.cond)} % · ${coin}${st.idle ? ` · <span class="bad">${st.idle} Gerät(e) ohne passenden Coin</span>` : ''}`;
    }
    const total = game.freeCoinValue();
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
