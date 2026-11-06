import { DEFAULT_PRESET, RANGE_PRESETS, presetRange, type RangePresetKey } from "@/lib/business/report-range";
import { dateRangeSchema, issuesByField } from "@/lib/validation/sales";

export type ReportRangeResult =
  | { ok: true; from: string; to: string; preset: RangePresetKey | null }
  | { ok: false; fields: Record<string, string> };

type ParamValue = string | string[] | null | undefined;

function single(value: ParamValue): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

/**
 * Resolve a report range from query parameters:
 *   ?range=today|7d|30d|90d       preset relative to today in Asia/Manila
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD explicit inclusive Manila dates
 *   (nothing)                      today
 */
export function parseReportRange(
  params: { from?: ParamValue; to?: ParamValue; range?: ParamValue },
  now: Date = new Date(),
): ReportRangeResult {
  const from = single(params.from)?.trim() || undefined;
  const to = single(params.to)?.trim() || undefined;
  const range = single(params.range)?.trim() || undefined;

  if (from !== undefined || to !== undefined) {
    if (from === undefined) return { ok: false, fields: { from: "Choose a start date." } };
    if (to === undefined) return { ok: false, fields: { to: "Choose an end date." } };
    const parsed = dateRangeSchema.safeParse({ from, to });
    if (!parsed.success) return { ok: false, fields: issuesByField(parsed.error) };
    return { ok: true, from: parsed.data.from, to: parsed.data.to, preset: null };
  }

  const key = (range ?? DEFAULT_PRESET) as RangePresetKey;
  if (!RANGE_PRESETS.some((p) => p.key === key)) {
    return { ok: false, fields: { range: "Range must be today, 7d, 30d or 90d." } };
  }
  return { ok: true, ...presetRange(key, now), preset: key };
}
