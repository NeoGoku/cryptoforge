// Hardware-Katalog: Einzelteile, Fertig-Miner, Bauregeln und Icons.
// Alle Hersteller- und Modellnamen sind frei erfunden (store-tauglich).
import type { Kind } from './config';

export type PartCat = 'case' | 'board' | 'cpu' | 'ram' | 'ssd' | 'psu' | 'gpu' | 'cool';
export type HwMarket = 'gpu' | 'asic' | 'parts';
export type Model = 'tower' | 'rig' | 'asic' | 'quantum' | 'fusion';

export interface PartDef {
  id: string;
  cat: PartCat;
  brand: string;
  name: string;
  cost: number;      // Basispreis EUR
  color: number;
  hash?: number;     // CPU/GPU
  watts?: number;    // Leistungsaufnahme (DC)
  heat?: number;     // CPU/GPU
  slots?: number;    // Gehäuse/Mainboard: GPU-Plätze
  rig?: boolean;     // Gehäuse: offener Rahmen statt Tower
  heatMul?: number;  // Gehäuse/Kühlung
  hashMul?: number;  // RAM/SSD
  cap?: number;      // Netzteil: Leistung W
  eff?: number;      // Netzteil: Wirkungsgrad
  unlock?: string;   // Forschungs-ID
  desc: string;
}

export const CATS: Record<PartCat, { name: string; icon: string; req: boolean; market: HwMarket }> = {
  case: { name: 'Gehäuse / Rahmen', icon: '🗄️', req: true, market: 'parts' },
  board: { name: 'Mainboard', icon: '🟩', req: true, market: 'parts' },
  cpu: { name: 'Prozessor', icon: '🔲', req: true, market: 'parts' },
  ram: { name: 'Arbeitsspeicher', icon: '📏', req: true, market: 'parts' },
  ssd: { name: 'Speicher', icon: '💾', req: true, market: 'parts' },
  psu: { name: 'Netzteil', icon: '🔌', req: true, market: 'parts' },
  gpu: { name: 'Grafikkarten', icon: '🎮', req: false, market: 'gpu' },
  cool: { name: 'Kühlung', icon: '❄️', req: false, market: 'parts' },
};
export const CAT_ORDER: PartCat[] = ['case', 'board', 'cpu', 'ram', 'ssd', 'psu', 'gpu', 'cool'];
export const REQUIRED: PartCat[] = ['case', 'board', 'cpu', 'ram', 'ssd', 'psu'];
/** Grundverbrauch von Mainboard, RAM und SSD (W). */
export const BASE_WATTS = 25;

export const PARTS: PartDef[] = [
  // Gehäuse / Rahmen
  { id: 'case_office', cat: 'case', brand: 'Brevalt', name: 'Office M1', cost: 35, color: 0x6f7486, slots: 1, heatMul: 1.1, desc: 'Schlichter Büro-Tower. Platz für 1 Grafikkarte, mäßige Belüftung.' },
  { id: 'case_gamer', cat: 'case', brand: 'Nyxaro', name: 'Vortex G5 RGB', cost: 110, color: 0x2a2f45, slots: 2, heatMul: 0.95, desc: 'Gaming-Tower mit Glasseite und RGB. Platz für 2 Grafikkarten.' },
  { id: 'case_frame6', cat: 'case', brand: 'Stackwell', name: 'Open Frame 6', cost: 150, color: 0x9aa3b5, slots: 6, rig: true, heatMul: 0.85, desc: 'Offener Mining-Rahmen für 6 Karten. Sehr gute Luftzirkulation.' },
  { id: 'case_frame8', cat: 'case', brand: 'Stackwell', name: 'Open Frame 8 Pro', cost: 240, color: 0xb0b8c8, slots: 8, rig: true, heatMul: 0.8, desc: 'Stabiler Alu-Rahmen für 8 Karten.' },
  { id: 'case_frame12', cat: 'case', brand: 'Stackwell', name: 'Mega Frame 12', cost: 480, color: 0xc8a86a, slots: 12, rig: true, heatMul: 0.78, desc: 'Doppelstöckiger Profi-Rahmen für 12 Karten.' },
  { id: 'case_air3', cat: 'case', brand: 'Brevalt', name: 'Airflow T3', cost: 230, color: 0x3c717a, slots: 3, rig: true, heatMul: 0.82, desc: 'Kompakter offener Rahmen für 3 Karten, Hitze −18 %.' },
  // Mainboards
  { id: 'mb_t1', cat: 'board', brand: 'Tessarc', name: 'T1 Basic', cost: 60, color: 0x2f6b4a, slots: 1, desc: 'Einsteiger-Board mit 1 PCIe-Slot.' },
  { id: 'mb_g2', cat: 'board', brand: 'Tessarc', name: 'G2 Gaming', cost: 120, color: 0x2a2f45, slots: 2, desc: 'Gaming-Board mit 2 PCIe-Slots.' },
  { id: 'mb_m6', cat: 'board', brand: 'Tessarc', name: 'MineBoard 6', cost: 190, color: 0x2f5b6b, slots: 6, desc: 'Mining-Board mit 6 PCIe-Slots (Riser).' },
  { id: 'mb_m8', cat: 'board', brand: 'Tessarc', name: 'MineBoard 8 Pro', cost: 290, color: 0x3b4f8a, slots: 8, desc: 'Mining-Board mit 8 PCIe-Slots.' },
  { id: 'mb_m12', cat: 'board', brand: 'Tessarc', name: 'MineBoard 12 X', cost: 560, color: 0x6b3b8a, slots: 12, desc: 'Server-Mining-Board mit 12 PCIe-Slots.' },
  { id: 'mb_eco3', cat: 'board', brand: 'Tessarc', name: 'E3 Workstation', cost: 245, color: 0x317370, slots: 3, desc: 'Workstation-Board mit 3 PCIe-Slots.' },
  // Prozessoren
  { id: 'cpu_c4', cat: 'cpu', brand: 'Corvaxis', name: 'C4 Lite', cost: 55, color: 0x8a8f9c, hash: 3, watts: 65, heat: 6, desc: '4 Kerne. Reicht zum Betrieb, mint etwas CPU-Coin.' },
  { id: 'cpu_c6', cat: 'cpu', brand: 'Corvaxis', name: 'C6 Core', cost: 130, color: 0x9ca3b4, hash: 6, watts: 90, heat: 9, desc: '6 Kerne. Solider CPU-Hash.' },
  { id: 'cpu_c12', cat: 'cpu', brand: 'Corvaxis', name: 'C12 Titan', cost: 420, color: 0xc8a86a, hash: 14, watts: 150, heat: 15, desc: '12 Kerne. Stark für CPU-Algorithmen.' },
  { id: 'cpu_c8e', cat: 'cpu', brand: 'Corvaxis', name: 'C8 Eco', cost: 255, color: 0x658f83, hash: 9, watts: 55, heat: 6, desc: '8 Kerne mit 55 W. Für stromsparendes Mondo-Mining.' },
  { id: 'cpu_c24', cat: 'cpu', brand: 'Corvaxis', name: 'C24 Matrix', cost: 1850, color: 0x8fb0d6, hash: 46, watts: 180, heat: 22, unlock: 'chain', desc: '24 Kerne für schnelle CPU-Rigs.' },
  // Arbeitsspeicher
  { id: 'ram8', cat: 'ram', brand: 'Lumeri', name: '8 GB DDR4', cost: 22, color: 0x3a6b3a, hashMul: 1, desc: 'Minimum für einen Miner.' },
  { id: 'ram16', cat: 'ram', brand: 'Lumeri', name: '16 GB DDR4', cost: 45, color: 0x2f5b8a, hashMul: 1.03, desc: 'Hash +3 %.' },
  { id: 'ram32', cat: 'ram', brand: 'Lumeri', name: 'Pulse 32 GB DDR5', cost: 110, color: 0x8a2f5b, hashMul: 1.06, desc: 'Hash +6 %.' },
  { id: 'ram64', cat: 'ram', brand: 'Lumeri', name: 'Matrix 64 GB', cost: 440, color: 0x609aca, hashMul: 1.12, unlock: 'chain', desc: 'Hash +12 %.' },
  // Speicher
  { id: 'ssd128', cat: 'ssd', brand: 'Dravon', name: '128 GB SATA', cost: 18, color: 0x4a4f5c, hashMul: 1, desc: 'Reicht für das Mining-OS.' },
  { id: 'ssd1t', cat: 'ssd', brand: 'Dravon', name: '1 TB NVMe', cost: 60, color: 0x2a2f45, hashMul: 1.02, desc: 'Schnelle Blockchain-Synchronisation: Hash +2 %.' },
  { id: 'ssd4t', cat: 'ssd', brand: 'Dravon', name: '4 TB NVMe Pro', cost: 310, color: 0x5e928a, hashMul: 1.05, unlock: 'chain', desc: 'Schnelle Synchronisation: Hash +5 %.' },
  // Netzteile
  { id: 'psu450', cat: 'psu', brand: 'Ardentia', name: '450 W Bronze', cost: 40, color: 0x4a4f5c, cap: 450, eff: 0.85, desc: '450 W, 85 % Wirkungsgrad.' },
  { id: 'psu750', cat: 'psu', brand: 'Ardentia', name: '750 W Gold', cost: 90, color: 0x6b5a2f, cap: 750, eff: 0.9, desc: '750 W, 90 % Wirkungsgrad.' },
  { id: 'psu1200', cat: 'psu', brand: 'Ardentia', name: '1200 W Platinum', cost: 190, color: 0x7a8494, cap: 1200, eff: 0.93, desc: '1200 W, 93 % Wirkungsgrad.' },
  { id: 'psu2000', cat: 'psu', brand: 'Ardentia', name: '2000 W Titanium', cost: 380, color: 0x9aa3b5, cap: 2000, eff: 0.95, desc: '2000 W, 95 % Wirkungsgrad.' },
  { id: 'psu3200', cat: 'psu', brand: 'Ardentia', name: 'Server 3200 W', cost: 560, color: 0x5b6b7a, cap: 3200, eff: 0.94, desc: 'Server-Netzteil, 3200 W.' },
  { id: 'psu5000', cat: 'psu', brand: 'Ardentia', name: 'Server 5000 W Dual', cost: 950, color: 0x3b4a5a, cap: 5000, eff: 0.94, desc: 'Doppel-Server-Netzteil, 5000 W.' },
  { id: 'psu650eco', cat: 'psu', brand: 'Ardentia', name: '650 W Eco Platinum', cost: 165, color: 0xb6cfb9, cap: 650, eff: 0.94, desc: '650 W, 94 % Wirkungsgrad. Für effiziente kleine Rigs.' },
  { id: 'psu4200', cat: 'psu', brand: 'Ardentia', name: 'Server 4200 W Titanium', cost: 1550, color: 0x818ac0, cap: 4200, eff: 0.96, unlock: 'gridops', desc: '4200 W, 96 % Wirkungsgrad.' },
  // Grafikkarten
  { id: 'g_k210', cat: 'gpu', brand: 'Kiradyne', name: 'K-210 4 GB', cost: 95, color: 0x5a6e8c, hash: 12, watts: 110, heat: 12, desc: 'Günstige Einsteigerkarte, 1 Lüfter.' },
  { id: 'g_k340', cat: 'gpu', brand: 'Kiradyne', name: 'K-340 8 GB', cost: 150, color: 0x4a7bb0, hash: 21, watts: 135, heat: 15, desc: 'Preis-Leistungs-Tipp, 2 Lüfter.' },
  { id: 'g_vx460', cat: 'gpu', brand: 'Vorcan', name: 'VX-460 8 GB', cost: 260, color: 0x3a3f4f, hash: 32, watts: 160, heat: 18, desc: 'Effiziente Mittelklasse.' },
  { id: 'g_nx62', cat: 'gpu', brand: 'Nyvex', name: 'NX-6200 12 GB', cost: 420, color: 0xa83a3a, hash: 48, watts: 200, heat: 22, desc: 'Viel Speicher, gut für Etra.' },
  { id: 'g_vx580', cat: 'gpu', brand: 'Vorcan', name: 'VX-580 12 GB', cost: 640, color: 0x2a2f38, hash: 66, watts: 250, heat: 28, desc: 'Obere Mittelklasse, 3 Lüfter.' },
  { id: 'g_vx720', cat: 'gpu', brand: 'Vorcan', name: 'VX-720 16 GB', cost: 1050, color: 0x1f2430, hash: 95, watts: 320, heat: 36, desc: 'High-End, sehr effizient je Hash.' },
  { id: 'g_vx990', cat: 'gpu', brand: 'Vorcan', name: 'VX-990 Ultra 24 GB', cost: 1900, color: 0x111318, hash: 150, watts: 430, heat: 50, desc: '150 H/s bei 430 W.' },
  { id: 'g_k240e', cat: 'gpu', brand: 'Kiradyne', name: 'K-240 Eco 6 GB', cost: 240, color: 0x43897f, hash: 18, watts: 65, heat: 9, desc: 'Stromsparende Einstiegskarte. 18 H/s bei 65 W.' },
  { id: 'g_nx88e', cat: 'gpu', brand: 'Nyvex', name: 'NX-8800 Eco 16 GB', cost: 1520, color: 0x398d9f, hash: 86, watts: 172, heat: 21, unlock: 'eff', desc: 'Effizienzkarte für dicht bestückte Rigs. 86 H/s bei 172 W.' },
  { id: 'g_vx1100', cat: 'gpu', brand: 'Vorcan', name: 'VX-1100 Array 32 GB', cost: 5600, color: 0x8271b8, hash: 245, watts: 460, heat: 53, unlock: 'gridops', desc: '245 H/s pro Slot. Benötigt ein starkes Netzteil.' },
  // Kühlung
  { id: 'cl_air', cat: 'cool', brand: 'Glacira', name: 'Air 4 Lüfter-Set', cost: 50, color: 0x8ab0c8, watts: 15, heatMul: 0.85, desc: 'Zusätzliche Lüfter: Hitze −15 %.' },
  { id: 'cl_aio', cat: 'cool', brand: 'Glacira', name: 'AIO 360 Wasserkühlung', cost: 170, color: 0x4fd1c5, watts: 35, heatMul: 0.7, desc: 'Wasserkühlung: Hitze −30 %.' },
  { id: 'cl_loop', cat: 'cool', brand: 'Glacira', name: 'Dual Loop 480', cost: 460, color: 0x7694cf, watts: 55, heatMul: 0.58, unlock: 'eff', desc: 'Doppelkreislauf: Hitze −42 %.' },
  { id: 'cl_imm', cat: 'cool', brand: 'Glacira', name: 'Immersion Tank', cost: 850, color: 0x3a8fb8, watts: 90, heatMul: 0.45, unlock: 'immersion', desc: 'Tauchkühlung in Spezialöl: Hitze −55 %.' },
];

export interface PrebuiltDef {
  id: string;
  brand: string;
  name: string;
  kind: Kind;
  model: Model;
  hash: number;
  watts: number;
  heat: number;
  cost: number;
  color: number;
  ledColor: number;
  unlock?: string;
  desc: string;
}

/** Fertig-Miner: werden komplett gekauft, nicht zusammengebaut. */
export const PREBUILT: PrebuiltDef[] = [
  { id: 'eco-mini', brand: 'Brevalt', name: 'Mondo Mini', kind: 'cpu', model: 'tower', hash: 8, watts: 52, heat: 7, cost: 520, color: 0x5b8676, ledColor: 0x86e8bd, desc: 'Fertiger CPU-PC für Mondo. Niedriger Verbrauch bei 8 H/s.' },
  { id: 'etra-duo', brand: 'Nyxaro', name: 'Etra Duo G2', kind: 'gpu', model: 'tower', hash: 68, watts: 290, heat: 36, cost: 2250, color: 0x455582, ledColor: 0xb1a1ff, desc: 'Fertiger GPU-Tower für Etra mit 68 H/s.' },
  { id: 'asic-sprint', brand: 'Helix Forge', name: 'HF-Sprint 14', kind: 'asic', model: 'asic', hash: 540, watts: 1860, heat: 148, cost: 4850, color: 0x705782, ledColor: 0xdb9dff, desc: 'Kompakter ASIC für BitForge und Luxar.' },
  { id: 'asic-loop', brand: 'Monterra', name: 'MT-Cascade 38', kind: 'asic', model: 'asic', hash: 3800, watts: 7100, heat: 345, cost: 54000, color: 0x346b7a, ledColor: 0x68e9ea, unlock: 'immersion', desc: 'Flüssiggekühltes ASIC-System für große Räume und ein starkes Netz.' },
  { id: 'asic', brand: 'Helix Forge', name: 'HF-Titan 9', kind: 'asic', model: 'asic', hash: 260, watts: 1400, heat: 120, cost: 1900, color: 0xb8862b, ledColor: 0xffc857, desc: 'Einsteiger-ASIC. Nur ASIC-Algorithmen (BitForge, Luxar).' },
  { id: 'pro', brand: 'Monterra', name: 'MT-Pulse X', kind: 'asic', model: 'asic', hash: 900, watts: 3200, heat: 260, cost: 6500, color: 0xb0584c, ledColor: 0xff6a3d, desc: 'Profi-ASIC mit 4 Lüftern. Schafft Luxar.' },
  { id: 'hydro', brand: 'Helix Forge', name: 'HF-Titan 21 Hydro', kind: 'asic', model: 'asic', hash: 2200, watts: 5200, heat: 240, cost: 16500, color: 0x4a7bb0, ledColor: 0x7ab8ff, desc: 'Wassergekühlter Industrie-ASIC. Wenig Hitze je Hash.' },
  { id: 'qpu', brand: 'Qorvane', name: 'Quantum Q1', kind: 'quantum', model: 'quantum', hash: 3600, watts: 9000, heat: 520, cost: 40000, color: 0x3a8fb8, ledColor: 0x7af5ff, unlock: 'quantum', desc: 'Experimenteller Quantenrechner. Mint Qubit.' },
  { id: 'fusion', brand: 'Solarc', name: 'Fusion Core', kind: 'fusion', model: 'fusion', hash: 18000, watts: 22000, heat: 900, cost: 200000, color: 0xb04a8c, ledColor: 0xff7ac8, unlock: 'fusion', desc: 'Miniatur-Fusionsreaktor. Mint Helion.' },
  { id: 'hv-usb', brand: 'Hashvault', name: 'USB Miner', kind: 'asic', model: 'asic', hash: 22, watts: 74, heat: 9, cost: 280, color: 0x4d6974, ledColor: 0x4fd1c5, desc: 'Kompakter Einstieg in Etra-Mining mit niedrigem Verbrauch.' },
  { id: 'hv-ai', brand: 'Hashvault', name: 'AI Cluster', kind: 'quantum', model: 'quantum', hash: 18000, watts: 15500, heat: 900, cost: 320000, color: 0x4c5691, ledColor: 0xa699ff, unlock: 'neural', desc: 'Optimierte Rechenkerne für Etra, Luxar und Qubit.' },
  { id: 'hv-orbital', brand: 'Hashvault', name: 'Orbital Forge', kind: 'fusion', model: 'fusion', hash: 78000, watts: 28000, heat: 1900, cost: 1550000, color: 0x52467e, ledColor: 0xdf9fff, unlock: 'orbital', desc: 'Fusions-Cluster mit hoher Parallellast für Helion.' },
];

export interface Build {
  parts: Partial<Record<PartCat, string>>;
  gpus: string[];
}

export const BUILD_PRESETS: { id: string; name: string; build: Build }[] = [
  { id: 'budget', name: 'Budget-PC', build: { parts: { case: 'case_office', board: 'mb_t1', cpu: 'cpu_c4', ram: 'ram8', ssd: 'ssd128', psu: 'psu450' }, gpus: ['g_k210'] } },
  { id: 'etra', name: 'Etra-Tower', build: { parts: { case: 'case_gamer', board: 'mb_g2', cpu: 'cpu_c6', ram: 'ram16', ssd: 'ssd128', psu: 'psu750', cool: 'cl_air' }, gpus: ['g_k340', 'g_k340'] } },
  { id: 'open', name: '4-GPU-Rig', build: { parts: { case: 'case_frame6', board: 'mb_m6', cpu: 'cpu_c6', ram: 'ram16', ssd: 'ssd1t', psu: 'psu1200', cool: 'cl_air' }, gpus: ['g_vx460', 'g_vx460', 'g_vx460', 'g_vx460'] } },
];

export interface Machine {
  id: string;
  name: string;
  build?: Build;
  pre?: string;
}

export interface Blueprint {
  id: string;
  name: string;
  build: Build;
}

export interface MachineStat {
  name: string;
  kind: Kind;
  model: Model;
  hash: number;      // Roh-Hash (ohne Upgrades)
  watts: number;     // Verbrauch aus der Steckdose
  heat: number;
  color: number;
  ledColor: number;
  gpus: string[];
  maxGpu: number;
}

export const partDef = (id: string): PartDef => PARTS.find((p) => p.id === id)!;
export const prebuiltDef = (id: string): PrebuiltDef => PREBUILT.find((p) => p.id === id)!;
export const partLabel = (p: PartDef): string => `${p.brand} ${p.name}`;
export const emptyBuild = (): Build => ({ parts: {}, gpus: [] });
export const cloneBuild = (b: Build): Build => ({ parts: { ...b.parts }, gpus: [...b.gpus] });

/** Werte einer Konfiguration und alle Probleme, die einen Zusammenbau verhindern. */
export function buildStats(b: Build): MachineStat & { problems: string[]; dc: number; cap: number } {
  const get = (c: PartCat) => (b.parts[c] ? partDef(b.parts[c]!) : undefined);
  const cs = get('case');
  const mb = get('board');
  const cpu = get('cpu');
  const ram = get('ram');
  const ssd = get('ssd');
  const psu = get('psu');
  const cool = get('cool');
  const gpus = b.gpus.map(partDef);
  const problems: string[] = [];
  for (const c of REQUIRED) if (!b.parts[c]) problems.push(`${CATS[c].name} fehlt`);
  const maxGpu = Math.min(cs?.slots ?? 0, mb?.slots ?? 0);
  if (cs && mb && gpus.length > maxGpu) problems.push(`Nur ${maxGpu} Grafikkarte(n) möglich (Gehäuse ${cs.slots}, Board ${mb.slots})`);
  const dc = BASE_WATTS + (cpu?.watts ?? 0) + (cool?.watts ?? 0) + gpus.reduce((a, g) => a + (g.watts ?? 0), 0);
  const cap = psu?.cap ?? 0;
  if (psu && dc > cap) problems.push(`Netzteil zu schwach: ${dc} W von ${cap} W`);
  const raw = (cpu?.hash ?? 0) + gpus.reduce((a, g) => a + (g.hash ?? 0), 0);
  const hash = raw * (ram?.hashMul ?? 1) * (ssd?.hashMul ?? 1);
  const heat = ((cpu?.heat ?? 0) + gpus.reduce((a, g) => a + (g.heat ?? 0), 0)) * (cs?.heatMul ?? 1) * (cool?.heatMul ?? 1);
  const top = [...gpus].sort((x, y) => (y.hash ?? 0) - (x.hash ?? 0))[0];
  const rig = !!cs?.rig;
  return {
    name: rig ? `Rig ${gpus.length}× ${top ? top.name.split(' ')[0] : 'CPU'}` : top ? `PC mit ${top.name.split(' ')[0]}` : 'CPU-PC',
    kind: gpus.length ? 'gpu' : 'cpu',
    model: rig ? 'rig' : 'tower',
    hash, watts: dc / (psu?.eff ?? 0.85), heat,
    color: cs?.color ?? 0x6f7486,
    ledColor: top ? (top.color === 0x111318 || top.color === 0x1f2430 || top.color === 0x2a2f38 || top.color === 0x3a3f4f ? 0x7ee787 : shift(top.color)) : 0x4fd1c5,
    gpus: b.gpus, maxGpu, problems, dc, cap,
  };
}

/** Hellere Akzentfarbe aus einer Bauteilfarbe (für LEDs). */
function shift(c: number): number {
  const ch = (x: number) => Math.min(255, Math.round(x * 1.6 + 40));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
}

export function machineStats(m: Machine): MachineStat {
  if (m.pre) {
    const p = prebuiltDef(m.pre);
    return { name: m.name, kind: p.kind, model: p.model, hash: p.hash, watts: p.watts, heat: p.heat, color: p.color, ledColor: p.ledColor, gpus: [], maxGpu: 0 };
  }
  const s = buildStats(m.build ?? emptyBuild());
  return { ...s, name: m.name };
}

/** Alle Teile einer Konfiguration als Liste von IDs (für Kosten und Lager). */
export function buildPartList(b: Build): string[] {
  return [...CAT_ORDER.filter((c) => c !== 'gpu').map((c) => b.parts[c]).filter((x): x is string => !!x), ...b.gpus];
}

// ---------- Icons (SVG, eigener Stil, keine fremden Logos) ----------

const hx = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const fan = (cx: number, cy: number, r: number, col: string, dur = 0.7) =>
  `<circle cx="${cx}" cy="${cy}" r="${r + 1.2}" fill="#10131c"/><g class="spin" style="animation-duration:${dur}s"><path d="M${cx} ${cy - r}V${cy + r}M${cx - r} ${cy}H${cx + r}" stroke="${col}" stroke-width="1.8" stroke-linecap="round"/></g>`;

/** Vorschaubild eines Einzelteils. */
export function partIcon(p: PartDef): string {
  const c = hx(p.color);
  const lit = '#4fd1c5';
  let body = '';
  switch (p.cat) {
    case 'case':
      if (p.rig) {
        const n = Math.min(p.slots ?? 6, 8);
        const cards = Array.from({ length: n }, (_, k) => `<rect x="${8 + k * (48 / n)}" y="12" width="${48 / n - 2}" height="18" rx="1.5" fill="#3a3f4f"/>`).join('');
        body = `<rect x="4" y="32" width="56" height="5" rx="1" fill="${c}"/><rect x="5" y="8" width="3" height="27" fill="${c}"/><rect x="56" y="8" width="3" height="27" fill="${c}"/><rect x="4" y="7" width="56" height="3" rx="1" fill="${c}"/>${cards}`;
      } else {
        const rgb = (p.slots ?? 1) > 1;
        body = `<rect x="18" y="3" width="28" height="40" rx="3" fill="${c}" stroke="#0006"/><rect x="22" y="8" width="16" height="30" rx="2" fill="${rgb ? '#5f4fd166' : '#0003'}" stroke="${rgb ? '#c88bff' : '#0004'}"/>${fan(41, 12, 3, rgb ? '#ff6aa8' : '#b8c4e0')}${fan(41, 24, 3, rgb ? '#4fd1c5' : '#b8c4e0', 0.9)}<circle class="blink" cx="41" cy="36" r="1.6" fill="${lit}"/>`;
      }
      break;
    case 'board': {
      const n = Math.min(p.slots ?? 1, 6);
      const slots = Array.from({ length: n }, (_, k) => `<rect x="10" y="${9 + k * (26 / n)}" width="30" height="${Math.max(2, 26 / n - 2.5)}" rx="1" fill="#10131c"/>`).join('');
      body = `<rect x="5" y="4" width="54" height="38" rx="3" fill="${c}" stroke="#0006"/>${slots}<rect x="44" y="9" width="11" height="11" rx="1" fill="#c0c6d4"/><rect x="44" y="24" width="3" height="14" fill="#1f2430"/><rect x="49" y="24" width="3" height="14" fill="#1f2430"/><path d="M8 40h50" stroke="#ffc85788"/>`;
      break;
    }
    case 'cpu':
      body = `<rect x="16" y="7" width="32" height="32" rx="2" fill="#2f6b4a"/>${Array.from({ length: 7 }, (_, k) => `<path d="M${19 + k * 4} 5v3M${19 + k * 4} 38v3M14 ${10 + k * 4}h3M47 ${10 + k * 4}h3" stroke="#c8a86a" stroke-width="1.4"/>`).join('')}<rect x="21" y="12" width="22" height="22" rx="2" fill="${c}"/><text x="32" y="27" font-size="8" text-anchor="middle" fill="#10131c" font-weight="700">${p.name.split(' ')[0]}</text>`;
      break;
    case 'ram':
      body = `<rect x="4" y="13" width="56" height="18" rx="2" fill="${c}"/>${Array.from({ length: 6 }, (_, k) => `<rect x="${8 + k * 8.5}" y="16" width="6" height="9" fill="#10131c"/>`).join('')}${Array.from({ length: 14 }, (_, k) => `<rect x="${6 + k * 3.8}" y="31" width="2" height="4" fill="#c8a86a"/>`).join('')}`;
      break;
    case 'ssd':
      body = (p.hashMul ?? 1) > 1
        ? `<rect x="6" y="17" width="52" height="12" rx="2" fill="${c}"/><rect x="12" y="19" width="10" height="8" fill="#10131c"/><rect x="26" y="19" width="18" height="8" fill="#10131c"/><rect x="50" y="19" width="5" height="8" fill="#c8a86a"/>`
        : `<rect x="14" y="8" width="36" height="30" rx="3" fill="${c}" stroke="#0006"/><rect x="18" y="14" width="28" height="10" rx="1" fill="#fff2"/><circle class="blink" cx="44" cy="32" r="1.6" fill="${lit}"/>`;
      break;
    case 'psu':
      body = `<rect x="8" y="7" width="48" height="32" rx="3" fill="${c}" stroke="#0006"/>${fan(26, 23, 10, '#b8c4e0', 0.8)}<rect x="42" y="12" width="9" height="6" rx="1" fill="#10131c"/><text x="46" y="33" font-size="7" text-anchor="middle" fill="#ffc857" font-weight="700">${p.cap! >= 1000 ? `${p.cap! / 1000}k` : p.cap}</text>`;
      break;
    case 'gpu': {
      const fans = (p.hash ?? 0) >= 60 ? 3 : (p.hash ?? 0) >= 20 ? 2 : 1;
      const accent = (p.hash ?? 0) >= 95 ? '#ffc857' : (p.hash ?? 0) >= 48 ? '#ff6aa8' : '#4fd1c5';
      const f = Array.from({ length: fans }, (_, k) => fan(fans === 1 ? 30 : 14 + k * (32 / (fans - 1)), 21, fans === 3 ? 6 : 8, accent, 0.5 + k * 0.1)).join('');
      body = `<rect x="3" y="8" width="54" height="27" rx="4" fill="${c}" stroke="#0006"/><rect x="3" y="8" width="54" height="5" rx="3" fill="#fff1"/>${f}<rect x="57" y="12" width="4" height="20" fill="#7a8494"/><path d="M10 36h36" stroke="#c8a86a" stroke-width="3"/><path d="M5 33h50" stroke="${accent}" stroke-width="1.2" opacity=".8"/>`;
      break;
    }
    case 'cool':
      body = (p.heatMul ?? 1) < 0.5
        ? `<rect x="8" y="6" width="48" height="34" rx="3" fill="#1f2430" stroke="${c}"/><rect x="11" y="16" width="42" height="21" rx="2" fill="${c}88"/>${Array.from({ length: 5 }, (_, k) => `<circle cx="${16 + k * 8}" cy="${30 - (k % 2) * 6}" r="1.6" fill="#fff8"/>`).join('')}`
        : (p.heatMul ?? 1) < 0.8
          ? `<rect x="4" y="8" width="56" height="16" rx="2" fill="#1f2430"/>${fan(14, 16, 6, '#4fd1c5')}${fan(32, 16, 6, '#4fd1c5')}${fan(50, 16, 6, '#4fd1c5')}<path d="M20 26c0 8 10 10 12 14" stroke="${c}" stroke-width="2.5" fill="none"/><circle cx="34" cy="40" r="5" fill="#2a2f45" stroke="${c}"/>`
          : `${fan(14, 22, 8, '#8ab0c8')}${fan(32, 22, 8, '#8ab0c8', 0.8)}${fan(50, 22, 8, '#8ab0c8', 0.9)}`;
      break;
  }
  return `<svg width="58" height="46" viewBox="0 0 64 46">${body}</svg>`;
}

/** Vorschaubild einer kompletten Maschine. */
export function machineIcon(st: MachineStat): string {
  const c = hx(st.color);
  const led = hx(st.ledColor);
  let body = '';
  switch (st.model) {
    case 'tower':
      body = `<rect x="18" y="3" width="28" height="40" rx="3" fill="${c}" stroke="#0006"/><rect x="22" y="8" width="16" height="30" rx="2" fill="${led}33" stroke="${led}88"/>${st.gpus.map((_, k) => `<rect x="23" y="${22 + k * 6}" width="14" height="4" rx="1" fill="#3a3f4f"/>`).join('')}${fan(41, 12, 3, '#b8c4e0')}<circle class="blink" cx="41" cy="36" r="1.6" fill="${led}"/>`;
      break;
    case 'rig': {
      const n = Math.max(1, st.gpus.length);
      const cards = st.gpus.map((g, k) => `<rect x="${8 + k * (48 / n)}" y="12" width="${48 / n - 2}" height="18" rx="1.5" fill="${hx(partDef(g).color)}" stroke="${led}66"/>`).join('');
      body = `<rect x="4" y="32" width="56" height="5" rx="1" fill="${c}"/><rect x="5" y="8" width="3" height="27" fill="${c}"/><rect x="56" y="8" width="3" height="27" fill="${c}"/><rect x="4" y="7" width="56" height="3" rx="1" fill="${c}"/>${cards}<circle class="blink" cx="54" cy="35" r="1.6" fill="${led}"/>`;
      break;
    }
    case 'asic': {
      const n = st.hash >= 2000 ? 2 : st.hash >= 800 ? 4 : 2;
      const f = Array.from({ length: n }, (_, k) => fan(n === 2 ? 20 + k * 24 : 12 + k * 13, 20, n === 2 ? 7 : 5, led, 0.5 + k * 0.1)).join('');
      body = `<rect x="3" y="4" width="58" height="34" rx="5" fill="${c}" stroke="#0006"/><rect x="3" y="4" width="58" height="7" rx="5" fill="#fff2"/>${f}<circle class="blink" cx="55" cy="9" r="2.2" fill="${led}"/>${st.hash >= 2000 ? `<path d="M6 42h52" stroke="#7ab8ff" stroke-width="3"/>` : ''}`;
      break;
    }
    case 'quantum':
      body = `<ellipse cx="32" cy="38" rx="20" ry="5" fill="#1f2430"/><rect x="16" y="8" width="32" height="30" rx="4" fill="${c}"/><ellipse cx="32" cy="8" rx="16" ry="4" fill="#bdf6ff"/><circle class="blink" cx="32" cy="23" r="6" fill="${led}"/><circle cx="32" cy="23" r="10" fill="none" stroke="${led}88"/>`;
      break;
    case 'fusion':
      body = `<rect x="12" y="10" width="40" height="30" rx="5" fill="${c}"/><circle cx="32" cy="25" r="11" fill="#10131c" stroke="${led}" stroke-width="2"/><circle class="blink" cx="32" cy="25" r="5" fill="${led}"/><path d="M14 10l6-6h24l6 6" stroke="${c}" stroke-width="3" fill="none"/>`;
      break;
  }
  return `<svg width="58" height="46" viewBox="0 0 64 46">${body}</svg>`;
}
