import React, { useMemo } from 'react';
import { View } from 'react-native';
import { bucketKey, bucketStart, climaEvents } from '../data/derive.ts';
import type { Derived } from '../store/DataContext';
import { Bars } from '../charts/Bars';
import { Card, Grid, Kpi, Legend, ListRow, Mono, Sub } from '../ui/primitives';
import { colors, space } from '../theme/tokens';
import { MONTHS, dateShort, monthLabel, num } from '../format';
import { standbyPerDay } from './Overview';

const MODES = ['', 'Heizen', 'Kühlen', 'Lüften'];

export function Standby({ data }: { data: Derived }) {
  const { ds, standby, capacity } = data;
  const m = useMemo(() => {
    const clima = climaEvents(ds);
    const monthKeys: { key: string; start: number }[] = [];
    for (let t = bucketStart(ds.from, 'month'); t <= ds.to; t = new Date(new Date(t).getFullYear(), new Date(t).getMonth() + 1, 1).getTime()) monthKeys.push({ key: bucketKey(t, 'month'), start: t });
    const keyOf = (t: number) => bucketKey(bucketStart(t, 'month'), 'month');
    const months = monthKeys.map((mk) => {
      const sb = standby.filter((s) => keyOf(s.start) === mk.key);
      const ev = clima.filter((e) => keyOf(e.start) === mk.key);
      return { ...mk, loss: standbyPerDay(sb), phases: sb.length, hours: [1, 2, 3].map((mode) => ev.filter((e) => e.mode === mode).reduce((a, e) => a + e.minutes, 0) / 60), events: ev.length };
    });
    const hours = new Array<number>(24).fill(0);
    for (const e of clima) hours[new Date(e.start).getHours()]++;
    const totalDays = standby.reduce((a, s) => a + s.hours / 24, 0);
    const lostPoints = standby.reduce((a, s) => a + s.socStart - s.socEnd, 0);
    return { clima, months, hours, totalDays, lostPoints, plugged: clima.filter((e) => e.plugged).length, minutes: clima.reduce((a, e) => a + e.minutes, 0) };
  }, [ds, standby]);

  const perDay = standbyPerDay(standby);
  const longest = standby.slice().sort((a, b) => b.hours - a.hours).slice(0, 6);
  const worst = standby.filter((s) => s.hours >= 24).sort((a, b) => b.perDay - a.perDay).slice(0, 6);
  const hasClima = m.clima.length > 0;

  return (
    <View style={{ gap: space.gap }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.gap }}>
        <Kpi label="Standverlust" value={num(perDay, 2)} unit="Punkte je Tag" sub={perDay != null ? 'entspricht ' + num((perDay / 100) * capacity, 2) + ' kWh je Tag' : ''} source="ΔcurrentSOCInPct ohne Fahrt und ohne Laden" />
        <Kpi label="Standphasen" value={num(standby.length)} sub={num(m.totalDays) + ' Tage ab 12 h ohne Ladekabel'} source="mileage · plugConnectionState" />
        <Kpi label="Im Stand verloren" value={num((m.lostPoints / 100) * capacity)} unit="kWh" sub={num(m.lostPoints) + ' Prozentpunkte in diesen Phasen'} source="currentSOCInPct × Kapazität" />
        <Kpi label="Klimatisierungen" value={num(m.clima.length)} sub={hasClima ? num((m.plugged / m.clima.length) * 100) + ' % davon am Ladekabel · ' + num(m.minutes / 60) + ' h' : 'keine in der Datei'} source="climatisationState · plugConnectionState" />
      </View>

      <Grid>
        <Card title="Standverlust pro Monat" note="Prozentpunkte Ladestand je Tag, gemittelt über die Standphasen des Monats. Der Ladestand liegt nur in ganzen Prozent vor; kurze Phasen zeigen deshalb oft null." source="currentSOCInPct · mileage · plugConnectionState">
          <Bars unit="Pkt./Tag" digits={2} seriesColors={[colors.blue]} data={m.months.map((b) => ({ label: MONTHS[new Date(b.start).getMonth()], values: [b.loss ?? 0], tip: monthLabel(b.start) + ' · ' + num(b.loss, 2) + ' Punkte je Tag · ' + b.phases + ' Standphasen' }))} />
        </Card>
        <Card title="Klimatisierung pro Monat" right={<Legend items={[{ label: 'Heizen', color: colors.copper }, { label: 'Kühlen', color: colors.blue }, { label: 'Lüften', color: colors.aqua }]} />} note="Stunden mit laufender Klimatisierung. Den Energiebedarf liefert das Fahrzeug nicht." source="climatisationState">
          <Bars unit="h" digits={1} seriesColors={[colors.copper, colors.blue, colors.aqua]} data={m.months.map((b) => ({ label: MONTHS[new Date(b.start).getMonth()], values: b.hours, tip: monthLabel(b.start) + ' · Heizen ' + num(b.hours[0], 1) + ' h · Kühlen ' + num(b.hours[1], 1) + ' h · Lüften ' + num(b.hours[2], 1) + ' h · ' + b.events + ' Vorgänge' }))} />
        </Card>
      </Grid>

      <Grid>
        <Card title="Wann wird klimatisiert?" note="Starts nach Uhrzeit." source="climatisationState · timestampUtc">
          <Bars unit="Starts" seriesColors={[colors.blue]} labelEvery={3} data={m.hours.map((n, h) => ({ label: '' + h, values: [n], tip: h + ' bis ' + (h + 1) + ' Uhr · ' + n + ' Starts' }))} />
        </Card>
        <Card title="Letzte Klimatisierungen" source="climatisationState · plugConnectionState">
          <View>
            {m.clima.slice(-6).reverse().map((e, i) => (
              <ListRow key={e.start} first={i === 0}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: [colors.muted, colors.copper, colors.blue, colors.aqua][e.mode] }} />
                <Mono style={{ width: 80 }}>{dateShort(e.start)}</Mono>
                <Mono style={{ flex: 1 }}>{MODES[e.mode]}</Mono>
                <Mono style={{ color: colors.text2 }}>{e.plugged ? 'am Kabel' : 'aus dem Akku'}</Mono>
                <Mono style={{ width: 64, textAlign: 'right' }}>{num(e.minutes) + ' min'}</Mono>
              </ListRow>
            ))}
            {!hasClima ? <Sub>Die Datei enthält keine Klimatisierungsdaten.</Sub> : null}
          </View>
        </Card>
      </Grid>

      <Grid>
        <Card title="Längste Standphasen" source="currentSOCInPct · plugConnectionState · mileage">
          <PhaseList list={longest} />
        </Card>
        <Card title="Höchste Verluste" note="Standphasen ab einem Tag, nach Verlust je Tag sortiert." source="currentSOCInPct · plugConnectionState · mileage">
          <PhaseList list={worst} />
        </Card>
      </Grid>
    </View>
  );
}

function PhaseList({ list }: { list: Derived['standby'] }) {
  return (
    <View>
      {list.map((s, i) => (
        <ListRow key={s.start} first={i === 0}>
          <Mono style={{ width: 80 }}>{dateShort(s.start)}</Mono>
          <Mono style={{ flex: 1 }}>{num(s.hours / 24, 1) + ' Tage'}</Mono>
          <Mono style={{ color: colors.text2 }}>{num(s.socStart) + ' → ' + num(s.socEnd) + ' %'}</Mono>
          <Mono style={{ width: 90, textAlign: 'right' }}>{num(s.perDay, 2) + ' /Tag'}</Mono>
        </ListRow>
      ))}
      {list.length === 0 ? <Sub>Keine passende Standphase gefunden.</Sub> : null}
    </View>
  );
}
