declare const __SAVE_RELEASE__: string;
export const SAVE_RELEASE = __SAVE_RELEASE__;
const LEGACY_KEY = 'cryptoforge.save.v1';
const SAVE_KEY = `${LEGACY_KEY}.release.${SAVE_RELEASE}`;
const ACTIVE_SLOT = `cryptoforge.active-slot.${SAVE_RELEASE}`;
export const SAVE_SLOTS = [1, 2, 3] as const;
export type SaveSlot = typeof SAVE_SLOTS[number];

export const slotKey = (slot: SaveSlot) => slot === 1 ? SAVE_KEY : `${SAVE_KEY}.${slot}`;

export function activeSlot(): SaveSlot {
  try {
    const value = Number(localStorage.getItem(ACTIVE_SLOT));
    if (value === 2 || value === 3) return value;
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
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    const value = JSON.parse(raw);
    return { nick: typeof value.nick === 'string' ? value.nick : '', cash: Number.isFinite(value.cash) ? value.cash : 0 };
  } catch {
    return null;
  }
}

export function hasPreviousSaves(): boolean {
  try {
    const currentSlots = new Set(SAVE_SLOTS.map(slotKey));
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    return !keys.some((key) => key !== null && currentSlots.has(key))
      && keys.some((key) => /^cryptoforge\.save(?:\.v1(?:\.release\.[^.]+)?)?(?:\.[23])?$/.test(key ?? ''));
  } catch {
    return false;
  }
}
