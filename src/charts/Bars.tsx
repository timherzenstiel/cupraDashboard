import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors } from '../theme/tokens';
import { Sub, T } from '../ui/primitives';
import { num } from '../format';
import { niceMax, ticksUpTo } from './scale';

export type Bar = { label: string; values: number[]; tip: string };

/**
 * Vertical bars, optionally stacked (values[0] at the bottom). Hovering or tapping a bar puts its
 * details in the readout line above the plot; the last bar is shown until then.
 */
export function Bars({ data, seriesColors, height = 220, unit, showValues, digits = 0, labelEvery = 1 }: { data: Bar[]; seriesColors: string[]; height?: number; unit: string; showValues?: boolean; digits?: number; labelEvery?: number }) {
  const [sel, setSel] = useState<number | null>(null);
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const { max, step } = niceMax(Math.max(0, ...totals));
  const plot = height - 22;
  const active = sel != null && sel < data.length ? sel : data.length - 1;
  return (
    <View style={{ gap: 8 }}>
      <Sub>{data[active]?.tip ?? ' '}</Sub>
      <View style={{ height, flexDirection: 'row' }}>
        <View style={{ width: 44, height: plot }}>
          {ticksUpTo(max, step).slice(1).map((v) => (
            <Sub key={v} style={{ position: 'absolute', right: 6, bottom: (v / max) * plot - 8, fontSize: 11, color: colors.muted }}>{num(v, step < 1 ? 1 : 0)}</Sub>
          ))}
          <Sub style={{ position: 'absolute', right: 6, bottom: -18, fontSize: 11, color: colors.muted }}>{unit}</Sub>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          {ticksUpTo(max, step).map((v) => (
            <View key={v} style={{ position: 'absolute', left: 0, right: 0, bottom: 22 + (v / max) * plot, height: 1, backgroundColor: v === 0 ? colors.axis : colors.grid }} />
          ))}
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
            {data.map((d, i) => (
              <Pressable key={i} accessibilityRole="button" accessibilityLabel={d.tip} onPress={() => setSel(i)} onHoverIn={() => setSel(i)}
                style={{ flex: 1, minWidth: 0, height: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
                {showValues && totals[i] > 0 ? <T style={{ fontSize: 12, marginBottom: 4 }}>{num(totals[i], digits)}</T> : null}
                <View style={{ width: '64%', maxWidth: 28, gap: 2, flexDirection: 'column-reverse', opacity: i === active ? 1 : 0.62 }}>
                  {d.values.map((v, k) => {
                    const h = Math.round((v / max) * plot);
                    const top = k === d.values.length - 1 || d.values.slice(k + 1).every((x) => x <= 0);
                    return h > 0 ? <View key={k} style={{ height: h, backgroundColor: seriesColors[k], borderTopLeftRadius: top ? 4 : 0, borderTopRightRadius: top ? 4 : 0 }} /> : null;
                  })}
                </View>
                <View style={{ height: 22, justifyContent: 'center' }}>
                  <Sub numberOfLines={1} style={{ fontSize: 11, color: colors.muted }}>{i % labelEvery === 0 ? d.label : ''}</Sub>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}
