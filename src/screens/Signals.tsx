import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Dataset, Series } from '../data/types.ts';
import type { Derived } from '../store/DataContext';
import { XYChart } from '../charts/XYChart';
import { Card, H2, Mono, Segmented, Source, Sub, T } from '../ui/primitives';
import { colors, space } from '../theme/tokens';
import { clock, dateShort, dayMonth, num } from '../format';

type Sig = { id: string; title: string; field: string; unit: string; digits: number; pick: (ds: Dataset) => Series };
const SIGNALS: Sig[] = [
  { id: 'soc', title: 'Ladestand', field: 'currentSOCInPct', unit: '%', digits: 0, pick: (d) => d.soc },
  { id: 'range', title: 'Angezeigte Reichweite', field: 'cruisingRangeElectricInKm', unit: 'km', digits: 0, pick: (d) => d.rangeKm },
  { id: 'power', title: 'Ladeleistung', field: 'chargePowerInKW', unit: 'kW', digits: 1, pick: (d) => d.power },
  { id: 'odo', title: 'Kilometerstand', field: 'mileage', unit: 'km', digits: 0, pick: (d) => d.odo },
  { id: 'plug', title: 'Ladekabel gesteckt', field: 'plugConnectionState', unit: '', digits: 0, pick: (d) => d.plug },
  { id: 'clima', title: 'Klimatisierung', field: 'climatisationState', unit: '', digits: 0, pick: (d) => d.clima },
  { id: 'insp', title: 'Tage bis Inspektion', field: 'inspectionDueDays', unit: 'Tage', digits: 0, pick: (d) => d.inspectionDays },
];
type Range = '24h' | '7d' | '30d' | 'all';
const SPAN: Record<Range, number> = { '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000, all: Infinity };

export function Signals({ data }: { data: Derived }) {
  const { ds } = data;
  const [id, setId] = useState('soc');
  const [range, setRange] = useState<Range>('7d');
  const sig = SIGNALS.find((s) => s.id === id) ?? SIGNALS[0];

  const v = useMemo(() => {
    const all = sig.pick(ds);
    const from = range === 'all' ? ds.from : ds.to - SPAN[range];
    let pts = all.filter((p) => p[0] >= from);
    // Carry the last earlier value in so the line starts at the left edge.
    const before = all.filter((p) => p[0] < from).pop();
    if (before) pts = [[from, before[1]], ...pts];
    if (pts.length) pts = [...pts, [ds.to, pts[pts.length - 1][1]]];
    // Every series holds its value until the next change, so draw steps rather than slopes.
    const line: [number, number][] = pts.flatMap((p, i) => (i ? [[p[0], pts[i - 1][1]], p] : [p]) as [number, number][]);
    // Keep the path light: at most about 1500 points.
    const stride = Math.ceil(line.length / 1500);
    const thin = stride > 1 ? line.filter((_, i) => i % stride === 0 || i === line.length - 1) : line;
    const vals = pts.map((p) => p[1]);
    const lo = vals.length ? Math.min(...vals) : 0;
    const hi = vals.length ? Math.max(...vals) : 1;
    const pad = (hi - lo) * 0.08 || 1;
    return { from, pts, line: thin, lo, hi, y0: lo - pad < 0 && lo >= 0 ? 0 : lo - pad, y1: hi + pad, mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, changes: all.filter((p) => p[0] >= from).length };
  }, [ds, sig, range]);

  const fmt = (x: number | null) => num(x, sig.digits) + (sig.unit ? ' ' + sig.unit : '');
  const span = ds.to - v.from;
  const tick = (t: number) => (range === '24h' ? clock(t) : range === 'all' ? dateShort(t) : dayMonth(t));

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.gap, alignItems: 'flex-start' }}>
      <Card style={{ flexGrow: 1, flexBasis: 300 }} title="Signale" note={SIGNALS.length + ' Zeitreihen aus dem Export. Jede speichert nur die Zeitpunkte, an denen sich der Wert geändert hat.'}>
        <View style={{ gap: 4 }}>
          {SIGNALS.map((s) => {
            const on = s.id === sig.id;
            return (
              <Pressable key={s.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setId(s.id)}
                style={{ minHeight: 52, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: on ? colors.muted : 'transparent', backgroundColor: on ? colors.raised : 'transparent' }}>
                <T>{s.title}</T>
                <Source>{s.field + ' · ' + num(s.pick(ds).length) + ' Änderungen'}</Source>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={{ flexGrow: 3, flexBasis: 600 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <View style={{ gap: 2 }}><H2>{sig.title}</H2><Source>{sig.field}</Source></View>
          <Segmented label="Zeitraum" value={range} onChange={setRange} options={[{ value: '24h', label: '24 h' }, { value: '7d', label: '7 Tage' }, { value: '30d', label: '30 Tage' }, { value: 'all', label: 'Alles' }]} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 32, rowGap: 8 }}>
          {[['Letzter Wert', fmt(v.pts.length ? v.pts[v.pts.length - 1][1] : null)], ['Minimum', fmt(v.pts.length ? v.lo : null)], ['Maximum', fmt(v.pts.length ? v.hi : null)], ['Änderungen', num(v.changes)]].map(([l, x]) => (
            <View key={l}><Sub style={{ fontSize: 12 }}>{l}</Sub><Mono style={{ fontSize: 16 }}>{x}</Mono></View>
          ))}
        </View>
        {v.pts.length > 1 ? (
          <XYChart height={320} x={[v.from, ds.to]} y={[v.y0, v.y1]}
            xTicks={[0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: v.from + f * span, label: tick(v.from + f * span) }))}
            yTicks={[0, 0.5, 1].map((f) => ({ v: v.y0 + f * (v.y1 - v.y0), label: num(v.y0 + f * (v.y1 - v.y0), sig.digits) }))}
            series={[{ points: v.line, color: colors.accent }]} />
        ) : <Sub>In diesem Zeitraum gibt es keine Werte. Zeitraum bis {dateShort(ds.to)}.</Sub>}
        {sig.id === 'clima' ? <Sub>0 aus · 1 Heizen · 2 Kühlen · 3 Lüften</Sub> : sig.id === 'plug' ? <Sub>0 nicht gesteckt · 1 gesteckt</Sub> : null}
      </Card>
    </View>
  );
}
