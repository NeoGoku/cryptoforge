/** Hashvault management mechanics adapted to CryptoForge's rooms, currencies and game clock. */
export const DAY_SECONDS = 300;
export const ORDER_LIMIT = 8;
export const ORDER_SLOTS_PER_CHIP = 2;
export const CHIP_LIMIT = 1_000_000;

export const PROVIDERS = {
  local: { name: 'Stadtwerke', price: 1, capacity: 1, cost: 0 },
  green: { name: 'GreenGrid', price: 0.82, capacity: 0.85, cost: 450 },
  industry: { name: 'IndustrieNetz', price: 1.12, capacity: 1.35, cost: 950 },
} as const;

export const LAYOUTS = {
  standard: { name: 'Standard', cooling: 1, power: 1, hash: 1 },
  airflow: { name: 'Kaltgang', cooling: 0.78, power: 1.04, hash: 1 },
  density: { name: 'Hochdichte', cooling: 1.18, power: 1, hash: 1.12 },
} as const;

export const CREW = {
  hash: { name: 'Performance', cost: 350, wage: 0.035, info: 'Hashrate erhöhen' },
  cool: { name: 'Wartung', cost: 450, wage: 0.04, info: 'Hitze und Verschleiß senken' },
  power: { name: 'Netzbetrieb', cost: 600, wage: 0.05, info: 'Stromverbrauch senken' },
} as const;

export const MODS = {
  saver: { name: 'Power Saver', description: 'Stromverbrauch −18 %', cost: 500, rigs: 1, grid: 0, research: 0 },
  turbo: { name: 'Turbo-Fan', description: 'Hash +15 %, Hitze +12 %', cost: 900, rigs: 2, grid: 0, research: 0 },
  liquid: { name: 'Flüssigkühlung', description: 'Hitze −30 %, Hash +8 %', cost: 1600, rigs: 2, grid: 1, research: 1 },
  booster: { name: 'Hash-Booster-Chip', description: 'Hash +25 %, Strom +10 %', cost: 2200, rigs: 3, grid: 1, research: 2 },
  stability: { name: 'Stabilitäts-Controller', description: 'Verschleiß −50 %', cost: 1200, rigs: 2, grid: 1, research: 0 },
  dual: { name: 'Multi-Task-Kernel', description: 'Verteilt 30 % Hashrate auf einen zweiten Coin', cost: 5000, rigs: 4, grid: 2, research: 2 },
} as const;

export const SITE_SHOP = {
  ducts: { name: 'Luftführung', description: 'Hitze −12 % im Raum', cost: 550 },
  breakers: { name: 'Industrieverteiler', description: 'Stromverbrauch −8 % im Raum', cost: 800 },
  bench: { name: 'Wartungsstation', description: 'Verschleiß −20 % im Raum', cost: 1200 },
  controller: { name: 'Laststeuerung', description: 'Hashrate +8 % im Raum', cost: 1800 },
  plant: { name: 'Topfpflanze', description: 'Angenehme Arbeitsatmosphäre · Hashrate +0,35 %', cost: 420 },
  lighting: { name: 'Indirekte LED-Beleuchtung', description: 'Gute Sicht am Rack · Hashrate +0,6 %', cost: 680 },
  interior: { name: 'Ergonomisches Interieur', description: 'Aufgeräumter Arbeitsplatz · Hashrate +1,2 %', cost: 1450 },
  purifier: { name: 'Luftreiniger', description: 'Weniger Staub · Verschleiß −5 %', cost: 950 },
} as const;

export const DESK_UPGRADES = [
  { name: 'Montagetisch', cost: 700, description: '−8 % Verschleiß', tech: null, hash: 1, power: 1, wear: 0.92 },
  { name: 'Monitoring-Tisch', cost: 2600, description: '+3 % Hashrate, −5 % Stromverbrauch', tech: 'eff', hash: 1.03, power: 0.95, wear: 1 },
  { name: 'Leitstand', cost: 9800, description: '+5 % Hashrate, −10 % Verschleiß', tech: 'gridops', hash: 1.05, power: 1, wear: 0.90 },
] as const;

export const SKILLS = {
  ledger: { name: 'Ops Ledger', description: 'Niedrigere Betriebs- und Personalkosten', cost: 1, max: 5, requires: '' },
  backbone: { name: 'Grid Backbone', description: 'Mehr Netzkapazität', cost: 2, max: 4, requires: '' },
  thermal: { name: 'Thermal Doctrine', description: 'Niedrigere Rig-Temperatur', cost: 2, max: 4, requires: 'backbone' },
  payroll: { name: 'Payroll Sync', description: 'Crew-Löhne senken', cost: 2, max: 4, requires: 'ledger' },
  treasury: { name: 'Treasury Desk', description: 'Mehr Wallet-Zinsen', cost: 2, max: 4, requires: 'ledger' },
  legacy: { name: 'Legacy Engine', description: 'Mehr Hashrate', cost: 3, max: 4, requires: 'backbone' },
  contract: { name: 'Contract-Slot', description: 'Zusätzliche Vertrags- und Limit-Order-Plätze', cost: 2, max: 3, requires: '' },
} as const;

export const CONSUMABLES = {
  burst: { name: 'Hash-Burst', description: 'Doppelte Hashrate für 60 s', cost: 2, sec: 60 },
  relief: { name: 'Netzentlastung', description: '60 s kostenloser Strom', cost: 1, sec: 60 },
  freeze: { name: 'Kältefront', description: 'Halbe Hitze für 90 s', cost: 1, sec: 90 },
} as const;

export const YIELD_APY: Readonly<Record<string, number>> = {
  MON: 0.072, ETRA: 0.058, NOVA: 0.063, BIT: 0.045, LUX: 0.05, QBT: 0.055, HEL: 0.06,
};

export const WALLET_TIERS = [
  { name: 'Basis', min: 0, multiplier: 1, lockDays: 1 },
  { name: 'Silber', min: 500, multiplier: 1.12, lockDays: 2 },
  { name: 'Gold', min: 2500, multiplier: 1.28, lockDays: 3 },
  { name: 'Platin', min: 10000, multiplier: 1.5, lockDays: 4 },
];

export type Metric = 'clicks' | 'sold' | 'rigs' | 'built' | 'repair' | 'research' | 'grid' | 'crew' | 'wallet' | 'orders' | 'rooms' | 'mods' | 'shop' | 'hash' | 'yield';
export const METRIC_NAMES: Record<Metric, string> = {
  clicks: 'Mining-Klicks', sold: 'Coin-Verkäufe in €', rigs: 'Miner', built: 'Eigenbauten', repair: 'Reparaturen', research: 'Forschungen',
  grid: 'Netzstufe', crew: 'Zugewiesene Crew', wallet: 'Wallet-Basiswert in €', orders: 'Ausgeführte Limit-Orders', rooms: 'Räume',
  mods: 'Installierte Mods', shop: 'Standort-Upgrades', hash: 'H/s', yield: 'Tage mit Zinsertrag',
};

export interface Target { metric: Metric; amount: number }
export interface Objective {
  id: string; name: string; targets: Target[]; cash: number; chips?: number; gate?: Target;
}

export const DAILY: Objective[] = [
  { id: 'shift', name: 'Mining-Schicht', targets: [{ metric: 'clicks', amount: 20 }], cash: 110 },
  { id: 'liquidity', name: 'Liquidität', targets: [{ metric: 'sold', amount: 30 }], cash: 125 },
  { id: 'uptime', name: 'Produktionsziel', targets: [{ metric: 'hash', amount: 15 }], cash: 110 },
  { id: 'bench', name: 'Werkbank', targets: [{ metric: 'built', amount: 1 }], cash: 210 },
  { id: 'maintenance', name: 'Wartungsfenster', targets: [{ metric: 'repair', amount: 1 }], cash: 180 },
  { id: 'desk', name: 'Handelsschicht', targets: [{ metric: 'orders', amount: 1 }], cash: 250 },
];

export const WEEKLY: Objective[] = [
  { id: 'production', name: 'Weekly Ops · Produktion', targets: [{ metric: 'clicks', amount: 100 }, { metric: 'sold', amount: 150 }], cash: 700, chips: 1 },
  { id: 'fabrication', name: 'Weekly Ops · Werkstatt', targets: [{ metric: 'built', amount: 2 }, { metric: 'rigs', amount: 2 }], cash: 1100 },
  { id: 'stability', name: 'Weekly Ops · Stabilität', targets: [{ metric: 'repair', amount: 3 }, { metric: 'grid', amount: 1 }], cash: 1250, chips: 1 },
  { id: 'market', name: 'Weekly Ops · Handel', targets: [{ metric: 'orders', amount: 3 }, { metric: 'sold', amount: 300 }], cash: 1300, chips: 1 },
];

export const PROJECTS: Objective[] = [
  { id: 'power-core', name: 'Projekt Netzbetrieb', targets: [{ metric: 'grid', amount: 2 }, { metric: 'rooms', amount: 2 }], cash: 2500, chips: 1 },
  { id: 'rig-fleet', name: 'Projekt Rig-Flotte', gate: { metric: 'rigs', amount: 2 }, targets: [{ metric: 'rigs', amount: 4 }, { metric: 'mods', amount: 3 }], cash: 4500, chips: 2 },
  { id: 'treasury-desk', name: 'Projekt Treasury', targets: [{ metric: 'wallet', amount: 500 }, { metric: 'yield', amount: 3 }], cash: 3000, chips: 1 },
  { id: 'crew-campus', name: 'Projekt Crew-Campus', gate: { metric: 'rooms', amount: 2 }, targets: [{ metric: 'crew', amount: 4 }, { metric: 'research', amount: 3 }, { metric: 'shop', amount: 3 }], cash: 7500, chips: 3 },
];

export type Effect = 'click' | 'hash' | 'power' | 'capacity' | 'cost' | 'reward' | 'crew' | 'cool';
export const COLLECTIONS: (Pick<Objective, 'id' | 'name' | 'targets'> & { text: string; bonuses: Partial<Record<Effect, number>> })[] = [
  { id: 'starter', name: 'Starter-Stack', targets: [{ metric: 'rigs', amount: 2 }, { metric: 'built', amount: 1 }], text: '+12 % Klickwert, +4 % Hashrate', bonuses: { click: 1.12, hash: 1.04 } },
  { id: 'gpu', name: 'GPU-Floor', targets: [{ metric: 'rigs', amount: 4 }, { metric: 'mods', amount: 3 }], text: '+8 % Hashrate, −5 % Stromverbrauch', bonuses: { hash: 1.08, power: 0.95 } },
  { id: 'operator', name: 'Operator-Suite', targets: [{ metric: 'rooms', amount: 3 }, { metric: 'shop', amount: 5 }, { metric: 'grid', amount: 3 }], text: '−6 % Fixkosten, +6 % Netzkapazität, −12 % Hitze', bonuses: { cost: 0.94, capacity: 1.06, cool: 0.88 } },
  { id: 'wallet', name: 'Wallet Treasury', targets: [{ metric: 'wallet', amount: 500 }, { metric: 'yield', amount: 3 }], text: '+8 % Auftragsprämie, +6 % Klickwert', bonuses: { reward: 1.08, click: 1.06 } },
  { id: 'crew', name: 'Crew Matrix', targets: [{ metric: 'crew', amount: 4 }, { metric: 'rooms', amount: 2 }], text: '+8 % Crew-Effektivität', bonuses: { crew: 1.08 } },
];

export const COOLING = {
  normal: { label: 'Standard', heat: 1, power: 1 },
  quiet: { label: 'Sparbetrieb', heat: 1.15, power: 0.94 },
  boost: { label: 'Maximal', heat: 0.75, power: 1.09 },
  auto: { label: 'Automatik', heat: 1, power: 1 },
} as const;

export const CONTRACTS = [
  { id: 'coin', name: 'Coin-Lieferung', kind: 'delivery', scale: 8, cash: 170, duration: 2 },
  { id: 'hash', name: 'Hashrate-Vertrag', kind: 'hash', scale: 20, cash: 250, duration: 2 },
  { id: 'sell', name: 'Liquiditätsvertrag', kind: 'sold', scale: 100, cash: 220, duration: 2 },
  { id: 'mine', name: 'Mining-Auftrag', kind: 'clicks', scale: 30, cash: 160, duration: 1 },
] as const;

export const GRID_PROFILES = {
  economy: { label: 'Sparsam', guard: true, policy: 'peak', batteryMode: 'auto', plan: 'manual' },
  balanced: { label: 'Ausgewogen', guard: false, policy: 'always', batteryMode: 'auto', plan: 'battery' },
  reliable: { label: 'Ausfallsicher', guard: true, policy: 'always', batteryMode: 'reserve', plan: 'service' },
} as const;
