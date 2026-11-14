import React, { useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { DataProvider, useData } from './src/store/DataContext';
import { Overview } from './src/screens/Overview';
import { Charging } from './src/screens/Charging';
import { Trips } from './src/screens/Trips';
import { Logbook } from './src/screens/Logbook';
import { Import } from './src/screens/Import';
import { Button, Mono, Sub, T } from './src/ui/primitives';
import { colors, font, space } from './src/theme/tokens';
import { dateShort, num } from './src/format';

const TABS = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'charging', label: 'Laden' },
  { id: 'trips', label: 'Fahrten' },
  { id: 'logbook', label: 'Logbuch' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function Tabs({ tab, setTab, bottom }: { tab: TabId; setTab: (t: TabId) => void; bottom?: boolean }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: bottom ? 0 : 4, flexGrow: 1 }}>
      {TABS.map((t) => {
        const on = t.id === tab;
        return (
          <Pressable key={t.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setTab(t.id)}
            style={{ minHeight: bottom ? 56 : 44, flex: bottom ? 1 : undefined, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: bottom ? 0 : 8, backgroundColor: on && !bottom ? colors.card : 'transparent', borderBottomWidth: bottom ? 0 : 2, borderTopWidth: bottom ? 2 : 0, borderColor: on ? colors.accent : 'transparent' }}>
            <T style={{ fontSize: bottom ? 12 : 14, fontWeight: on ? '600' : '500', color: on ? colors.text : colors.text2 }}>{t.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

function Shell() {
  const { status, data, error, importFile } = useData();
  const [tab, setTab] = useState<TabId>('overview');
  const { width } = useWindowDimensions();
  const narrow = width < 760;

  if (status === 'loading') return <View style={{ flex: 1, backgroundColor: colors.ground }} />;
  if (!data) return <View style={{ flex: 1, backgroundColor: colors.ground }}><Import /></View>;

  const { ds } = data;
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 28, rowGap: 8, paddingVertical: 12, paddingHorizontal: narrow ? 16 : 32, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <T style={{ fontFamily: font.head, fontWeight: '600', fontSize: 18 }}>Born Datenlabor</T>
          <Mono style={{ fontSize: 12, color: colors.muted }}>{num(data.capacity) + ' kWh'}</Mono>
        </View>
        {narrow ? <View style={{ flexGrow: 1 }} /> : <Tabs tab={tab} setTab={setTab} />}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {!narrow ? <Sub>{dateShort(ds.from) + ' – ' + dateShort(ds.to)}</Sub> : null}
          <Button label={status === 'importing' ? 'Liest …' : 'Export laden'} onPress={importFile} />
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: narrow ? 16 : space.page, paddingBottom: 48, maxWidth: 1440, width: '100%', alignSelf: 'center', gap: space.gap }}>
        {error ? <T style={{ color: colors.accent }}>{error}</T> : null}
        {tab === 'overview' ? <Overview data={data} /> : tab === 'charging' ? <Charging data={data} /> : tab === 'trips' ? <Trips data={data} /> : <Logbook data={data} />}
        <Sub style={{ fontSize: 12, color: colors.muted }}>{'Stand der Daten: ' + dateShort(ds.to) + ' · ' + num(ds.recordCount) + ' Datenpunkte importiert am ' + dateShort(ds.importedAt)}</Sub>
      </ScrollView>
      {narrow ? <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.ground }}><Tabs tab={tab} setTab={setTab} bottom /></View> : null}
    </View>
  );
}

export default function App() {
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}
