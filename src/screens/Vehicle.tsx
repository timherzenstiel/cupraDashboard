import React, { useMemo } from 'react';
import { View } from 'react-native';
import { bucketKey, bucketStart, buckets, displayedFullRange } from '../data/derive.ts';
import type { Derived } from '../store/DataContext';
import { XYChart } from '../charts/XYChart';
import { niceMax, ticksUpTo } from '../charts/scale';
import { Card, Grid, Kpi, Legend, ListRow, Mono, Sub, T } from '../ui/primitives';
import { colors, space } from '../theme/tokens';
import { MONTHS, dateShort, monthLabel, num } from '../format';

const DAY = 86_400_000;
const PARTS: [string, string][] = [['front_left', 'vorn links'], ['front_right', 'vorn rechts'], ['rear_left', 'hinten links'], ['rear_right', 'hinten rechts']];
const WORDS: Record<string, string> = { CLOSED: 'zu', OPEN: 'offen', LOCKED: 'verriegelt', UNLOCKED: 'nicht verriegelt' };
const word = (v: string | undefined) => (v ? WORDS[v] ?? v.toLowerCase() : '–');

export function Vehicle({ data }: { data: Derived }) {
  const { ds, trips, sessions, capacity } = data;
  const snap = ds.snapshot;
  const m = useMemo(() => {
    const groups = new Map<string, { text: string; n: number; first: number; last: number }>();
    for (const w of ds.warnings) {
      const g = groups.get(w.text);
      if (g) { g.n++; g.last = Math.max(g.last, w.t); g.first = Math.min(g.first, w.t); }
      else groups.set(w.text, { text: w.text, n: 1, first: w.t, last: w.t });
    }
    const shown = displayedFullRange(ds);
    const months = [...buckets(trips, sessions, 'month').values()].sort((a, b) => a.start - b.start).filter((b) => b.driveKm > 200);
    const range = months.map((b) => ({ start: b.start, real: capacity / (b.driveKwh / b.driveKm), shown: shown.get(bucketKey(bucketStart(b.start, 'month'), 'month')) ?? null }));
    return { groups: [...groups.values()].sort((a, b) => b.last - a.last), range };
  }, [ds, trips, sessions, capacity]);

  const insp = ds.inspectionDays;
  const inspNow = insp.length ? insp[insp.length - 1] : null;
  const due = inspNow ? inspNow[0] + inspNow[1] * DAY : null;
  const lastWarn = ds.warnings.length ? ds.warnings[ds.warnings.length - 1] : null;
  const tMin = snap['hvbatterytemperature_info.min_temperature.value'];
  const tMax = snap['hvbatterytemperature_info.max_temperature.value'];
  const openParts = PARTS.filter(([k]) => snap[`door_info.${k}.door_status.value`] === 'OPEN' || snap[`window_info.${k}.window_status.value`] === 'OPEN').length;
  const unlocked = PARTS.filter(([k]) => snap[`door_info.${k}.door_lock_status.value`] === 'UNLOCKED').length;
  const rangeY = niceMax(Math.max(1, ...m.range.flatMap((r) => [r.real, r.shown ?? 0])), 4);
  const inspY = niceMax(Math.max(1, ...insp.map((p) => p[1])), 4);
  const span = Math.max(1, ds.to - ds.from);

  return (
    <View style={{ gap: space.gap }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.gap }}>
        <Kpi label="Nächste Inspektion" value={num(inspNow?.[1])} unit="Tage" sub={due ? 'fällig um den ' + dateShort(due) : 'keine Angabe in der Datei'} source="inspectionDueDays" />
        <Kpi label="Warnmeldungen" value={num(ds.warnings.length)} sub={lastWarn ? 'letzte am ' + dateShort(lastWarn.t) : 'keine in der Datei'} source="text · category · priority" />
        <Kpi label="Batterietemperatur" value={tMin && tMax ? num(+tMin, 1) + '–' + num(+tMax, 1) : '–'} unit="°C" sub="letzter gemeldeter Wert" source="hvbatterytemperature_info" />
        <Kpi label="Türen und Fenster" value={openParts + unlocked === 0 ? 'zu' : openParts + ' offen'} sub={unlocked === 0 ? 'alle Türen verriegelt' : unlocked + ' Türen nicht verriegelt'} source="door_info · window_info" />
      </View>

      <Grid>
        <Card title="Angezeigte gegen reale Reichweite" right={<Legend items={[{ label: 'Anzeige im Auto', color: colors.blue }, { label: 'real gefahren', color: colors.copper }]} />}
          note="Beide auf einen vollen Akku hochgerechnet. Die Anzeige ist der Monatsmittelwert aus Reichweite geteilt durch Ladestand." source="cruisingRangeElectricInKm · currentSOCInPct · mileage">
          <XYChart x={[-0.5, m.range.length - 0.5]} y={[0, rangeY.max]}
            xTicks={m.range.map((r, i) => ({ v: i, label: i % 2 === 0 ? MONTHS[new Date(r.start).getMonth()] : '' }))}
            yTicks={ticksUpTo(rangeY.max, rangeY.step).map((v) => ({ v, label: num(v) }))}
            series={[{ color: colors.blue, points: m.range.filter((r) => r.shown != null).map((r) => [m.range.indexOf(r), r.shown!]) }, { color: colors.copper, points: m.range.map((r, i) => [i, r.real]) }]}
            dotColor={colors.copper}
            dots={m.range.map((r, i) => ({ x: i, y: r.real, tip: monthLabel(r.start) + ' · real ' + num(r.real) + ' km · Anzeige ' + num(r.shown) + ' km' }))}
            caption="Kilometer. Punkt antippen für Details." />
        </Card>
        <Card title="Countdown zur Inspektion" note={due ? 'Bei gleichbleibendem Verlauf ist die Inspektion um den ' + dateShort(due) + ' fällig.' : undefined} source="inspectionDueDays">
          <XYChart x={[ds.from, ds.to]} y={[0, inspY.max]}
            xTicks={[0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: ds.from + f * span, label: monthLabel(ds.from + f * span) }))}
            yTicks={ticksUpTo(inspY.max, inspY.step).map((v) => ({ v, label: num(v) }))}
            series={[{ color: colors.accent, points: insp.map((p) => [p[0], p[1]] as [number, number]), gapX: 20 * DAY }]}
            caption="Tage bis zur nächsten Inspektion." />
        </Card>
      </Grid>

      <Grid>
        <Card title="Warnmeldungen" note={ds.warnings.length ? 'Nach Meldung zusammengefasst, neueste zuerst.' : undefined} source="text · category · priority · timestampUtc">
          <View>
            {m.groups.map((g, i) => (
              <ListRow key={g.text} first={i === 0}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <T style={{ fontWeight: '500' }}>{g.text}</T>
                  <Sub>{g.n === 1 ? 'am ' + dateShort(g.first) : dateShort(g.first) + ' bis ' + dateShort(g.last)}</Sub>
                </View>
                <Mono>{g.n + '×'}</Mono>
              </ListRow>
            ))}
            {ds.warnings.length === 0 ? <Sub>Die Datei enthält keine Warnmeldungen.</Sub> : null}
          </View>
          {lastWarn && ds.to - lastWarn.t > 60 * DAY ? <Sub>{'Seit dem ' + dateShort(lastWarn.t) + ' enthält die Datei keine Meldung mehr. Ob es seither keine gab oder das Fahrzeug sie nicht mehr liefert, lässt sich aus der Datei nicht unterscheiden.'}</Sub> : null}
        </Card>
        <Card title="Zuletzt gemeldeter Zustand" note="Momentaufnahme vom Zeitpunkt des Exports, kein Verlauf." source="door_info · window_info · trunk_lid_info · hood_info">
          <View>
            {PARTS.map(([k, label], i) => (
              <ListRow key={k} first={i === 0}>
                <T style={{ flex: 1 }}>{'Tür ' + label}</T>
                <Mono style={{ color: colors.text2 }}>{word(snap[`door_info.${k}.door_status.value`]) + ' · ' + word(snap[`door_info.${k}.door_lock_status.value`])}</Mono>
                <Mono style={{ width: 110, textAlign: 'right' }}>{'Fenster ' + word(snap[`window_info.${k}.window_status.value`])}</Mono>
              </ListRow>
            ))}
            <ListRow><T style={{ flex: 1 }}>Kofferraum</T><Mono style={{ color: colors.text2 }}>{word(snap['trunk_lid_info.trunk_lid_status.value']) + ' · ' + word(snap['trunk_lid_info.trunk_lid_lock_status.value'])}</Mono></ListRow>
            <ListRow><T style={{ flex: 1 }}>Motorhaube</T><Mono style={{ color: colors.text2 }}>{word(snap['hood_info.hood_status.value'])}</Mono></ListRow>
          </View>
        </Card>
      </Grid>
    </View>
  );
}
