const SAVE_KEY = 'cryptoforge.save.v1';
const ACTIVE_SLOT = 'cryptoforge.active-slot';
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
