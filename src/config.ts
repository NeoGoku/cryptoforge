export interface GadgetDef {
  id: string;
  name: string;
  hash: number;   // H/s
  watts: number;  // Verbrauch
  heat: number;   // Hitze je Gadget
  cost: number;   // EUR
  size: number;   // Gehäusehöhe (Render)
  color: number;
  ledColor: number;
}

export const GADGETS: GadgetDef[] = [
  { id: 'gpu', name: 'GPU-Rig Nova', hash: 25, watts: 350, heat: 30, cost: 180, size: 22, color: 0x8c90c0, ledColor: 0x4fd1c5 },
  { id: 'asic', name: 'ASIC Titan S9', hash: 140, watts: 1100, heat: 110, cost: 1200, size: 34, color: 0xb8862b, ledColor: 0xffc857 },
  { id: 'pro', name: 'ASIC Titan X', hash: 720, watts: 3200, heat: 260, cost: 7500, size: 48, color: 0xb0584c, ledColor: 0xff6a3d },
];

export interface RoomDef {
  id: string;
  name: string;
  size: number;      // Raumtiefe in Kacheln
  maxHeat: number;   // Hitzelimit, darüber Drosselung
  cost: number;
  spots: [number, number][]; // Slot-Positionen (Kachelkoordinaten)
}

export const ROOMS: RoomDef[] = [
  { id: 'kid', name: 'Kinderzimmer', size: 6, maxHeat: 200, cost: 0, spots: [[1.6, 3.2], [3.6, 3.2]] },
  { id: 'store', name: 'Lagerraum', size: 8, maxHeat: 450, cost: 2500, spots: [[2.4, 3.6], [4.2, 3.6], [2.4, 5.4], [4.2, 5.4]] },
  { id: 'garage', name: 'Garage', size: 10, maxHeat: 700, cost: 12000, spots: [[3.0, 4.0], [4.8, 4.0], [6.6, 4.0], [3.0, 6.0], [4.8, 6.0], [6.6, 6.0]] },
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
];

export const gadgetDef = (id: string): GadgetDef => GADGETS.find((g) => g.id === id)!;
export const roomDef = (id: string): RoomDef => ROOMS.find((r) => r.id === id)!;
export const upgradeDef = (id: string): UpgradeDef => UPGRADES.find((u) => u.id === id)!;
export const upgradeCost = (u: UpgradeDef, lvl: number): number => Math.round(u.base * Math.pow(u.mult, lvl));
