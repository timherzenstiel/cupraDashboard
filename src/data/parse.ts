import type { CurvePoint, Dataset, Series, Session, Warning } from './types.ts';

type Raw = { dataFieldName?: string; value?: string; timestampUtc?: string };

const MIN_T = Date.UTC(2015, 0, 1);

/** Timestamps in the export are ISO strings, but some rows carry 1970, year 1 or "N/A". Those return NaN. */
export function parseTime(s: string | undefined): number {
  if (!s || s.length < 19 || s[0] !== '2') return NaN;
  const t = Date.parse(s);
  return t > MIN_T ? t : NaN;
}

export function finish(points: Series): Series {
  points.sort((a, b) => a[0] - b[0]);
  const out: Series = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last[1] === p[1]) continue;
    if (last && last[0] === p[0]) last[1] = p[1];
    else out.push(p);
  }
  return out;
}

const CLIMA: Record<string, number> = { off: 0, heating: 1, cooling: 2, ventilation: 3 };
type SimpleKey = 'soc' | 'rangeKm' | 'odo' | 'power' | 'inspectionDays' | 'outdoorTemp';
const SIMPLE: Record<string, SimpleKey> = {
  // One-time (historical) export.
  currentSOCInPct: 'soc',
  cruisingRangeElectricInKm: 'rangeKm',
  mileage: 'odo',
  chargePowerInKW: 'power',
  inspectionDueDays: 'inspectionDays',
  // Continuous 15-minute packages use other names for the same things. These come from the
  // portal's data dictionary and have not yet been checked against a package from a Born.
  'battery_state_report.soc': 'soc',
  'mileage.value': 'odo',
  'range.value': 'rangeKm',
  value_of_the_primary_range: 'rangeKm',
  'battery_state_report.charge_power': 'power',
  charging_power: 'power',
  outdoor_temperature: 'outdoorTemp',
  'outdoor_temperature.temperature': 'outdoorTemp',
};
const PLUG_FIELDS = new Set(['plugConnectionState', 'plug_connection_state', 'charging_plug1_connectionstate', 'plug_state']);

/**
 * Turns the parsed export ({ vin, userId, Data: [...] }) into the compact dataset.
 * The VIN and user id are deliberately not copied.
 */
export function parseExport(json: unknown, now = Date.now()): Dataset {
  const rows: Raw[] = (json as { Data?: Raw[] })?.Data ?? [];
  if (!Array.isArray(rows)) throw new Error('Keine "Data"-Liste in der Datei gefunden.');

  const series: Record<SimpleKey, Series> = { soc: [], rangeKm: [], odo: [], power: [], inspectionDays: [], outdoorTemp: [] };
  const plug: Series = [];
  const clima: Series = [];
  const sess = new Map<number, Record<string, string>>();
  const curveIds = new Map<number, string>();
  const curvePts = new Map<number, Map<number, Record<string, string>>>();
  const aggDay = new Map<number, Record<string, string>>();
  const aggMonth = new Map<number, Record<string, string>>();
  const warnText = new Map<number, string>();
  const warnMeta = new Map<number, { category?: string; priority?: string }>();
  const snapshot: Record<string, string> = {};
  let from = Infinity;
  let to = -Infinity;

  for (const r of rows) {
    const name = r.dataFieldName;
    const value = r.value;
    if (!name || value == null) continue;
    const t = parseTime(r.timestampUtc);

    const simple = SIMPLE[name];
    if (simple) {
      let v = Number(value);
      // Temperatures above 200 can only be Kelvin.
      if (simple === 'outdoorTemp' && v > 200) v = Math.round((v - 273.15) * 10) / 10;
      if (!Number.isNaN(t) && value !== '' && Number.isFinite(v)) {
        series[simple].push([t, v]);
        if (t < from) from = t;
        if (t > to) to = t;
      }
      continue;
    }
    if (PLUG_FIELDS.has(name)) {
      if (!Number.isNaN(t)) plug.push([t, value.toLowerCase() === 'connected' ? 1 : 0]);
      continue;
    }
    if (name === 'climatisationState') {
      const c = CLIMA[value.toLowerCase()];
      if (!Number.isNaN(t) && c != null) clima.push([t, c]);
      continue;
    }
    if (name === 'text' || name === 'category' || name === 'priority') {
      if (Number.isNaN(t) || value === '') continue;
      if (name === 'text') warnText.set(t, value);
      else warnMeta.set(t, { ...warnMeta.get(t), [name]: value });
      continue;
    }
    if (name.startsWith('chargingSession.[')) {
      const m = /^chargingSession\.\[(\d+)\]\.(\w+)/.exec(name);
      if (m) put(sess, +m[1], m[2], value);
      continue;
    }
    if (name.startsWith('powerCurve.[')) {
      const m = /^powerCurve\.\[(\d+)\]\.(?:timeCurve\.\[(\d+)\]\.(\w+)|sessionId)/.exec(name);
      if (!m) continue;
      if (m[2] == null) curveIds.set(+m[1], value);
      else {
        let pts = curvePts.get(+m[1]);
        if (!pts) curvePts.set(+m[1], (pts = new Map()));
        put(pts, +m[2], m[3], value);
      }
      continue;
    }
    if (name.startsWith('aggregation.')) {
      const m = /^aggregation\.(day|month)\.\[(\d+)\]\.(\w+)/.exec(name);
      if (m) put(m[1] === 'day' ? aggDay : aggMonth, +m[2], m[3], value);
      continue;
    }
    if (/^(door_info|window_info|trunk_lid_info|hood_info|hvbatterytemperature_info|service_maintenance_info|mileage_info|hvsoc_info|cruise_range_primary_info)\./.test(name)) {
      snapshot[name] = value;
    }
  }

  const curves: Record<string, CurvePoint[]> = {};
  for (const [i, pts] of curvePts) {
    const id = curveIds.get(i);
    if (!id) continue;
    const list: CurvePoint[] = [];
    for (const p of pts.values()) {
      const t = parseTime(p.timestamp);
      if (!Number.isNaN(t)) list.push([t, Number(p.soc), Number(p.chargePower)]);
    }
    list.sort((a, b) => a[0] - b[0]);
    if (list.length > 1) curves[id] = list;
  }

  const capacityKwh = estimateCapacity(curves);
  const cap = capacityKwh ?? DEFAULT_CAPACITY_KWH;

  const sessions: Session[] = [];
  for (const s of sess.values()) {
    const start = parseTime(s.startChargingTimestamp);
    const stop = parseTime(s.stopChargingTimestamp);
    const type = (s.chargeType ?? '').toLowerCase();
    if (Number.isNaN(start) || Number.isNaN(stop) || (type !== 'ac' && type !== 'dc') || !s.sessionId) continue;
    const endSoc = Number(s.endSoc);
    const delta = Number(s.deltaSoc);
    const curve = curves[s.sessionId];
    const fromCurve = curve ? curveEnergy(curve) : 0;
    sessions.push({
      id: s.sessionId,
      start,
      stop,
      type,
      startSoc: endSoc - delta,
      endSoc,
      activeSec: Number(s.activeChargingTime) || 0,
      peakKw: Number(s.peakChargePower) || 0,
      kwh: fromCurve > 0 ? fromCurve : (delta / 100) * cap,
      kwhFromCurve: fromCurve > 0,
    });
  }
  sessions.sort((a, b) => a.start - b.start);

  const warnings: Warning[] = [...warnText].map(([t, text]) => ({
    t,
    text,
    category: warnMeta.get(t)?.category ?? '',
    priority: Number(warnMeta.get(t)?.priority) || 0,
  }));
  warnings.sort((a, b) => a.t - b.t);

  return {
    version: 1,
    importedAt: now,
    from: Number.isFinite(from) ? from : 0,
    to: Number.isFinite(to) ? to : 0,
    soc: finish(series.soc),
    rangeKm: finish(series.rangeKm),
    odo: finish(series.odo),
    power: finish(series.power),
    plug: finish(plug),
    clima: finish(clima),
    inspectionDays: finish(series.inspectionDays),
    outdoorTemp: finish(series.outdoorTemp),
    sessions,
    curves,
    aggDay: agg(aggDay),
    aggMonth: agg(aggMonth),
    warnings,
    snapshot,
    capacityKwh,
    recordCount: rows.length,
  };
}

export const DEFAULT_CAPACITY_KWH = 77;

function put<K>(map: Map<K, Record<string, string>>, key: K, field: string, value: string) {
  const o = map.get(key);
  if (o) o[field] ??= value;
  else map.set(key, { [field]: value });
}

function agg(map: Map<number, Record<string, string>>): Series {
  const out: Series = [];
  for (const a of map.values()) {
    const t = parseTime(a.date?.replace(/T(\d\d:\d\d)Z$/, 'T$1:00Z'));
    const v = Number(a.chargedEnergy);
    if (!Number.isNaN(t) && Number.isFinite(v)) out.push([t, v]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** kWh under the power curve (trapezoid rule). Gaps over 15 minutes count as not charging. */
export function curveEnergy(curve: CurvePoint[]): number {
  let kwh = 0;
  for (let i = 1; i < curve.length; i++) {
    const dt = (curve[i][0] - curve[i - 1][0]) / 3_600_000;
    if (dt > 0 && dt < 0.25) kwh += ((curve[i][2] + curve[i - 1][2]) / 2) * dt;
  }
  return kwh;
}

/**
 * Usable capacity = energy per percentage point x 100, over curves that gained at least 30 points.
 * Curves with missing stretches integrate too little energy and so estimate low; the upper
 * quartile is therefore closer to the truth than the median. The power is measured before the
 * battery, so the result still sits slightly above the true net capacity.
 */
export function estimateCapacity(curves: Record<string, CurvePoint[]>): number | null {
  const est: number[] = [];
  for (const c of Object.values(curves)) {
    const gain = c[c.length - 1][1] - c[0][1];
    const kwh = curveEnergy(c);
    if (gain >= 30 && kwh > 0) est.push((kwh / gain) * 100);
  }
  if (est.length < 4) return null;
  est.sort((a, b) => a - b);
  return est[Math.floor(est.length * 0.75)];
}
