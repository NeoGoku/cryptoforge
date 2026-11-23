export type Kind = 'cpu' | 'gpu' | 'asic' | 'quantum' | 'fusion';

export interface CoinDef {
  id: string;
  name: string;
  color: string;
  base: number;      // Basiskurs EUR
  vol: number;       // Volatilität
  revert: number;    // Rückkehr zum Basiskurs
  perHash: number;   // Coins je Hash und Sekunde
  mult: Record<Kind, number>; // Algorithmus-Faktor je Gerätetyp
  minHash: number;   // Mindest-Hashrate je Gerät, um diesen Coin zu minen
  desc: string;
  unlock?: string;
}

export const COINS: CoinDef[] = [
  { id: 'MON', name: 'Mondo', color: '#9ad0ff', base: 1.5, vol: 0.05, revert: 0.02, perHash: 0.02, minHash: 0, mult: { cpu: 1.6, gpu: 0.9, asic: 0, quantum: 0.8, fusion: 0.8 }, desc: 'CPU-Coin. Läuft auf jedem PC, ASICs können ihn nicht minen.' },
  { id: 'ETRA', name: 'Etra', color: '#8c7bff', base: 12, vol: 0.06, revert: 0.02, perHash: 0.0022, minHash: 20, mult: { cpu: 0.3, gpu: 1.35, asic: 0.6, quantum: 0.9, fusion: 0.9 }, desc: 'GPU-Algorithmus. Ideal für den Einstieg.' },
  { id: 'NOVA', name: 'Nova', color: '#ff6aa8', base: 0.8, vol: 0.14, revert: 0.008, perHash: 0.03, minHash: 0, mult: { cpu: 1, gpu: 1, asic: 1, quantum: 1.2, fusion: 1.2 }, desc: 'Spekulativer Meme-Coin. Extreme Ausschläge.', unlock: 'market' },
  { id: 'BIT', name: 'BitForge', color: '#ffc857', base: 40, vol: 0.04, revert: 0.02, perHash: 0.00072, minHash: 100, mult: { cpu: 0, gpu: 0.8, asic: 1.1, quantum: 1.1, fusion: 1.1 }, desc: 'Solide Leitwährung. Braucht ASIC-Leistung.' },
  { id: 'LUX', name: 'Luxar', color: '#7ee787', base: 320, vol: 0.05, revert: 0.02, perHash: 0.000106, minHash: 500, mult: { cpu: 0, gpu: 1, asic: 1.15, quantum: 1, fusion: 1 }, desc: 'Premium-Coin für Hochleistungs-ASICs.' },
  { id: 'QBT', name: 'Qubit', color: '#7af5ff', base: 2600, vol: 0.07, revert: 0.015, perHash: 0.0000162, minHash: 3000, mult: { cpu: 0, gpu: 1, asic: 1, quantum: 1.3, fusion: 1.05 }, desc: 'Quanten-Algorithmus. Nur für Quantenrechner.', unlock: 'quantum' },
  { id: 'HEL', name: 'Helion', color: '#ff9f43', base: 21000, vol: 0.06, revert: 0.015, perHash: 0.00000238, minHash: 15000, mult: { cpu: 0, gpu: 1, asic: 1, quantum: 1, fusion: 1.3 }, desc: 'Fusions-Coin. Höchster Ertrag je Hash.', unlock: 'fusion' },
];

export const DEFAULT_COIN = 'ETRA';

/** Kann dieses Gerät den Coin minen (genug Hashrate, passender Algorithmus)? */
export const canMine = (g: { hash: number; kind: Kind }, c: CoinDef): boolean => g.hash >= c.minHash && c.mult[g.kind] > 0;

export interface RoomDef {
  id: string;
  name: string;
  size: number;      // Raumtiefe in Kacheln
  maxHeat: number;   // Hitzelimit, darüber Drosselung
  cost: number;
  rent: number;      // EUR/s
  gridKw?: number;
  gate?: { room: string; grid: number; tech: string };
  spots: [number, number][]; // Slot-Positionen (Kachelkoordinaten)
}

const grid = (cols: number, rows: number, u0: number, v0: number, su = 1.8, sv = 1.8): [number, number][] => {
  const out: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([u0 + c * su, v0 + r * sv]);
  return out;
};

export const ROOMS: RoomDef[] = [
  { id: 'kid', name: 'Kinderzimmer', size: 6, maxHeat: 200, cost: 0, rent: 0, spots: [[1.6, 3.2], [3.6, 3.2]] },
  { id: 'store', name: 'Lagerraum', size: 8, maxHeat: 450, cost: 3750, rent: 0.12, spots: [[2.4, 3.6], [4.2, 3.6], [2.4, 5.4], [4.2, 5.4]] },
  { id: 'garage', name: 'Garage', size: 10, maxHeat: 700, cost: 18000, rent: 0.35, spots: [[3.0, 4.0], [4.8, 4.0], [6.6, 4.0], [3.0, 6.0], [4.8, 6.0], [6.6, 6.0]] },
  { id: 'basement', name: 'Keller', size: 10, maxHeat: 1100, cost: 60000, rent: 0.7, spots: grid(4, 2, 2.2, 3.6) },
  { id: 'hall', name: 'Industriehalle', size: 12, maxHeat: 2200, cost: 225000, rent: 1.6, spots: grid(4, 3, 3.0, 3.4) },
  { id: 'dc', name: 'Rechenzentrum', size: 14, maxHeat: 5200, cost: 900000, rent: 4, spots: grid(5, 4, 2.8, 3.2, 1.9, 1.9) },
  { id: 'suite', name: 'Datacenter Suite', size: 15, maxHeat: 10000, cost: 2100000, rent: 7,
    gridKw: 12, gate: { room: 'dc', grid: 4, tech: 'gridops' }, spots: grid(6, 4, 2, 3.1, 1.9, 2.1) },
  { id: 'campus', name: 'Datacenter Campus', size: 17, maxHeat: 22000, cost: 6300000, rent: 14,
    gridKw: 24, gate: { room: 'suite', grid: 7, tech: 'compression' }, spots: grid(7, 5, 2, 3.1, 1.9, 2.1) },
  { id: 'megafarm', name: 'Mega-Farm Campus', size: 19, maxHeat: 48000, cost: 18000000, rent: 26,
    gridKw: 44, gate: { room: 'campus', grid: 10, tech: 'orbital' }, spots: grid(8, 6, 2, 3.1, 1.9, 2.1) },
];

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  max: number;
  base: number;
  mult: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'cool', name: 'Kühlsystem', desc: 'Hitze −15 % je Stufe', max: 5, base: 300, mult: 2.2 },
  { id: 'tariff', name: 'Nachttarif', desc: 'Strompreis −10 % je Stufe', max: 3, base: 500, mult: 2.5 },
  { id: 'oc', name: 'Overclocking', desc: 'Hash +10 % je Stufe', max: 5, base: 400, mult: 2.0 },
  { id: 'psu', name: 'Netzteil-Effizienz', desc: 'Verbrauch −8 % je Stufe', max: 5, base: 600, mult: 2.2 },
  { id: 'fw', name: 'Firewall', desc: 'Hack-Risiko −35 % je Stufe', max: 3, base: 1200, mult: 2.6 },
  { id: 'click', name: 'Mining-Skript', desc: 'Klickwert +50 % und Krit-Chance +1 % je Stufe', max: 5, base: 250, mult: 2.4 },
  { id: 'bat', name: 'Notstrom-Akku', desc: 'Stromausfälle −30 % kürzer je Stufe', max: 3, base: 900, mult: 2.4 },
];

export interface StaffDef {
  id: string;
  name: string;
  desc: string;
  max: number;
  hire: number;
  mult: number;
  salary: number; // EUR/s je Stufe
}

export const STAFF: StaffDef[] = [
  { id: 'tech', name: 'Techniker', desc: 'Verschleiß −30 % je Stufe, repariert unter 60 % Zustand automatisch', max: 3, hire: 800, mult: 2.5, salary: 0.2 },
  { id: 'sec', name: 'Sicherheitsexperte', desc: 'Hack-Risiko halbiert je Stufe', max: 2, hire: 1500, mult: 3, salary: 0.3 },
];

export interface TechDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  secs: number;
  req?: string;
}

export const TECHS: TechDef[] = [
  { id: 'eff', name: 'Effizienz-Firmware', desc: 'Stromverbrauch −10 %', cost: 2400, secs: 79 },
  { id: 'market', name: 'Marktanalyse', desc: 'Schaltet die Münze Nova frei', cost: 4000, secs: 105 },
  { id: 'auto', name: 'Auto-Verkauf', desc: 'Verkauft Coins automatisch ab einem Schwellwert', cost: 5600, secs: 105 },
  { id: 'chain', name: 'Block-Optimierung', desc: 'Hash +10 %', cost: 12800, secs: 158 },
  { id: 'immersion', name: 'Immersionskühlung', desc: 'Hitze −20 %, schaltet den Immersion Tank frei', cost: 9600, secs: 158, req: 'eff' },
  { id: 'quantum', name: 'Quantum-Hardware', desc: 'Schaltet Quantum Q1 frei', cost: 40000, secs: 315, req: 'immersion' },
  { id: 'fusion', name: 'Fusionskern', desc: 'Schaltet Fusion Core frei', cost: 192000, secs: 525, req: 'quantum' },
  { id: 'gridops', name: 'Autonomous Grid', desc: 'Stromverbrauch −12 % und Datacenter Suite freischalten', cost: 92800, secs: 368, req: 'immersion' },
  { id: 'compression', name: 'Hash Compression', desc: 'Coin-Produktion +18 % und Datacenter Campus freischalten', cost: 232000, secs: 525, req: 'gridops' },
  { id: 'neural', name: 'Neural Mining', desc: 'Klickwert +45 % und AI Cluster freischalten', cost: 432000, secs: 630, req: 'compression' },
  { id: 'orbital', name: 'Orbital Scheduling', desc: 'Hashrate +25 %, Orbital Forge und Mega-Farm freischalten', cost: 1360000, secs: 840, req: 'fusion' },
];

export const LOANS = [500, 2500, 10000, 50000];

export const roomDef = (id: string): RoomDef => ROOMS.find((r) => r.id === id)!;
export const upgradeDef = (id: string): UpgradeDef => UPGRADES.find((u) => u.id === id)!;
export const coinDef = (id: string): CoinDef => COINS.find((c) => c.id === id)!;
export const techDef = (id: string): TechDef => TECHS.find((t) => t.id === id)!;
export const staffDef = (id: string): StaffDef => STAFF.find((s) => s.id === id)!;
export const upgradeCost = (u: UpgradeDef, lvl: number): number => Math.round(u.base * Math.pow(u.mult, lvl));
export const staffCost = (s: StaffDef, lvl: number): number => Math.round(s.hire * Math.pow(s.mult, lvl));
