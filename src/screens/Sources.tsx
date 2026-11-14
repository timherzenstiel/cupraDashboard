import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useData, type Derived } from '../store/DataContext';
import { Button, Card, Grid, ListRow, Mono, Source, Sub, T } from '../ui/primitives';
import { colors, font, space } from '../theme/tokens';
import { clock, dateShort, num } from '../format';

const DEFAULT_URL = 'http://localhost:8787';

export function Sources({ data }: { data: Derived }) {
  const { ds, trips, sessions } = data;
  const { sync, status, importFile, reset, connectCollector, syncNow } = useData();
  const [url, setUrl] = useState(sync.url ?? DEFAULT_URL);
  const [confirm, setConfirm] = useState(false);

  const rows: [string, string, number][] = [
    ['Ladestand', 'currentSOCInPct · battery_state_report.soc', ds.soc.length],
    ['Kilometerstand', 'mileage · mileage.value', ds.odo.length],
    ['Angezeigte Reichweite', 'cruisingRangeElectricInKm · range.value', ds.rangeKm.length],
    ['Ladeleistung', 'chargePowerInKW · charging_power', ds.power.length],
    ['Ladekabel', 'plugConnectionState · plug_connection_state', ds.plug.length],
    ['Klimatisierung', 'climatisationState', ds.clima.length],
    ['Außentemperatur', 'outdoor_temperature', ds.outdoorTemp.length],
    ['Ladevorgänge vom Fahrzeug', 'chargingSession', ds.sessions.length],
    ['Ladekurven', 'powerCurve', Object.keys(ds.curves).length],
    ['Warnmeldungen', 'text · category · priority', ds.warnings.length],
  ];
  const label = { off: 'Nicht verbunden', syncing: 'Abruf läuft …', ok: 'Verbunden', error: 'Fehler' }[sync.state];
  const dot = { off: colors.muted, syncing: colors.blue, ok: colors.good, error: colors.accent }[sync.state];

  return (
    <View style={{ gap: space.gap }}>
      <Grid>
        <Card title="Collector" note="Der Collector läuft auf deinem Rechner, holt alle 15 Minuten das neue Datenpaket vom Portal und stellt es dieser Seite bereit. Neue Werte werden zu den vorhandenen hinzugefügt.">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: dot }} />
            <T style={{ fontFamily: font.head, fontWeight: '600', fontSize: 20 }}>{label}</T>
            {sync.at ? <Sub>{'zuletzt ' + dateShort(sync.at) + ' ' + clock(sync.at) + ' Uhr'}</Sub> : null}
          </View>
          {sync.message ? <T style={{ color: sync.state === 'error' ? colors.accent : colors.text2 }}>{sync.message}</T> : null}
          <View style={{ gap: 6 }}>
            <Sub>Adresse des Collectors</Sub>
            <TextInput accessibilityLabel="Adresse des Collectors" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} inputMode="url"
              style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.axis, backgroundColor: colors.ground, color: colors.text, fontFamily: font.mono, fontSize: 14 }} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Button primary label={sync.url ? 'Jetzt abrufen' : 'Verbinden'} onPress={() => (sync.url === url.trim() ? syncNow() : connectCollector(url.trim()))} />
            {sync.url ? <Button label="Trennen" onPress={() => connectCollector(null)} /> : null}
          </View>
          <Sub>Voraussetzung: Am Portal ist eine Dauerabfrage mit 15 Minuten und „All Data“ angelegt, und der Collector ist einmal angemeldet. Die Schritte stehen in der README im Ordner collector.</Sub>
        </Card>

        <Card title="Datei" note="Ein weiterer Export aus dem Portal wird mit den vorhandenen Daten zusammengeführt: Zeitreihen werden ergänzt, Ladevorgänge anhand ihrer Kennung abgeglichen.">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Button primary label={status === 'importing' ? 'Liest …' : 'Export hinzufügen'} onPress={importFile} />
            {confirm
              ? <><Button label="Wirklich alles löschen" onPress={() => { setConfirm(false); reset(); }} /><Button label="Abbrechen" onPress={() => setConfirm(false)} /></>
              : <Button label="Alle Daten löschen" onPress={() => setConfirm(true)} />}
          </View>
          <Sub>Gelöscht wird nur der Bestand in diesem Browser. Deine Exportdateien und der Collector bleiben unberührt.</Sub>
          <View>
            <ListRow first><T style={{ flex: 1 }}>Zeitraum</T><Mono>{dateShort(ds.from) + ' – ' + dateShort(ds.to)}</Mono></ListRow>
            <ListRow><T style={{ flex: 1 }}>Zuletzt ergänzt</T><Mono>{dateShort(ds.importedAt) + ' ' + clock(ds.importedAt)}</Mono></ListRow>
            <ListRow><T style={{ flex: 1 }}>Abgeleitet</T><Mono>{num(trips.length) + ' Fahrten · ' + num(sessions.length) + ' Ladevorgänge'}</Mono></ListRow>
          </View>
        </Card>
      </Grid>

      <Card title="Datenbestand" note="Gespeichert werden nur Wertänderungen, nicht jede Meldung des Fahrzeugs.">
        <View>
          {rows.map(([name, field, n], i) => (
            <ListRow key={name} first={i === 0}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}><T>{name}</T><Source>{field}</Source></View>
              <Mono style={{ color: n ? colors.text : colors.muted }}>{n ? num(n) : 'keine Daten'}</Mono>
            </ListRow>
          ))}
        </View>
      </Card>
    </View>
  );
}
