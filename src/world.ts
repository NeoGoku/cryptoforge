// Fiktive Spielwelt: Rich List aller Wallets. Alle Personen, Firmen und Adressen sind erfunden.
import { COINS } from './config';

export interface Holder {
  id: string;
  name: string;
  tag: string;          // Kurzbeschreibung
  kind: 'person' | 'fund' | 'exchange' | 'whale';
  addr: string;
  hold: Record<string, number>;
  txs: number;
  prev: number;         // Wert beim letzten Schnappschuss (für Trend)
}

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeAddr(r: () => number = Math.random): string {
  let s = 'fx1q';
  for (let i = 0; i < 38; i++) s += CHARSET[Math.floor(r() * CHARSET.length)];
  return s;
}

export const shortAddr = (a: string) => `${a.slice(0, 8)}…${a.slice(-5)}`;

const FIRST = ['Lena', 'Malik', 'Sofia', 'Jonas', 'Aiko', 'Mateo', 'Nora', 'Emil', 'Yara', 'Theo', 'Ines', 'Ravi', 'Clara', 'Oskar', 'Leona', 'Darius', 'Mira', 'Henrik', 'Zoe', 'Kenji', 'Alina', 'Bruno', 'Selin', 'Viktor', 'Elif', 'Noah', 'Ida', 'Lukas', 'Amara', 'Finn'];
const LAST = ['Varnholt', 'Kessimor', 'Dranvik', 'Ostrelli', 'Belmaro', 'Quintaro', 'Harsveld', 'Talveri', 'Velnor', 'Strathby', 'Ambrevik', 'Lorcane', 'Faldrek', 'Nimbrecht', 'Corvelle', 'Draxen', 'Eltmoor', 'Grauvik', 'Marquell', 'Tessendorf'];
const HANDLES = ['frostbyte', 'hashqueen', 'blockbaron', 'coldwallet', 'diamondpaws', 'gpu_goblin', 'moonshot', 'nodewalker', 'satsstacker', 'rigmaster', 'chainghost', 'etrafan'];
const JOBS = ['Früher Miner', 'Daytrader', 'Rig-Betreiber', 'Entwickler', 'Investorin', 'Hardware-Händler', 'Langzeit-Halter', 'Streamer', 'Studentin', 'Unternehmer'];
const ORGS: [string, string, Holder['kind']][] = [
  ['Orbis Exchange', 'Cold Wallet einer Börse', 'exchange'],
  ['Halvern Capital', 'Krypto-Fonds', 'fund'],
  ['Genesis-Wallet', 'Inaktiv seit Jahren', 'whale'],
  ['Northgate Digital Fund', 'Institutioneller Fonds', 'fund'],
  ['Kairo Ventures', 'Wagniskapital', 'fund'],
  ['Unbekannter Wal', 'Anonym', 'whale'],
  ['Bluefjord Treasury', 'Firmenreserve', 'fund'],
  ['Lumen Exchange', 'Hot Wallet einer Börse', 'exchange'],
  ['Unbekannter Wal', 'Anonym', 'whale'],
  ['Stratos Mining AG', 'Mining-Konzern', 'fund'],
];

/** Erzeugt die Rich List deterministisch (gleich bei jedem Start). */
export function makeHolders(): Holder[] {
  const r = rng(424242);
  const out: Holder[] = [];
  for (let i = 0; i < 60; i++) {
    const wealth = 2.2e9 * Math.pow(0.81, i) * (0.85 + r() * 0.3);
    const org = i < 24 && r() < 0.42 ? ORGS[Math.floor(r() * ORGS.length)] : null;
    let name: string;
    let tag: string;
    let kind: Holder['kind'] = 'person';
    if (org) {
      [name, tag, kind] = org;
    } else {
      const f = FIRST[Math.floor(r() * FIRST.length)];
      const l = LAST[Math.floor(r() * LAST.length)];
      name = r() < 0.3 ? `@${HANDLES[Math.floor(r() * HANDLES.length)]}${Math.floor(r() * 90 + 10)}` : `${f} ${l}`;
      tag = JOBS[Math.floor(r() * JOBS.length)];
    }
    // Vermögen auf Coins verteilen
    const w = COINS.map(() => Math.pow(r(), 2));
    const sum = w.reduce((a, b) => a + b, 0);
    const hold: Record<string, number> = {};
    COINS.forEach((c, k) => { hold[c.id] = (wealth * w[k] / sum) / c.base; });
    out.push({ id: `h${i}`, name, tag, kind, addr: makeAddr(r), hold, txs: Math.floor(50 + r() * 40000), prev: wealth });
  }
  return out;
}

export const holderValue = (h: Holder, prices: Record<string, number>) =>
  COINS.reduce((a, c) => a + (h.hold[c.id] ?? 0) * (prices[c.id] ?? c.base), 0);
