export type Kind = 'gpu' | 'asic' | 'quantum' | 'fusion';

export interface GadgetDef {
  id: string;
  name: string;
  kind: Kind;
  hash: number;   // H/s
  watts: number;  // Verbrauch
  heat: number;   // Hitze je Gadget
  cost: number;   // EUR
  size: number;   // Gehäusehöhe (Render)
  color: number;
  ledColor: number;
  unlock?: string; // Forschungs-ID
}

export const GADGETS: GadgetDef[] = [
  { id: 'gpu', name: 'GPU-Rig Nova', kind: 'gpu', hash: 25, watts: 350, heat: 30, cost: 180, size: 22, color: 0x8c90c0, ledColor: 0x4fd1c5 },
  { id: 'asic', name: 'ASIC Titan S9', kind: 'asic', hash: 140, watts: 1100, heat: 110, cost: 1200, size: 34, color: 0xb8862b, ledColor: 0xffc857 },
  { id: 'pro', name: 'ASIC Titan X', kind: 'asic', hash: 720, watts: 3200, heat: 260, cost: 7500, size: 48, color: 0xb0584c, ledColor: 0xff6a3d },
  { id: 'qpu', name: 'Quantum Q1', kind: 'quantum', hash: 3600, watts: 9000, heat: 520, cost: 40000, size: 56, color: 0x3a8fb8, ledColor: 0x7af5ff, unlock: 'quantum' },
  { id: 'fusion', name: 'Fusion Core', kind: 'fusion', hash: 18000, watts: 22000, heat: 900, cost: 200000, size: 64, color: 0xb04a8c, ledColor: 0xff7ac8, unlock: 'fusion' },
];

export interface CoinDef {
  id: string;
  name: string;
  color: string;
  base: number;      // Basiskurs EUR
  vol: number;       // Volatilität
  revert: number;    // Rückkehr zum Basiskurs
  perHash: number;   // Coins je Hash und Sekunde
  mult: Record<Kind, number>; // Algorithmus-Faktor je Gadget-Typ
  desc: string;
  unlock?: string;
}

export const COINS: CoinDef[] = [
  { id: 'BIT', name: 'BitForge', color: '#ffc857', base: 40, vol: 0.04, revert: 0.02, perHash: 0.00072, mult: { gpu: 0.8, asic: 1.1, quantum: 1.1, fusion: 1.1 }, desc: 'Solide Leitwährung. ASIC-freundlich.' },
  { id: 'ETRA', name: 'Etra', color: '#8c7bff', base: 12, vol: 0.06, revert: 0.02, perHash: 0.0022, mult: { gpu: 1.35, asic: 0.6, quantum: 0.9, fusion: 0.9 }, desc: 'GPU-Algorithmus. Mittlere Schwankung.' },
  { id: 'NOVA', name: 'Nova', color: '#ff6aa8', base: 0.8, vol: 0.14, revert: 0.008, perHash: 0.03, mult: { gpu: 1, asic: 1, quantum: 1.2, fusion: 1.2 }, desc: 'Spekulativer Meme-Coin. Extreme Ausschläge.', unlock: 'market' },
];

export interface RoomDef {
  id: string;
  name: string;
  size: number;      // Raumtiefe in Kacheln
  maxHeat: number;   // Hitzelimit, darüber Drosselung
  cost: number;
  rent: number;      // EUR/s
  spots: [number, number][]; // Slot-Positionen (Kachelkoordinaten)
}

const grid = (cols: number, rows: number, u0: number, v0: number, su = 1.8, sv = 1.8): [number, number][] => {
  const out: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([u0 + c * su, v0 + r * sv]);
  return out;
};

export const ROOMS: RoomDef[] = [
  { id: 'kid', name: 'Kinderzimmer', size: 6, maxHeat: 200, cost: 0, rent: 0, spots: [[1.6, 3.2], [3.6, 3.2]] },
  { id: 'store', name: 'Lagerraum', size: 8, maxHeat: 450, cost: 2500, rent: 0.12, spots: [[2.4, 3.6], [4.2, 3.6], [2.4, 5.4], [4.2, 5.4]] },
  { id: 'garage', name: 'Garage', size: 10, maxHeat: 700, cost: 12000, rent: 0.35, spots: [[3.0, 4.0], [4.8, 4.0], [6.6, 4.0], [3.0, 6.0], [4.8, 6.0], [6.6, 6.0]] },
  { id: 'basement', name: 'Keller', size: 10, maxHeat: 1100, cost: 40000, rent: 0.7, spots: grid(4, 2, 2.2, 3.6) },
  { id: 'hall', name: 'Industriehalle', size: 12, maxHeat: 2200, cost: 150000, rent: 1.6, spots: grid(4, 3, 3.0, 3.4) },
  { id: 'dc', name: 'Rechenzentrum', size: 14, maxHeat: 5200, cost: 600000, rent: 4, spots: grid(5, 4, 2.8, 3.2, 1.9, 1.9) },
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
  { id: 'eff', name: 'Effizienz-Firmware', desc: 'Stromverbrauch −10 %', cost: 1500, secs: 45 },
  { id: 'market', name: 'Marktanalyse', desc: 'Schaltet die Münze Nova frei', cost: 2500, secs: 60 },
  { id: 'auto', name: 'Auto-Verkauf', desc: 'Verkauft Coins automatisch ab einem Schwellwert', cost: 3500, secs: 60 },
  { id: 'chain', name: 'Block-Optimierung', desc: 'Hash +10 %', cost: 8000, secs: 90 },
  { id: 'immersion', name: 'Immersionskühlung', desc: 'Hitze −20 %', cost: 6000, secs: 90, req: 'eff' },
  { id: 'quantum', name: 'Quantum-Hardware', desc: 'Schaltet Quantum Q1 frei', cost: 25000, secs: 180, req: 'immersion' },
  { id: 'fusion', name: 'Fusionskern', desc: 'Schaltet Fusion Core frei', cost: 120000, secs: 300, req: 'quantum' },
];

export const LOANS = [500, 2500, 10000, 50000];

export const gadgetDef = (id: string): GadgetDef => GADGETS.find((g) => g.id === id)!;
export const roomDef = (id: string): RoomDef => ROOMS.find((r) => r.id === id)!;
export const upgradeDef = (id: string): UpgradeDef => UPGRADES.find((u) => u.id === id)!;
export const coinDef = (id: string): CoinDef => COINS.find((c) => c.id === id)!;
export const techDef = (id: string): TechDef => TECHS.find((t) => t.id === id)!;
export const staffDef = (id: string): StaffDef => STAFF.find((s) => s.id === id)!;
export const upgradeCost = (u: UpgradeDef, lvl: number): number => Math.round(u.base * Math.pow(u.mult, lvl));
export const staffCost = (s: StaffDef, lvl: number): number => Math.round(s.hire * Math.pow(s.mult, lvl));
