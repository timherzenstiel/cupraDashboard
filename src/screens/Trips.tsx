import React, { useMemo } from 'react';
import { View } from 'react-native';
import { buckets, byClass } from '../data/derive.ts';
import type { Derived } from '../store/DataContext';
import { Bars } from '../charts/Bars';
import { XYChart } from '../charts/XYChart';
import { niceMax, ticksUpTo } from '../charts/scale';
import { Card, Grid, Kpi, ListRow, Mono, Sub } from '../ui/primitives';
import { colors, space } from '../theme/tokens';
import { MONTHS, clock, dateShort, duration, monthLabel, num } from '../format';
import { median } from './Overview';

export function Trips({ data }: { data: Derived }) {
  const { trips, sessions, capacity } = data;
  const m = useMemo(() => {
    const km = trips.reduce((s, t) => s + t.km, 0);
    const hours = trips.reduce((s, t) => s + t.minutes, 0) / 60;
    const longest = trips.slice().sort((a, b) => b.km - a.km).slice(0, 6);
    const length = byClass(trips, [0, 5, 20, 50, 150, 1e9], ['unter 5', '5–20', '20–50', '50–150', 'über 150'], (t) => t.km);
    const speed = byClass(trips.filter((t) => t.km >= 8), [0, 30, 50, 70, 90, 110, 1e9], ['unter 30', '30–50', '50–70', '70–90', '90–110', 'über 110'], (t) => t.kmh);
    const months = [...buckets(trips, sessions, 'month').values()].sort((a, b) => a.start - b.start);
    return { km, hours, longest, length, speed, months };
  }, [trips, sessions]);

  const speedPts = m.speed.map((c, i) => ({ c, i })).filter((p) => p.c.per100 != null && p.c.km > 100);
  const speedY = niceMax(Math.max(1, ...speedPts.map((p) => p.c.per100!)), 3);
  const rangeMonths = m.months.filter((b) => b.driveKm > 200);
  const range = (b: (typeof rangeMonths)[number]) => capacity / (b.driveKwh / b.driveKm);
  const rangeY = niceMax(Math.max(1, ...rangeMonths.map(range)), 4);

  return (
    <View style={{ gap: space.gap }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.gap }}>
        <Kpi label="Fahrten" value={num(trips.length)} sub={num(m.km) + ' km insgesamt'} source="mileage" />
        <Kpi label="Ø Strecke" value={num(m.km / (trips.length || 1), 1)} unit="km" sub={'Hälfte der Fahrten unter ' + num(median(trips.map((t) => t.km))) + ' km'} source="mileage" />
        <Kpi label="Ø Tempo" value={num(m.hours ? m.km / m.hours : null)} unit="km/h" sub={'Fahrzeit gesamt ' + num(m.hours) + ' h'} source="mileage · timestampUtc" />
        <Kpi label="Längste Fahrt" value={num(m.longest[0]?.km)} unit="km" sub={m.longest[0] ? dateShort(m.longest[0].start) + ' · ' + duration(m.longest[0].minutes) : ''} source="mileage" />
      </View>

      <Grid>
        <Card title="Verbrauch nach Streckenlänge" note="kWh je 100 km. Unter 5 km ist der Wert ungenau, weil der Ladestand nur in ganzen Prozent vorliegt." source="mileage · currentSOCInPct">
          <Bars unit="kWh" showValues digits={1} seriesColors={[colors.blue]} data={m.length.map((c) => ({ label: c.label + ' km', values: [c.per100 ?? 0], tip: c.label + ' km · ' + num(c.per100, 1) + ' kWh/100 km · ' + c.trips + ' Fahrten · ' + num(c.km) + ' km' }))} />
        </Card>
        <Card title="Verbrauch nach Durchschnittstempo" note="Fahrten ab 8 km, nach Durchschnittstempo der ganzen Fahrt gruppiert." source="mileage · timestampUtc · currentSOCInPct">
          <XYChart x={[-0.5, m.speed.length - 0.5]} y={[0, speedY.max]}
            xTicks={m.speed.map((c, i) => ({ v: i, label: c.label }))}
            yTicks={ticksUpTo(speedY.max, speedY.step).map((v) => ({ v, label: num(v) }))}
            series={[{ color: colors.blue, points: speedPts.map((p) => [p.i, p.c.per100!]) }]}
            dots={speedPts.map((p) => ({ x: p.i, y: p.c.per100!, tip: p.c.label + ' km/h · ' + num(p.c.per100, 1) + ' kWh/100 km · ' + p.c.trips + ' Fahrten' }))}
            caption="kWh je 100 km über km/h. Punkt antippen für Details." />
        </Card>
      </Grid>

      <Grid>
        <Card title="Reale Reichweite bei vollem Akku" note={'Geschätzte Kapazität von ' + num(capacity, 1) + ' kWh geteilt durch den Monatsverbrauch.'} source="powerCurve · currentSOCInPct · mileage">
          <XYChart x={[-0.5, rangeMonths.length - 0.5]} y={[0, rangeY.max]}
            xTicks={rangeMonths.map((b, i) => ({ v: i, label: i % 2 === 0 ? MONTHS[new Date(b.start).getMonth()] : '' }))}
            yTicks={ticksUpTo(rangeY.max, rangeY.step).map((v) => ({ v, label: num(v) }))}
            series={[{ color: colors.accent, points: rangeMonths.map((b, i) => [i, range(b)]) }]}
            dotColor={colors.accent}
            dots={rangeMonths.map((b, i) => ({ x: i, y: range(b), tip: monthLabel(b.start) + ' · ' + num(range(b)) + ' km' }))}
            caption="Kilometer. Punkt antippen für Details." />
        </Card>
        <Card title="Strecke pro Monat" source="mileage">
          <Bars unit="km" seriesColors={[colors.blue]} data={m.months.map((b) => ({ label: MONTHS[new Date(b.start).getMonth()], values: [b.km], tip: monthLabel(b.start) + ' · ' + num(b.km) + ' km · ' + b.trips + ' Fahrten' }))} />
        </Card>
      </Grid>

      <Grid>
        <Card title="Längste Fahrten" source="mileage · currentSOCInPct">
          <View>
            {m.longest.map((t, i) => (
              <ListRow key={t.start} first={i === 0}>
                <Mono style={{ width: 118 }}>{dateShort(t.start) + ' ' + clock(t.start)}</Mono>
                <Mono style={{ flex: 1 }}>{num(t.km) + ' km'}</Mono>
                <Mono style={{ color: colors.text2 }}>{duration(t.minutes) + ' · ' + num(t.kmh) + ' km/h'}</Mono>
                <Mono style={{ width: 60, textAlign: 'right' }}>{num(t.per100, 1)}</Mono>
              </ListRow>
            ))}
          </View>
          <Sub>Letzte Spalte: kWh je 100 km.</Sub>
        </Card>
      </Grid>
    </View>
  );
}
