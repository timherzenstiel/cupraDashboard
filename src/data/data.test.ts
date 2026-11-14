import test from 'node:test';
import assert from 'node:assert/strict';
import { curveEnergy, parseExport, parseTime } from './parse.ts';
import { allSessions, bucketKey, bucketStart, buckets, deriveStandby, deriveTrips, isoWeek, valueAt } from './derive.ts';

const iso = (t: number) => new Date(t).toISOString();
const T0 = Date.UTC(2026, 2, 2, 7, 0, 0); // Monday 2 March 2026, 08:00 in Berlin
const MIN = 60_000;
const row = (dataFieldName: string, value: string | number, t: number | string) => ({ key: 'k', dataFieldName, value: String(value), timestampUtc: typeof t === 'number' ? iso(t) : t });

function fixture() {
  const Data = [];
  // Parked, then a 20 km trip with one tick per km every minute, SoC falling 80 -> 75.
  Data.push(row('mileage', 1000, T0 - 600 * MIN), row('currentSOCInPct', 80, T0 - 600 * MIN));
  for (let k = 1; k <= 20; k++) Data.push(row('mileage', 1000 + k, T0 + k * MIN));
  for (let p = 1; p <= 5; p++) Data.push(row('currentSOCInPct', 80 - p, T0 + p * 4 * MIN));
  // A data dropout while driving: 40 km in 30 minutes still belongs to one second trip after a 2 h stop.
  Data.push(row('mileage', 1021, T0 + 140 * MIN), row('mileage', 1061, T0 + 170 * MIN), row('mileage', 1062, T0 + 171 * MIN));
  Data.push(row('currentSOCInPct', 65, T0 + 171 * MIN));
  // Junk the real export contains.
  Data.push(row('mileage', 0, '0001-01-01T00:00:00.000Z'), row('currentSOCInPct', 50, 'N/A'), row('text', '', T0));
  Data.push(row('text', 'Please replace key battery.', T0 + MIN), row('priority', 114, T0 + MIN), row('category', 'COMFORT', T0 + MIN));
  // One reported AC session with a power curve: 10 kW for one hour, 40 -> 53 %.
  const s = T0 + 300 * MIN;
  for (const [f, v] of Object.entries({ sessionId: 'abc', startChargingTimestamp: iso(s), stopChargingTimestamp: iso(s + 60 * MIN), chargeType: 'AC', endSoc: 53, deltaSoc: 13, activeChargingTime: 3600, peakChargePower: 10 })) {
    Data.push(row('chargingSession.[1].' + f, v, '1970-01-21T16:08:17.060Z'));
  }
  Data.push(row('powerCurve.[1].sessionId', 'abc', 'N/A'));
  for (let i = 0; i <= 6; i++) {
    Data.push(row(`powerCurve.[1].timeCurve.[${i}].timestamp`, iso(s + i * 10 * MIN), 'N/A'), row(`powerCurve.[1].timeCurve.[${i}].soc`, 40 + i * 2, 'N/A'), row(`powerCurve.[1].timeCurve.[${i}].chargePower`, 10, 'N/A'));
  }
  Data.push(row('aggregation.month.[0].date', '2026-03-01T00:00Z', T0), row('aggregation.month.[0].chargedEnergy', '10.0', T0));
  return { vin: 'TESTVIN', userId: 'u', Data };
}

test('parseTime rejects the placeholder timestamps', () => {
  assert.ok(Number.isNaN(parseTime('N/A')));
  assert.ok(Number.isNaN(parseTime('1970-01-21T16:08:17.060Z')));
  assert.ok(Number.isNaN(parseTime('+58511-05-15T05:58:25Z')));
  assert.equal(parseTime('2026-03-02T07:00:00.000Z'), T0);
});

test('parseExport builds series, sessions and warnings and leaves the VIN out', () => {
  const ds = parseExport(fixture());
  assert.equal(ds.odo[0][1], 1000);
  assert.equal(ds.odo.length, 24);
  assert.equal(ds.sessions.length, 1);
  assert.equal(ds.sessions[0].startSoc, 40);
  assert.ok(Math.abs(ds.sessions[0].kwh - 10) < 1e-9 && ds.sessions[0].kwhFromCurve);
  assert.deepEqual(ds.warnings.map((w) => [w.text, w.priority]), [['Please replace key battery.', 114]]);
  assert.equal(ds.aggMonth[0][1], 10);
  assert.ok(!JSON.stringify(ds).includes('TESTVIN'));
});

test('curveEnergy ignores gaps longer than 15 minutes', () => {
  assert.equal(curveEnergy([[0, 10, 60], [600_000, 20, 60], [3_600_000, 30, 60]]), 10);
});

test('deriveTrips splits on stops and keeps dropouts inside a trip', () => {
  const ds = parseExport(fixture());
  const trips = deriveTrips(ds);
  assert.equal(trips.length, 2);
  assert.equal(trips[0].km, 20);
  assert.equal(trips[0].socStart, 80);
  assert.equal(trips[0].socEnd, 75);
  assert.equal(trips[1].km, 42);
  assert.ok(trips[0].per100 != null && Math.abs(trips[0].per100 - ((5 / 100) * 77) / 20 * 100) < 1e-9);
});

test('buckets, week starts and ISO weeks use local time', () => {
  const ds = parseExport(fixture());
  const trips = deriveTrips(ds);
  const b = buckets(trips, allSessions(ds), 'day');
  assert.equal(b.get('2026-03-02')?.km, 62);
  assert.ok(Math.abs((b.get('2026-03-02')?.acKwh ?? 0) - 10) < 1e-9);
  const sunday = new Date(2026, 2, 8, 12).getTime();
  assert.equal(bucketKey(bucketStart(sunday, 'week'), 'week'), '2026-03-02');
  assert.equal(isoWeek(bucketStart(sunday, 'week')), 10);
  assert.equal(isoWeek(new Date(2026, 11, 28).getTime()), 53);
  assert.equal(valueAt(ds.soc, T0 - 1000 * MIN), null);
  assert.deepEqual(deriveStandby(ds, trips, allSessions(ds)), []);
});

test('climaEvents drops blips and records whether the car was plugged in', async () => {
  const { climaEvents, displayedFullRange } = await import('./derive.ts');
  const f = fixture();
  f.Data.push(row('plugConnectionState', 'connected', T0 + 290 * MIN), row('climatisationState', 'heating', T0 + 295 * MIN), row('climatisationState', 'off', T0 + 310 * MIN));
  f.Data.push(row('climatisationState', 'ventilation', T0 + 400 * MIN), row('climatisationState', 'off', T0 + 400 * MIN + 5000));
  f.Data.push(row('cruisingRangeElectricInKm', 320, T0 - 600 * MIN));
  const ds = parseExport(f);
  const ev = climaEvents(ds);
  assert.equal(ev.length, 1);
  assert.deepEqual([ev[0].mode, ev[0].minutes, ev[0].plugged], [1, 15, true]);
  const shown = displayedFullRange(ds).get('2026-03') ?? 0;
  assert.ok(shown >= 400 && shown <= 427, 'range scaled to a full battery');
});
