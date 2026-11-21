export interface Settings {
  music: number;   // 0..1
  sfx: number;     // 0..1
  quality: 'high' | 'low';
  shake: boolean;
}

const KEY = 'cf.settings';
const defaults: Settings = { music: 0.5, sfx: 0.8, quality: 'high', shake: true };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* ignorieren */
  }
  return { ...defaults };
}

export const settings: Settings = load();

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignorieren */
  }
}
