import { GADGETS, ROOMS, gadgetDef, roomDef, upgradeDef, upgradeCost } from './config';

export const BASE_PRICE = 40;      // EUR je BIT (Startwert, Mean Reversion)
export const BIT_PER_HASH = 0.00072;
export const POWER_SCALE = 5000;  // 1 s Spielzeit = 5000 s Stromverbrauch (macht Strom relevant)
export const BASE_TARIFF = 0.32;   // EUR/kWh
export const CLICK_BIT = 0.01;
const OFFLINE_CAP = 8 * 3600;
const ACH_REWARD = 250;
const SAVE_KEY = 'cryptoforge.save.v1';

export type Slots = (string | null)[];

export interface SaveData {
  v: 1;
  cash: number;
  coins: number;
  sold: number;
  mined: number;
  bought: number;
  playSec: number;
  inv: Record<string, number>;
  rooms: Record<string, Slots>;
  upgrades: Record<string, number>;
  mission: number;
  ach: string[];
  overheated: boolean;
  savedAt: number;
  active: string;
}

export interface RoomStat { heat: number; throttle: number; power: number; hash: number; }
type Regime = 'bull' | 'bear' | 'side';
type EventName = 'change' | 'toast';

export interface Mission { title: string; desc: string; reward: number; done: (g: Game) => boolean; prog: (g: Game) => [number, number]; }
export interface Achievement { id: string; name: string; desc: string; test: (g: Game) => boolean; }

export const MISSIONS: Mission[] = [
  { title: 'Erster Rig', desc: 'Kaufe ein Gadget.', reward: 200, done: (g) => g.s.bought >= 1, prog: (g) => [Math.min(g.s.bought, 1), 1] },
  { title: 'Erster Verkauf', desc: 'Verkaufe 10 BIT.', reward: 300, done: (g) => g.s.sold >= 10, prog: (g) => [Math.min(g.s.sold, 10), 10] },
  { title: 'Kinderzimmer voll', desc: 'Belege alle Slots im Kinderzimmer.', reward: 500, done: (g) => g.roomFull('kid'), prog: (g) => [(g.s.rooms.kid ?? []).filter(Boolean).length, 2] },
  { title: 'Kühlung I', desc: 'Kaufe Kühlsystem Stufe 1.', reward: 400, done: (g) => (g.s.upgrades.cool ?? 0) >= 1, prog: (g) => [Math.min(g.s.upgrades.cool ?? 0, 1), 1] },
  { title: 'Lagerraum beziehen', desc: 'Schalte den Lagerraum frei.', reward: 1000, done: (g) => !!g.s.rooms.store, prog: (g) => [g.s.rooms.store ? 1 : 0, 1] },
];

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: 'Erster Hash', desc: 'Insgesamt 1 BIT gemined.', test: (g) => g.s.mined >= 1 },
  { id: 'placed', name: 'Rig-Besitzer', desc: 'Ein Gadget platziert.', test: (g) => g.placedCount() >= 1 },
  { id: 'kilo', name: 'Kilohash', desc: '1.000 H/s Gesamtleistung.', test: (g) => g.hashTotal >= 1000 },
  { id: 'sell100', name: 'Verkäufer', desc: '100 BIT verkauft.', test: (g) => g.s.sold >= 100 },
  { id: 'heat', name: 'Hitzewelle', desc: 'Einen Raum überhitzt.', test: (g) => g.s.overheated },
  { id: 'cool3', name: 'Eiskalt', desc: 'Kühlung Stufe 3.', test: (g) => (g.s.upgrades.cool ?? 0) >= 3 },
  { id: 'rich', name: 'Fünfstellig', desc: '10.000 € Bargeld.', test: (g) => g.s.cash >= 10000 },
  { id: 'rooms', name: 'Immobilienmogul', desc: 'Alle Räume freigeschaltet.', test: (g) => ROOMS.every((r) => !!g.s.rooms[r.id]) },
];

export class Game {
  s: SaveData;
  price = BASE_PRICE;
  regime: Regime = 'side';
  priceHistory: number[] = [BASE_PRICE];
  roomStats: Record<string, RoomStat> = {};
  bitPerSec = 0;
  powerEurPerSec = 0;
  hashTotal = 0;
  offlineGain = 0;

  private regimeTimer = 90;
  private historyTimer = 0;
  private checkTimer = 0;
  private saveTimer = 0;
  private listeners: Record<EventName, Array<(msg?: string) => void>> = { change: [], toast: [] };

  constructor() {
    this.s = this.load() ?? this.fresh();
    this.recalc();
    this.applyOffline();
  }

  on(ev: EventName, fn: (msg?: string) => void) {
    this.listeners[ev].push(fn);
  }

  private emit(ev: EventName, msg?: string) {
    for (const f of this.listeners[ev]) f(msg);
  }

  toast(msg: string) {
    this.emit('toast', msg);
  }

  private afterChange() {
    this.recalc();
    this.save();
    this.emit('change');
  }

  difficulty(): number {
    return 1 + (this.s.playSec / 3600) * 0.3;
  }

  roomFull(id: string): boolean {
    const slots = this.s.rooms[id];
    return !!slots && slots.every((x) => x !== null);
  }

  placedCount(): number {
    let n = 0;
    for (const id in this.s.rooms) n += this.s.rooms[id].filter(Boolean).length;
    return n;
  }

  owned(id: string): number {
    let n = this.s.inv[id] ?? 0;
    for (const r in this.s.rooms) n += this.s.rooms[r].filter((x) => x === id).length;
    return n;
  }

  /** Netto-Ertrag (EUR/s) eines Gadgets bei aktuellem Kurs und Upgrades. */
  netPerSec(hash: number, watts: number): number {
    const up = this.s.upgrades;
    const oc = 1 + 0.1 * (up.oc ?? 0);
    const tariff = BASE_TARIFF * Math.pow(0.9, up.tariff ?? 0);
    return ((hash * oc * BIT_PER_HASH) / this.difficulty()) * this.price - (watts / 1000 / 3600) * tariff * POWER_SCALE;
  }

  /** Hitze, Drosselung, Hashrate, Strom und BIT/s aus dem aktuellen Stand berechnen. */
  recalc() {
    const up = this.s.upgrades;
    const oc = 1 + 0.1 * (up.oc ?? 0);
    const cool = Math.pow(0.85, up.cool ?? 0);
    const tariff = BASE_TARIFF * Math.pow(0.9, up.tariff ?? 0);
    this.roomStats = {};
    let hash = 0;
    let watts = 0;
    let overheated = this.s.overheated;

    for (const r of ROOMS) {
      const slots = this.s.rooms[r.id];
      if (!slots) continue;
      const items = slots.filter((x): x is string => x !== null).map(gadgetDef);
      const heat = items.reduce((a, g) => a + g.heat * cool, 0);
      const throttle = heat > r.maxHeat ? r.maxHeat / heat : 1;
      if (throttle < 1) overheated = true;
      const rHash = items.reduce((a, g) => a + g.hash * oc * throttle, 0);
      const rPower = items.reduce((a, g) => a + g.watts, 0);
      this.roomStats[r.id] = { heat, throttle, power: rPower, hash: rHash };
      hash += rHash;
      watts += rPower;
    }

    this.s.overheated = overheated;
    this.hashTotal = hash;
    this.bitPerSec = (hash * BIT_PER_HASH) / this.difficulty();
    this.powerEurPerSec = (watts / 1000 / 3600) * tariff * POWER_SCALE;
  }

  /** Haupt-Schleife, dt in Sekunden. */
  update(dtRaw: number) {
    const dt = Math.min(Math.max(dtRaw, 0), 0.25);
    this.s.playSec += dt;
    this.recalc();
    this.updateMarket(dt);

    // Mining läuft nur bei positivem Bargeld (sonst Stromsperre). Strom wird immer abgebucht.
    if (this.s.cash > 0) {
      const gain = this.bitPerSec * dt;
      this.s.coins += gain;
      this.s.mined += gain;
    }
    this.s.cash -= this.powerEurPerSec * dt;

    this.checkTimer += dt;
    if (this.checkTimer >= 1) {
      this.checkTimer = 0;
      this.checkProgress();
    }
    this.saveTimer += dt;
    if (this.saveTimer >= 5) {
      this.saveTimer = 0;
      this.save();
    }
  }

  private updateMarket(dt: number) {
    this.regimeTimer -= dt;
    if (this.regimeTimer <= 0) {
      const r = Math.random();
      this.regime = r < 0.4 ? 'bull' : r < 0.7 ? 'side' : 'bear';
      this.regimeTimer = 60 + Math.random() * 90;
    }
    const drift = this.regime === 'bull' ? 0.006 : this.regime === 'bear' ? -0.006 : 0;
    const noise = (Math.random() - 0.5) * 0.04 * Math.sqrt(dt);
    this.price *= Math.exp(drift * dt + noise);
    this.price += (BASE_PRICE - this.price) * 0.02 * dt;
    this.price = Math.min(400, Math.max(4, this.price));

    this.historyTimer += dt;
    if (this.historyTimer >= 1) {
      this.historyTimer = 0;
      this.priceHistory.push(this.price);
      if (this.priceHistory.length > 90) this.priceHistory.shift();
    }
  }

  private checkProgress() {
    let changed = false;
    const m = MISSIONS[this.s.mission];
    if (m && m.done(this)) {
      this.s.cash += m.reward;
      this.s.mission++;
      changed = true;
      this.toast(`Mission erledigt: ${m.title} (+${m.reward} €)`);
    }
    for (const a of ACHIEVEMENTS) {
      if (!this.s.ach.includes(a.id) && a.test(this)) {
        this.s.ach.push(a.id);
        this.s.cash += ACH_REWARD;
        changed = true;
        this.toast(`Erfolg: ${a.name} (+${ACH_REWARD} €)`);
      }
    }
    if (changed) {
      this.save();
      this.emit('change');
    }
  }

  // ---- Aktionen ----

  buyGadget(id: string) {
    const g = gadgetDef(id);
    if (this.s.cash < g.cost) {
      this.toast('Zu wenig Bargeld.');
      return;
    }
    this.s.cash -= g.cost;
    this.s.bought++;
    this.addInv(id, 1);
    this.afterChange();
  }

  private addInv(id: string, n: number) {
    const v = (this.s.inv[id] ?? 0) + n;
    if (v <= 0) delete this.s.inv[id];
    else this.s.inv[id] = v;
  }

  private bestInInv(): string | null {
    for (let i = GADGETS.length - 1; i >= 0; i--) {
      const id = GADGETS[i].id;
      if ((this.s.inv[id] ?? 0) > 0) return id;
    }
    return null;
  }

  /** Bestes Gadget aus dem Inventar in den ersten freien Slot des aktiven Raums. */
  placeItem() {
    const slots = this.s.rooms[this.s.active];
    if (!slots) return;
    const idx = slots.indexOf(null);
    if (idx < 0) {
      this.toast('Raum ist voll.');
      return;
    }
    const id = this.bestInInv();
    if (!id) {
      this.toast('Kein Gadget im Inventar.');
      return;
    }
    slots[idx] = id;
    this.addInv(id, -1);
    this.afterChange();
  }

  /** Belegten Slot leeren (Gadget zurück ins Inventar) oder freien Slot füllen. */
  toggleSlot(idx: number) {
    const slots = this.s.rooms[this.s.active];
    if (!slots) return;
    const cur = slots[idx];
    if (cur) {
      slots[idx] = null;
      this.addInv(cur, 1);
      this.afterChange();
      return;
    }
    const id = this.bestInInv();
    if (!id) {
      this.toast('Kein Gadget im Inventar.');
      return;
    }
    slots[idx] = id;
    this.addInv(id, -1);
    this.afterChange();
  }

  buyRoom(id: string) {
    if (this.s.rooms[id]) {
      this.setRoom(id);
      return;
    }
    const r = roomDef(id);
    if (this.s.cash < r.cost) {
      this.toast('Zu wenig Bargeld.');
      return;
    }
    this.s.cash -= r.cost;
    this.s.rooms[id] = new Array<string | null>(r.spots.length).fill(null);
    this.s.active = id;
    this.afterChange();
  }

  setRoom(id: string) {
    if (!this.s.rooms[id]) return;
    this.s.active = id;
    this.afterChange();
  }

  buyUpgrade(id: string) {
    const u = upgradeDef(id);
    const lvl = this.s.upgrades[id] ?? 0;
    if (lvl >= u.max) return;
    const cost = upgradeCost(u, lvl);
    if (this.s.cash < cost) {
      this.toast('Zu wenig Bargeld.');
      return;
    }
    this.s.cash -= cost;
    this.s.upgrades[id] = lvl + 1;
    this.afterChange();
  }

  sell(frac: number) {
    const amt = this.s.coins * frac;
    if (amt < 1e-6) {
      this.toast('Keine BIT zum Verkaufen.');
      return;
    }
    this.s.coins -= amt;
    this.s.cash += amt * this.price;
    this.s.sold += amt;
    this.afterChange();
  }

  /** Manuelles Mining per Klick. */
  click(): number {
    this.s.coins += CLICK_BIT;
    this.s.mined += CLICK_BIT;
    return CLICK_BIT;
  }

  // ---- Persistenz ----

  private fresh(): SaveData {
    return {
      v: 1, cash: 300, coins: 0, sold: 0, mined: 0, bought: 0, playSec: 0,
      inv: {}, rooms: { kid: [null, null] }, upgrades: {}, mission: 0, ach: [],
      overheated: false, savedAt: Date.now(), active: 'kid',
    };
  }

  private load(): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw) as SaveData;
      return d.v === 1 ? d : null;
    } catch {
      return null;
    }
  }

  save() {
    this.s.savedAt = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.s));
    } catch {
      /* Speicher nicht verfügbar */
    }
  }

  reset() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignorieren */
    }
    location.reload();
  }

  /** Ertrag für die Zeit seit dem letzten Speichern (max. 8 h), mit aktuellem Stand berechnet. */
  private applyOffline() {
    const elapsed = Math.min(Math.max(0, (Date.now() - this.s.savedAt) / 1000), OFFLINE_CAP);
    if (elapsed < 30) return;
    const gain = this.s.cash > 0 ? this.bitPerSec * elapsed : 0;
    this.s.coins += gain;
    this.s.mined += gain;
    this.s.cash -= this.powerEurPerSec * elapsed;
    this.offlineGain = gain;
    this.s.savedAt = Date.now();
  }
}

export const game = new Game();
