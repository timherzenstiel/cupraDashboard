import React, { useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { colors } from '../theme/tokens';
import { Sub } from '../ui/primitives';

export type XYSeries = { points: [number, number][]; color: string; width?: number; /** Break the line where x jumps by more than this. */ gapX?: number };
export type XYDot = { x: number; y: number; tip: string };
type Tick = { v: number; label: string };

/**
 * Lines over a numeric x axis, with optional hoverable dots on top. The readout line shows the
 * hovered or tapped dot; without dots it shows the caption only.
 */
export function XYChart({ series, dots, dotColor = colors.blue, x, y, xTicks, yTicks, height = 240, refY, caption }: {
  series: XYSeries[]; dots?: XYDot[]; dotColor?: string; x: [number, number]; y: [number, number]; xTicks: Tick[]; yTicks: Tick[]; height?: number; refY?: { v: number; label: string }; caption?: string;
}) {
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  const left = 48;
  const bottom = 22;
  const pw = Math.max(0, w - left - 8);
  const ph = height - bottom - 6;
  const sx = (v: number) => left + ((v - x[0]) / (x[1] - x[0])) * pw;
  const sy = (v: number) => 6 + ph - ((Math.min(y[1], Math.max(y[0], v)) - y[0]) / (y[1] - y[0])) * ph;
  const path = (s: XYSeries) => {
    let d = '';
    let prev: number | null = null;
    for (const [px, py] of s.points) {
      d += (prev == null || (s.gapX != null && px - prev > s.gapX) ? 'M' : 'L') + sx(px).toFixed(1) + ' ' + sy(py).toFixed(1) + ' ';
      prev = px;
    }
    return d;
  };
  const tip = sel != null && dots?.[sel] ? dots[sel].tip : caption;
  return (
    <View style={{ gap: 8 }}>
      {tip != null ? <Sub>{tip}</Sub> : null}
      <View onLayout={onLayout} style={{ height }}>
        {w > 0 ? (
          <>
            <View style={{ position: 'absolute', left: 0, top: 0 }}>
            <Svg width={w} height={height}>
              {yTicks.map((t) => <Line key={t.v} x1={left} x2={left + pw} y1={sy(t.v)} y2={sy(t.v)} stroke={t.v === y[0] ? colors.axis : colors.grid} strokeWidth={1} />)}
              <Line x1={left} x2={left} y1={6} y2={6 + ph} stroke={colors.axis} strokeWidth={1} />
              {refY ? <Line x1={left} x2={left + pw} y1={sy(refY.v)} y2={sy(refY.v)} stroke={colors.dashed} strokeWidth={1} strokeDasharray="4 4" /> : null}
              {series.map((s, i) => <Path key={i} d={path(s)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeLinejoin="round" strokeLinecap="round" />)}
            </Svg>
            </View>
            {yTicks.map((t) => <Sub key={t.v} style={{ position: 'absolute', left: 0, width: left - 6, textAlign: 'right', top: sy(t.v) - 8, fontSize: 11, color: colors.muted }}>{t.label}</Sub>)}
            {xTicks.map((t) => <Sub key={t.v} style={{ position: 'absolute', left: sx(t.v) - 40, width: 80, textAlign: 'center', top: 6 + ph + 4, fontSize: 11, color: colors.muted }}>{t.label}</Sub>)}
            {refY ? <Sub style={{ position: 'absolute', right: 10, top: sy(refY.v) - 18, fontSize: 11, color: colors.muted }}>{refY.label}</Sub> : null}
            {dots?.map((d, i) => (
              <Pressable key={i} accessibilityRole="button" accessibilityLabel={d.tip} onPress={() => setSel(i)} onHoverIn={() => setSel(i)}
                style={{ position: 'absolute', left: sx(d.x) - 12, top: sy(d.y) - 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: i === sel ? 14 : 10, height: i === sel ? 14 : 10, borderRadius: 7, backgroundColor: dotColor, borderWidth: 2, borderColor: colors.card }} />
              </Pressable>
            ))}
          </>
        ) : null}
      </View>
    </View>
  );
}
