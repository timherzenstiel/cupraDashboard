import { DEFAULT_CAPACITY_KWH } from './parse.ts';
import type { Bucket, Dataset, Series, Session, Standby, Trip } from './types.ts';

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Last value at or before t, or null when the series starts later. */
export function valueAt(series: Series, t: number): number | null {
  let lo = 0;
  let hi = series.length - 1;
  if (hi < 0 || series[0][0] > t) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (series[mid][0] <= t) lo = mid;
    else hi = mid - 1;
  }
  return series[lo][1];
}

export const capacityOf = (ds: Dataset) => ds.capacityKwh ?? DEFAULT_CAPACITY_KWH;

/** Below this distance a 1 % SoC step is too coarse for a per-trip consumption figure. */
export const MIN_KM_FOR_CONSUMPTION = 8;

/**
 * Trips are runs of odometer changes. Two changes belong to the same trip when they are at most
 * ten minutes apart, or when the gap is longer but the distance covered in it implies driving
 * (the car was moving while no data arrived).
 */
export function deriveTrips(ds: Dataset): Trip[] {
  const odo = ds.odo;
  const cap = capacityOf(ds);
  const trips: Trip[] = [];
  let i = 1;
  while (i < odo.length) {
    const first = i;
    let j = i;
    while (j + 1 < odo.length) {
      const gap = odo[j + 1][0] - odo[j][0];
      const km = odo[j + 1][1] - odo[j][1];
      if (gap <= 10 * MIN || (km >= 3 && km / (gap / HOUR) >= 20)) j++;
      else break;
    }
    const km = odo[j][1] - odo[first - 1][1];
    const end = odo[j][0];
    // The first change arrives after the first kilometre; back-date the start by that kilometre's pace.
    const pace = j > first ? (end - odo[first][0]) / Math.max(1, odo[j][1] - odo[first][1]) : 2 * MIN;
    const start = Math.max(odo[first - 1][0], odo[first][0] - Math.min(pace * (odo[first][1] - odo[first - 1][1]), 30 * MIN));
    i = j + 1;
    if (km <= 0 || km > 1500) continue;
    const minutes = Math.max(1, (end - start) / MIN);
    const socStart = valueAt(ds.soc, start);
    const socEnd = valueAt(ds.soc, end + 2 * MIN);
    const drop = socStart != null && socEnd != null ? socStart - socEnd : null;
    const kwh = drop != null && drop >= 0 ? (drop / 100) * cap : null;
    trips.push({
      start,
      end,
      km,
      minutes,
      kmh: km / (minutes / 60),
      socStart,
      socEnd,
      kwh,
      per100: kwh != null && km >= MIN_KM_FOR_CONSUMPTION ? (kwh / km) * 100 : null,
    });
  }
  return trips;
}

/**
 * The car only reports charging sessions for part of the period. For the time before the first
 * reported session, rebuild sessions from the charge-power series.
 */
export function allSessions(ds: Dataset): Session[] {
  const firstReported = ds.sessions.length ? ds.sessions[0].start : Infinity;
  const out: Session[] = [];
  const p = ds.power;
  let i = 0;
  while (i < p.length && p[i][0] < firstReported) {
    if (p[i][1] <= 0) { i++; continue; }
    const start = p[i][0];
    let stop = start;
    let kwh = 0;
    let peak = 0;
    let active = 0;
    let j = i;
    while (j < p.length) {
      const next = j + 1 < p.length ? p[j + 1][0] : p[j][0];
      const dt = Math.min(next - p[j][0], 30 * MIN);
      if (p[j][1] > 0) { kwh += p[j][1] * (dt / HOUR); active += dt; stop = p[j][0] + dt; peak = Math.max(peak, p[j][1]); }
      else if (next - stop > 20 * MIN) break;
      j++;
    }
    i = j + 1;
    const startSoc = valueAt(ds.soc, start);
    const endSoc = valueAt(ds.soc, stop + 2 * MIN);
    if (startSoc == null || endSoc == null || endSoc - startSoc < 1 || stop >= firstReported) continue;
    out.push({ id: 'derived-' + start, start, stop, type: peak > 11.5 ? 'dc' : 'ac', startSoc, endSoc, activeSec: active / 1000, peakKw: peak, kwh, kwhFromCurve: false, derived: true });
  }
  return out.concat(ds.sessions);
}

/** Parked periods of at least minHours with no plug and no charging; the SoC drop is the standby loss. */
export function deriveStandby(ds: Dataset, trips: Trip[], sessions: Session[], minHours = 12): Standby[] {
  const out: Standby[] = [];
  for (let k = 0; k + 1 < trips.length; k++) {
    const start = trips[k].end + 10 * MIN;
    const end = trips[k + 1].start - 5 * MIN;
    const hours = (end - start) / HOUR;
    if (hours < minHours) continue;
    if (valueAt(ds.plug, start) === 1 || ds.plug.some((x) => x[0] > start && x[0] < end && x[1] === 1)) continue;
    if (sessions.some((s) => s.start < end && s.stop > start)) continue;
    const socStart = valueAt(ds.soc, start);
    const socEnd = valueAt(ds.soc, end);
    if (socStart == null || socEnd == null || socEnd > socStart) continue;
    out.push({ start, end, hours, socStart, socEnd, perDay: (socStart - socEnd) / (hours / 24) });
  }
  return out;
}

export type Grain = 'day' | 'week' | 'month' | 'year';

const pad = (n: number) => (n < 10 ? '0' + n : '' + n);

/** Start of the local day / ISO week (Monday) / month / year containing t. */
export function bucketStart(t: number, grain: Grain): number {
  const d = new Date(t);
  if (grain === 'year') return new Date(d.getFullYear(), 0, 1).getTime();
  if (grain === 'month') return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (grain === 'week') day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day.getTime();
}

export function bucketKey(start: number, grain: Grain): string {
  const d = new Date(start);
  if (grain === 'year') return '' + d.getFullYear();
  if (grain === 'month') return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/** ISO week number of the week starting at this Monday. */
export function isoWeek(monday: number): number {
  const d = new Date(monday);
  d.setDate(d.getDate() + 3);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - jan4.getTime()) / DAY - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

export function buckets(trips: Trip[], sessions: Session[], grain: Grain): Map<string, Bucket> {
  const map = new Map<string, Bucket>();
  const get = (t: number) => {
    const start = bucketStart(t, grain);
    const key = bucketKey(start, grain);
    let b = map.get(key);
    if (!b) map.set(key, (b = { key, start, km: 0, trips: 0, driveKwh: 0, driveKm: 0, chargedKwh: 0, acKwh: 0, dcKwh: 0, sessions: 0 }));
    return b;
  };
  for (const t of trips) {
    const b = get(t.start);
    b.km += t.km;
    b.trips++;
    if (t.kwh != null) { b.driveKwh += t.kwh; b.driveKm += t.km; }
  }
  for (const s of sessions) {
    const b = get(s.start);
    b.sessions++;
    b.chargedKwh += s.kwh;
    if (s.type === 'ac') b.acKwh += s.kwh;
    else b.dcKwh += s.kwh;
  }
  return map;
}

/** kWh per 100 km over a set of trips, energy-weighted. Uses every trip with a known SoC drop. */
export function consumption(trips: Trip[]): number | null {
  let kwh = 0;
  let km = 0;
  for (const t of trips) if (t.kwh != null) { kwh += t.kwh; km += t.km; }
  return km > 0 ? (kwh / km) * 100 : null;
}

export type ClassStat = { label: string; trips: number; km: number; per100: number | null };

export function byClass(trips: Trip[], edges: number[], labels: string[], pick: (t: Trip) => number): ClassStat[] {
  return labels.map((label, i) => {
    const sel = trips.filter((t) => pick(t) >= edges[i] && pick(t) < edges[i + 1]);
    return { label, trips: sel.length, km: sel.reduce((s, t) => s + t.km, 0), per100: consumption(sel) };
  });
}

/** Charging starts by weekday (0 = Monday) and local hour. */
export function chargeStartGrid(sessions: Session[]): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const s of sessions) {
    const d = new Date(s.start);
    grid[(d.getDay() + 6) % 7][d.getHours()]++;
  }
  return grid;
}

/** Share of time spent in each 10-point SoC band. */
export function socDwell(ds: Dataset): number[] {
  const bins = new Array<number>(10).fill(0);
  for (let i = 0; i + 1 < ds.soc.length; i++) {
    const dt = Math.min(ds.soc[i + 1][0] - ds.soc[i][0], 14 * DAY);
    bins[Math.min(9, Math.floor(ds.soc[i][1] / 10))] += dt;
  }
  const total = bins.reduce((a, b) => a + b, 0) || 1;
  return bins.map((b) => b / total);
}

export type ClimaEvent = { start: number; end: number; minutes: number; /** 1 heating, 2 cooling, 3 ventilation */ mode: number; plugged: boolean };

/** Climatisation runs of at least a minute. Shorter blips are state flicker in the export. */
export function climaEvents(ds: Dataset): ClimaEvent[] {
  const out: ClimaEvent[] = [];
  for (let i = 0; i + 1 < ds.clima.length; i++) {
    const [start, mode] = ds.clima[i];
    if (mode === 0) continue;
    const end = Math.min(ds.clima[i + 1][0], start + 2 * HOUR);
    const minutes = (end - start) / MIN;
    if (minutes < 1) continue;
    const last = out[out.length - 1];
    if (last && last.mode === mode && start - last.end < MIN) { last.end = end; last.minutes = (end - last.start) / MIN; }
    else out.push({ start, end, minutes, mode, plugged: valueAt(ds.plug, start) === 1 });
  }
  return out;
}

/**
 * Range the car shows, scaled to a full battery (range ÷ SoC × 100), averaged per month.
 * Only readings at 30 % SoC or more are used; below that the scaling amplifies rounding.
 */
export function displayedFullRange(ds: Dataset): Map<string, number> {
  const acc = new Map<string, [number, number]>();
  for (const [t, soc] of ds.soc) {
    if (soc < 30) continue;
    const km = valueAt(ds.rangeKm, t);
    if (km == null || km <= 0) continue;
    const key = bucketKey(bucketStart(t, 'month'), 'month');
    const a = acc.get(key) ?? [0, 0];
    a[0] += (km / soc) * 100;
    a[1]++;
    acc.set(key, a);
  }
  return new Map([...acc].map(([k, [s, n]]) => [k, s / n]));
}
