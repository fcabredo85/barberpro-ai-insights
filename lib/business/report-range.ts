import { addDays, manilaToday } from "./dates";

/** Date presets for dashboard filters, all relative to today in Asia/Manila. */
export const RANGE_PRESETS = [
  { key: "today", label: "Today", description: "today", days: 1 },
  { key: "7d", label: "7 days", description: "last 7 days", days: 7 },
  { key: "30d", label: "30 days", description: "last 30 days", days: 30 },
  { key: "90d", label: "90 days", description: "last 90 days", days: 90 },
] as const;

export type RangePresetKey = (typeof RANGE_PRESETS)[number]["key"];

export const DEFAULT_PRESET: RangePresetKey = "today";

export function presetRange(key: RangePresetKey, now: Date = new Date()): { from: string; to: string } {
  const preset = RANGE_PRESETS.find((p) => p.key === key) ?? RANGE_PRESETS[0];
  const to = manilaToday(now);
  return { from: addDays(to, -(preset.days - 1)), to };
}

/** Which preset (if any) exactly matches a range, for highlighting the active filter. */
export function matchPreset(from: string, to: string, now: Date = new Date()): RangePresetKey | null {
  for (const p of RANGE_PRESETS) {
    const r = presetRange(p.key, now);
    if (r.from === from && r.to === to) return p.key;
  }
  return null;
}
