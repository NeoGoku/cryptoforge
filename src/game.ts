import { ROOMS, COINS, LOANS, DEFAULT_COIN, canMine, roomDef, upgradeDef, upgradeCost, coinDef, techDef, staffDef, staffCost } from './config';
import type { CoinDef, Kind } from './config';
import { PARTS, PREBUILT, CATS, partDef, prebuiltDef, buildStats, machineStats, buildPartList, emptyBuild, cloneBuild } from './hardware';
import type { Machine, MachineStat, Blueprint, Build, PartCat, HwMarket } from './hardware';
import { makeHolders, makeAddr, holderValue, shortAddr } from './world';
import type { Holder } from './world';

export const BASE_TARIFF = 0.32;   // EUR/kWh
export const POWER_SCALE = 5000;   // 1 s Spielzeit = 5000 s Stromverbrauch (macht Strom relevant)
export const CLICK_BIT = 0.01;
export const POOL_FEE = 0.03;
export const SOLO_MULT = 1.12;
export const SOLO_MEAN = 25;       // Sekunden zwischen Blöcken (Ø)
export const STAKE_RATE = 0.0025 / 60; // 0,25 % pro Minute
export const LOAN_RATE = 0.06 / 600;   // 6 % je 10 Minuten
export const INSURE_RATE = 0.00004;    // EUR/s je EUR Gerätewert
const OFFLINE_CAP = 8 * 3600;
const ACH_REWARD = 250;
const SAVE_KEY = 'cryptoforge.save.v1';

export type Slots = (string | null)[];
export type Regime = 'bull' | 'bear' | 'side';
type EventName = 'change' | 'toast' | 'fx';
export type EvId = 'outage' | 'heat' | 'sale';

export interface Stats {
  events: number; outages: number; hacked: number; blocks: number; repairs: number;
  loans: number; repaid: number; powerSpent: number; rentPaid: number; interestPaid: number; clicks: number; salaryPaid: number; bonuses: number; built: number; bargains: number;
}

export interface SaveData {
  v: 3;
  boosts: Record<string, number>; // Bonus-ID → Ende (playSec)
  cash: number;
  wallet: Record<string, number>;
  staked: Record<string, number>;
  soldEur: number;
  minedTotal: number;
  bought: number;
  playSec: number;
  machines: Record<string, Machine>;   // alle Miner; Raum-Slots enthalten deren IDs
  parts: Record<string, number>;       // lose Einzelteile im Lager
  blueprints: Blueprint[];
  draft: Build;                        // aktuelle Konfiguration in der Werkstatt
  mid: number;                         // Zähler für Maschinen-IDs
  addr: string;                        // eigene Wallet-Adresse
  rooms: Record<string, Slots>;
  cond: Record<string, number>;
  roomCoin: Record<string, string>;
  upgrades: Record<string, number>;
  staff: Record<string, number>;
  research: string[];
  researching: { id: string; end: number } | null;
  debt: number;
  insured: boolean;
  mode: 'pool' | 'solo';
  autoSell: { on: boolean; min: number };
  mission: number;
  ach: string[];
  overheated: boolean;
  ev: { id: EvId; until: number; total: number } | null;
  prestige: { points: number; resets: number; lifetime: number };
  streak: { last: string; count: number };
  tutorial: boolean;
  stats: Stats;
  netHistory: number[];
  savedAt: number;
  active: string;
}

export interface RoomStat { idle: number; heat: number; limit: number; throttle: number; power: number; hash: number; cond: number; }

export interface Mission { title: string; desc: string; reward: number; done: (g: Game) => boolean; prog: (g: Game) => [number, number]; }
export interface Achievement { id: string; name: string; desc: string; test: (g: Game) => boolean; }

const mk = (title: string, desc: string, reward: number, done: (g: Game) => boolean, prog: (g: Game) => [number, number]): Mission => ({ title, desc, reward, done, prog });
const min1 = (v: number, t: number): [number, number] => [Math.min(v, t), t];

const maxGpus = (g: Game): number => Object.values(g.s.machines).reduce((a, m) => Math.max(a, m.build?.gpus.length ?? 0), 0);

export const MISSIONS: Mission[] = [
  mk('Erster Miner', 'Baue in der Werkstatt einen PC mit Grafikkarte.', 200, (g) => g.s.stats.built >= 1, (g) => min1(g.s.stats.built, 1)),
  mk('Erster Verkauf', 'Verkaufe Coins im Wert von 20 €.', 300, (g) => g.s.soldEur >= 20, (g) => min1(g.s.soldEur, 20)),
  mk('Kinderzimmer voll', 'Belege alle Slots im Kinderzimmer.', 500, (g) => g.roomFull('kid'), (g) => [(g.s.rooms.kid ?? []).filter(Boolean).length, 2]),
  mk('Kühlung I', 'Kaufe Kühlsystem Stufe 1.', 400, (g) => (g.s.upgrades.cool ?? 0) >= 1, (g) => min1(g.s.upgrades.cool ?? 0, 1)),
  mk('Blaupause', 'Speichere eine Konfiguration als Blueprint.', 300, (g) => g.s.blueprints.length >= 1, (g) => min1(g.s.blueprints.length, 1)),
  mk('Lagerraum beziehen', 'Schalte den Lagerraum frei.', 1000, (g) => !!g.s.rooms.store, (g) => [g.s.rooms.store ? 1 : 0, 1]),
  mk('Rig-Bauer', 'Baue einen offenen Rig mit mindestens 4 Grafikkarten.', 1200, (g) => maxGpus(g) >= 4, (g) => min1(maxGpus(g), 4)),
  mk('Forschung', 'Starte deine erste Forschung.', 600, (g) => g.s.research.length > 0 || !!g.s.researching, (g) => [g.s.research.length > 0 || g.s.researching ? 1 : 0, 1]),
  mk('Zweite Münze', 'Mine BitForge (100+ H/s je Gerät, z. B. ein ASIC).', 800, (g) => (g.rate.BIT ?? 0) > 0, (g) => [(g.rate.BIT ?? 0) > 0 ? 1 : 0, 1]),
  mk('Abgesichert', 'Schließe die Versicherung ab.', 700, (g) => g.s.insured, (g) => [g.s.insured ? 1 : 0, 1]),
  mk('Techniker', 'Stelle einen Techniker ein.', 900, (g) => (g.s.staff.tech ?? 0) >= 1, (g) => min1(g.s.staff.tech ?? 0, 1)),
  mk('Kreditwürdig', 'Nimm einen Kredit auf.', 1000, (g) => g.s.stats.loans >= 1, (g) => min1(g.s.stats.loans, 1)),
  mk('Garage', 'Schalte die Garage frei.', 4000, (g) => !!g.s.rooms.garage, (g) => [g.s.rooms.garage ? 1 : 0, 1]),
  mk('Großrig', 'Baue einen Rig mit 8 Grafikkarten.', 3000, (g) => maxGpus(g) >= 8, (g) => min1(maxGpus(g), 8)),
  mk('Automatisierung', 'Erforsche Auto-Verkauf.', 3000, (g) => g.s.research.includes('auto'), (g) => [g.s.research.includes('auto') ? 1 : 0, 1]),
  mk('Vermögend', 'Erreiche 50.000 € Vermögen.', 10000, (g) => g.netWorth() >= 50000, (g) => min1(Math.max(0, g.netWorth()), 50000)),
  mk('Auf der Liste', 'Erreiche Platz 50 der Rich List im Explorer.', 5000, (g) => g.myRank() <= 50, (g) => [g.myRank() <= 50 ? 1 : 0, 1]),
  mk('Quantensprung', 'Erforsche Quantum-Hardware.', 20000, (g) => g.s.research.includes('quantum'), (g) => [g.s.research.includes('quantum') ? 1 : 0, 1]),
  mk('Neustart', 'Führe einen Prestige-Neustart durch.', 25000, (g) => g.s.prestige.resets >= 1, (g) => [Math.min(g.s.prestige.resets, 1), 1]),
  mk('Kühlung III', 'Kaufe Kühlsystem Stufe 3.', 2500, (g) => (g.s.upgrades.cool ?? 0) >= 3, (g) => min1(g.s.upgrades.cool ?? 0, 3)),
  mk('Fünf Miner', 'Besitze insgesamt 5 Miner.', 1500, (g) => g.totalGadgets() >= 5, (g) => min1(g.totalGadgets(), 5)),
  mk('Stromsparer', 'Erforsche die Effizienz-Firmware.', 2000, (g) => g.has('eff'), (g) => min1(g.has('eff') ? 1 : 0, 1)),
  mk('Staker', 'Stake Coins.', 2500, (g) => Object.values(g.s.staked).some((v) => v > 0), (g) => min1(Object.values(g.s.staked).some((v) => v > 0) ? 1 : 0, 1)),
  mk('Blockfinder', 'Finde 5 Blöcke im Solo-Modus.', 3000, (g) => g.s.stats.blocks >= 5, (g) => min1(g.s.stats.blocks, 5)),
  mk('Zehn Plätze', 'Stelle 10 Miner auf.', 4000, (g) => g.placedCount() >= 10, (g) => min1(g.placedCount(), 10)),
  mk('Garage voll', 'Belege alle Slots der Garage.', 8000, (g) => g.roomFull('garage'), (g) => [(g.s.rooms.garage ?? []).filter(Boolean).length, 6]),
  mk('Hunderttausend', 'Erreiche 100.000 € Vermögen.', 12000, (g) => g.netWorth() >= 100000, (g) => min1(Math.max(0, g.netWorth()), 100000)),
  mk('Industriehalle', 'Schalte die Industriehalle frei.', 20000, (g) => !!g.s.rooms.hall, (g) => [g.s.rooms.hall ? 1 : 0, 1]),
  mk('Quantenzeitalter', 'Besitze einen Quantum Q1.', 30000, (g) => g.owned('qpu') >= 1, (g) => min1(g.owned('qpu'), 1)),
  mk('Fusionskern', 'Erforsche den Fusionskern.', 50000, (g) => g.has('fusion'), (g) => min1(g.has('fusion') ? 1 : 0, 1)),
  mk('Drohnenjäger', 'Fange 3 fliegende Bonus-Drohnen.', 1500, (g) => g.s.stats.bonuses >= 3, (g) => min1(g.s.stats.bonuses, 3)),
  mk('Luxus-Mining', 'Mine Luxar (braucht 500+ H/s je Gerät).', 15000, (g) => (g.rate.LUX ?? 0) > 0, (g) => [(g.rate.LUX ?? 0) > 0 ? 1 : 0, 1]),
  mk('Top 10', 'Erreiche die Top 10 der Rich List.', 50000, (g) => g.myRank() <= 10, (g) => [g.myRank() <= 10 ? 1 : 0, 1]),
  mk('Qubit-Mining', 'Mine Qubit mit einem Quantenrechner.', 40000, (g) => (g.rate.QBT ?? 0) > 0, (g) => [(g.rate.QBT ?? 0) > 0 ? 1 : 0, 1]),
  mk('Sonnenkraft', 'Mine Helion mit einem Fusion Core.', 120000, (g) => (g.rate.HEL ?? 0) > 0, (g) => [(g.rate.HEL ?? 0) > 0 ? 1 : 0, 1]),
];

const ach = (id: string, name: string, desc: string, test: (g: Game) => boolean): Achievement => ({ id, name, desc, test });

export const ACHIEVEMENTS: Achievement[] = [
  ach('first', 'Erster Hash', 'Insgesamt 1 Coin gemined.', (g) => g.s.minedTotal >= 1),
  ach('placed', 'Rig-Besitzer', 'Einen Miner aufgestellt.', (g) => g.placedCount() >= 1),
  ach('kilo', 'Kilohash', '1.000 H/s Gesamtleistung.', (g) => g.hashTotal >= 1000),
  ach('mega', 'Megahash', '10.000 H/s Gesamtleistung.', (g) => g.hashTotal >= 10000),
  ach('sell', 'Händler', 'Coins im Wert von 1.000 € verkauft.', (g) => g.s.soldEur >= 1000),
  ach('heat', 'Hitzewelle', 'Einen Raum überhitzt.', (g) => g.s.overheated),
  ach('cool3', 'Eiskalt', 'Kühlung Stufe 3.', (g) => (g.s.upgrades.cool ?? 0) >= 3),
  ach('rich', 'Fünfstellig', '10.000 € Bargeld.', (g) => g.s.cash >= 10000),
  ach('nw100', 'Sechsstellig', '100.000 € Vermögen.', (g) => g.netWorth() >= 100000),
  ach('million', 'Millionär', '1.000.000 € Vermögen.', (g) => g.netWorth() >= 1e6),
  ach('rooms', 'Immobilienmogul', 'Alle Räume freigeschaltet.', (g) => ROOMS.every((r) => !!g.s.rooms[r.id])),
  ach('insured', 'Vorsichtig', 'Versicherung abgeschlossen.', (g) => g.s.insured),
  ach('blocks', 'Glückspilz', 'Im Solo-Modus einen Block gefunden.', (g) => g.s.stats.blocks >= 1),
  ach('stake', 'Anleger', 'Coins im Staking.', (g) => Object.values(g.s.staked).some((v) => v > 0)),
  ach('loan', 'Schuldner', 'Kredit aufgenommen.', (g) => g.s.stats.loans >= 1),
  ach('debtfree', 'Schuldenfrei', 'Einen Kredit komplett zurückgezahlt.', (g) => g.s.stats.repaid >= 1),
  ach('res3', 'Forscher', '3 Forschungen abgeschlossen.', (g) => g.s.research.length >= 3),
  ach('blackout', 'Blackout', 'Einen Stromausfall erlebt.', (g) => g.s.stats.outages >= 1),
  ach('hacked', 'Gehackt', 'Von Hackern bestohlen.', (g) => g.s.stats.hacked >= 1),
  ach('repair', 'Handwerker', 'Einen Raum repariert.', (g) => g.s.stats.repairs >= 1),
  ach('streak', 'Treue', '3 Tage Login-Serie.', (g) => g.s.streak.count >= 3),
  ach('prestige', 'Wiedergeboren', 'Prestige-Neustart durchgeführt.', (g) => g.s.prestige.resets >= 1),
  ach('catch10', 'Drohnenfänger', '10 Bonus-Drohnen gefangen.', (g) => g.s.stats.bonuses >= 10),
  ach('catch50', 'Himmelsjäger', '50 Bonus-Drohnen gefangen.', (g) => g.s.stats.bonuses >= 50),
  ach('diverse', 'Diversifiziert', '4 verschiedene Coins gleichzeitig im Wallet.', (g) => COINS.filter((c) => (g.s.wallet[c.id] ?? 0) > 1e-9).length >= 4),
  ach('helion', 'Sonnenkönig', 'Helion gemined.', (g) => (g.s.wallet.HEL ?? 0) + (g.s.staked.HEL ?? 0) > 0),
  ach('builder', 'Schrauber', '10 Miner selbst gebaut.', (g) => g.s.stats.built >= 10),
  ach('rig12', 'Monster-Rig', 'Einen Rig mit 12 Grafikkarten gebaut.', (g) => maxGpus(g) >= 12),
  ach('bargain', 'Schnäppchenjäger', 'Hardware unter 85 % des Normalpreises gekauft.', (g) => g.s.stats.bargains >= 1),
  ach('top10', 'Krypto-Elite', 'Top 10 der Rich List.', (g) => g.myRank() <= 10),
  ach('top1', 'Reichste Wallet der Welt', 'Platz 1 der Rich List.', (g) => g.myRank() <= 1),
];

const HW_NEWS: Record<HwMarket, { up: string[]; down: string[] }> = {
  gpu: {
    up: ['Mining-Boom: Grafikkarten ausverkauft', 'Chip-Knappheit bei Kartenherstellern', 'Neues Spiel treibt GPU-Nachfrage', 'Lieferengpass bei Grafikspeicher'],
    down: ['Neue GPU-Generation vorgestellt – Altkarten günstiger', 'Großfarm verkauft gebrauchte Karten', 'Mining-Verbot in Großregion – GPUs fluten den Markt', 'Händler räumen Lager'],
  },
  asic: {
    up: ['ASIC-Hersteller meldet Lieferverzug', 'Mining-Konzerne kaufen ASICs auf', 'Zollerhöhung auf Mining-Hardware'],
    down: ['Neue ASIC-Generation macht alte Modelle billiger', 'ASIC-Überproduktion', 'Pleite einer Mining-Firma: ASICs im Abverkauf'],
  },
  parts: {
    up: ['Speicherpreise steigen', 'Netzteil-Knappheit nach Fabrikbrand', 'Rohstoffpreise treiben Hardwarekosten'],
    down: ['Black-Week-Rabatte auf PC-Teile', 'Überangebot an Mainboards', 'Speicherpreise fallen'],
  },
};
/** Startrechner im Kinderzimmer: alter Büro-PC ohne Grafikkarte. */
const STARTER_PC: Build = { parts: { case: 'case_office', board: 'mb_t1', cpu: 'cpu_c4', ram: 'ram8', ssd: 'ssd128', psu: 'psu450' }, gpus: [] };

const HW_NAMES: Record<HwMarket, string> = { gpu: 'GPU-Preise', asic: 'ASIC-Preise', parts: 'PC-Teile' };

export interface BonusDef { id: string; icon: string; w: number; }
export const BONUSES: BonusDef[] = [
  { id: 'cash', icon: '💶', w: 26 }, { id: 'coins', icon: '🪙', w: 20 }, { id: 'hash', icon: '⚡', w: 18 },
  { id: 'click', icon: '👆', w: 12 }, { id: 'cool', icon: '❄️', w: 10 }, { id: 'repair', icon: '🔧', w: 8 }, { id: 'pump', icon: '🚀', w: 6 },
];
export const BOOST_INFO: Record<string, { name: string; icon: string; total: number }> = {
  hash: { name: 'Turbo ×2 Hash', icon: '⚡', total: 15 },
  click: { name: 'Klick ×10', icon: '👆', total: 20 },
  cool: { name: 'Kältefront −50 % Hitze', icon: '❄️', total: 30 },
};
const NEWS_UP = ['Großinvestor steigt bei {c} ein', 'Börse listet {c} neu', '{c} bekommt Partnerschaft mit Tech-Riesen', 'Influencer feiert {c}'];
const NEWS_DOWN = ['Gerüchte über Sicherheitslücke bei {c}', 'Regulierer prüft {c}', 'Wal verkauft große {c}-Bestände', 'Exchange pausiert {c}-Auszahlungen'];

export const EV_NAMES: Record<string, { name: string; icon: string }> = {
  outage: { name: 'Stromausfall', icon: '🔌' },
  heat: { name: 'Hitzewelle', icon: '🌡️' },
  sale: { name: 'Hardware-Sale −30 %', icon: '🏷️' },
};

const todayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const yesterdayStr = (): string => {
  const d = new Date(Date.now() - 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export class Game {
  s: SaveData;
  prices: Record<string, number> = {};
  history: Record<string, number[]> = {};
  regime: Regime = 'side';
  roomStats: Record<string, RoomStat> = {};
  rate: Record<string, number> = {};   // Coins/s je Münze (brutto)
  hashTotal = 0;
  powerEurPerSec = 0;
  rentPerSec = 0;
  salaryPerSec = 0;
  premiumPerSec = 0;
  interestPerSec = 0;
  incomeEurPerSec = 0;
  offlineGain = 0;
  offlineEur = 0;

  /** Hardware-Preisindex je Markt (1 = Normalpreis). */
  hw: Record<HwMarket, number> = { gpu: 1, asic: 1, parts: 1 };
  hwHistory: Record<HwMarket, number[]> = { gpu: [1], asic: [1], parts: [1] };
  holders: Holder[] = makeHolders();
  private hwNewsTimer = 110;
  private whaleTimer = 140;
  private worldTimer = 0;
  private snapTimer = 0;
  private statCache = new Map<string, MachineStat>();
  private regimeTimer = 90;
  private newsTimer = 75;
  private flyerTimer = 25;
  /** Aktuell fliegende Bonus-Drohne (t = Restzeit, total = Flugdauer). */
  flyer: { kind: string; t: number; total: number } | null = null;
  news: { msg: string; up: boolean; coin: string; at: number }[] = [];
  private historyTimer = 0;
  private checkTimer = 0;
  private saveTimer = 0;
  private netTimer = 0;
  private eventTimer = 90;
  private soloTimer = SOLO_MEAN;
  private listeners: Record<EventName, Array<(msg?: string) => void>> = { change: [], toast: [], fx: [] };

  constructor() {
    this.s = this.load() ?? this.fresh();
    for (const c of COINS) {
      this.prices[c.id] = c.base;
      this.history[c.id] = [c.base];
    }
    this.recalc();
    if (this.remapMission) {
      let i = 0;
      while (i < MISSIONS.length && MISSIONS[i].done(this)) i++;
      this.s.mission = i;
      this.remapMission = false;
    }
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

  fx(name: string) {
    this.emit('fx', name);
  }

  private afterChange() {
    this.statCache.clear();
    this.recalc();
    this.save();
    this.emit('change');
  }

  // ---- Abfragen ----

  difficulty(): number {
    return 1 + (this.s.playSec / 3600) * 0.3;
  }

  prestigeMult(): number {
    return 1 + 0.05 * this.s.prestige.points;
  }

  has(tech: string): boolean {
    return this.s.research.includes(tech);
  }

  unlocked(x: { unlock?: string }): boolean {
    return !x.unlock || this.has(x.unlock);
  }

  coinUnlocked(c: CoinDef): boolean {
    return !c.unlock || this.has(c.unlock);
  }

  running(): boolean {
    return this.s.cash > 0 && this.s.ev?.id !== 'outage';
  }

  evInfo(): { id: EvId; name: string; icon: string; left: number; total: number } | null {
    const e = this.s.ev;
    if (!e) return null;
    return { id: e.id, ...EV_NAMES[e.id], left: Math.max(0, e.until - this.s.playSec), total: e.total };
  }

  private saleF(): number {
    return this.s.ev?.id === 'sale' ? 0.7 : 1;
  }

  /** Aktueller Kaufpreis eines Einzelteils (Hardware-Index, Sale). */
  partPrice(id: string): number {
    const p = partDef(id);
    return Math.max(1, Math.round(p.cost * this.hw[CATS[p.cat].market] * this.saleF()));
  }

  /** Aktueller Kaufpreis eines Fertig-Miners. */
  prePrice(id: string): number {
    return Math.max(1, Math.round(prebuiltDef(id).cost * this.hw.asic * this.saleF()));
  }

  /** Wiederverkaufswert (50 % des aktuellen Marktpreises, ohne Sale). */
  partSellValue(id: string): number {
    const p = partDef(id);
    return Math.round(p.cost * this.hw[CATS[p.cat].market] * 0.5);
  }

  machineValue(m: Machine): number {
    if (m.pre) return prebuiltDef(m.pre).cost * this.hw.asic;
    return buildPartList(m.build ?? emptyBuild()).reduce((a, id) => a + partDef(id).cost * this.hw[CATS[partDef(id).cat].market], 0);
  }

  machineSellValue(m: Machine): number {
    return Math.round(this.machineValue(m) * 0.5);
  }

  /** Werte einer Maschine (gecacht, wird bei jeder Änderung neu berechnet). */
  mstat(id: string): MachineStat {
    let st = this.statCache.get(id);
    if (!st) {
      const m = this.s.machines[id];
      st = m ? machineStats(m) : { name: '?', kind: 'cpu', model: 'tower', hash: 0, watts: 0, heat: 0, color: 0x444444, ledColor: 0x444444, gpus: [], maxGpu: 0 };
      this.statCache.set(id, st);
    }
    return st;
  }

  /** Maschinen, die nicht in einem Raum stehen. */
  unplaced(): Machine[] {
    const placed = new Set<string>();
    for (const r in this.s.rooms) for (const x of this.s.rooms[r]) if (x) placed.add(x);
    return Object.values(this.s.machines).filter((m) => !placed.has(m.id));
  }

  roomOf(id: string): string | null {
    for (const r in this.s.rooms) if (this.s.rooms[r].includes(id)) return r;
    return null;
  }

  partsCount(): number {
    return Object.values(this.s.parts).reduce((a, b) => a + b, 0);
  }

  /** Kosten der fehlenden Teile einer Konfiguration (Lagerteile werden zuerst verwendet). */
  missingCost(b: Build): { cost: number; missing: string[] } {
    const stock = { ...this.s.parts };
    const missing: string[] = [];
    for (const id of buildPartList(b)) {
      if ((stock[id] ?? 0) > 0) stock[id]--;
      else missing.push(id);
    }
    return { cost: missing.reduce((a, id) => a + this.partPrice(id), 0), missing };
  }

  /** Platz in der Rich List (1 = reichste Wallet). */
  myRank(): number {
    const me = this.netWorth();
    return 1 + this.holders.filter((h) => holderValue(h, this.prices) > me).length;
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

  maxGadgets(): number {
    return ROOMS.reduce((a, r) => a + (this.s.rooms[r.id] ? r.spots.length : 0), 0);
  }

  totalGadgets(): number {
    return Object.keys(this.s.machines).length;
  }

  /** Anzahl Fertig-Miner eines Modells. */
  owned(preId: string): number {
    return Object.values(this.s.machines).filter((m) => m.pre === preId).length;
  }

  /** Marktwert aller Miner und losen Teile. */
  gadgetValue(): number {
    const parts = Object.entries(this.s.parts).reduce((a, [id, n]) => a + this.partPrice(id) * n, 0);
    return Object.values(this.s.machines).reduce((a, m) => a + this.machineValue(m), 0) + parts;
  }

  coinValue(): number {
    return COINS.reduce((a, c) => a + ((this.s.wallet[c.id] ?? 0) + (this.s.staked[c.id] ?? 0)) * this.prices[c.id], 0);
  }

  assets(): number {
    return this.s.cash + this.gadgetValue() * 0.6 + this.coinValue();
  }

  netWorth(): number {
    return this.assets() - this.s.debt;
  }

  loanLimit(): number {
    return Math.max(0, 1000 + 0.8 * Math.max(0, this.assets() - this.s.debt) - this.s.debt);
  }

  prestigeTotal(): number {
    return Math.floor(Math.sqrt((this.s.prestige.lifetime + this.s.soldEur) / 5000));
  }

  prestigeGain(): number {
    return this.prestigeTotal() - this.s.prestige.points;
  }

  canPrestige(): boolean {
    return this.netWorth() >= 20000 && this.prestigeGain() >= 1;
  }

  dailyReady(): boolean {
    return this.s.streak.last !== todayStr();
  }

  dailyReward(): number {
    const next = this.s.streak.last === yesterdayStr() ? this.s.streak.count + 1 : 1;
    return Math.round(100 * Math.min(next, 7) * (1 + 0.1 * this.s.prestige.points));
  }

  repairCost(roomId: string): number {
    const slots = this.s.rooms[roomId] ?? [];
    const val = slots.reduce((a, id) => a + (id && this.s.machines[id] ? this.machineValue(this.s.machines[id]) : 0), 0);
    return Math.round(val * 0.004 * (100 - (this.s.cond[roomId] ?? 100)));
  }

  private modeFactor(): number {
    return this.s.mode === 'solo' ? SOLO_MULT : 1 - POOL_FEE;
  }

  /** Kann eine Maschine (ID) bzw. ein Gerät mit diesen Werten den Coin minen? */
  canMine(x: string | { hash: number; kind: Kind }, coinId: string): boolean {
    return canMine(typeof x === 'string' ? this.mstat(x) : x, coinDef(coinId));
  }

  boostOn(id: string): boolean {
    return (this.s.boosts[id] ?? 0) > this.s.playSec;
  }

  boostLeft(id: string): number {
    return Math.max(0, (this.s.boosts[id] ?? 0) - this.s.playSec);
  }

  /** Fliegende Bonus-Drohne fangen. Gibt die Belohnung als Text zurück. */
  catchFlyer(): string {
    const f = this.flyer;
    if (!f) return '';
    this.flyer = null;
    const s = this.s;
    s.stats.bonuses++;
    let msg = '';
    switch (f.kind) {
      case 'cash': {
        const eur = Math.round(Math.max(40, this.incomeEurPerSec * 60, s.cash * 0.02));
        s.cash += eur;
        msg = `+${Math.round(eur).toLocaleString('de-DE')} €`;
        break;
      }
      case 'coins': {
        const c = s.roomCoin[s.active] ?? DEFAULT_COIN;
        const amt = Math.max((this.rate[c] ?? 0) * 120, 30 / this.prices[c]);
        this.credit(c, amt);
        msg = `+${amt < 1 ? amt.toFixed(4) : amt.toFixed(2)} ${c}`;
        break;
      }
      case 'repair':
        for (const r of ROOMS) if (s.rooms[r.id]) s.cond[r.id] = Math.min(100, (s.cond[r.id] ?? 100) + 30);
        msg = 'Alle Räume +30 % Zustand';
        break;
      case 'pump': {
        const list = COINS.filter((c) => this.coinUnlocked(c));
        const c = list[Math.floor(Math.random() * list.length)];
        this.prices[c.id] = Math.min(c.base * 10, this.prices[c.id] * 1.25);
        msg = `${c.name} Kurs +25 %`;
        break;
      }
      default: {
        const b = BOOST_INFO[f.kind];
        s.boosts[f.kind] = Math.max(s.playSec, s.boosts[f.kind] ?? 0) + b.total;
        msg = `${b.name} · ${b.total} s`;
      }
    }
    this.fx('bonus');
    this.afterChange();
    return msg;
  }

  /** Netto-Ertrag (EUR/s) eines Geräts auf einer Münze, bei aktuellem Kurs und Upgrades. */
  netPerSec(g: { hash: number; kind: Kind; watts: number }, coinId: string): number {
    const c = coinDef(coinId);
    const up = this.s.upgrades;
    const oc = 1 + 0.1 * (up.oc ?? 0) + (this.has('chain') ? 0.1 : 0);
    const psu = Math.pow(0.92, up.psu ?? 0) * (this.has('eff') ? 0.9 : 1);
    const tariff = BASE_TARIFF * Math.pow(0.9, up.tariff ?? 0);
    const income = ((g.hash * c.mult[g.kind] * oc * this.prestigeMult() * c.perHash) / this.difficulty()) * this.prices[coinId] * this.modeFactor();
    return income - (g.watts * psu / 1000 / 3600) * tariff * POWER_SCALE;
  }

  /** Hitze, Drosselung, Hashrate, Strom und Coins/s aus dem aktuellen Stand berechnen. */
  recalc() {
    const s = this.s;
    const up = s.upgrades;
    const oc = 1 + 0.1 * (up.oc ?? 0) + (this.has('chain') ? 0.1 : 0);
    const cool = Math.pow(0.85, up.cool ?? 0) * (this.has('immersion') ? 0.8 : 1) * (this.boostOn('cool') ? 0.5 : 1);
    const psu = Math.pow(0.92, up.psu ?? 0) * (this.has('eff') ? 0.9 : 1);
    const tariff = BASE_TARIFF * Math.pow(0.9, up.tariff ?? 0);
    const limitF = s.ev?.id === 'heat' ? 0.75 : 1;
    const pm = this.prestigeMult();
    const diff = this.difficulty();
    this.roomStats = {};
    this.rate = {};
    let hash = 0;
    let watts = 0;
    let rent = 0;
    let overheated = s.overheated;

    for (const r of ROOMS) {
      const slots = s.rooms[r.id];
      if (!slots) continue;
      rent += r.rent;
      const coin = coinDef(s.roomCoin[r.id] ?? DEFAULT_COIN);
      const all = slots.filter((x): x is string => x !== null).map((id) => this.mstat(id));
      const items = all.filter((g) => canMine(g, coin)); // zu schwache Geräte stehen still
      const heat = items.reduce((a, g) => a + g.heat * cool, 0);
      const limit = r.maxHeat * limitF;
      const throttle = heat > limit ? limit / heat : 1;
      if (throttle < 1) overheated = true;
      const cond = s.cond[r.id] ?? 100;
      const eff = (0.5 + 0.5 * cond / 100) * throttle * oc * pm * (this.boostOn('hash') ? 2 : 1);
      let rHash = 0;
      let rCoins = 0;
      let rPower = 0;
      for (const g of items) {
        rHash += g.hash * eff;
        rCoins += (g.hash * coin.mult[g.kind] * eff * coin.perHash) / diff;
        rPower += g.watts * psu;
      }
      this.roomStats[r.id] = { idle: all.length - items.length, heat, limit, throttle, power: rPower, hash: rHash, cond };
      this.rate[coin.id] = (this.rate[coin.id] ?? 0) + rCoins;
      hash += rHash;
      watts += rPower;
    }

    s.overheated = overheated;
    this.hashTotal = hash;
    this.powerEurPerSec = (watts / 1000 / 3600) * tariff * POWER_SCALE;
    this.rentPerSec = rent;
    this.salaryPerSec = (s.staff.tech ?? 0) * staffDef('tech').salary + (s.staff.sec ?? 0) * staffDef('sec').salary;
    this.premiumPerSec = s.insured ? this.gadgetValue() * INSURE_RATE : 0;
    this.interestPerSec = s.debt * LOAN_RATE;
    this.incomeEurPerSec = COINS.reduce((a, c) => a + (this.rate[c.id] ?? 0) * this.prices[c.id], 0) * this.modeFactor();
  }

  /** Laufende Kosten (EUR/s) ohne Zinsen. Bei Stromausfall entfällt der Strom. */
  costPerSec(): number {
    const power = this.s.ev?.id === 'outage' ? 0 : this.powerEurPerSec;
    return power + this.rentPerSec + this.salaryPerSec + this.premiumPerSec;
  }

  /** Netto-Ertrag EUR/s inklusive Zinsen. */
  netEurPerSec(): number {
    return (this.running() ? this.incomeEurPerSec : 0) - this.costPerSec() - this.interestPerSec;
  }

  // ---- Haupt-Schleife ----

  update(dtRaw: number) {
    const dt = Math.min(Math.max(dtRaw, 0), 0.25);
    const s = this.s;
    s.playSec += dt;
    this.recalc();
    this.updateMarket(dt);
    this.updateEvents(dt);
    this.updateFlyer(dt);

    const running = this.running();
    if (running) {
      if (s.mode === 'pool') {
        for (const c in this.rate) this.credit(c, this.rate[c] * dt * (1 - POOL_FEE));
      } else {
        this.soloTimer -= dt;
        if (this.soloTimer <= 0) {
          this.soloTimer = Math.max(3, -Math.log(1 - Math.random()) * SOLO_MEAN);
          let any = false;
          for (const c in this.rate) {
            const amt = this.rate[c] * SOLO_MEAN * SOLO_MULT;
            if (amt > 0) { this.credit(c, amt); any = true; }
          }
          if (any) {
            s.stats.blocks++;
            this.fx('block');
          }
        }
      }
    }

    const power = (this.s.ev?.id === 'outage' ? 0 : this.powerEurPerSec) * dt;
    s.cash -= power + (this.rentPerSec + this.salaryPerSec + this.premiumPerSec) * dt;
    s.stats.powerSpent += power;
    s.stats.rentPaid += this.rentPerSec * dt;
    s.stats.salaryPaid += this.salaryPerSec * dt;

    if (s.debt > 0) {
      const i = s.debt * LOAN_RATE * dt;
      s.debt += i;
      s.stats.interestPaid += i;
    }
    for (const c of COINS) {
      const st = s.staked[c.id] ?? 0;
      if (st > 0) s.staked[c.id] = st + st * STAKE_RATE * dt;
    }

    // Verschleiß
    if (running) {
      const techF = 1 - 0.3 * (s.staff.tech ?? 0);
      for (const r of ROOMS) {
        const st = this.roomStats[r.id];
        if (!st || !s.rooms[r.id].some(Boolean)) continue;
        const ratio = st.heat / st.limit;
        let cond = (s.cond[r.id] ?? 100) - 0.03 * (0.4 + ratio * ratio) * techF * dt;
        if (cond < 60 && (s.staff.tech ?? 0) > 0) cond += 0.4 * (s.staff.tech ?? 0) * dt;
        s.cond[r.id] = Math.min(100, Math.max(0, cond));
      }
    }

    if (s.researching && Date.now() >= s.researching.end) this.finishResearch();

    this.netTimer += dt;
    if (this.netTimer >= 10) {
      this.netTimer = 0;
      s.netHistory.push(Math.round(this.netWorth()));
      if (s.netHistory.length > 180) s.netHistory.shift();
    }

    this.checkTimer += dt;
    if (this.checkTimer >= 1) {
      this.checkTimer = 0;
      this.checkProgress();
      this.autoSell();
    }
    this.saveTimer += dt;
    if (this.saveTimer >= 5) {
      this.saveTimer = 0;
      this.save();
    }
  }

  /** Hardware-Preise: Drift mit dem Kryptomarkt, Rückkehr zum Normalpreis, gelegentliche News. */
  private updateHardware(dt: number) {
    const bull = this.regime === 'bull' ? 1 : this.regime === 'bear' ? -1 : 0;
    const drift: Record<HwMarket, number> = { gpu: 0.0012 * bull, asic: 0.0008 * bull, parts: 0.0003 * bull };
    const vol: Record<HwMarket, number> = { gpu: 0.012, asic: 0.008, parts: 0.006 };
    for (const k of ['gpu', 'asic', 'parts'] as HwMarket[]) {
      let v = this.hw[k] * Math.exp(drift[k] * dt + (Math.random() - 0.5) * vol[k] * Math.sqrt(dt));
      v += (1 - v) * 0.004 * dt;
      this.hw[k] = Math.min(1.8, Math.max(0.55, v));
    }
    this.hwNewsTimer -= dt;
    if (this.hwNewsTimer > 0) return;
    this.hwNewsTimer = 90 + Math.random() * 90;
    const r = Math.random();
    const k: HwMarket = r < 0.5 ? 'gpu' : r < 0.75 ? 'asic' : 'parts';
    const up = Math.random() < 0.5;
    const pct = 8 + Math.random() * 17;
    this.hw[k] = Math.min(1.8, Math.max(0.55, this.hw[k] * (up ? 1 + pct / 100 : 1 - pct / 100)));
    const pool = up ? HW_NEWS[k].up : HW_NEWS[k].down;
    const msg = `${pool[Math.floor(Math.random() * pool.length)]} – ${HW_NAMES[k]} ${up ? '+' : '−'}${Math.round(pct)} %`;
    this.news.unshift({ msg, up, coin: 'HW', at: Date.now() });
    if (this.news.length > 8) this.news.pop();
    this.toast(`Hardware: ${msg}`);
    this.fx(up ? 'news-up' : 'news-down');
    this.emit('change');
  }

  /** Rich List: kleine Käufe/Verkäufe der fiktiven Wallets, gelegentlich Wal-Bewegungen mit Kurswirkung. */
  private updateWorld(dt: number) {
    this.worldTimer += dt;
    if (this.worldTimer >= 4) {
      this.worldTimer = 0;
      for (let i = 0; i < 4; i++) {
        const h = this.holders[Math.floor(Math.random() * this.holders.length)];
        const c = COINS[Math.floor(Math.random() * COINS.length)];
        h.hold[c.id] = Math.max(0, (h.hold[c.id] ?? 0) * (0.93 + Math.random() * 0.16));
        h.txs++;
      }
    }
    this.snapTimer += dt;
    if (this.snapTimer >= 60) {
      this.snapTimer = 0;
      for (const h of this.holders) h.prev = holderValue(h, this.prices);
    }
    this.whaleTimer -= dt;
    if (this.whaleTimer > 0) return;
    this.whaleTimer = 120 + Math.random() * 120;
    const h = this.holders[Math.floor(Math.random() * 20)];
    const list = COINS.filter((c) => this.coinUnlocked(c) && (h.hold[c.id] ?? 0) > 0);
    if (!list.length) return;
    const c = list[Math.floor(Math.random() * list.length)];
    const sell = Math.random() < 0.55;
    const share = 0.15 + Math.random() * 0.3;
    const amt = h.hold[c.id] * share;
    h.hold[c.id] += sell ? -amt : amt;
    const pct = 4 + Math.random() * 8;
    this.prices[c.id] = Math.min(c.base * 10, Math.max(c.base * 0.1, this.prices[c.id] * (sell ? 1 - pct / 100 : 1 + pct / 100)));
    const who = h.kind === 'person' ? h.name : `${h.name} (${shortAddr(h.addr)})`;
    const msg = `Wal-Alarm: ${who} ${sell ? 'verschiebt' : 'kauft'} ${Math.round(amt).toLocaleString('de-DE')} ${c.id}${sell ? ' zur Börse' : ''} – ${c.id} ${sell ? '−' : '+'}${Math.round(pct)} %`;
    this.news.unshift({ msg, up: !sell, coin: c.id, at: Date.now() });
    if (this.news.length > 8) this.news.pop();
    this.toast(`Börse: ${msg}`);
    this.fx(sell ? 'news-down' : 'news-up');
  }

  private updateFlyer(dt: number) {
    if (this.flyer) {
      this.flyer.t -= dt;
      if (this.flyer.t <= 0) this.flyer = null;
      return;
    }
    this.flyerTimer -= dt;
    if (this.flyerTimer > 0) return;
    this.flyerTimer = 45 + Math.random() * 75;
    let r = Math.random() * BONUSES.reduce((a, b) => a + b.w, 0);
    let kind = BONUSES[0].id;
    for (const b of BONUSES) { r -= b.w; if (r <= 0) { kind = b.id; break; } }
    if (kind === 'repair' && ROOMS.every((x) => (this.s.cond[x.id] ?? 100) >= 95)) kind = 'cash';
    this.flyer = { kind, t: 10, total: 10 };
  }

  private credit(coin: string, amt: number) {
    if (amt <= 0) return;
    this.s.wallet[coin] = (this.s.wallet[coin] ?? 0) + amt;
    this.s.minedTotal += amt;
  }

  private updateMarket(dt: number) {
    this.regimeTimer -= dt;
    if (this.regimeTimer <= 0) {
      const r = Math.random();
      this.regime = r < 0.4 ? 'bull' : r < 0.7 ? 'side' : 'bear';
      this.regimeTimer = 60 + Math.random() * 90;
    }
    this.newsTimer -= dt;
    if (this.newsTimer <= 0) {
      this.newsTimer = 60 + Math.random() * 70;
      const list = COINS.filter((c) => this.coinUnlocked(c));
      const c = list[Math.floor(Math.random() * list.length)];
      const up = Math.random() < 0.5;
      const pct = 10 + Math.random() * 20 * (c.id === 'NOVA' ? 2 : 1);
      this.prices[c.id] = Math.min(c.base * 10, Math.max(c.base * 0.1, this.prices[c.id] * (up ? 1 + pct / 100 : 1 - pct / 100)));
      const pool = up ? NEWS_UP : NEWS_DOWN;
      const msg = `${pool[Math.floor(Math.random() * pool.length)].replace('{c}', c.name)} – ${up ? '+' : '−'}${Math.round(pct)} %`;
      this.news.unshift({ msg, up, coin: c.id, at: Date.now() });
      if (this.news.length > 8) this.news.pop();
      this.toast(`Börse: ${msg}`);
      this.fx(up ? 'news-up' : 'news-down');
    }
    for (const c of COINS) {
      const k = c.id === 'NOVA' ? 2 : 1;
      const drift = (this.regime === 'bull' ? 0.006 : this.regime === 'bear' ? -0.006 : 0) * k;
      const noise = (Math.random() - 0.5) * c.vol * Math.sqrt(dt);
      let p = this.prices[c.id] * Math.exp(drift * dt + noise);
      p += (c.base - p) * c.revert * dt;
      this.prices[c.id] = Math.min(c.base * 10, Math.max(c.base * 0.1, p));
    }
    this.updateHardware(dt);
    this.updateWorld(dt);
    this.historyTimer += dt;
    if (this.historyTimer >= 1) {
      this.historyTimer = 0;
      for (const k of ['gpu', 'asic', 'parts'] as HwMarket[]) {
        const h = this.hwHistory[k];
        h.push(this.hw[k]);
        if (h.length > 90) h.shift();
      }
      for (const c of COINS) {
        const h = this.history[c.id];
        h.push(this.prices[c.id]);
        if (h.length > 90) h.shift();
      }
    }
  }

  // ---- Events ----

  private updateEvents(dt: number) {
    const s = this.s;
    if (s.ev && s.playSec >= s.ev.until) {
      const id = s.ev.id;
      s.ev = null;
      this.toast(`Vorbei: ${EV_NAMES[id].name}`);
      this.fx(`end-${id}`);
      this.afterChange();
    }
    this.eventTimer -= dt;
    if (this.eventTimer > 0) return;
    this.eventTimer = 70 + Math.random() * 80;
    if (s.ev || s.playSec < 240 || this.placedCount() === 0) return;
    this.triggerEvent();
  }

  triggerEvent(forced?: string) {
    const s = this.s;
    const table: [string, number][] = [['outage', 16], ['crash', 12], ['boom', 12], ['sale', 14], ['heat', 12], ['hack', 12], ['fail', 12]];
    let id = forced;
    if (!id) {
      let r = Math.random() * table.reduce((a, b) => a + b[1], 0);
      id = table[0][0];
      for (const [k, w] of table) { r -= w; if (r <= 0) { id = k; break; } }
    }
    s.stats.events++;
    const up = s.upgrades;
    switch (id) {
      case 'outage': {
        const dur = (25 + Math.random() * 20) * Math.pow(0.7, up.bat ?? 0);
        s.ev = { id: 'outage', until: s.playSec + dur, total: dur };
        s.stats.outages++;
        this.toast(`Stromausfall! Mining pausiert ${Math.round(dur)} s.`);
        break;
      }
      case 'heat':
        s.ev = { id: 'heat', until: s.playSec + 60, total: 60 };
        this.toast('Hitzewelle: Hitzelimit −25 % für 60 s.');
        break;
      case 'sale':
        s.ev = { id: 'sale', until: s.playSec + 90, total: 90 };
        this.toast('Hardware-Sale: alle Teile und Miner −30 % für 90 s!');
        break;
      case 'crash':
        for (const c of COINS) this.prices[c.id] = Math.max(c.base * 0.1, this.prices[c.id] * 0.6);
        this.regime = 'bear';
        this.regimeTimer = 90;
        this.toast('Marktcrash! Alle Kurse −40 %.');
        break;
      case 'boom':
        for (const c of COINS) this.prices[c.id] = Math.min(c.base * 10, this.prices[c.id] * 1.35);
        this.regime = 'bull';
        this.regimeTimer = 90;
        this.toast('Bullrun! Alle Kurse +35 %.');
        break;
      case 'hack': {
        const chance = 0.6 * Math.pow(0.65, up.fw ?? 0) * Math.pow(0.5, s.staff.sec ?? 0);
        const hasCoins = COINS.some((c) => (s.wallet[c.id] ?? 0) * this.prices[c.id] > 1);
        if (!hasCoins || Math.random() > chance) {
          this.toast('Hack-Angriff abgewehrt!');
          break;
        }
        let value = 0;
        for (const c of COINS) {
          const stolen = (s.wallet[c.id] ?? 0) * 0.2;
          s.wallet[c.id] = (s.wallet[c.id] ?? 0) - stolen;
          value += stolen * this.prices[c.id];
        }
        s.stats.hacked++;
        if (s.insured) {
          s.cash += value * 0.7;
          this.toast(`Hack! ${Math.round(value)} € gestohlen, Versicherung erstattet 70 %.`);
        } else {
          this.toast(`Hack! 20 % deiner Coins gestohlen (${Math.round(value)} €).`);
        }
        break;
      }
      case 'fail': {
        const rooms = ROOMS.filter((r) => s.rooms[r.id]?.some(Boolean));
        if (!rooms.length) break;
        const r = rooms[Math.floor(Math.random() * rooms.length)];
        if (s.insured) {
          this.toast(`Defekt im ${r.name} – Versicherung übernimmt.`);
        } else {
          s.cond[r.id] = Math.max(0, (s.cond[r.id] ?? 100) - 25);
          this.toast(`Defekt im ${r.name}: Zustand −25 %.`);
        }
        break;
      }
    }
    this.fx(id);
    this.afterChange();
  }

  // ---- Fortschritt ----

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

  private autoSell() {
    const a = this.s.autoSell;
    if (!a.on || !this.has('auto')) return;
    const total = COINS.reduce((x, c) => x + (this.s.wallet[c.id] ?? 0) * this.prices[c.id], 0);
    if (total >= a.min) {
      this.sellAll(1, true);
    }
  }

  // ---- Aktionen ----

  private hasSpace(): boolean {
    if (this.totalGadgets() >= this.maxGadgets()) {
      this.toast('Keine freien Plätze – erweitere einen Raum oder verkaufe einen Miner.');
      return false;
    }
    return true;
  }

  private newMachine(m: Omit<Machine, 'id'>): Machine {
    const id = `m${this.s.mid++}`;
    const mm = { ...m, id };
    this.s.machines[id] = mm;
    this.s.bought++;
    return mm;
  }

  /** Neue Maschine in den aktiven Raum stellen, falls dort ein Slot frei ist. */
  private autoPlace(id: string) {
    const slots = this.s.rooms[this.s.active];
    const idx = slots ? slots.indexOf(null) : -1;
    if (idx >= 0) slots[idx] = id;
  }

  private addPart(id: string, n: number) {
    const v = (this.s.parts[id] ?? 0) + n;
    if (v <= 0) delete this.s.parts[id];
    else this.s.parts[id] = v;
  }

  private noteBargain(market: HwMarket) {
    if (this.hw[market] < 0.85) this.s.stats.bargains++;
  }

  buyPart(id: string) {
    const p = partDef(id);
    if (!this.unlocked(p)) { this.toast('Noch nicht erforscht.'); return; }
    const cost = this.partPrice(id);
    if (this.s.cash < cost) { this.toast('Zu wenig Bargeld.'); return; }
    this.s.cash -= cost;
    this.addPart(id, 1);
    this.noteBargain(CATS[p.cat].market);
    this.afterChange();
  }

  sellPart(id: string) {
    if ((this.s.parts[id] ?? 0) < 1) { this.toast('Kein Teil im Lager.'); return; }
    this.s.cash += this.partSellValue(id);
    this.addPart(id, -1);
    this.afterChange();
  }

  buyPrebuilt(id: string) {
    const p = prebuiltDef(id);
    if (!this.unlocked(p)) { this.toast('Noch nicht erforscht.'); return; }
    if (!this.hasSpace()) return;
    const cost = this.prePrice(id);
    if (this.s.cash < cost) { this.toast('Zu wenig Bargeld.'); return; }
    this.s.cash -= cost;
    this.noteBargain('asic');
    const m = this.newMachine({ name: `${p.brand} ${p.name}`, pre: id });
    this.autoPlace(m.id);
    this.afterChange();
  }

  /** Miner verkaufen (nur aus dem Lager, nicht aufgestellt). */
  sellMachine(id: string) {
    const m = this.s.machines[id];
    if (!m) return;
    if (this.roomOf(id)) { this.toast('Kein Verkauf möglich: Miner steht noch im Raum.'); return; }
    this.s.cash += this.machineSellValue(m);
    delete this.s.machines[id];
    this.afterChange();
  }

  /** Selbstgebauten Miner zerlegen: alle Teile zurück ins Lager. */
  dismantle(id: string, toDraft = false) {
    const m = this.s.machines[id];
    if (!m?.build) return;
    const r = this.roomOf(id);
    if (r) this.s.rooms[r] = this.s.rooms[r].map((x) => (x === id ? null : x));
    for (const p of buildPartList(m.build)) this.addPart(p, 1);
    if (toDraft) this.s.draft = cloneBuild(m.build);
    delete this.s.machines[id];
    this.afterChange();
  }

  // ---- Werkstatt ----

  setDraftPart(cat: PartCat, id: string) {
    const d = this.s.draft;
    if (d.parts[cat] === id && !CATS[cat].req) delete d.parts[cat];
    else d.parts[cat] = id;
    this.afterChange();
  }

  clearDraftPart(cat: PartCat) {
    delete this.s.draft.parts[cat];
    this.afterChange();
  }

  addDraftGpu(id: string) {
    const st = buildStats(this.s.draft);
    if (st.maxGpu && this.s.draft.gpus.length >= st.maxGpu) { this.toast(`Kein PCIe-Slot frei (max. ${st.maxGpu}).`); return; }
    if (!this.s.draft.parts.case || !this.s.draft.parts.board) { this.toast('Kein Gehäuse oder Mainboard gewählt.'); return; }
    this.s.draft.gpus.push(id);
    this.afterChange();
  }

  removeDraftGpu(idx: number) {
    this.s.draft.gpus.splice(idx, 1);
    this.afterChange();
  }

  /** Grafikkarten der Konfiguration bis zum Maximum mit diesem Modell auffüllen. */
  fillDraftGpu(id: string) {
    const st = buildStats(this.s.draft);
    while (this.s.draft.gpus.length < st.maxGpu) this.s.draft.gpus.push(id);
    this.afterChange();
  }

  clearDraft() {
    this.s.draft = emptyBuild();
    this.afterChange();
  }

  /** Konfiguration zusammenbauen: Lagerteile verwenden, fehlende Teile automatisch kaufen. */
  buildDraft(name?: string): boolean {
    const b = this.s.draft;
    const st = buildStats(b);
    if (st.problems.length) { this.toast(`Kein Zusammenbau möglich: ${st.problems[0]}.`); return false; }
    for (const id of buildPartList(b)) if (!this.unlocked(partDef(id))) { this.toast('Noch nicht erforscht.'); return false; }
    if (!this.hasSpace()) return false;
    const { cost, missing } = this.missingCost(b);
    if (this.s.cash < cost) { this.toast(`Zu wenig Bargeld: fehlende Teile kosten ${Math.round(cost).toLocaleString('de-DE')} €.`); return false; }
    this.s.cash -= cost;
    for (const id of missing) this.addPart(id, 1);
    if (missing.some((id) => partDef(id).cat === 'gpu')) this.noteBargain('gpu');
    for (const id of buildPartList(b)) this.addPart(id, -1);
    const m = this.newMachine({ name: name?.trim() || st.name, build: cloneBuild(b) });
    this.s.stats.built++;
    this.autoPlace(m.id);
    this.toast(`Zusammengebaut: ${m.name}`);
    this.fx('repair');
    this.afterChange();
    return true;
  }

  saveBlueprint(name: string) {
    const st = buildStats(this.s.draft);
    if (st.problems.length) { this.toast(`Kein gültiger Blueprint: ${st.problems[0]}.`); return; }
    if (this.s.blueprints.length >= 12) { this.toast('Kein Platz: maximal 12 Blueprints.'); return; }
    this.s.blueprints.push({ id: `b${Date.now().toString(36)}`, name: name.trim() || st.name, build: cloneBuild(this.s.draft) });
    this.toast('Blueprint gespeichert.');
    this.afterChange();
  }

  loadBlueprint(id: string) {
    const bp = this.s.blueprints.find((x) => x.id === id);
    if (!bp) return;
    this.s.draft = cloneBuild(bp.build);
    this.afterChange();
  }

  buildBlueprint(id: string) {
    const bp = this.s.blueprints.find((x) => x.id === id);
    if (!bp) return;
    const keep = this.s.draft;
    this.s.draft = cloneBuild(bp.build);
    const ok = this.buildDraft(bp.name);
    this.s.draft = keep;
    if (!ok) this.afterChange();
  }

  deleteBlueprint(id: string) {
    this.s.blueprints = this.s.blueprints.filter((x) => x.id !== id);
    this.afterChange();
  }

  /** Konfiguration einer bestehenden Maschine als Blueprint übernehmen. */
  blueprintFrom(id: string) {
    const m = this.s.machines[id];
    if (!m?.build) return;
    const keep = this.s.draft;
    this.s.draft = cloneBuild(m.build);
    this.saveBlueprint(m.name);
    this.s.draft = keep;
    this.afterChange();
  }

  // ---- Aufstellen ----

  private bestUnplaced(): string | null {
    const list = this.unplaced().sort((a, b) => this.mstat(b.id).hash - this.mstat(a.id).hash);
    return list[0]?.id ?? null;
  }

  placeItem(id?: string) {
    const slots = this.s.rooms[this.s.active];
    if (!slots) return;
    const idx = slots.indexOf(null);
    if (idx < 0) {
      this.toast('Raum ist voll.');
      return;
    }
    const mid = id ?? this.bestUnplaced();
    if (!mid || this.roomOf(mid)) {
      this.toast('Kein Miner im Lager.');
      return;
    }
    slots[idx] = mid;
    this.afterChange();
  }

  /** Miner aus dem Raum ins Lager nehmen. */
  unplace(id: string) {
    const r = this.roomOf(id);
    if (!r) return;
    this.s.rooms[r] = this.s.rooms[r].map((x) => (x === id ? null : x));
    this.afterChange();
  }

  toggleSlot(idx: number) {
    const slots = this.s.rooms[this.s.active];
    if (!slots) return;
    if (slots[idx]) {
      slots[idx] = null;
      this.afterChange();
      return;
    }
    const id = this.bestUnplaced();
    if (!id) {
      this.toast('Kein Miner im Lager. Baue einen in der Werkstatt.');
      return;
    }
    slots[idx] = id;
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
    this.s.cond[id] = 100;
    this.s.active = id;
    this.afterChange();
  }

  setRoom(id: string) {
    if (!this.s.rooms[id]) return;
    this.s.active = id;
    this.afterChange();
  }

  setRoomCoin(roomId: string, coinId: string) {
    const c = coinDef(coinId);
    if (!this.s.rooms[roomId] || !this.coinUnlocked(c)) return;
    this.s.roomCoin[roomId] = coinId;
    const items = (this.s.rooms[roomId] ?? []).filter((x): x is string => !!x).map((id) => this.mstat(id));
    const weak = items.filter((g) => !canMine(g, c)).length;
    if (weak) this.toast(`Achtung: ${weak} Gerät(e) schaffen ${c.id} nicht (min. ${c.minHash} H/s) und stehen still.`);
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

  hire(id: string) {
    const d = staffDef(id);
    const lvl = this.s.staff[id] ?? 0;
    if (lvl >= d.max) return;
    const cost = staffCost(d, lvl);
    if (this.s.cash < cost) {
      this.toast('Zu wenig Bargeld.');
      return;
    }
    this.s.cash -= cost;
    this.s.staff[id] = lvl + 1;
    this.afterChange();
  }

  startResearch(id: string) {
    const t = techDef(id);
    if (this.s.researching || this.has(id) || (t.req && !this.has(t.req))) return;
    if (this.s.cash < t.cost) {
      this.toast('Zu wenig Bargeld.');
      return;
    }
    this.s.cash -= t.cost;
    this.s.researching = { id, end: Date.now() + t.secs * 1000 };
    this.afterChange();
  }

  private finishResearch() {
    const r = this.s.researching;
    if (!r) return;
    this.s.research.push(r.id);
    this.s.researching = null;
    this.toast(`Forschung abgeschlossen: ${techDef(r.id).name}`);
    this.fx('research');
    this.afterChange();
  }

  takeLoan(amount: number) {
    if (!LOANS.includes(amount)) return;
    if (amount > this.loanLimit()) {
      this.toast('Kreditlimit überschritten.');
      return;
    }
    this.s.cash += amount;
    this.s.debt += amount;
    this.s.stats.loans++;
    this.fx('loan');
    this.afterChange();
  }

  repay(frac: number) {
    const s = this.s;
    const amt = Math.min(s.debt * frac, Math.max(0, s.cash));
    if (amt < 0.01) {
      this.toast(s.debt <= 0 ? 'Keine Schulden.' : 'Zu wenig Bargeld.');
      return;
    }
    s.cash -= amt;
    s.debt -= amt;
    if (s.debt < 0.01) {
      s.debt = 0;
      s.stats.repaid++;
    }
    this.afterChange();
  }

  toggleInsurance() {
    this.s.insured = !this.s.insured;
    this.afterChange();
  }

  setMode(m: 'pool' | 'solo') {
    this.s.mode = m;
    this.soloTimer = SOLO_MEAN;
    this.afterChange();
  }

  setAutoSell(on: boolean, min: number) {
    this.s.autoSell = { on, min };
    this.afterChange();
  }

  sell(coin: string, frac: number, silent = false): number {
    const amt = (this.s.wallet[coin] ?? 0) * frac;
    if (amt < 1e-9) return 0;
    const eur = amt * this.prices[coin];
    this.s.wallet[coin] -= amt;
    this.s.cash += eur;
    this.s.soldEur += eur;
    if (!silent) this.afterChange();
    return eur;
  }

  sellAll(frac: number, silent = false): number {
    let eur = 0;
    for (const c of COINS) eur += this.sell(c.id, frac, true);
    if (eur < 1e-9) {
      if (!silent) this.toast('Keine Coins zum Verkaufen.');
      return 0;
    }
    if (silent) this.fx('autosell');
    this.afterChange();
    return eur;
  }

  stake(coin: string, frac: number) {
    const amt = (this.s.wallet[coin] ?? 0) * frac;
    if (amt < 1e-9) {
      this.toast('Keine Coins zum Staken.');
      return;
    }
    this.s.wallet[coin] -= amt;
    this.s.staked[coin] = (this.s.staked[coin] ?? 0) + amt;
    this.afterChange();
  }

  unstake(coin: string, frac: number) {
    const amt = (this.s.staked[coin] ?? 0) * frac;
    if (amt < 1e-9) return;
    this.s.staked[coin] -= amt;
    this.s.wallet[coin] = (this.s.wallet[coin] ?? 0) + amt;
    this.afterChange();
  }

  repairRoom(id: string) {
    const cost = this.repairCost(id);
    if (cost <= 0) return;
    if (this.s.cash < cost) {
      this.toast('Zu wenig Bargeld.');
      return;
    }
    this.s.cash -= cost;
    this.s.cond[id] = 100;
    this.s.stats.repairs++;
    this.fx('repair');
    this.afterChange();
  }

  claimDaily() {
    if (!this.dailyReady()) return;
    const reward = this.dailyReward();
    this.s.streak = { last: todayStr(), count: this.s.streak.last === yesterdayStr() ? this.s.streak.count + 1 : 1 };
    this.s.cash += reward;
    this.toast(`Tagesbonus: +${reward} € (Serie ${this.s.streak.count})`);
    this.fx('win');
    this.afterChange();
  }

  doPrestige() {
    if (!this.canPrestige()) return;
    const total = this.prestigeTotal();
    const keep = {
      ach: this.s.ach,
      prestige: { points: total, resets: this.s.prestige.resets + 1, lifetime: this.s.prestige.lifetime + this.s.soldEur },
      streak: this.s.streak,
      tutorial: true,
      mission: this.s.mission,
      blueprints: this.s.blueprints,
      addr: this.s.addr,
    };
    this.s = { ...this.fresh(), ...keep };
    this.fx('prestige');
    this.afterChange();
  }

  /** Manuelles Mining per Klick (BitForge). */
  click(): number {
    const gain = CLICK_BIT * this.prestigeMult() * (this.boostOn('click') ? 10 : 1);
    this.credit('BIT', gain);
    this.s.stats.clicks++;
    return gain;
  }

  // ---- Persistenz ----

  private fresh(): SaveData {
    const starter: Machine = { id: 'm1', name: 'Alter Familien-PC', build: cloneBuild(STARTER_PC) };
    return {
      v: 3, boosts: {}, cash: 350, wallet: {}, staked: {}, soldEur: 0, minedTotal: 0, bought: 0, playSec: 0,
      machines: { m1: starter }, parts: {}, blueprints: [], draft: emptyBuild(), mid: 2, addr: makeAddr(),
      rooms: { kid: ['m1', null] }, cond: { kid: 100 }, roomCoin: { kid: 'MON' }, upgrades: {}, staff: {},
      research: [], researching: null, debt: 0, insured: false, mode: 'pool', autoSell: { on: false, min: 100 },
      mission: 0, ach: [], overheated: false, ev: null, prestige: { points: 0, resets: 0, lifetime: 0 },
      streak: { last: '', count: 0 }, tutorial: false,
      stats: { events: 0, outages: 0, hacked: 0, blocks: 0, repairs: 0, loans: 0, repaid: 0, powerSpent: 0, rentPaid: 0, interestPaid: 0, clicks: 0, salaryPaid: 0, bonuses: 0, built: 0, bargains: 0 },
      netHistory: [], savedAt: Date.now(), active: 'kid',
    };
  }

  private load(): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return this.migrate(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  /** Nach einer Migration von v1/v2: Missionsindex neu bestimmen (ohne erneute Belohnung). */
  private remapMission = false;

  private migrate(d: Record<string, unknown>): SaveData | null {
    if (!d || typeof d !== 'object') return null;
    const base = this.fresh();
    let src = d as Record<string, unknown>;
    if (src.v === 1) {
      const o = src as unknown as { cash: number; coins: number; sold: number; mined: number; bought: number; playSec: number; inv: Record<string, number>; rooms: Record<string, Slots>; upgrades: Record<string, number>; ach: string[]; overheated: boolean; savedAt: number; active: string };
      src = {
        cash: o.cash, wallet: { BIT: o.coins }, soldEur: o.sold * 40, minedTotal: o.mined, bought: o.bought, playSec: o.playSec,
        inv: o.inv, rooms: o.rooms, cond: Object.fromEntries(Object.keys(o.rooms).map((k) => [k, 100])), upgrades: o.upgrades,
        ach: o.ach, overheated: o.overheated, savedAt: o.savedAt, active: o.active, tutorial: true, v: 2,
      };
    }
    if (src.v === 2) {
      // Alte Gadgets in Maschinen umwandeln
      const machines: Record<string, Machine> = {};
      let mid = 1;
      const make = (old: string): string | null => {
        const id = `m${mid++}`;
        if (old === 'gpu') machines[id] = { id, name: 'GPU-PC (Altbestand)', build: { parts: { ...STARTER_PC.parts }, gpus: ['g_k340'] } };
        else if (PREBUILT.some((p) => p.id === old)) { const p = prebuiltDef(old); machines[id] = { id, name: `${p.brand} ${p.name}`, pre: old }; }
        else return null;
        return id;
      };
      const rooms = (src.rooms ?? {}) as Record<string, Slots>;
      const newRooms: Record<string, Slots> = {};
      for (const r in rooms) newRooms[r] = rooms[r].map((x) => (x ? make(x) : null));
      for (const [old, n] of Object.entries((src.inv ?? {}) as Record<string, number>)) for (let i = 0; i < n; i++) make(old);
      src = { ...src, v: 3, machines, rooms: newRooms, mid, parts: {}, blueprints: [], draft: emptyBuild(), addr: makeAddr() };
      delete src.inv;
      this.remapMission = true;
    }
    if (src.v !== 3) return null;
    const m = { ...base, ...(src as unknown as SaveData) };
    m.stats = { ...base.stats, ...m.stats };
    m.prestige = { ...base.prestige, ...m.prestige };
    m.autoSell = { ...base.autoSell, ...m.autoSell };
    m.draft = { parts: { ...(m.draft?.parts ?? {}) }, gpus: [...(m.draft?.gpus ?? [])] };
    // Unbekannte Teile (z. B. aus älteren Versionen) entfernen
    const known = (id: string) => PARTS.some((p) => p.id === id);
    for (const id of Object.keys(m.parts)) if (!known(id)) delete m.parts[id];
    for (const r of ROOMS) {
      const slots = m.rooms[r.id];
      if (slots && slots.length !== r.spots.length) m.rooms[r.id] = Array.from({ length: r.spots.length }, (_, i) => slots[i] ?? null);
      if (slots) m.rooms[r.id] = m.rooms[r.id].map((x) => (x && m.machines[x] ? x : null));
    }
    // Coin-Mindesthashrate: Räume, deren Geräte den gewählten Coin nicht schaffen, auf einen passenden Coin umstellen
    for (const r of ROOMS) {
      const items = (m.rooms[r.id] ?? []).filter((x): x is string => !!x).map((id) => machineStats(m.machines[id]));
      const c = coinDef(m.roomCoin[r.id] ?? DEFAULT_COIN);
      if (items.length && !items.some((g) => canMine(g, c))) {
        const fit = [DEFAULT_COIN, 'MON', 'BIT'].find((id) => items.some((g) => canMine(g, coinDef(id))));
        m.roomCoin[r.id] = fit ?? DEFAULT_COIN;
      }
    }
    if (!m.rooms[m.active]) m.active = 'kid';
    m.ev = null;
    return m;
  }

  /** true während Reset/Import: verhindert, dass beforeunload den alten Stand zurückschreibt. */
  private noSave = false;

  save() {
    if (this.noSave) return;
    this.s.savedAt = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.s));
    } catch {
      /* Speicher nicht verfügbar */
    }
  }

  exportSave(): string {
    this.save();
    return btoa(JSON.stringify(this.s));
  }

  importSave(code: string): boolean {
    try {
      const d = JSON.parse(atob(code.trim()));
      if (!this.migrate(d)) return false;
      this.noSave = true;
      localStorage.setItem(SAVE_KEY, JSON.stringify(d));
      location.reload();
      return true;
    } catch {
      return false;
    }
  }

  reset() {
    this.noSave = true;
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignorieren */
    }
    location.reload();
  }

  /** Ertrag für die Zeit seit dem letzten Speichern (max. 8 h, Zinsen max. 30 min). */
  private applyOffline() {
    const s = this.s;
    const elapsed = Math.min(Math.max(0, (Date.now() - s.savedAt) / 1000), OFFLINE_CAP);
    if (elapsed < 30) return;
    this.offlineEur = 0;
    if (s.cash > 0) {
      for (const c in this.rate) {
        const gain = this.rate[c] * elapsed * this.modeFactor();
        this.credit(c, gain);
        this.offlineGain += gain;
        this.offlineEur += gain * this.prices[c];
      }
    }
    s.cash -= this.costPerSec() * elapsed;
    s.debt += s.debt * LOAN_RATE * Math.min(elapsed, 1800);
    s.savedAt = Date.now();
  }
}

export const game = new Game();
