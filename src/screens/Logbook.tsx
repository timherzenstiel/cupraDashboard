import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { bucketKey, bucketStart, buckets, isoWeek, type Grain } from '../data/derive.ts';
import type { Bucket, Session, Trip } from '../data/types.ts';
import type { Derived } from '../store/DataContext';
import { Button, Card, H2, Kpi, Legend, ListRow, Mono, Segmented, Sub, T } from '../ui/primitives';
import { colors, font, space } from '../theme/tokens';
import { MONTHS, MONTHS_LONG, WEEKDAYS, WEEKDAYS_LONG, clock, dayMonth, duration, num, weekdayIndex } from '../format';

type Mode = 'week' | 'month' | 'year';
type Filter = 'all' | 'trip' | 'charge';
const EMPTY: Bucket = { key: '', start: 0, km: 0, trips: 0, driveKwh: 0, driveKm: 0, chargedKwh: 0, acKwh: 0, dcKwh: 0, sessions: 0 };
const DAY = 86_400_000;

const add = (a: Bucket, b: Bucket): Bucket => ({ ...a, km: a.km + b.km, trips: a.trips + b.trips, driveKwh: a.driveKwh + b.driveKwh, driveKm: a.driveKm + b.driveKm, chargedKwh: a.chargedKwh + b.chargedKwh, acKwh: a.acKwh + b.acKwh, dcKwh: a.dcKwh + b.dcKwh, sessions: a.sessions + b.sessions });
const sum = (list: Bucket[]) => list.reduce(add, EMPTY);
const per100 = (b: Bucket) => (b.driveKm > 0 ? (b.driveKwh / b.driveKm) * 100 : null);
const shift = (t: number, mode: Mode, by: number) => { const d = new Date(t); if (mode === 'week') d.setDate(d.getDate() + 7 * by); else if (mode === 'month') d.setMonth(d.getMonth() + by, 1); else d.setFullYear(d.getFullYear() + by, 0, 1); return d.getTime(); };
const addDays = (t: number, n: number) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };

export function Logbook({ data }: { data: Derived }) {
  const { ds, trips, sessions } = data;
  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState(ds.to);
  const [filter, setFilter] = useState<Filter>('all');
  const [selDay, setSelDay] = useState<number | null>(null);

  const by = useMemo(() => ({ day: buckets(trips, sessions, 'day'), week: buckets(trips, sessions, 'week'), month: buckets(trips, sessions, 'month') }), [trips, sessions]);
  const get = (grain: Grain, start: number) => by[grain as 'day'].get(bucketKey(start, grain)) ?? { ...EMPTY, start };

  const start = bucketStart(anchor, mode);
  const end = shift(start, mode, 1);
  const days: number[] = [];
  for (let t = start; t < end; t = addDays(t, 1)) days.push(t);

  let label: string;
  let cells: { key: string; label: string; b: Bucket; day?: number; blank?: boolean; future?: boolean }[];
  let aggTitle: string;
  let aggs: { label: string; b: Bucket }[];
  if (mode === 'year') {
    const y = new Date(start).getFullYear();
    label = '' + y;
    const months = Array.from({ length: 12 }, (_, i) => get('month', new Date(y, i, 1).getTime()));
    cells = months.map((b, i) => ({ key: 'm' + i, label: MONTHS[i], b, future: new Date(y, i, 1).getTime() > ds.to }));
    aggTitle = 'Quartal';
    aggs = [0, 1, 2, 3].map((q) => ({ label: ['Jan–Mär', 'Apr–Jun', 'Jul–Sep', 'Okt–Dez'][q], b: sum(months.slice(q * 3, q * 3 + 3)) }));
  } else {
    const dayCells = days.map((t) => ({ key: 'd' + t, label: mode === 'week' ? dayMonth(t) : '' + new Date(t).getDate(), b: get('day', t), day: t, future: t > ds.to }));
    if (mode === 'week') {
      label = 'KW ' + isoWeek(start) + ' · ' + dayMonth(start) + '–' + dayMonth(addDays(start, 6)) + new Date(start).getFullYear();
      cells = dayCells;
      aggTitle = 'Vergleich';
      const prev12 = Array.from({ length: 12 }, (_, i) => get('week', shift(start, 'week', -(i + 1))));
      const avg = sum(prev12);
      aggs = [{ label: 'Diese Woche', b: sum(dayCells.map((c) => c.b)) }, { label: 'Vorwoche', b: prev12[0] }, { label: 'Ø der 12 Wochen davor', b: { ...avg, km: avg.km / 12, trips: avg.trips / 12, chargedKwh: avg.chargedKwh / 12 } }];
    } else {
      label = MONTHS_LONG[new Date(start).getMonth()] + ' ' + new Date(start).getFullYear();
      cells = [...Array.from({ length: weekdayIndex(start) }, (_, i) => ({ key: 'b' + i, label: '', b: EMPTY, blank: true })), ...dayCells];
      aggTitle = 'Kalenderwoche';
      aggs = [];
      for (let w = bucketStart(start, 'week'); w < end && w <= ds.to; w = addDays(w, 7)) {
        const inMonth = days.filter((t) => t >= w && t < addDays(w, 7));
        aggs.push({ label: 'KW ' + isoWeek(w) + ' · ' + dayMonth(inMonth[0]) + '–' + dayMonth(inMonth[inMonth.length - 1]), b: sum(inMonth.map((t) => get('day', t))) });
      }
    }
  }
  const total = sum(cells.map((c) => c.b));
  const maxKm = Math.max(1, ...cells.map((c) => c.b.km));
  const maxKwh = Math.max(1, ...cells.map((c) => c.b.chargedKwh));

  // The list shows one day in month view (the chosen one, else the latest with entries), the whole week in week view.
  const activeDay = mode === 'month' ? (selDay != null && selDay >= start && selDay < end ? selDay : [...days].reverse().find((t) => { const b = get('day', t); return b.trips + b.sessions > 0; }) ?? null) : null;
  const [from, to] = mode === 'month' ? (activeDay != null ? [activeDay, addDays(activeDay, 1)] : [0, 0]) : [start, end];
  type Entry = { t: number; trip?: Trip; session?: Session };
  const entries: Entry[] = mode === 'year' ? [] : [
    ...(filter !== 'charge' ? trips.filter((t) => t.start >= from && t.start < to).map((trip) => ({ t: trip.start, trip })) : []),
    ...(filter !== 'trip' ? sessions.filter((s) => s.start >= from && s.start < to).map((session) => ({ t: session.start, session })) : []),
  ].sort((a, b) => a.t - b.t);
  const listTitle = mode === 'year' ? 'Monate' : mode === 'week' ? 'Fahrten und Ladevorgänge der Woche' : activeDay != null ? WEEKDAYS_LONG[weekdayIndex(activeDay)] + ', ' + new Date(activeDay).getDate() + '. ' + MONTHS_LONG[new Date(activeDay).getMonth()] : 'Keine Einträge';
  const cols = mode === 'year' ? 4 : 7;

  return (
    <View style={{ gap: space.gap }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <Segmented label="Zeitraum" value={mode} onChange={(v) => { setMode(v); setSelDay(null); }} options={[{ value: 'week', label: 'Woche' }, { value: 'month', label: 'Monat' }, { value: 'year', label: 'Jahr' }]} />
        <Button label="‹" accessibilityLabel="Zeitraum zurück" onPress={() => setAnchor(shift(start, mode, -1))} />
        <View style={{ minWidth: 200 }}><T style={{ fontFamily: font.head, fontWeight: '600', fontSize: 22, lineHeight: 28 }}>{label}</T></View>
        <Button label="›" accessibilityLabel="Zeitraum vor" onPress={() => setAnchor(shift(start, mode, 1))} />
        <Button label="Neueste" onPress={() => { setAnchor(ds.to); setSelDay(null); }} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.gap }}>
        <Kpi label="Strecke" value={num(total.km)} unit="km" />
        <Kpi label="Fahrten" value={num(total.trips)} />
        <Kpi label="Ø Verbrauch" value={num(per100(total), 1)} unit="kWh/100 km" />
        <Kpi label="Geladen" value={num(total.chargedKwh)} unit="kWh" />
        <Kpi label="Ladevorgänge" value={num(total.sessions)} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.gap, alignItems: 'flex-start' }}>
        <Card style={{ flexGrow: 3, flexBasis: 560 }} title="Kalender" right={<Legend items={[{ label: 'gefahren', color: colors.blue }, { label: 'geladen', color: colors.copper }]} />} source="mileage · chargingSession · currentSOCInPct">
          <View style={{ gap: 4 }}>
            {mode !== 'year' ? <View style={{ flexDirection: 'row', gap: 4 }}>{WEEKDAYS.map((d) => <Sub key={d} style={{ flex: 1, fontSize: 12, color: colors.muted, paddingHorizontal: 6 }}>{d}</Sub>)}</View> : null}
            {Array.from({ length: Math.ceil(cells.length / cols) }, (_, r) => (
              <View key={r} style={{ flexDirection: 'row', gap: 4 }}>
                {Array.from({ length: cols }, (_, c) => {
                  const cell = cells[r * cols + c];
                  if (!cell || cell.blank) return <View key={c} style={{ flex: 1 }} />;
                  const on = cell.day != null && cell.day === activeDay;
                  return (
                    <Pressable key={cell.key} accessibilityRole="button" accessibilityState={{ selected: on }} disabled={mode !== 'month'}
                      accessibilityLabel={cell.label + ': ' + num(cell.b.km) + ' km gefahren, ' + num(cell.b.chargedKwh) + ' kWh geladen'} onPress={() => cell.day != null && setSelDay(cell.day)}
                      style={{ flex: 1, minWidth: 0, minHeight: 84, padding: 6, borderRadius: 6, borderWidth: 1, borderColor: on ? colors.muted : colors.border, backgroundColor: on ? colors.raised : colors.inset, justifyContent: 'space-between', gap: 4 }}>
                      <Mono style={{ fontSize: 12, color: cell.future ? '#56606A' : colors.text2 }}>{cell.label}</Mono>
                      <View style={{ gap: 3 }}>
                        <T numberOfLines={1} style={{ fontSize: 12 }}>{cell.b.km > 0 ? num(cell.b.km) + ' km' : ' '}</T>
                        <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.blue, width: `${(cell.b.km / maxKm) * 100}%` }} />
                        <T numberOfLines={1} style={{ fontSize: 12, color: colors.text2 }}>{cell.b.chargedKwh > 0 ? num(cell.b.chargedKwh) + ' kWh' : ' '}</T>
                        <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.copper, width: `${(cell.b.chargedKwh / maxKwh) * 100}%` }} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          <View>
            <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 6 }}>
              <Sub style={{ flex: 2 }}>{aggTitle}</Sub>
              {['Strecke', 'Fahrten', 'Ø Verbrauch', 'Geladen'].map((h) => <Sub key={h} style={{ flex: 1, textAlign: 'right' }}>{h}</Sub>)}
            </View>
            {aggs.map((a) => (
              <View key={a.label} style={{ flexDirection: 'row', gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border }}>
                <T numberOfLines={1} style={{ flex: 2, fontSize: 13 }}>{a.label}</T>
                <Mono style={{ flex: 1, textAlign: 'right' }}>{num(a.b.km) + ' km'}</Mono>
                <Mono style={{ flex: 1, textAlign: 'right' }}>{num(a.b.trips)}</Mono>
                <Mono style={{ flex: 1, textAlign: 'right' }}>{num(per100(a.b), 1)}</Mono>
                <Mono style={{ flex: 1, textAlign: 'right' }}>{num(a.b.chargedKwh) + ' kWh'}</Mono>
              </View>
            ))}
          </View>
        </Card>

        <Card style={{ flexGrow: 2, flexBasis: 400 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <H2>{listTitle}</H2>
            {mode !== 'year' ? <Segmented label="Filter" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Alle' }, { value: 'trip', label: 'Fahrten' }, { value: 'charge', label: 'Laden' }]} /> : null}
          </View>
          <View>
            {mode === 'year' ? cells.filter((c) => c.b.trips + c.b.sessions > 0).reverse().map((c, i) => (
              <ListRow key={c.key} first={i === 0}>
                <View style={{ flex: 1, gap: 2 }}><T style={{ fontWeight: '500' }}>{c.label}</T><Sub>{num(c.b.trips) + ' Fahrten · ' + num(per100(c.b), 1) + ' kWh/100 km'}</Sub></View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}><Mono>{num(c.b.km) + ' km'}</Mono><Mono style={{ fontSize: 12, color: colors.text2 }}>{num(c.b.chargedKwh) + ' kWh geladen'}</Mono></View>
              </ListRow>
            )) : entries.map((e, i) => (
              <ListRow key={(e.trip ? 't' : 's') + e.t} first={i === 0}>
                <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: e.trip ? colors.blue : colors.copper }} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <T style={{ fontWeight: '500' }}>{e.trip ? 'Fahrt' : 'Laden ' + e.session!.type.toUpperCase()}</T>
                  <Sub>{(mode === 'week' ? WEEKDAYS[weekdayIndex(e.t)] + ' ' + dayMonth(e.t) + ' · ' : '') + clock(e.t) + ' Uhr · ' + (e.trip ? duration(e.trip.minutes) : duration((e.session!.stop - e.session!.start) / 60000))}</Sub>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Mono>{e.trip ? num(e.trip.km) + ' km' : num(e.session!.kwh, 1) + ' kWh'}</Mono>
                  <Mono style={{ fontSize: 12, color: colors.text2 }}>{e.trip ? num(e.trip.kmh) + ' km/h' + (e.trip.per100 != null ? ' · ' + num(e.trip.per100, 1) + ' kWh/100' : '') : num(e.session!.startSoc) + ' → ' + num(e.session!.endSoc) + ' % · max ' + num(e.session!.peakKw, 1) + ' kW'}</Mono>
                </View>
              </ListRow>
            ))}
            {mode !== 'year' && entries.length === 0 ? <Sub>In diesem Zeitraum gibt es keine Einträge.</Sub> : null}
          </View>
        </Card>
      </View>
    </View>
  );
}
