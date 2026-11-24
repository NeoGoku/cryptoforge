import { COINS, ROOMS, coinDef, roomDef } from './config';
import type { CoinDef } from './config';
import type { Game, SaveData } from './game';
import {
  CHIP_LIMIT, COLLECTIONS, CONSUMABLES, CONTRACTS, COOLING, CREW, DAILY, DAY_SECONDS, GRID_PROFILES, LAYOUTS, MODS, ORDER_LIMIT, ORDER_SLOTS_PER_CHIP,
  DESK_UPGRADES, PROJECTS, PROVIDERS, SITE_SHOP, SKILLS, WALLET_TIERS, WEEKLY, YIELD_APY,
} from './operations-data';
import type { Effect, Metric, Objective, Target } from './operations-data';
import { keys, owns, restoreOperations } from './operations-state';
import type { BatteryMode, Consumable, Contract, Cooling, CrewRole, Layout, Ledger, Mod, Order, OutagePlan, Provider, RigSettings, SiteItem, Skill, TariffPolicy } from './operations-state';

const EPS = 1e-9;
const WEEK_DAYS = 7;
const DAY_METRICS = ['clicks', 'sold', 'built', 'repair', 'orders'] as const;
const DAY_METRIC_SET = new Set<Metric>(DAY_METRICS);
const positive = (value: number) => Number.isFinite(value) && value > EPS;
const compact = (value: number) => value.toLocaleString('de-DE', { maximumFractionDigits: 4 });
const cashText = (value: number) => `${compact(value)} €`;

export class Operations {
  constructor(private game: Game, private changed: () => void) {}

  get s() { return this.game.s.ops; }
  get day() { return Math.floor(this.s.clock / DAY_SECONDS) + 1; }
  get hour() { return this.s.clock % DAY_SECONDS / DAY_SECONDS * 24; }
  get week() { return Math.floor((this.day - 1) / WEEK_DAYS) + 1; }
  get batteryMax() { return 0.7 * this.s.grid.batteryLevel; }
  get gridCost() { return Math.round(800 * 1.48 ** this.s.grid.level); }
  get batteryCost() { return Math.round(750 * 1.55 ** this.s.grid.batteryLevel); }
  get orderLimit() { return ORDER_LIMIT + this.level('contract') * ORDER_SLOTS_PER_CHIP; }
  get orderCash() { return this.s.orders.reduce((sum, o) => sum + (o.side === 'buy' ? o.amount * o.limit : 0), 0); }
  get leaseBuyouts() { return Object.values(this.s.leases).reduce((sum, l) => sum + l.payment * l.remaining, 0); }

  level(id: Skill) { return this.s.skills[id] ?? 0; }
  effect(id: Consumable) { return Math.max(0, (this.s.effects[id] ?? 0) - this.s.clock); }

  private fail(message: string): false {
    this.game.toast(message);
    return false;
  }

  private pay(amount: number): boolean {
    if (this.game.s.cash + EPS < amount) return this.fail('Zu wenig Bargeld.');
    this.game.s.cash -= amount;
    return true;
  }

  collectionEffects(projected?: { rigs: number; built: number }): Record<Effect, number> {
    const result: Record<Effect, number> = { click: 1, hash: 1, power: 1, capacity: 1, cost: 1, reward: 1, crew: 1, cool: 1 };
    for (const c of COLLECTIONS) {
      const qualifies = c.targets.every(({ metric, amount }) => {
        const extra = metric === 'rigs' ? projected?.rigs : metric === 'built' ? projected?.built : 0;
        return this.metric(metric) + (extra ?? 0) >= amount;
      });
      if (!qualifies) continue;
      for (const effect of keys(c.bonuses)) result[effect] *= c.bonuses[effect]!;
    }
    return result;
  }

  gridCapacity(effects = this.collectionEffects()) {
    return (1.5 + this.s.grid.level * 1.5 + ROOMS.reduce((sum, room) => sum + (this.game.s.rooms[room.id] ? room.gridKw ?? 0.55 : 0), 0))
      * PROVIDERS[this.s.grid.provider].capacity * (1 + 0.06 * this.level('backbone')) * effects.capacity;
  }

  tariffAt(hour: number) { return hour < 7 || hour >= 22 ? 0.76 : hour >= 17 ? 1.36 : 1; }
  priceFactor(hour = this.hour) { return this.tariffAt(hour) * PROVIDERS[this.s.grid.provider].price; }

  gridLoad(kw: number, effects = this.collectionEffects(), hour = this.hour) {
    const { batteryMode, charge, batteryLevel, guard, policy } = this.s.grid;
    const capacity = this.gridCapacity(effects) * this.game.gridCapacityFactor();
    const backup = batteryMode === 'auto' && charge > EPS ? Math.min(Math.max(0, kw - capacity), 0.65 * batteryLevel) : 0;
    const usable = Math.min(kw, (guard ? 0.88 : 1) * capacity + backup);
    const scheduled = policy === 'night' && this.tariffAt(hour) !== 0.76 ? 0 : policy === 'peak' && this.tariffAt(hour) > 1 ? 0.65 : 1;
    const throttle = (kw > EPS ? usable / kw : 1) * scheduled;
    const discharge = Math.min(backup, Math.max(0, kw * throttle - capacity));
    const grid = kw * throttle - discharge;
    const charging = batteryMode !== 'off' && charge < this.batteryMax - EPS && this.tariffAt(hour) <= 1
      ? Math.min(Math.max(0, (guard ? 0.88 : 1) * capacity - grid), batteryLevel * 0.3)
      : 0;
    return { demand: kw, capacity, throttle, grid: grid + charging, charging, discharge };
  }

  debtStage() {
    const debt = this.s.arrears;
    if (debt >= 600) return { name: 'Abschaltung', output: 0 };
    if (debt >= 300) return { name: 'Notbetrieb', output: 0.62 };
    if (debt >= 120) return { name: 'Sanktion', output: 0.88 };
    if (debt > EPS) return { name: 'Mahnung', output: 1 };
    return { name: 'Stabil', output: 1 };
  }

  chargeOperations(amount: number) {
    const paid = Math.min(amount, Math.max(0, this.game.s.cash));
    this.game.s.cash -= paid;
    if (amount - paid > EPS) this.s.arrears += amount - paid;
  }

  repayArrears() {
    const amount = Math.min(this.s.arrears, Math.max(0, this.game.s.cash));
    if (amount <= EPS) return;
    this.s.arrears -= amount;
    this.game.s.cash -= amount;
    if (this.debtStage().output > 0) this.s.shutdownDays = 0;
    this.changed();
  }

  canRestructure() { return this.s.shutdownDays >= 3 && this.debtStage().output === 0; }

  restructure() {
    if (!this.canRestructure()) return;
    const game = this.game;
    const leased = new Set(Object.keys(this.s.leases));
    for (const id of leased) game.removeRig(id);
    const owned = Object.keys(game.s.machines).filter((id) => id !== 'm1');
    const seized = owned.sort((a, b) => game.machineValue(game.s.machines[b]) - game.machineValue(game.s.machines[a]))
      .slice(0, Math.ceil(owned.length * 0.35));
    for (const id of seized) game.removeRig(id);
    for (const [id, rig] of Object.entries(this.s.rigs)) {
      if (rig.crew) this.s.rigs[id] = { ...rig, crew: undefined, xp: 0 };
    }
    this.s.crew = { hash: 0, cool: 0, power: 0 };
    this.s.arrears = 0;
    this.s.shutdownDays = 0;
    this.s.restructures++;
    game.s.active = 'kid';
    game.s.cash = Math.max(game.s.cash, 350, Math.ceil(game.rentPerSec * 180));
    game.toast(`Wiederaufbau gestartet. ${seized.length} Miner eingezogen, ${leased.size} Leasinggeräte zurückgegeben.`);
    this.changed();
  }

  advance(dt: number) {
    const before = this.day;
    const previousClock = this.s.clock;
    this.s.clock += dt;
    this.accrueRentals(previousClock, this.s.clock);
    if (this.day !== before) {
      this.settleYield();
      this.settleLeases();
      this.s.shutdownDays = this.debtStage().output === 0 ? Math.min(3, this.s.shutdownDays + 1) : 0;
      this.expireContracts();
      this.syncPeriods();
      this.changed();
    }
  }

  updateGrid(dt: number, load: ReturnType<Operations['gridLoad']>) {
    if (this.game.s.ev?.id === 'outage') return;
    const { charge } = this.s.grid;
    this.s.grid.charge = Math.max(0, Math.min(this.batteryMax, charge + (load.charging - load.discharge) * dt / DAY_SECONDS));
  }

  upgradeGrid(battery = false) {
    const g = this.s.grid;
    if (battery ? g.batteryLevel >= 10 : g.level >= 20) return this.fail('Maximalstufe erreicht.');
    if (!this.pay(battery ? this.batteryCost : this.gridCost)) return;
    if (battery) {
      g.batteryLevel++;
      g.charge += 0.35;
    } else g.level++;
    this.changed();
  }

  provider(id: Provider) {
    if (id === this.s.grid.provider) return;
    if (!this.pay(PROVIDERS[id].cost)) return;
    this.s.grid.provider = id;
    this.changed();
  }

  configureGrid(key: 'batteryMode', value: BatteryMode): void;
  configureGrid(key: 'policy', value: TariffPolicy): void;
  configureGrid(key: 'plan', value: OutagePlan): void;
  configureGrid(key: 'guard', value: boolean): void;
  configureGrid(key: string, value: string | boolean) {
    const g = this.s.grid;
    if (key === 'batteryMode' && (value === 'auto' || value === 'reserve' || value === 'off')) g.batteryMode = value;
    else if (key === 'policy' && (value === 'always' || value === 'peak' || value === 'night')) g.policy = value;
    else if (key === 'plan' && (value === 'manual' || value === 'battery' || value === 'service')) g.plan = value;
    else if (key === 'guard' && typeof value === 'boolean') g.guard = value;
    else return;
    this.changed();
  }

  applyGridProfile(id: keyof typeof GRID_PROFILES) {
    const { guard, policy, batteryMode, plan } = GRID_PROFILES[id];
    Object.assign(this.s.grid, { guard, policy, batteryMode, plan });
    this.changed();
  }

  outageCost() {
    return Math.round(Math.max(75, this.gridCapacity() * 20));
  }

  resolveOutage(mode: 'battery' | 'service', silent = false): boolean {
    const e = this.game.s.ev;
    const fail = (text: string) => silent ? false : this.fail(text);
    if (e?.id !== 'outage') return false;
    if (mode === 'battery') {
      if (this.s.grid.batteryMode === 'off' || this.s.grid.charge < 0.25) return fail('Notstrom benötigt einen aktiven Akku mit mindestens 0,25 kWh.');
      this.s.grid.charge -= 0.25;
    } else {
      const cost = this.outageCost();
      if (this.game.s.cash < cost) return fail('Zu wenig Bargeld.');
      this.game.s.cash -= cost;
    }
    this.game.s.ev = null;
    this.game.toast(mode === 'battery' ? 'Notstrom hat den Betrieb wiederhergestellt.' : 'Entstördienst hat das Netz wiederhergestellt.');
    if (!silent) this.changed();
    return true;
  }

  layout(room: string, layout: Layout) {
    if (!this.game.s.rooms[room]) return;
    this.s.layouts[room] = layout;
    this.changed();
  }

  buySite(room: string, id: SiteItem) {
    const items = this.s.sites[room];
    if (!this.game.s.rooms[room] || !items || items.includes(id)) return;
    if (!this.pay(SITE_SHOP[id].cost)) return;
    items.push(id);
    this.changed();
  }

  deskLevel(room: string) { return this.s.desks[room] ?? 0; }

  buyDesk(room: string, expectedLevel: number) {
    if (!this.game.s.rooms[room]) return;
    const level = this.deskLevel(room);
    if (expectedLevel !== level) return;
    const next = DESK_UPGRADES[level];
    if (!next || (next.tech && !this.game.has(next.tech)) || !this.pay(next.cost)) return;
    this.s.desks[room] = level + 1;
    this.changed();
  }

  cooling(room: string, value: Cooling) {
    if (!this.game.s.rooms[room]) return;
    this.s.cooling[room] = value;
    this.changed();
  }

  siteEffects(room: string, rawHeat: number, limit: number) {
    const items = this.s.sites[room] ?? [];
    const layout = LAYOUTS[this.s.layouts[room] ?? 'standard'];
    let deskHash = 1, deskPower = 1, deskWear = 1;
    for (let i = 0; i < this.deskLevel(room); i++) {
      const desk = DESK_UPGRADES[i];
      deskHash *= desk.hash;
      deskPower *= desk.power;
      deskWear *= desk.wear;
    }
    const siteHeat = layout.cooling * (items.includes('ducts') ? 0.88 : 1);
    const mode = this.s.cooling[room] ?? 'normal';
    const ratio = rawHeat * siteHeat / limit;
    const activeMode = mode === 'auto' ? (ratio >= 0.9 ? 'boost' : ratio < 0.6 ? 'quiet' : 'normal') : mode;
    return {
      heat: siteHeat * COOLING[activeMode].heat,
      power: deskPower * layout.power * COOLING[activeMode].power * (items.includes('breakers') ? 0.92 : 1),
      hash: deskHash * layout.hash * (items.includes('controller') ? 1.08 : 1)
        * (items.includes('plant') ? 1.0035 : 1)
        * (items.includes('lighting') ? 1.006 : 1)
        * (items.includes('interior') ? 1.012 : 1),
      wear: deskWear * (items.includes('bench') ? 0.8 : 1) * (items.includes('purifier') ? 0.95 : 1),
    };
  }

  private rig(id: string): RigSettings {
    return this.s.rigs[id] ??= { xp: 0, mods: [] };
  }

  crewAvailable(role: CrewRole) {
    return this.s.crew[role] - Object.values(this.s.rigs).filter((r) => r.crew === role).length;
  }

  crewCost(role: CrewRole) { return Math.round(CREW[role].cost * 1.33 ** this.s.crew[role]); }
  crewWages() {
    return keys(CREW).reduce((w, role) => w + CREW[role].wage * this.s.crew[role], 0) * 0.94 ** this.level('payroll');
  }

  hireCrew(role: CrewRole, fire = false) {
    if (fire) {
      if (this.crewAvailable(role) <= 0) return this.fail('Zuerst eine Zuweisung lösen.');
      this.s.crew[role]--;
    } else {
      if (this.s.crew[role] >= 60 || !this.pay(this.crewCost(role))) return;
      this.s.crew[role]++;
    }
    this.changed();
  }

  assignCrew(id: string, role?: CrewRole) {
    if (!this.game.s.machines[id]) return;
    const rig = this.rig(id);
    if (rig.crew === role) return;
    if (role && this.crewAvailable(role) <= 0) return this.fail('Für diese Rolle ist keine freie Crew verfügbar.');
    rig.crew = role;
    rig.xp = 0;
    this.changed();
  }

  autoAssign() {
    for (const id of Object.values(this.game.s.rooms).flat()) {
      if (!id || this.s.rigs[id]?.crew) continue;
      const role = keys(CREW).find((r) => this.crewAvailable(r) > 0);
      if (!role) break;
      this.rig(id).crew = role;
    }
    this.changed();
  }

  train(dt: number) {
    for (const id of Object.values(this.game.s.rooms).flat()) {
      if (id && this.s.rigs[id]?.crew) this.s.rigs[id].xp = Math.min(900, this.s.rigs[id].xp + dt);
    }
  }

  modReady(id: Mod) {
    const m = MODS[id];
    return this.game.totalGadgets() >= m.rigs && this.s.grid.level >= m.grid && this.game.s.research.length >= m.research;
  }

  modLevel(id: Mod) { return this.s.mods[id] ?? 0; }
  modCost(id: Mod) { return Math.round(MODS[id].cost * (1 + this.modLevel(id) * 1.1)); }

  developMod(id: Mod) {
    if (!this.modReady(id) || this.modLevel(id) >= 3) return;
    if (!this.pay(this.modCost(id))) return;
    this.s.mods[id] = this.modLevel(id) + 1;
    this.changed();
  }

  installMod(machine: string, id: Mod) {
    if (!this.game.s.machines[machine] || !this.modLevel(id)) return;
    const rig = this.rig(machine);
    if (rig.mods.includes(id)) {
      rig.mods = rig.mods.filter((m) => m !== id);
      if (id === 'dual') delete rig.secondary;
    } else {
      if (rig.mods.length >= 2) return this.fail('Es sind bereits zwei Mods installiert.');
      if (!this.pay(Math.round(MODS[id].cost * 0.3))) return;
      rig.mods.push(id);
    }
    this.changed();
  }

  setTarget(id: string, coin?: string, secondary = false) {
    if (!this.game.s.machines[id]) return;
    const c = COINS.find((x) => x.id === coin);
    if (coin && (!c || !this.game.coinUnlocked(c) || !this.game.canMine(id, coin))) return;
    const rig = this.rig(id);
    if (secondary && !rig.mods.includes('dual')) return;
    if (secondary) rig.secondary = c?.id;
    else rig.target = c?.id;
    this.changed();
  }

  ensureRigTarget(id: string, roomCoin: CoinDef) {
    const current = this.rigCoin(id, roomCoin);
    if (this.game.coinUnlocked(current) && this.game.canMine(id, current.id)) return;
    const device = this.game.mstat(id);
    const candidates = COINS.filter((coin) => this.game.coinUnlocked(coin) && this.game.canMine(device, coin.id));
    candidates.sort((a, b) => this.game.netPerSec(device, b.id) - this.game.netPerSec(device, a.id));
    if (candidates.length) this.rig(id).target = candidates[0].id;
  }

  rigCoin(id: string, fallback: CoinDef) {
    const target = this.s.rigs[id]?.target;
    if (target && this.game.coinUnlocked(coinDef(target)) && this.game.canMine(id, target)) return coinDef(target);
    return fallback;
  }

  rigEffects(id: string, defaultCoin: CoinDef, crewEffect: number) {
    const rig = this.s.rigs[id];
    const result = { hash: 1, heat: 1, power: 1, wear: 1, main: defaultCoin, secondary: undefined as CoinDef | undefined };
    if (!rig) return result;
    result.main = this.rigCoin(id, defaultCoin);
    const crew = (1 + Math.floor(rig.xp / 300) * 0.15) * crewEffect;
    if (rig.crew === 'hash') result.hash *= 1 + 0.08 * crew;
    if (rig.crew === 'cool') {
      result.heat *= 1 - 0.10 * crew;
      result.wear *= 1 - 0.15 * crew;
    }
    if (rig.crew === 'power') result.power *= 1 - 0.08 * crew;
    for (const mod of rig.mods) {
      const lv = 1 + 0.2 * (this.modLevel(mod) - 1);
      switch (mod) {
        case 'saver': result.power *= 1 - 0.18 * lv; break;
        case 'turbo': result.hash *= 1 + 0.15 * lv; result.heat *= 1.12; break;
        case 'liquid': result.hash *= 1 + 0.08 * lv; result.heat *= 1 - 0.3 * lv; break;
        case 'booster': result.hash *= 1 + 0.25 * lv; result.power *= 1.1; break;
        case 'stability': result.wear *= 1 - 0.5 * lv; break;
        case 'dual':
          if (rig.secondary && rig.secondary !== result.main.id && this.game.coinUnlocked(coinDef(rig.secondary)) && this.game.canMine(id, rig.secondary)) result.secondary = coinDef(rig.secondary);
          break;
      }
    }
    return result;
  }

  leaseQuote(id: string) {
    const price = this.game.prePrice(id);
    return { deposit: Math.round(price * 0.2), payment: Math.round(price * 0.31) };
  }

  rentOut(id: string) {
    if (!this.game.s.machines[id] || !this.game.roomOf(id) || this.s.leases[id]) return this.fail('Nur eigene, aufgestellte Miner können vermietet werden.');
    const rig = this.rig(id);
    if (rig.rental) return this.fail('Dieser Miner ist bereits vermietet.');
    const device = this.game.mstat(id);
    const best = COINS.filter((coin) => this.game.coinUnlocked(coin) && this.game.canMine(device, coin.id))
      .reduce((value, coin) => Math.max(value, this.game.netPerSec(device, coin.id)), 0);
    const rate = Math.max(0.02, best * 0.55);
    rig.rental = { since: this.s.clock, until: this.s.clock + DAY_SECONDS * 3, rate };
    this.game.toast(`Mietvertrag gestartet · ${cashText(rate)}/s für 3 Spieltage. Der Miner pausiert währenddessen.`);
    this.changed();
  }

  stopRental(id: string) {
    const rig = this.s.rigs[id];
    if (!rig?.rental) return;
    delete rig.rental;
    this.game.toast('Mietvertrag vorzeitig beendet. Der Miner ist wieder verfügbar.');
    this.changed();
  }

  private accrueRentals(from: number, to: number) {
    for (const [id, rig] of Object.entries(this.s.rigs)) {
      const rental = rig.rental;
      if (!rental) continue;
      const seconds = Math.max(0, Math.min(to, rental.until) - Math.max(from, rental.since));
      this.game.s.cash += seconds * rental.rate;
      if (to >= rental.until) {
        delete rig.rental;
        this.game.toast(`${this.game.s.machines[id]?.name ?? 'Miner'}: Mietvertrag beendet.`);
      }
    }
  }

  beginLease(id: string, prebuilt: string) {
    const { payment } = this.leaseQuote(prebuilt);
    this.s.leases[id] = { remaining: 3, due: this.day + 1, payment };
  }

  finishLease(id: string, cancel: boolean) {
    const lease = this.s.leases[id];
    if (!lease) return;
    if (!cancel && !this.pay(lease.remaining * lease.payment)) return;
    delete this.s.leases[id];
    if (cancel) this.game.removeRig(id);
    this.game.toast(cancel ? 'Leasing beendet. Miner zurückgegeben.' : 'Leasing abgelöst. Miner übernommen.');
    this.changed();
  }

  private settleLeases() {
    for (const [id, lease] of Object.entries(this.s.leases)) {
      if (lease.due > this.day) continue;
      if (this.game.s.cash < lease.payment) {
        delete this.s.leases[id];
        this.game.removeRig(id);
        this.game.toast('Leasingrate offen. Der Miner wurde zurückgegeben.');
        continue;
      }
      this.game.s.cash -= lease.payment;
      lease.due++;
      if (--lease.remaining === 0) {
        delete this.s.leases[id];
        this.game.toast('Leasing abbezahlt. Der Miner gehört dir.');
      }
    }
  }

  walletValue(stable = false) {
    return COINS.reduce((sum, c) => sum + (this.s.treasury[c.id]?.amount ?? 0) * (stable ? c.base : this.game.prices[c.id]), 0);
  }

  walletTier() {
    const value = this.walletValue(true);
    return [...WALLET_TIERS].reverse().find((tier) => value >= tier.min)!;
  }

  holdBonus(coin: string) {
    const entry = this.s.treasury[coin];
    return entry ? Math.min(0.12, Math.max(0, this.day - entry.since - 1) * 0.015) : 0;
  }

  apy(coin: string) {
    return YIELD_APY[coin] * this.walletTier().multiplier * (1 + this.holdBonus(coin)) * (1 + 0.06 * this.level('treasury'));
  }

  private logWallet(type: Ledger['type'], coin: string, amount: number) {
    this.s.ledger.unshift({ type, coin, amount, day: this.day });
    this.s.ledger.splice(24);
  }

  transfer(coin: string, amount: number, withdraw: boolean) {
    if (!COINS.some((c) => c.id === coin) || !positive(amount)) return this.fail('Gib einen gültigen Betrag ein.');
    const wallet = this.game.s.wallet;
    const entry = this.s.treasury[coin];
    if (withdraw) {
      if (!entry || amount > entry.amount + EPS) return this.fail('Zu wenig Coins im Zins-Wallet.');
      if (this.day < entry.unlock) return this.fail(`Auszahlung ab Tag ${entry.unlock}.`);
      const moved = Math.min(amount, entry.amount);
      entry.amount -= moved;
      if (entry.amount <= EPS) delete this.s.treasury[coin];
      wallet[coin] = (wallet[coin] ?? 0) + moved;
      this.logWallet('withdraw', coin, moved);
    } else {
      if ((wallet[coin] ?? 0) + EPS < amount) return this.fail('Zu wenig freie Coins.');
      amount = Math.min(amount, wallet[coin] ?? 0);
      wallet[coin] -= amount;
      const updated = this.s.treasury[coin] ??= { amount: 0, unlock: this.day, since: this.day };
      updated.amount += amount;
      updated.unlock = Math.max(updated.unlock, this.day + this.walletTier().lockDays);
      this.logWallet('deposit', coin, amount);
    }
    this.changed();
  }

  toggleYield() {
    this.s.yieldOn = !this.s.yieldOn;
    this.changed();
  }

  private settleYield() {
    if (!this.s.yieldOn) return;
    let total = 0;
    const tier = this.walletTier();
    for (const [coin, entry] of Object.entries(this.s.treasury)) {
      const amount = entry.amount * YIELD_APY[coin] * tier.multiplier * (1 + this.holdBonus(coin)) * (1 + 0.06 * this.level('treasury')) / 365;
      entry.amount += amount;
      total += amount * this.game.prices[coin];
      this.logWallet('yield', coin, amount);
    }
    if (total > 0) {
      this.s.yieldDays++;
      this.s.yieldTotal += total;
      this.s.yieldHistory.unshift({ day: this.day - 1, eur: total });
      this.s.yieldHistory.splice(14);
    }
  }

  placeOrder(coin: string, side: Order['side'], amount: number, limit: number) {
    const c = COINS.find((x) => x.id === coin && this.game.coinUnlocked(x));
    if (!c || !positive(amount) || !positive(limit) || !positive(amount * limit)) return this.fail('Gib eine gültige Menge und ein gültiges Limit ein.');
    if (this.s.orders.length >= this.orderLimit) return this.fail('Alle Order-Plätze sind belegt.');
    if (side === 'buy') {
      if (!this.pay(amount * limit)) return;
    } else {
      const free = this.game.s.wallet[coin] ?? 0;
      if (free < amount) return this.fail('Zu wenig freie Coins.');
      this.game.s.wallet[coin] = free - amount;
    }
    this.s.orders.push({ id: this.s.nextOrder++, coin, side, amount, limit });
    this.changed();
  }

  cancelOrder(id: number) {
    const index = this.s.orders.findIndex((o) => o.id === id);
    if (index < 0) return;
    const [o] = this.s.orders.splice(index, 1);
    if (o.side === 'buy') this.game.s.cash += o.amount * o.limit;
    else this.game.s.wallet[o.coin] = (this.game.s.wallet[o.coin] ?? 0) + o.amount;
    this.changed();
  }

  settleOrders() {
    if (!this.s.orders.length) return;
    const pending: Order[] = [];
    const game = this.game;
    for (const o of this.s.orders) {
      const price = game.prices[o.coin];
      if (o.side === 'buy' ? price > o.limit : price < o.limit) {
        pending.push(o);
        continue;
      }
      if (o.side === 'buy') {
        game.s.cash += (o.limit - price) * o.amount;
        game.s.wallet[o.coin] = (game.s.wallet[o.coin] ?? 0) + o.amount;
      } else {
        game.s.cash += price * o.amount;
        game.s.soldEur += price * o.amount;
      }
      this.s.filled++;
      game.toast(`Limit-Order ausgeführt: ${compact(o.amount)} ${o.coin} zu ${cashText(price)}.`);
    }
    if (this.s.orders.length !== pending.length) {
      this.s.orders = pending;
      this.changed();
    }
  }

  toggleAutoCoin(coin: string) {
    if (!COINS.some((c) => c.id === coin)) return;
    this.s.autoCoins[coin] = this.s.autoCoins[coin] === false;
    this.changed();
  }

  metric(metric: Metric): number {
    const g = this.game;
    switch (metric) {
      case 'clicks': return g.s.stats.clicks;
      case 'sold': return g.s.soldEur;
      case 'rigs': return g.totalGadgets();
      case 'built': return g.s.stats.built;
      case 'repair': return g.s.stats.repairs;
      case 'research': return g.s.research.length;
      case 'grid': return this.s.grid.level;
      case 'crew': return Object.values(this.s.rigs).filter((r) => r.crew).length;
      case 'wallet': return this.walletValue(true);
      case 'orders': return this.s.filled;
      case 'rooms': return ROOMS.filter((r) => g.s.rooms[r.id]).length;
      case 'mods': return Object.values(this.s.rigs).reduce((sum, r) => sum + r.mods.length, 0);
      case 'shop': return Object.values(this.s.sites).reduce((sum, list) => sum + list.length, 0);
      case 'hash': return g.hashTotal;
      case 'yield': return this.s.yieldDays;
      case 'rigHash': return Math.max(0, ...Object.keys(g.s.machines).map((id) => g.mstat(id).hash));
      case 'dailyNet': return Math.max(0, g.netEurPerSec() * DAY_SECONDS);
    }
  }

  private baseline() {
    return Object.fromEntries(DAY_METRICS.map((metric) => [metric, this.metric(metric)]));
  }

  syncPeriods() {
    for (const type of ['daily', 'weekly'] as const) {
      const index = type === 'daily' ? this.day : this.week;
      if (index !== this.s[type].index) this.s[type] = { index, baseline: this.baseline(), claimed: [] };
    }
  }

  progress(metric: Metric, kind: 'daily' | 'weekly' | 'projects') {
    const past = kind !== 'projects' && DAY_METRIC_SET.has(metric) ? this.s[kind].baseline[metric] ?? 0 : 0;
    return Math.max(0, this.metric(metric) - past);
  }

  ready(targets: Target[], kind: 'daily' | 'weekly' | 'projects' = 'projects') {
    return targets.every((t) => this.progress(t.metric, kind) >= t.amount);
  }

  objectives(kind: 'daily' | 'weekly' | 'projects'): Objective[] {
    if (kind === 'projects') return PROJECTS;
    if (kind === 'weekly') return [WEEKLY[0], WEEKLY[1 + (this.week - 1) % (WEEKLY.length - 1)]];
    return [DAILY[0], DAILY[1 + (this.day - 1) % (DAILY.length - 1)]];
  }

  claimed(kind: 'daily' | 'weekly' | 'projects'): string[] {
    return kind === 'projects' ? this.s.projects : this.s[kind].claimed;
  }

  claim(kind: 'daily' | 'weekly' | 'projects', id: string) {
    this.syncPeriods();
    const objective = this.objectives(kind).find((o) => o.id === id);
    const claimed = this.claimed(kind);
    if (!objective || claimed.includes(id) || (objective.gate && !this.ready([objective.gate])) || !this.ready(objective.targets, kind)) return;
    const cash = Math.round(objective.cash * this.collectionEffects().reward);
    this.game.s.cash += cash;
    this.addChips(objective.chips ?? 0);
    claimed.push(id);
    this.game.toast(`Auftrag erfüllt: ${objective.name} · +${cashText(cash)}.`);
    this.changed();
  }

  get contractLimit() { return 2 + Math.min(2, this.level('contract')); }

  contractOffers(): Contract[] {
    const rotation = (this.day - 1) % CONTRACTS.length;
    const scale = Math.min(12, 1 + Math.floor(this.game.s.soldEur / 2500));
    const coin = this.day % 2 ? 'MON' : 'ETRA';
    return [0, 1, 2].map((offset) => {
      const t = CONTRACTS[(rotation + offset) % CONTRACTS.length];
      const amount = t.scale * scale;
      return {
        id: `${this.day}-${t.id}`, kind: t.kind, coin, amount,
        cash: t.cash * scale, offered: this.day, due: this.day + t.duration, baseline: 0,
      };
    }).filter((c) => !this.s.contractClaims.includes(c.id) && !this.s.contracts.some((a) => a.id === c.id));
  }

  contractLabel(contract: Contract) {
    const def = CONTRACTS.find((t) => t.kind === contract.kind)!;
    return contract.kind === 'delivery' ? `${def.name} · ${contract.coin}` : def.name;
  }

  contractProgress(contract: Contract) {
    if (contract.kind === 'delivery') return this.game.s.wallet[contract.coin] ?? 0;
    return Math.max(0, this.metric(contract.kind) - contract.baseline);
  }

  acceptContract(id: string) {
    const contract = this.contractOffers().find((c) => c.id === id);
    if (!contract || this.s.contracts.length >= this.contractLimit) return;
    if (contract.kind === 'sold' || contract.kind === 'clicks') contract.baseline = this.metric(contract.kind);
    this.s.contracts.push(contract);
    this.changed();
  }

  finishContract(id: string) {
    const c = this.s.contracts.find((x) => x.id === id);
    if (!c || c.due <= this.day || this.contractProgress(c) < c.amount) return;
    if (c.kind === 'delivery') this.game.s.wallet[c.coin] -= c.amount;
    const reward = Math.round(c.cash * this.collectionEffects().reward);
    this.game.s.cash += reward;
    this.s.contracts = this.s.contracts.filter((x) => x.id !== id);
    this.s.contractClaims.push(id);
    this.game.toast(`Vertrag abgeschlossen · +${cashText(reward)}.`);
    this.changed();
  }

  private expireContracts() {
    this.s.contracts = this.s.contracts.filter((c) => c.due > this.day);
    this.s.contractClaims = this.s.contractClaims.filter((id) => id.startsWith(`${this.day}-`));
  }

  addChips(amount: number) {
    this.s.chips = Math.min(CHIP_LIMIT, this.s.chips + amount);
  }

  buySkill(id: Skill) {
    const skill = SKILLS[id];
    const level = this.level(id);
    if ((skill.requires && !this.level(skill.requires)) || level >= skill.max || this.s.chips < skill.cost + level) return;
    this.s.chips -= skill.cost + level;
    this.s.skills[id] = level + 1;
    this.changed();
  }

  chipShop(id: Consumable, use: boolean) {
    const item = CONSUMABLES[id];
    const stock = this.s.consumables[id] ?? 0;
    if (use) {
      if (!stock || this.effect(id)) return;
      this.s.consumables[id] = stock - 1;
      this.s.effects[id] = this.s.clock + item.sec;
    } else {
      if (this.s.chips < item.cost || stock >= 99) return;
      this.s.chips -= item.cost;
      this.s.consumables[id] = stock + 1;
    }
    this.changed();
  }

  prestige(next: SaveData, gain: number) {
    const previous = this.s;
    next.ops = restoreOperations({
      clock: previous.clock, restructures: previous.restructures, chips: previous.chips + gain, skills: previous.skills, consumables: previous.consumables,
      projects: previous.projects, contractClaims: previous.contractClaims, daily: previous.daily, weekly: previous.weekly, traders: previous.traders,
    });
    next.ops.daily.baseline = {};
    next.ops.weekly.baseline = {};
  }

  traderDeals() {
    const g = this.game;
    const room = g.s.active;
    const c = COINS[(this.day - 1) % 2];
    const wear = Math.max(0, 100 - (g.s.cond[room] ?? 100));
    const premium = this.day % 2 ? 1.15 : 1.22;
    const maxCoins = Math.min(g.s.wallet[c.id] ?? 0, 15 + (this.day % 5) * 5);
    const restore = Math.min(wear, 35 + (this.day % 3) * 10);
    const quote = Math.round(g.prices[c.id] * maxCoins * premium);
    const repair = Math.ceil(restore * (6 + ROOMS.indexOf(roomDef(room))));
    const chipCost = 950 + (this.day % 4) * 150;
    const batteryCost = 60 + this.day % 5 * 8;
    return [
      { id: 'luna', name: 'Luna · Coin-Broker', text: `${compact(maxCoins)} ${c.id} für ${cashText(quote)}`, available: quote > 0, apply: () => { g.s.wallet[c.id] -= maxCoins; g.s.cash += quote; g.s.soldEur += quote; } },
      { id: 'mark', name: 'Mark · Energiehändler', text: `Akku bis zu +0,35 kWh für ${cashText(batteryCost)}`, available: this.s.grid.charge < this.batteryMax - EPS && g.s.cash >= batteryCost, apply: () => { g.s.cash -= batteryCost; this.s.grid.charge = Math.min(this.batteryMax, this.s.grid.charge + 0.35); } },
      { id: 'otto', name: 'Otto · Rig-Mechaniker', text: `Zustand im aktiven Raum +${compact(restore)} % für ${cashText(repair)}`, available: restore > 0 && g.s.cash >= repair, apply: () => { g.s.cash -= repair; g.s.cond[room] += restore; g.s.stats.repairs++; } },
      { id: 'kira', name: 'Kira · Großhandel', text: `1 Chip für ${cashText(chipCost)}`, available: g.s.cash >= chipCost, apply: () => { g.s.cash -= chipCost; this.addChips(1); } },
      { id: 'ivy', name: 'Ivy · Quant-Händlerin', text: `75 € Kursprämie bei 250 € Umsatz`, available: g.s.soldEur >= 250, apply: () => { g.s.cash += 75; } },
      { id: 'nova', name: 'Nova · Boost-Technik', text: 'Ein Hash-Burst für 400 €', available: g.s.cash >= 400 && (this.s.consumables.burst ?? 0) < 99, apply: () => { g.s.cash -= 400; this.s.consumables.burst = (this.s.consumables.burst ?? 0) + 1; } },
      { id: 'crypto', name: 'Crypto · Mystery Trader', text: `1 Chip gegen ${this.day % 2 ? '1,25' : '1,50'} BIT`, available: (g.s.wallet.BIT ?? 0) >= (this.day % 2 ? 1.25 : 1.5), apply: () => { g.s.wallet.BIT -= this.day % 2 ? 1.25 : 1.5; this.addChips(1); } },
    ];
  }

  acceptTrader(id: string) {
    if (this.s.traders[id] === this.day) return;
    const deal = this.traderDeals().find((d) => d.id === id);
    if (!deal?.available) return;
    deal.apply();
    this.s.traders[id] = this.day;
    this.game.s.stats.deals++;
    this.changed();
  }
}
