import React, { useMemo } from 'react';
import { View } from 'react-native';
import { buckets, chargeStartGrid, consumption, socDwell } from '../data/derive.ts';
import type { Derived } from '../store/DataContext';
import { Bars } from '../charts/Bars';
import { XYChart } from '../charts/XYChart';
import { niceMax, ticksUpTo } from '../charts/scale';
import { Card, Grid, Kpi, Legend, ListRow, Mono, Sub, T } from '../ui/primitives';
import { colors, seq, space } from '../theme/tokens';
import { MONTHS, WEEKDAYS, clock, dateShort, monthLabel, num } from '../format';

export function Overview({ data }: { data: Derived }) {
  const { ds, trips, sessions, capacity } = data;
  const m = useMemo(() => {
    const months = [...buckets(trips, sessions, 'month').values()].sort((a, b) => a.start - b.start);
    const km = trips.reduce((s, t) => s + t.km, 0);
    const charged = sessions.reduce((s, x) => s + x.kwh, 0);
    const dc = sessions.filter((s) => s.type === 'dc').reduce((s, x) => s + x.kwh, 0);
    const season = (ms: number[]) => consumption(trips.filter((t) => ms.includes(new Date(t.start).getMonth())));
    const dwell = socDwell(ds);
    return { months, km, charged, dc, winter: season([11, 0, 1]), summer: season([5, 6, 7]), above80: dwell[8] + dwell[9], grid: chargeStartGrid(sessions) };
  }, [ds, trips, sessions]);

  const cons = consumption(trips);
  const consMonths = m.months.filter((b) => b.driveKm > 200);
  const consY = niceMax(Math.max(...consMonths.map((b) => (b.driveKwh / b.driveKm) * 100), 1), 3);
  const heatMax = Math.max(1, ...m.grid.flat());
  const last = sessions.slice(-6).reverse();
  const odo = ds.odo.length ? ds.odo[ds.odo.length - 1][1] : null;

  return (
    <View style={{ gap: space.gap }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.gap }}>
        <Kpi label="Kilometerstand" value={num(odo)} unit="km" sub={'+' + num(m.km) + ' km im Zeitraum'} source="mileage" />
        <Kpi label="Ø Verbrauch" value={num(cons, 1)} unit="kWh/100 km" sub={'Sommer ' + num(m.summer, 1) + ' · Winter ' + num(m.winter, 1)} source="currentSOCInPct × Kapazität ÷ mileage" />
        <Kpi label="Geladene Energie" value={num(m.charged)} unit="kWh" sub={num((m.dc / (m.charged || 1)) * 100) + ' % davon DC'} source="chargingSession · powerCurve" />
        <Kpi label="Ladevorgänge" value={num(sessions.length)} sub={'Ø ' + num(m.charged / (sessions.length || 1), 1) + ' kWh je Vorgang'} source="chargingSession.sessionId" />
        <Kpi label="Nutzbare Kapazität" value={num(capacity, 1)} unit="kWh" sub={ds.capacityKwh ? 'geschätzt aus ' + Object.keys(ds.curves).length + ' Ladekurven' : 'Annahme, keine Ladekurven'} source="powerCurve.chargePower ÷ ΔSoC" />
      </View>

      <Grid>
        <Card title="Geladene Energie pro Monat" right={<Legend items={[{ label: 'AC', color: colors.blue }, { label: 'DC', color: colors.copper }]} />} source="chargingSession.deltaSoc · powerCurve.timeCurve · chargePowerInKW">
          <Bars unit="kWh" seriesColors={[colors.blue, colors.copper]} data={m.months.map((b) => ({ label: MONTHS[new Date(b.start).getMonth()], values: [b.acKwh, b.dcKwh], tip: monthLabel(b.start) + ' · AC ' + num(b.acKwh) + ' kWh · DC ' + num(b.dcKwh) + ' kWh · gesamt ' + num(b.chargedKwh) + ' kWh' }))} />
        </Card>
        <Card title="Verbrauch pro Monat" note="Aus dem Abfall des Ladestands während der Fahrten, mal geschätzter Kapazität. Ohne Standverluste und Vorklimatisierung." source="currentSOCInPct · mileage">
          <XYChart
            x={[-0.5, consMonths.length - 0.5]} y={[0, consY.max]}
            xTicks={consMonths.map((b, i) => ({ v: i, label: i % 2 === 0 ? MONTHS[new Date(b.start).getMonth()] : '' }))}
            yTicks={ticksUpTo(consY.max, consY.step).map((v) => ({ v, label: num(v) }))}
            series={[{ color: colors.accent, points: consMonths.map((b, i) => [i, (b.driveKwh / b.driveKm) * 100]) }]}
            dotColor={colors.accent}
            dots={consMonths.map((b, i) => ({ x: i, y: (b.driveKwh / b.driveKm) * 100, tip: monthLabel(b.start) + ' · ' + num((b.driveKwh / b.driveKm) * 100, 1) + ' kWh/100 km · ' + num(b.km) + ' km' }))}
            caption="kWh je 100 km. Punkt antippen für Details."
          />
        </Card>
      </Grid>

      <Grid min={380}>
        <Card title="Wann wird geladen?" note="Ladestarts nach Wochentag und Uhrzeit." source="chargingSession.startChargingTimestamp">
          <View style={{ gap: 2 }}>
            {m.grid.map((row, d) => (
              <View key={d} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Sub style={{ width: 22, fontSize: 11, color: colors.muted }}>{WEEKDAYS[d]}</Sub>
                <View style={{ flex: 1, flexDirection: 'row', gap: 2 }}>
                  {row.map((n, h) => (
                    <View key={h} accessibilityLabel={WEEKDAYS[d] + ' ' + h + ' Uhr: ' + n + ' Ladestarts'} style={{ flex: 1, height: 20, borderRadius: 2, backgroundColor: n === 0 ? seq[0] : seq[Math.min(4, 1 + Math.floor(((n - 1) / heatMax) * 4))] }} />
                  ))}
                </View>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginLeft: 30 }}>
            {['0 Uhr', '6', '12', '18', '23'].map((l) => <Sub key={l} style={{ fontSize: 11, color: colors.muted }}>{l}</Sub>)}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Sub style={{ fontSize: 11 }}>selten</Sub>
            {seq.slice(1).map((c) => <View key={c} style={{ width: 16, height: 10, backgroundColor: c }} />)}
            <Sub style={{ fontSize: 11 }}>häufig · bis {heatMax} Starts</Sub>
          </View>
        </Card>

        <Card title="Letzte Ladevorgänge" source="chargingSession.endSoc · deltaSoc · chargeType">
          <View>
            {last.map((s, i) => (
              <ListRow key={s.id} first={i === 0}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.type === 'ac' ? colors.blue : colors.copper }} />
                <Mono style={{ width: 28 }}>{s.type.toUpperCase()}</Mono>
                <Mono style={{ width: 118 }}>{dateShort(s.start) + ' ' + clock(s.start)}</Mono>
                <Mono style={{ flex: 1, color: colors.text2 }}>{num(s.startSoc) + ' → ' + num(s.endSoc) + ' %'}</Mono>
                <Mono>{num(s.kwh, 1) + ' kWh'}</Mono>
              </ListRow>
            ))}
          </View>
        </Card>

        <Card title="Befunde aus deinen Daten">
          <View>
            <ListRow first><View style={{ flex: 1, gap: 2 }}><T style={{ fontWeight: '600' }}>{m.winter != null && m.summer != null ? 'Im Winter ' + num((m.winter / m.summer - 1) * 100) + ' % mehr Verbrauch' : 'Noch kein Jahresvergleich'}</T><Sub>{'Dezember bis Februar ' + num(m.winter, 1) + ', Juni bis August ' + num(m.summer, 1) + ' kWh/100 km.'}</Sub></View></ListRow>
            <ListRow><View style={{ flex: 1, gap: 2 }}><T style={{ fontWeight: '600' }}>{num(m.above80 * 100) + ' % der Zeit über 80 % Ladestand'}</T><Sub>{num(sessions.filter((s) => s.endSoc >= 99).length) + ' von ' + sessions.length + ' Ladevorgängen gingen bis 100 %.'}</Sub></View></ListRow>
            <ListRow><View style={{ flex: 1, gap: 2 }}><T style={{ fontWeight: '600' }}>{data.standby.length ? 'Standverlust ' + num(standbyPerDay(data.standby), 2) + ' Prozentpunkte je Tag' : 'Keine langen Standphasen'}</T><Sub>{'Mittel über ' + data.standby.length + ' Standphasen ab 12 Stunden ohne Ladekabel.'}</Sub></View></ListRow>
          </View>
        </Card>
      </Grid>
    </View>
  );
}

/** Percentage points lost per day across all standby periods together. */
export function standbyPerDay(list: { hours: number; socStart: number; socEnd: number }[]): number | null {
  const days = list.reduce((a, s) => a + s.hours / 24, 0);
  return days > 0 ? list.reduce((a, s) => a + s.socStart - s.socEnd, 0) / days : null;
}

export function median(v: number[]): number | null {
  if (!v.length) return null;
  const s = v.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
