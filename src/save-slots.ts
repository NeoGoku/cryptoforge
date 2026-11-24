const SAVE_KEY = 'cryptoforge.save';
const LEGACY_KEY = 'cryptoforge.save.v1';
const ACTIVE_SLOT = 'cryptoforge.selected-slot';
const LEGACY_ACTIVE_SLOT = 'cryptoforge.active-slot';
export const SAVE_SLOTS = [1, 2, 3] as const;
export type SaveSlot = typeof SAVE_SLOTS[number];

const suffix = (slot: SaveSlot) => slot === 1 ? '' : `.${slot}`;
export const slotKey = (slot: SaveSlot) => SAVE_KEY + suffix(slot);

export function previousSaves(slot: SaveSlot): string[] {
  const keys = [LEGACY_KEY + suffix(slot)];
  const releases = /^cryptoforge\.save\.v1\.release\.(?:[0-9a-f]{16}|dev)(?:\.([23]))?$/;
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    const match = key?.match(releases);
    if (key && match && Number(match[1] ?? 1) === slot) keys.push(key);
  }
  const candidates = keys.flatMap((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    try {
      const data = JSON.parse(raw);
      if (!data || ![1, 2, 3].includes(data.v) || !Number.isFinite(data.cash)) return [];
      return [{
        raw,
        resets: Number(data.prestige?.resets) || 0,
        playSec: Number(data.playSec) || 0,
        savedAt: Number(data.savedAt) || 0,
      }];
    } catch {
      return [];
    }
  });
  // Keep an established game ahead of a fresh slot created by an incompatible release.
  return candidates.sort((a, b) => b.resets - a.resets || b.playSec - a.playSec || b.savedAt - a.savedAt)
    .map(({ raw }) => raw);
}

export function activeSlot(): SaveSlot {
  try {
    const explicit = Number(localStorage.getItem(ACTIVE_SLOT));
    if (explicit === 1 || explicit === 2 || explicit === 3) return explicit;
    const legacy = Number(localStorage.getItem(LEGACY_ACTIVE_SLOT));
    if (legacy === 1 || legacy === 2 || legacy === 3) return legacy;
    // Prior releases may have saved a selection even if the original game did not.
    const recent = SAVE_SLOTS.flatMap((slot) => previousSaves(slot).slice(0, 1).map((raw) => {
      const data = JSON.parse(raw);
      return { slot, release: data.release, savedAt: Number(data.savedAt) || 0 };
    })).filter(({ slot, release }) =>
      typeof release === 'string' && Number(localStorage.getItem(`${LEGACY_ACTIVE_SLOT}.${release}`)) === slot
    ).sort((a, b) => b.savedAt - a.savedAt);
    if (recent.length) return recent[0].slot;
  } catch {
    // The default slot remains available when storage is disabled.
  }
  return 1;
}

export function selectSlot(slot: SaveSlot) {
  localStorage.setItem(ACTIVE_SLOT, String(slot));
}

export function slotPreview(slot: SaveSlot): { nick: string; cash: number } | null {
  try {
    const raw = localStorage.getItem(slotKey(slot)) ?? previousSaves(slot)[0];
    if (!raw) return null;
    const value = JSON.parse(raw);
    return { nick: typeof value.nick === 'string' ? value.nick : '', cash: Number.isFinite(value.cash) ? value.cash : 0 };
  } catch {
    return null;
  }
}
