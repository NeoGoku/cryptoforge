import { COINS, ROOMS } from './config';
import type { Game } from './game';
import { COLLECTIONS, CONSUMABLES, COOLING, CREW, DAY_SECONDS, GRID_PROFILES, LAYOUTS, METRIC_NAMES, MODS, PROVIDERS, SITE_SHOP, SKILLS } from './operations-data';
import type { Objective, Target } from './operations-data';
import { keys, owns } from './operations-state';

const art = {
  grid: new URL('./assets/operations-grid.webp', import.meta.url).href,
  rigs: new URL('./assets/operations-rigs.webp', import.meta.url).href,
  treasury: new URL('./assets/operations-treasury.webp', import.meta.url).href,
};

const tabs = { grid: 'Stromnetz', rigs: 'Rigs & Crew', rooms: 'Räume & Ausbau', treasury: 'Wallet & Börse', tasks: 'Aufträge', traders: 'Händler', meta: 'Sammlungen & Prestige' };
export type OpsTab = keyof typeof tabs;
type ObjectiveTab = 'daily' | 'weekly' | 'projects';
const walletEvents = { deposit: 'Einzahlung', withdraw: 'Auszahlung', yield: 'Zins' };

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const fmt = (value: number, digits = 0) => value.toLocaleString('de-DE', { maximumFractionDigits: digits });
const eur = (value: number, digits = 2) => `${fmt(value, digits)} €`;
const disabled = (condition: boolean) => condition ? ' disabled' : '';
const item = (label: string, value: string) => `<div class="kv"><span>${label}</span><b>${value}</b></div>`;
const section = (title: string) => `<h3 class="sectitle">${title}</h3>`;
const empty = (text: string) => `<p class="muted cf-ops-empty">${text}</p>`;
const card = (title: string, html: string) => `<section class="card cf-ops-card"><div class="name">${title}</div>${html}</section>`;
const act = (label: string, action: string, id = '', blocked = false, active = false) =>
  `<button type="button" data-act="ops" data-op="${action}" data-id="${escapeHtml(id)}"${active ? ' class="on" aria-pressed="true"' : ''}${disabled(blocked)}>${label}</button>`;
const buttons = (html: string) => `<div class="btns">${html}</div>`;
const description = (html: string) => `<div class="muted cf-ops-text">${html}</div>`;

export const opsLink = (tab: OpsTab, label = tabs[tab]) => `<button type="button" data-act="open-ops" data-id="${tab}">${label}</button>`;
export const isOpsTab = (id: string): id is OpsTab => owns(tabs, id);
const header = (type: keyof typeof art, title: string, detail: string) => `
  <header class="cf-ops-hero">
    <img src="${art[type]}" alt="" width="640" height="380">
    <div><h2>${title}</h2><span>${detail}</span></div>
  </header>`;

const clock = (hour: number) => `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor(hour % 1 * 60)).padStart(2, '0')}`;

function gridPanel(g: Game) {
  const o = g.ops, s = o.s.grid, load = g.grid;
  const demand = `${fmt(load.demand, 2)} / ${fmt(load.capacity, 2)} kW`;
  let html = header('grid', 'Stromnetz', `Spieltag ${o.day} · ${clock(o.hour)}`) + card('Netzauslastung', `
    <div class="cf-ops-meter" role="meter" aria-label="Netzauslastung" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, Math.round(load.demand / load.capacity * 100))}">
      <span class="${load.demand > load.capacity ? 'over' : ''}" style="width:${Math.min(100, load.demand / load.capacity * 100)}%"></span>
    </div>
    ${item('Bedarf / Kapazität', demand)}
    ${item('Netzbezug', `${fmt(g.s.ev?.id === 'outage' ? 0 : load.grid, 2)} kW`)}
    ${item('Mining-Leistung nach Netzlimit', `${fmt((g.s.ev?.id === 'outage' ? 0 : load.throttle) * 100)} %`)}
    ${item('Tarif / laufende Stromkosten', `${eur(g.tariff(), 3)}/kWh · ${eur(g.gridCostPerSec(), 3)}/s`)}
    ${buttons(act(`Netz +1,5 kW Basis · ${eur(o.gridCost)}`, 'grid', '', s.level >= 20 || g.s.cash < o.gridCost))}
  `);
  html += card('Versorger und Tarif', item('Nacht / Tag / Spitze', '22–07 / 07–17 / 17–22 Uhr')
    + item('Preisfaktor', `${fmt(o.priceFactor(0), 2)}× / ${fmt(o.priceFactor(12), 2)}× / ${fmt(o.priceFactor(19), 2)}×`)
    + buttons(keys(PROVIDERS).map((id) => act(`${PROVIDERS[id].name}${s.provider === id ? '' : ` · ${eur(PROVIDERS[id].cost)}`}`, 'provider', id, s.provider !== id && g.s.cash < PROVIDERS[id].cost, s.provider === id)).join(''))
    + description('GreenGrid senkt Preis und Anschlussleistung. IndustrieNetz erhöht beide.')
    + buttons(act('Durchgehend', 'policy', 'always', false, s.policy === 'always') + act('Spitze drosseln', 'policy', 'peak', false, s.policy === 'peak') + act('Nur Nachttarif', 'policy', 'night', false, s.policy === 'night'))
    + buttons(keys(GRID_PROFILES).map((id) => act(GRID_PROFILES[id].label, 'grid-profile', id)).join(''))
    + buttons(act(s.guard ? 'Lastschutz an · 88 %' : 'Lastschutz aus', 'guard', '', false, s.guard)));
  html += card('Notstrom-Akku', item('Ladung', `${fmt(s.charge, 3)} / ${fmt(o.batteryMax, 2)} kWh`)
    + item('Laden / Entladen', `${fmt(load.charging, 2)} / ${fmt(load.discharge, 2)} kW`)
    + buttons(act(`Akku ausbauen · ${eur(o.batteryCost)}`, 'battery', '', s.batteryLevel >= 10 || g.s.cash < o.batteryCost))
    + buttons(act('Lastspitzen puffern', 'battery-mode', 'auto', false, s.batteryMode === 'auto') + act('Für Ausfälle reservieren', 'battery-mode', 'reserve', false, s.batteryMode === 'reserve') + act('Aus', 'battery-mode', 'off', false, s.batteryMode === 'off')));
  const outage = g.evInfo();
  html += card('Ausfallplan', buttons(act('Manuell', 'plan', 'manual', false, s.plan === 'manual') + act('Automatisch Akku', 'plan', 'battery', false, s.plan === 'battery') + act('Automatisch Dienst', 'plan', 'service', false, s.plan === 'service'))
    + (outage?.id === 'outage' ? description(`Stromausfall · noch ${Math.ceil(outage.left)} s`) + buttons(act('Akku · 0,25 kWh', 'outage', 'battery', s.charge < 0.25 || s.batteryMode === 'off') + act(`Entstördienst · ${eur(o.outageCost())}`, 'outage', 'service', g.s.cash < o.outageCost())) : description('Netz verfügbar.')));
  html += card('Betriebsrückstände', item('Offen / Status', `${eur(o.s.arrears)} · ${o.debtStage().name}`)
    + description('Bei 120 € Rückstand sinkt die Leistung auf 88 %, bei 300 € auf 62 %. Ab 600 € stoppt das Netz.')
    + buttons(act('Offenen Betrag tilgen', 'repay-arrears', '', o.s.arrears <= 1e-9 || g.s.cash <= 0))
    + (o.debtStage().output === 0 ? description(`Spieltag(e) mit Abschaltung: ${o.s.shutdownDays} / 3`)
      + buttons(act('Wiederaufbau prüfen', 'restructure', '', !o.canRestructure())) : ''));
  html += card('Tarifvorschau', [0, 12, 19].map((hour, index) => {
    const forecast = o.gridLoad(load.demand, undefined, hour);
    return item(['Nacht', 'Tag', 'Spitze'][index], `${eur(g.tariff(hour), 3)}/kWh · ${fmt(forecast.throttle * 100)} % Netzleistung`);
  }).join('') + description('Prognose mit der aktuellen Last und Akkuladung.'));
  return html;
}

function rigPanel(g: Game) {
  const o = g.ops, room = g.s.active;
  const layout = o.s.layouts[room] ?? 'standard';
  const roomName = ROOMS.find((r) => r.id === room)!.name;
  let html = header('rigs', 'Rigs & Crew', roomName)
    + card(`Standort · ${roomName}`, description('Kaltgang: −22 % Hitze, +4 % Strom. Hochdichte: +12 % Hash, +18 % Hitze.')
      + buttons(keys(LAYOUTS).map((id) => act(LAYOUTS[id].name, 'layout', id, false, layout === id)).join(''))
      + description('Kühlung')
      + buttons(keys(COOLING).map((id) => act(COOLING[id].label, 'cooling', id, false, (o.s.cooling[room] ?? 'normal') === id)).join(''))
      + keys(SITE_SHOP).map((id) => {
        const entry = SITE_SHOP[id];
        const owned = o.s.sites[room]?.includes(id);
        return item(entry.name, entry.description) + buttons(act(owned ? 'Installiert' : `Kaufen · ${eur(entry.cost)}`, 'site', id, owned || g.s.cash < entry.cost));
      }).join(''));
  html += section('Crew') + card('Rollen & freie Mitarbeiter', keys(CREW).map((role) => {
    const c = CREW[role];
    return item(c.name, `${o.crewAvailable(role)} / ${o.s.crew[role]} frei`) + description(`${c.info} · ${eur(c.wage, 3)}/s`)
      + buttons(act(`Einstellen · ${eur(o.crewCost(role))}`, 'hire', role, g.s.cash < o.crewCost(role)) + act('Entlassen', 'fire', role, o.crewAvailable(role) <= 0));
  }).join('') + buttons(act('Freie Crew automatisch verteilen', 'assign-auto', '', !keys(CREW).some((r) => o.crewAvailable(r) > 0))));
  html += section('Mod-Entwicklung') + keys(MODS).map((id) => {
    const m = MODS[id], level = o.modLevel(id);
    return card(m.name, description(m.description)
      + item('Entwicklung', `${level} / 3`)
      + (!o.modReady(id) ? description(`Benötigt ${m.rigs} Miner, Netzstufe ${m.grid}, ${m.research} Forschungen`) : '')
      + buttons(act(level === 3 ? 'Maximalstufe' : `Entwickeln · ${eur(o.modCost(id))}`, 'develop', id, !o.modReady(id) || level === 3 || g.s.cash < o.modCost(id))));
  }).join('');
  html += section('Miner');
  for (const [id, machine] of Object.entries(g.s.machines)) {
    const rig = o.s.rigs[id], lease = o.s.leases[id], location = g.roomOf(id);
    const role = rig?.crew;
    const options = (value?: string) => `<option value="">Raumstandard / aus</option>` + COINS.filter((c) => g.coinUnlocked(c) && g.canMine(id, c.id)).map((c) => `<option value="${c.id}"${c.id === value ? ' selected' : ''}>${c.id}</option>`).join('');
    const cmd = (action: string, data: string) => act(data, action, id);
    const opts = keys(MODS).filter((m) => o.modLevel(m));
    html += card(escapeHtml(machine.name), description(location ? ROOMS.find((r) => r.id === location)!.name : 'Im Lager')
      + item('Crew-Rolle', role ? `${CREW[role].name} · Stufe ${1 + Math.floor((rig?.xp ?? 0) / 300)}` : 'Frei')
      + buttons(keys(CREW).map((r) => act(CREW[r].name, 'assign', `${id}:${r}`, role !== r && o.crewAvailable(r) <= 0, r === role)).join('') + act('Lösen', 'assign', `${id}:-`, !role))
      + item('Mods', `${rig?.mods.length ?? 0} / 2`)
      + (opts.length ? buttons(opts.map((m) => {
        const installed = rig?.mods.includes(m);
        return act(installed ? `${MODS[m].name} entfernen` : `${MODS[m].name} · ${eur(Math.round(MODS[m].cost * 0.3))}`, 'install', `${id}:${m}`, !installed && ((rig?.mods.length ?? 0) >= 2 || g.s.cash < Math.round(MODS[m].cost * 0.3)), installed);
      }).join('')) : description('Entwickle zuerst einen Mod.'))
      + `<label class="cf-ops-field">Coin pro Rig<select data-op-select="target" data-rig="${escapeHtml(id)}" aria-label="Coin pro Rig">${options(rig?.target)}</select></label>`
      + (rig?.mods.includes('dual') ? `<label class="cf-ops-field">Zweitcoin<select data-op-select="secondary" data-rig="${escapeHtml(id)}" aria-label="Zweitcoin">${options(rig.secondary)}</select></label>` : '')
      + (lease ? item('Leasing', `${lease.remaining} × ${eur(lease.payment)} · fällig ab Tag ${lease.due}`) + buttons(act(`Ablösen · ${eur(lease.remaining * lease.payment)}`, 'buyout', id, g.s.cash < lease.remaining * lease.payment) + cmd('return', 'Zurückgeben')) : ''));
  }
  return html;
}

function roomsPanel(g: Game) {
  const o = g.ops;
  let html = header('rigs', 'Räume & Ausbau', 'Produktivität, Wartung und Raumgestaltung');
  for (const room of ROOMS.filter((r) => !!g.s.rooms[r.id])) {
    const stats = g.roomStats[room.id];
    const items = o.s.sites[room.id] ?? [];
    const wear = Math.round((stats?.wear ?? 1) * 100);
    html += card(`${room.name}${g.s.active === room.id ? ' · aktiv' : ''}`,
      item('Miner / Stellplätze', `${g.s.rooms[room.id].filter(Boolean).length} / ${room.spots.length}`)
      + item('Hashrate / Wartung', `${fmt(stats?.hash ?? 0, 1)} H/s · Verschleißfaktor ${fmt(wear, 0)} %`)
      + item('Raumzustand', `${fmt(g.s.cond[room.id] ?? 100, 0)} %`)
      + buttons(act(g.s.active === room.id ? 'Aktiver Raum' : 'Raum öffnen', 'room-select', room.id, false, g.s.active === room.id))
      + (g.s.cond[room.id] < 95 ? buttons(act(`Raum reparieren · ${eur(g.repairCost(room.id))}`, 'room-repair', room.id, g.s.cash < g.repairCost(room.id))) : '')
      + section('Einrichtung & Technik')
      + keys(SITE_SHOP).map((id) => {
        const entry = SITE_SHOP[id], owned = items.includes(id);
        return `<div class="cf-ops-upgrade"><span>${escapeHtml(entry.name)}<small>${escapeHtml(entry.description)}</small></span>${act(owned ? 'Installiert' : `Kaufen · ${eur(entry.cost)}`, 'room-site', `${room.id}:${id}`, owned || g.s.cash < entry.cost, owned)}</div>`;
      }).join(''));
  }
  return html + description('Raumgestaltung wirkt dauerhaft auf alle Miner im jeweiligen Raum. Kleine Dekor-Boni addieren sich; Technik-Upgrades bleiben separat sichtbar.')
    + description('Kompatibilität und Einzelteile findest du in Werkstatt und Komponentenmarkt. Dort zeigt der Konfigurator fehlende oder inkompatible Bauteile vor dem Bau an.');
}

function treasuryPanel(g: Game) {
  const o = g.ops, s = o.s, tier = o.walletTier();
  const history = s.yieldHistory.slice().reverse();
  const max = Math.max(...history.map((row) => row.eur), 0.001);
  const chart = history.length ? `<div class="cf-ops-yield" role="img" aria-label="Zinsertrag der letzten ${history.length} Tage">${history.map((row) => `<span title="Tag ${row.day} · ${eur(row.eur, 5)}" style="height:${Math.max(4, row.eur / max * 100)}%"></span>`).join('')}</div>` : empty('Noch keine Zinsgutschrift.');
  const unlocked = COINS.filter((c) => g.coinUnlocked(c));
  let html = header('treasury', 'Wallet & Börse', `Spieltag ${o.day} · Stufe ${tier.name}`)
    + card('Zins-Wallet', item('Marktwert / Basiswert', `${eur(o.walletValue())} / ${eur(o.walletValue(true))}`)
      + item('Stufe / Sperrfrist für Einzahlungen', `${tier.name} · ${tier.lockDays} Spieltag(e)`)
      + item('Gesamtzinsen / letzter Tag', `${eur(s.yieldTotal, 5)} / ${eur(history[history.length - 1]?.eur ?? 0, 5)}`)
      + chart + buttons(act(s.yieldOn ? 'Zinsen pausieren' : 'Zinsen aktivieren', 'yield', '', false, s.yieldOn)));
  for (const c of unlocked) {
    const w = s.treasury[c.id];
    const free = g.s.wallet[c.id] ?? 0;
    const locked = Boolean(w && o.day < w.unlock);
    html += card(`${c.name} · ${c.id}`, item('Frei / Zins-Wallet', `${fmt(free, 5)} / ${fmt(w?.amount ?? 0, 5)} ${c.id}`)
      + item('Jahreszins / Haltebonus', `${fmt(o.apy(c.id) * 100, 2)} % / +${fmt(o.holdBonus(c.id) * 100, 1)} %`)
      + (locked ? description(`Freigabe an Spieltag ${w!.unlock}.`) : '')
      + `<form data-op-form="transfer-${c.id}" class="cf-ops-form"><input type="hidden" name="coin" value="${c.id}">
        <label class="cf-ops-field">Menge ${c.id}<input type="number" min="0.000000001" step="any" inputmode="decimal" required name="amount" placeholder="0"></label>
        <div class="btns"><button type="submit" name="direction" value="deposit"${disabled(free <= 1e-9)}>Einzahlen</button><button type="submit" name="direction" value="withdraw"${disabled(!w || locked)}>Auszahlen</button></div>
      </form>`
      + buttons(act('Alles einzahlen', 'deposit-all', c.id, free <= 1e-9) + act('Alles auszahlen', 'withdraw-all', c.id, !w || locked)));
  }
  html += section('Limit-Handel') + card('Order anlegen', description(`${s.orders.length} / ${o.orderLimit} Plätze · ${eur(o.orderCash)} für Käufe reserviert`)
    + `<form data-op-form="order" class="cf-ops-form">
      <div class="cf-ops-fields"><label class="cf-ops-field">Coin<select name="coin">${unlocked.map((c) => `<option value="${c.id}">${c.id}</option>`).join('')}</select></label>
      <label class="cf-ops-field">Richtung<select name="side"><option value="buy">Kauf</option><option value="sell">Verkauf</option></select></label>
      <label class="cf-ops-field">Menge<input type="number" min="0.000000001" step="any" inputmode="decimal" name="amount" required></label>
      <label class="cf-ops-field">Limit in € je Coin<input type="number" min="0.000000001" step="any" inputmode="decimal" name="limit" required></label></div>
      <div class="btns"><button type="submit" class="primary"${disabled(s.orders.length >= o.orderLimit)}>Order platzieren</button></div></form>`);
  html += s.orders.map((order) => card(`${order.side === 'buy' ? 'Kauf' : 'Verkauf'} · ${fmt(order.amount, 5)} ${order.coin}`,
    item('Limit / Kurs', `${eur(order.limit, 5)} / ${eur(g.prices[order.coin], 5)}`) + buttons(act('Stornieren', 'order-cancel', String(order.id))))).join('');
  html += section('Wallet-Logbuch') + (s.ledger.length ? card('Letzte Buchungen', s.ledger.map((l) => item(`Tag ${l.day} · ${walletEvents[l.type]}`, `${fmt(l.amount, 6)} ${l.coin}`)).join('')) : empty('Keine Buchungen vorhanden.'));
  return html;
}

function progress(g: Game, targets: Target[], kind: ObjectiveTab) {
  return targets.map((t) => {
    const value = Math.min(t.amount, g.ops.progress(t.metric, kind));
    return item(METRIC_NAMES[t.metric], `${fmt(value, 1)} / ${fmt(t.amount)}`)
      + `<div class="track"><div class="fill" style="width:${value / t.amount * 100}%"></div></div>`;
  }).join('');
}

function objective(g: Game, o: Objective, kind: ObjectiveTab) {
  const done = g.ops.claimed(kind).includes(o.id);
  const locked = o.gate && !g.ops.ready([o.gate]);
  return card(o.name, progress(g, o.targets, kind)
    + (locked ? description(`Freischaltung · ${o.gate!.amount} ${METRIC_NAMES[o.gate!.metric]}`) : '')
    + item('Prämie', `${eur(Math.round(o.cash * g.ops.collectionEffects().reward))}${o.chips ? ` + ${o.chips} Chip(s)` : ''}`)
    + buttons(act(done ? 'Abgeholt' : 'Prämie abholen', 'claim', `${kind}:${o.id}`, done || locked || !g.ops.ready(o.targets, kind))));
}

function tasksPanel(g: Game) {
  return section(`Tages-Challenges · Tag ${g.ops.day}`) + description(`Ein Spieltag dauert ${DAY_SECONDS / 60} Minuten. Eine Spielwoche umfasst sieben Spieltage.`)
    + g.ops.objectives('daily').map((o) => objective(g, o, 'daily')).join('')
    + section(`Weekly Ops · Woche ${g.ops.week}`) + g.ops.objectives('weekly').map((o) => objective(g, o, 'weekly')).join('')
    + section('Operations-Projekte') + g.ops.objectives('projects').map((o) => objective(g, o, 'projects')).join('')
    + section(`Verträge · ${g.ops.s.contracts.length} / ${g.ops.contractLimit} aktiv`)
    + [...g.ops.s.contracts, ...g.ops.contractOffers()].map((c) => {
      const active = g.ops.s.contracts.includes(c);
      const value = active ? g.ops.contractProgress(c) : 0;
      const unit = c.kind === 'delivery' ? c.coin : METRIC_NAMES[c.kind];
      return card(g.ops.contractLabel(c), item(unit, `${fmt(Math.min(c.amount, value), 1)} / ${fmt(c.amount)}`)
        + item('Prämie / Frist', `${eur(Math.round(c.cash * g.ops.collectionEffects().reward))} · bis Ende Tag ${c.due - 1}`)
        + buttons(active ? act('Abschließen', 'contract-finish', c.id, value < c.amount) : act('Annehmen', 'contract-accept', c.id, g.ops.s.contracts.length >= g.ops.contractLimit)));
    }).join('');
}

function traderPanel(g: Game) {
  return section(`Händler · Angebote an Tag ${g.ops.day}`) + g.ops.traderDeals().map((d) => {
    const redeemed = g.ops.s.traders[d.id] === g.ops.day;
    return card(d.name, description(d.text) + buttons(act(redeemed ? 'Eingelöst' : 'Angebot annehmen', 'deal', d.id, redeemed || !d.available)));
  }).join('');
}

function metaPanel(g: Game) {
  const o = g.ops;
  return section('Sammlungen') + COLLECTIONS.map((c) => card(c.name, description(c.text) + progress(g, c.targets, 'projects')
    + description(o.ready(c.targets) ? 'Set-Bonus aktiv' : 'Set-Bonus ausstehend'))).join('')
    + section(`Prestige-Skilltree · ${o.s.chips} Chips`) + keys(SKILLS).map((id) => {
      const skill = SKILLS[id], level = o.level(id), cost = skill.cost + level;
      const req = skill.requires;
      return card(skill.name, description(skill.description) + item('Stufe', `${level} / ${skill.max}`)
        + (req && !o.level(req) ? description(`Voraussetzung: ${SKILLS[req].name}`) : '')
        + buttons(act(level === skill.max ? 'Maximalstufe' : `Freischalten · ${cost} Chip(s)`, 'skill', id, level >= skill.max || o.s.chips < cost || Boolean(req && !o.level(req)))));
    }).join('')
    + section('Chip-Shop') + keys(CONSUMABLES).map((id) => {
      const c = CONSUMABLES[id], stock = o.s.consumables[id] ?? 0, remaining = o.effect(id);
      return card(c.name, description(c.description) + item('Vorrat', String(stock))
        + buttons(act(`Kaufen · ${c.cost} Chip(s)`, 'consumable-buy', id, o.s.chips < c.cost || stock >= 99)
          + act(remaining ? `Aktiv · ${Math.ceil(remaining)} s` : 'Einsetzen', 'consumable-use', id, !stock || remaining > 0)));
    }).join('');
}

const panels = { grid: gridPanel, rigs: rigPanel, rooms: roomsPanel, treasury: treasuryPanel, tasks: tasksPanel, traders: traderPanel, meta: metaPanel };
export function renderOperations(g: Game, tab: OpsTab) {
  return `<div class="cf-ops"><nav class="cf-ops-nav" aria-label="Betriebsbereiche">${keys(tabs).map((id) => act(tabs[id], 'tab', id, false, id === tab)).join('')}</nav>${panels[tab](g)}</div>`;
}

export function performOpsAction(g: Game, operation: string, id: string) {
  const o = g.ops;
  const [primary, secondary] = id.split(':', 2);
  switch (operation) {
    case 'repay-arrears': o.repayArrears(); break;
    case 'grid': o.upgradeGrid(); break;
    case 'battery': o.upgradeGrid(true); break;
    case 'provider': if (owns(PROVIDERS, id)) o.provider(id); break;
    case 'battery-mode': if (id === 'auto' || id === 'reserve' || id === 'off') o.configureGrid('batteryMode', id); break;
    case 'policy': if (id === 'always' || id === 'peak' || id === 'night') o.configureGrid('policy', id); break;
    case 'plan': if (id === 'manual' || id === 'battery' || id === 'service') o.configureGrid('plan', id); break;
    case 'grid-profile': if (owns(GRID_PROFILES, id)) o.applyGridProfile(id); break;
    case 'guard': o.configureGrid('guard', !o.s.grid.guard); break;
    case 'outage': if (id === 'battery' || id === 'service') o.resolveOutage(id); break;
    case 'cooling': if (owns(COOLING, id)) o.cooling(g.s.active, id); break;
    case 'layout': if (owns(LAYOUTS, id)) o.layout(g.s.active, id); break;
    case 'site': if (owns(SITE_SHOP, id)) o.buySite(g.s.active, id); break;
    case 'room-site': if (owns(SITE_SHOP, secondary)) o.buySite(primary, secondary); break;
    case 'room-select': g.setRoom(id); break;
    case 'room-repair': g.repairRoom(id); break;
    case 'hire': if (owns(CREW, id)) o.hireCrew(id); break;
    case 'fire': if (owns(CREW, id)) o.hireCrew(id, true); break;
    case 'assign': if (owns(CREW, secondary)) o.assignCrew(primary, secondary); else if (secondary === '-') o.assignCrew(primary); break;
    case 'assign-auto': o.autoAssign(); break;
    case 'develop': if (owns(MODS, id)) o.developMod(id); break;
    case 'install': if (owns(MODS, secondary)) o.installMod(primary, secondary); break;
    case 'buyout': o.finishLease(id, false); break;
    case 'return': o.finishLease(id, true); break;
    case 'yield': o.toggleYield(); break;
    case 'deposit-all': o.transfer(id, g.s.wallet[id] ?? 0, false); break;
    case 'withdraw-all': o.transfer(id, o.s.treasury[id]?.amount ?? 0, true); break;
    case 'order-cancel': o.cancelOrder(Number(id)); break;
    case 'claim': if (primary === 'daily' || primary === 'weekly' || primary === 'projects') o.claim(primary, secondary); break;
    case 'contract-accept': o.acceptContract(id); break;
    case 'contract-finish': o.finishContract(id); break;
    case 'deal': o.acceptTrader(id); break;
    case 'skill': if (owns(SKILLS, id)) o.buySkill(id); break;
    case 'consumable-buy': if (owns(CONSUMABLES, id)) o.chipShop(id, false); break;
    case 'consumable-use': if (owns(CONSUMABLES, id)) o.chipShop(id, true); break;
    case 'auto-coin': o.toggleAutoCoin(id); break;
  }
}
