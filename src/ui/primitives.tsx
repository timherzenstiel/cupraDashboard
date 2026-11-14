import React from 'react';
import { Pressable, Text as RNText, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { colors, font, space } from '../theme/tokens';

type TP = { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number };
export const T = ({ children, style, numberOfLines }: TP) => <RNText numberOfLines={numberOfLines} style={[{ color: colors.text, fontFamily: font.body, fontSize: 14, lineHeight: 20 }, style]}>{children}</RNText>;
export const Sub = ({ children, style, numberOfLines }: TP) => <T numberOfLines={numberOfLines} style={[{ color: colors.text2, fontSize: 13 }, style]}>{children}</T>;
export const Mono = ({ children, style, numberOfLines }: TP) => <T numberOfLines={numberOfLines} style={[{ fontFamily: font.mono, fontSize: 13 }, style]}>{children}</T>;
export const H2 = ({ children }: { children: React.ReactNode }) => <RNText accessibilityRole="header" style={{ color: colors.text, fontFamily: font.head, fontWeight: '600', fontSize: 17 }}>{children}</RNText>;
/** Names the export fields a figure is computed from. */
export const Source = ({ children }: { children: React.ReactNode }) => <RNText style={{ color: colors.muted, fontFamily: font.mono, fontSize: 11 }}>{children}</RNText>;

export function Card({ children, style, title, right, note, source }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; title?: string; right?: React.ReactNode; note?: string; source?: string }) {
  return (
    <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: space.radius, padding: space.card, gap: 14, minWidth: 0, flexShrink: 1, maxWidth: '100%' }, style]}>
      {title ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <H2>{title}</H2>
          {right}
        </View>
      ) : null}
      {note ? <Sub>{note}</Sub> : null}
      {children}
      {source ? <Source>{source}</Source> : null}
    </View>
  );
}

export function Kpi({ label, value, unit, sub, source }: { label: string; value: string; unit?: string; sub?: string; source?: string }) {
  return (
    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 200, minWidth: 0, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: space.radius, paddingVertical: 16, paddingHorizontal: 20, gap: 4 }}>
      <Sub>{label}</Sub>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <RNText style={{ color: colors.text, fontFamily: font.head, fontWeight: '600', fontSize: 30, lineHeight: 34 }}>{value}</RNText>
        {unit ? <Sub style={{ fontSize: 14 }}>{unit}</Sub> : null}
      </View>
      {sub ? <Sub>{sub}</Sub> : null}
      {source ? <Source>{source}</Source> : null}
    </View>
  );
}

/** A wrapping row of equally growing children. */
export const Grid = ({ children, min = 480 }: { children: React.ReactNode; min?: number }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.gap }}>
    {React.Children.map(children, (c) => (c ? <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: min, minWidth: 0, maxWidth: '100%' }}>{c}</View> : null))}
  </View>
);

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: i.color }} />
          <Sub>{i.label}</Sub>
        </View>
      ))}
    </View>
  );
}

export function Segmented<V extends string>({ value, options, onChange, label }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; label: string }) {
  return (
    <View accessibilityLabel={label} style={{ flexDirection: 'row', borderColor: colors.border, borderWidth: 1, borderRadius: 8, overflow: 'hidden' }}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: on ? colors.raised : 'transparent', borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.border }}>
            <T style={{ color: on ? colors.text : colors.text2, fontWeight: on ? '600' : '400' }}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Button({ label, onPress, primary, accessibilityLabel }: { label: string; onPress: () => void; primary?: boolean; accessibilityLabel?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress}
      style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? colors.accent : 'transparent', borderWidth: primary ? 0 : 1, borderColor: colors.border }}>
      <T style={{ fontWeight: '600', color: primary ? colors.ground : colors.text }}>{label}</T>
    </Pressable>
  );
}

export function ListRow({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}>{children}</View>;
}
