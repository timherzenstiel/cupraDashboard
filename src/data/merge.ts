import { estimateCapacity, finish } from './parse.ts';
import type { Dataset, Series, Session, Warning } from './types.ts';

const series = (a: Series | undefined, b: Series | undefined): Series => finish([...(a ?? []), ...(b ?? [])].map((p) => [p[0], p[1]] as [number, number]));

/** Daily and monthly totals are keyed by their date; the later import wins because the car revises them. */
function keyed(a: Series, b: Series): Series {
  const m = new Map<number, number>(a);
  for (const [t, v] of b) m.set(t, v);
  return [...m].sort((x, y) => x[0] - y[0]);
}

/**
 * Combines an existing dataset with a newer import (another export, or data from the collector).
 * Time series are unioned, sessions and curves are matched by id, and the capacity estimate is
 * recomputed over all curves.
 */
export function mergeDatasets(a: Dataset, b: Dataset): Dataset {
  const sessions = new Map<string, Session>();
  for (const s of [...a.sessions, ...b.sessions]) sessions.set(s.id, s);
  const warnings = new Map<string, Warning>();
  for (const w of [...a.warnings, ...b.warnings]) warnings.set(w.t + '|' + w.text, w);
  const curves = { ...a.curves, ...b.curves };
  const newer = b.to >= a.to ? b : a;
  const older = newer === b ? a : b;
  return {
    version: 1,
    importedAt: Math.max(a.importedAt, b.importedAt),
    from: Math.min(a.from || Infinity, b.from || Infinity),
    to: Math.max(a.to, b.to),
    soc: series(a.soc, b.soc),
    rangeKm: series(a.rangeKm, b.rangeKm),
    odo: series(a.odo, b.odo),
    power: series(a.power, b.power),
    plug: series(a.plug, b.plug),
    clima: series(a.clima, b.clima),
    inspectionDays: series(a.inspectionDays, b.inspectionDays),
    outdoorTemp: series(a.outdoorTemp, b.outdoorTemp),
    sessions: [...sessions.values()].sort((x, y) => x.start - y.start),
    curves,
    aggDay: keyed(a.aggDay, b.aggDay),
    aggMonth: keyed(a.aggMonth, b.aggMonth),
    warnings: [...warnings.values()].sort((x, y) => x.t - y.t),
    snapshot: { ...older.snapshot, ...newer.snapshot },
    capacityKwh: estimateCapacity(curves) ?? newer.capacityKwh ?? older.capacityKwh,
    // Re-importing the same file must not inflate the count; overlapping imports are not additive.
    recordCount: Math.max(a.recordCount, b.recordCount),
  };
}
