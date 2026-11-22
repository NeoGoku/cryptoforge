import { COINS, ROOMS } from './config';
import { CHIP_LIMIT, CONSUMABLES, CONTRACTS, COOLING, CREW, LAYOUTS, MODS, ORDER_LIMIT, ORDER_SLOTS_PER_CHIP, PROVIDERS, SITE_SHOP, SKILLS } from './operations-data';
import type { Metric } from './operations-data';

export type Keys<T> = Extract<keyof T, string>;
export type Provider = Keys<typeof PROVIDERS>;
export type Layout = Keys<typeof LAYOUTS>;
export type CrewRole = Keys<typeof CREW>;
export type Mod = Keys<typeof MODS>;
export type SiteItem = Keys<typeof SITE_SHOP>;
export type Skill = Keys<typeof SKILLS>;
export type Consumable = Keys<typeof CONSUMABLES>;
export type Cooling = Keys<typeof COOLING>;
export type ContractKind = typeof CONTRACTS[number]['kind'];

export interface Contract {
  id: string;
  kind: ContractKind;
  coin: string;
  amount: number;
  cash: number;
  offered: number;
  due: number;
  baseline: number;
}
export type BatteryMode = 'auto' | 'reserve' | 'off';
export type TariffPolicy = 'always' | 'peak' | 'night';
export type OutagePlan = 'manual' | 'battery' | 'service';

export interface RigSettings {
  crew?: CrewRole;
  xp: number;
  mods: Mod[];
  target?: string;
  secondary?: string;
}

export interface Order {
  id: number;
  coin: string;
  side: 'buy' | 'sell';
  amount: number;
  limit: number;
}

export interface Ledger {
  day: number;
  coin: string;
  type: 'deposit' | 'withdraw' | 'yield';
  amount: number;
}

interface Period {
  index: number;
  baseline: Partial<Record<Metric, number>>;
  claimed: string[];
}

export interface OperationsState {
  clock: number;
  arrears: number;
  shutdownDays: number;
  restructures: number;
  grid: {
    level: number;
    provider: Provider;
    batteryLevel: number;
    charge: number;
    batteryMode: BatteryMode;
    guard: boolean;
    policy: TariffPolicy;
    plan: OutagePlan;
  };
  cooling: Partial<Record<string, Cooling>>;
  layouts: Partial<Record<string, Layout>>;
  sites: Record<string, SiteItem[]>;
  crew: Record<CrewRole, number>;
  rigs: Record<string, RigSettings>;
  mods: Partial<Record<Mod, number>>;
  leases: Record<string, { remaining: number; due: number; payment: number }>;
  treasury: Record<string, { amount: number; unlock: number; since: number }>;
  yieldOn: boolean;
  yieldDays: number;
  yieldTotal: number;
  yieldHistory: { day: number; eur: number }[];
  ledger: Ledger[];
  nextOrder: number;
  orders: Order[];
  filled: number;
  autoCoins: Partial<Record<string, boolean>>;
  daily: Period;
  weekly: Period;
  projects: string[];
  contracts: Contract[];
  contractClaims: string[];
  traders: Record<string, number>;
  chips: number;
  skills: Partial<Record<Skill, number>>;
  consumables: Partial<Record<Consumable, number>>;
  effects: Partial<Record<Consumable, number>>;
}

export const keys = <T extends object>(table: T): Keys<T>[] => Object.keys(table) as Keys<T>[];
export const owns = <T extends object>(table: T, id: string): id is Keys<T> => Object.prototype.hasOwnProperty.call(table, id);
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const number = (v: unknown, max = Number.MAX_SAFE_INTEGER): number => typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : 0;
const integer = (v: unknown, max?: number): number => Math.floor(number(v, max));
const belongs = <T extends string>(v: unknown, values: readonly T[]): v is T => typeof v === 'string' && values.includes(v as T);
const pick = <T extends string>(v: unknown, values: readonly T[], fallback: T): T => belongs(v, values) ? v : fallback;
const ids = (v: unknown): string[] => [...new Set(list(v).filter((x): x is string => typeof x === 'string' && /^[a-z0-9-]{1,40}$/.test(x)))].slice(0, 64);

export function restoreOperations(input?: unknown, machines: string[] = []): OperationsState {
  const raw = object(input);
  const grid = object(raw.grid);
  const s: OperationsState = {
    clock: number(raw.clock),
    arrears: number(raw.arrears),
    shutdownDays: integer(raw.shutdownDays, 3),
    restructures: integer(raw.restructures),
    grid: {
      level: integer(grid.level, 20),
      provider: pick(grid.provider, keys(PROVIDERS), 'local'),
      batteryLevel: integer(grid.batteryLevel, 10),
      charge: number(grid.charge),
      batteryMode: pick(grid.batteryMode, ['auto', 'reserve', 'off'], 'auto'),
      guard: grid.guard === true,
      policy: pick(grid.policy, ['always', 'peak', 'night'], 'always'),
      plan: pick(grid.plan, ['manual', 'battery', 'service'], 'manual'),
    },
    cooling: {}, layouts: {}, sites: {}, crew: { hash: 0, cool: 0, power: 0 }, rigs: {}, mods: {}, leases: {},
    treasury: {}, yieldOn: raw.yieldOn !== false, yieldDays: integer(raw.yieldDays), yieldTotal: number(raw.yieldTotal),
    yieldHistory: [], ledger: [], nextOrder: integer(raw.nextOrder) || 1, orders: [], filled: integer(raw.filled), autoCoins: {},
    daily: { index: -1, baseline: {}, claimed: [] }, weekly: { index: -1, baseline: {}, claimed: [] },
    projects: ids(raw.projects), contracts: [], contractClaims: ids(raw.contractClaims).slice(0, 8), traders: {}, chips: integer(raw.chips, CHIP_LIMIT), skills: {}, consumables: {}, effects: {},
  };
  s.grid.charge = Math.min(s.grid.charge, 0.7 * s.grid.batteryLevel);
  for (const r of ROOMS) {
    s.cooling[r.id] = pick(object(raw.cooling)[r.id], keys(COOLING), 'normal');
    s.layouts[r.id] = pick(object(raw.layouts)[r.id], keys(LAYOUTS), 'standard');
    s.sites[r.id] = [...new Set(list(object(raw.sites)[r.id]).filter((id): id is SiteItem => belongs(id, keys(SITE_SHOP))))];
  }
  const available: Record<CrewRole, number> = { hash: 0, cool: 0, power: 0 };
  for (const role of keys(CREW)) available[role] = s.crew[role] = integer(object(raw.crew)[role], 60);
  const coinIds = COINS.map((c) => c.id);
  for (const id of machines) {
    const item = object(object(raw.rigs)[id]);
    if (Object.keys(item).length) {
      const crew = belongs(item.crew, keys(CREW)) && available[item.crew] > 0 ? item.crew : undefined;
      if (crew) available[crew]--;
      s.rigs[id] = {
        crew, xp: crew ? number(item.xp, 900) : 0,
        mods: [...new Set(list(item.mods).filter((mod): mod is Mod => belongs(mod, keys(MODS))))].slice(0, 2),
        target: belongs(item.target, coinIds) ? item.target : undefined,
        secondary: belongs(item.secondary, coinIds) ? item.secondary : undefined,
      };
    }
    const lease = object(object(raw.leases)[id]);
    if (number(lease.remaining) && number(lease.due) && number(lease.payment)) {
      s.leases[id] = { remaining: integer(lease.remaining, 3), due: integer(lease.due), payment: number(lease.payment) };
    }
  }

  for (const id of keys(MODS)) s.mods[id] = integer(object(raw.mods)[id], 3);
  for (const id of keys(SKILLS)) s.skills[id] = integer(object(raw.skills)[id], SKILLS[id].max);
  for (const id of keys(CONSUMABLES)) {
    s.consumables[id] = integer(object(raw.consumables)[id], 99);
    s.effects[id] = number(object(raw.effects)[id], s.clock + CONSUMABLES[id].sec);
  }
  for (const { id } of COINS) {
    const entry = object(object(raw.treasury)[id]);
    const amount = number(entry.amount);
    if (amount > 0) s.treasury[id] = { amount, unlock: integer(entry.unlock), since: integer(entry.since) };
    if (object(raw.autoCoins)[id] === false) s.autoCoins[id] = false;
  }
  for (const entry of list(raw.orders)) {
    const { id, side, coin, amount, limit } = object(entry);
    if (!Number.isSafeInteger(id) || integer(id) < 1 || s.orders.some((o) => o.id === id)) continue;
    if (!belongs(side, ['buy', 'sell']) || !belongs(coin, coinIds) || !number(amount) || !number(limit) || !Number.isFinite(Number(amount) * Number(limit))) continue;
    s.orders.push({ id: integer(id), coin, side, amount: number(amount), limit: number(limit) });
    s.nextOrder = Math.max(s.nextOrder, integer(id) + 1);
    if (s.orders.length >= ORDER_LIMIT + SKILLS.contract.max * ORDER_SLOTS_PER_CHIP) break;
  }
  for (const entry of list(raw.contracts).slice(0, 4)) {
    const row = object(entry);
    const id = ids([row.id])[0];
    if (!id || !belongs(row.kind, CONTRACTS.map((c) => c.kind)) || !belongs(row.coin, coinIds) || !number(row.amount) || !number(row.cash)) continue;
    s.contracts.push({
      id, kind: row.kind, coin: row.coin, amount: number(row.amount), cash: number(row.cash),
      offered: integer(row.offered), due: integer(row.due), baseline: number(row.baseline),
    });
  }
  for (const value of list(raw.ledger).slice(0, 24)) {
    const row = object(value);
    if (belongs(row.coin, coinIds) && belongs(row.type, ['deposit', 'withdraw', 'yield']) && number(row.amount)) {
      s.ledger.push({ day: integer(row.day), coin: row.coin, type: row.type, amount: number(row.amount) });
    }
  }
  for (const entry of list(raw.yieldHistory).slice(0, 14)) {
    const row = object(entry);
    if (number(row.eur)) s.yieldHistory.push({ day: integer(row.day), eur: number(row.eur) });
  }
  for (const type of ['daily', 'weekly'] as const) {
    const period = object(raw[type]);
    if (typeof period.index === 'number' && Number.isSafeInteger(period.index) && period.index >= 0) {
      s[type] = { index: period.index, baseline: {}, claimed: ids(period.claimed) };
      const baseline = object(period.baseline);
      const metrics = ['clicks', 'sold', 'built', 'repair', 'orders'] as const;
      for (const key of metrics) s[type].baseline[key] = number(baseline[key]);
    }
  }
  for (const id of ['luna', 'mark', 'ivy', 'otto', 'nova', 'kira', 'crypto']) {
    if (Object.prototype.hasOwnProperty.call(object(raw.traders), id)) s.traders[id] = integer(object(raw.traders)[id]);
  }
  return s;
}
