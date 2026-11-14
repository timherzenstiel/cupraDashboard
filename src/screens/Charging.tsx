import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { socDwell } from '../data/derive.ts';
import type { Derived } from '../store/DataContext';
import { Bars } from '../charts/Bars';
import { XYChart } from '../charts/XYChart';
import { niceMax, ticksUpTo } from '../charts/scale';
import { Card, Grid, Kpi, Legend, Mono, Sub, T } from '../ui/primitives';
import { colors, space } from '../theme/tokens';
import { clock, dateShort, duration, num } from '../format';

export function Charging({ data }: { data: Derived }) {
  const { ds, sessions } = data;
  const withCurve = useMemo(() => sessions.filter((s) => ds.curves[s.id]).reverse(), [ds, sessions]);
  const [selId, setSelId] = useState<string | null>(null);
  // Start on the latest fast charge with a real SoC gain: that is the curve people look for.
  const sel = withCurve.find((s) => s.id === selId) ?? withCurve.find((s) => s.type === 'dc' && s.endSoc - s.startSoc >= 20) ?? withCurve[0];

  const st = useMemo(() => {
    const of = (type: 'ac' | 'dc') => {
      const list = sessions.filter((s) => s.type === type);
      const kwh = list.reduce((a, s) => a + s.kwh, 0);
      const hours = list.reduce((a, s) => a + s.activeSec, 0) / 3600;
      return { n: list.length, kwh, avgKw: hours > 0 ? kwh / hours : null, peak: Math.max(0, ...list.map((s) => s.peakKw)) };
    };
    return { ac: of('ac'), dc: of('dc'), full: sessions.filter((s) => s.endSoc >= 99).length, dwell: socDwell(ds) };
  }, [ds, sessions]);

  const total = st.ac.kwh + st.dc.kwh || 1;
  const yMax = niceMax(Math.max(11, ...withCurve.flatMap((s) => ds.curves[s.id].map((p) => p[2]))), 3);
  // Highest power seen at each percent of charge: drops the ramp-up and pauses, which would
  // otherwise draw vertical spikes at a single SoC value.
  const toLine = (id: string): [number, number][] => {
    const best = new Map<number, number>();
    for (const p of ds.curves[id]) if (p[2] > 0) best.set(p[1], Math.max(best.get(p[1]) ?? 0, p[2]));
    return [...best].sort((a, b) => a[0] - b[0]);
  };
  const windows = sessions.slice(-30);

  return (
    <View style={{ gap: space.gap }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.gap }}>
        <Kpi label="Geladen an AC" value={num(st.ac.kwh)} unit="kWh" sub={num((st.ac.kwh / total) * 100) + ' % · ' + st.ac.n + ' Vorgänge'} source="chargingSession.chargeType" />
        <Kpi label="Geladen an DC" value={num(st.dc.kwh)} unit="kWh" sub={num((st.dc.kwh / total) * 100) + ' % · ' + st.dc.n + ' Vorgänge'} source="chargingSession.chargeType" />
        <Kpi label="Ø Ladeleistung DC" value={num(st.dc.avgKw)} unit="kW" sub={'Spitze ' + num(st.dc.peak) + ' kW · AC Ø ' + num(st.ac.avgKw, 1) + ' kW'} source="kWh ÷ activeChargingTime" />
        <Kpi label="Bis 100 % geladen" value={num(st.full)} unit="mal" sub={num((st.full / (sessions.length || 1)) * 100) + ' % aller Ladevorgänge'} source="chargingSession.endSoc" />
      </View>

      <Card title="Ladekurve: Leistung über Ladestand" note={withCurve.length ? 'Das Fahrzeug liefert Kurven nur für die letzten ' + withCurve.length + ' Ladevorgänge. Die übrigen liegen grau im Hintergrund.' : 'Die Datei enthält keine Ladekurven.'} source="powerCurve.timeCurve.soc · chargePower · chargingSession.peakChargePower">
        {sel ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
            <View style={{ flexGrow: 1, flexBasis: 300, minWidth: 0, gap: 6 }}>
              {withCurve.filter((s) => s.id === sel.id || s.endSoc - s.startSoc >= 5).slice(0, 8).map((s) => {
                const on = s.id === sel.id;
                return (
                  <Pressable key={s.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setSelId(s.id)}
                    style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: on ? colors.muted : colors.border, backgroundColor: on ? colors.raised : 'transparent' }}>
                    <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.type === 'ac' ? colors.blue : colors.copper }} />
                    <Mono style={{ width: 28 }}>{s.type.toUpperCase()}</Mono>
                    <Mono style={{ flex: 1 }}>{dateShort(s.start) + ' ' + clock(s.start)}</Mono>
                    <Mono style={{ color: colors.text2 }}>{num(s.startSoc) + ' → ' + num(s.endSoc) + ' %'}</Mono>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexGrow: 3, flexBasis: 480, minWidth: 0, gap: 12 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 28, rowGap: 8 }}>
                {[['Geladen', num(sel.kwh, 1) + ' kWh'], ['Spitze', num(sel.peakKw, 1) + ' kW'], ['Durchschnitt', num(sel.activeSec ? sel.kwh / (sel.activeSec / 3600) : null, 1) + ' kW'], ['Aktive Ladezeit', duration(sel.activeSec / 60)], ['Am Lader', duration((sel.stop - sel.start) / 60000)]].map(([l, v]) => (
                  <View key={l}><Sub style={{ fontSize: 12 }}>{l}</Sub><Mono style={{ fontSize: 15 }}>{v}</Mono></View>
                ))}
              </View>
              <XYChart height={280} x={[0, 100]} y={[0, yMax.max]}
                xTicks={[0, 20, 40, 60, 80, 100].map((v) => ({ v, label: v + (v === 100 ? ' % SoC' : v === 0 ? ' %' : '') }))}
                yTicks={ticksUpTo(yMax.max, yMax.step).map((v) => ({ v, label: num(v) + (v === yMax.max ? ' kW' : '') }))}
                series={[...withCurve.filter((s) => s.id !== sel.id).map((s) => ({ points: toLine(s.id), color: '#56606A', width: 1.5, gapX: 6 })), { points: toLine(sel.id), color: colors.accent, width: 2.5, gapX: 6 }]}
              />
            </View>
          </View>
        ) : null}
      </Card>

      <Grid>
        <Card title={'Ladefenster der letzten ' + windows.length + ' Vorgänge'} right={<Legend items={[{ label: 'AC', color: colors.blue }, { label: 'DC', color: colors.copper }]} />}
          note={'Jeder Balken reicht vom Start- bis zum End-Ladestand. ' + windows.filter((s) => s.startSoc >= 20 && s.endSoc <= 80).length + ' von ' + windows.length + ' bleiben zwischen 20 und 80 %.'} source="chargingSession.endSoc · deltaSoc">
          <View style={{ height: 220, marginLeft: 44 }}>
            {[0, 20, 80, 100].map((v) => <View key={v} style={{ position: 'absolute', left: 0, right: 0, bottom: (v / 100) * 220, height: 1, backgroundColor: v === 0 ? colors.axis : v === 100 ? colors.grid : colors.dashed }} />)}
            {[20, 80, 100].map((v) => <Sub key={v} style={{ position: 'absolute', left: -44, bottom: (v / 100) * 220 - 8, fontSize: 11, color: colors.muted }}>{v + ' %'}</Sub>)}
            <View style={{ flex: 1, flexDirection: 'row', gap: 3 }}>
              {windows.map((s) => (
                <View key={s.id} accessibilityLabel={s.type.toUpperCase() + ' ' + dateShort(s.start) + ': ' + num(s.startSoc) + ' bis ' + num(s.endSoc) + ' Prozent'} style={{ flex: 1 }}>
                  <View style={{ position: 'absolute', left: '18%', right: '18%', bottom: (Math.max(0, s.startSoc) / 100) * 220, height: Math.max(3, ((s.endSoc - Math.max(0, s.startSoc)) / 100) * 220), borderRadius: 4, backgroundColor: s.type === 'ac' ? colors.blue : colors.copper }} />
                </View>
              ))}
            </View>
          </View>
          {windows.length ? <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginLeft: 44 }}><Sub style={{ fontSize: 11, color: colors.muted }}>{dateShort(windows[0].start)}</Sub><Sub style={{ fontSize: 11, color: colors.muted }}>{dateShort(windows[windows.length - 1].start)}</Sub></View> : null}
        </Card>

        <Card title="Aufenthaltsdauer nach Ladestand" note={'Anteil der Zeit je Ladestand-Bereich. ' + num((st.dwell[8] + st.dwell[9]) * 100) + ' % der Zeit stand das Auto über 80 %.'} source="currentSOCInPct">
          <Bars unit="%" showValues seriesColors={[colors.blue]} data={st.dwell.map((v, i) => ({ label: i * 10 + '–' + (i * 10 + 10), values: [v * 100], tip: i * 10 + ' bis ' + (i * 10 + 10) + ' % Ladestand · ' + num(v * 100, 1) + ' % der Zeit' }))} />
        </Card>
      </Grid>
      {sessions.some((s) => s.derived) ? <T style={{ color: colors.text2, fontSize: 13 }}>{'Hinweis: Für ' + sessions.filter((s) => s.derived).length + ' Ladevorgänge vor dem ' + dateShort(ds.sessions[0]?.start ?? 0) + ' liefert das Fahrzeug keine Sitzungsdaten. Sie sind aus dem Verlauf der Ladeleistung rekonstruiert.'}</T> : null}
    </View>
  );
}
