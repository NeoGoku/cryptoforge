export const WorkshopJobs = [
  { id: 'office', name: 'Büro Nord', description: 'Sparsamer Bürorechner', minHash: 3, maxWatts: 120, budget: 260, reward: 305 },
  { id: 'studio', name: 'Pixelstudio', description: 'Kompakter GPU-PC', minHash: 20, maxWatts: 320, budget: 480, reward: 560 },
  { id: 'lab', name: 'Rechenlabor', description: 'Effizientes Mehrkarten-Rig', minHash: 100, maxWatts: 850, budget: 2250, reward: 2580, tech: 'eff' },
] as const;

export type GridResponse = 'limit' | 'battery' | 'tariff';
export const GRID_WARNING = 30;
export const GRID_SHORTAGE = 55;
export const GRID_BATTERY_COST = 0.25;
