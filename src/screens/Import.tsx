import React from 'react';
import { View } from 'react-native';
import { useData } from '../store/DataContext';
import { Button, Card, Sub, T } from '../ui/primitives';
import { colors, font } from '../theme/tokens';

export function Import() {
  const { status, error, importFile } = useData();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Card style={{ maxWidth: 560, width: '100%' }}>
        <T style={{ fontFamily: font.head, fontWeight: '600', fontSize: 24, lineHeight: 30 }}>Export laden</T>
        <Sub>Wähle die JSON-Datei aus dem EU-Data-Act-Portal der Volkswagen-Gruppe. Sie wird auf diesem Gerät gelesen und verdichtet; die Fahrgestellnummer und die Rohdaten werden nicht gespeichert und nichts wird hochgeladen.</Sub>
        {status === 'importing' ? <T>Datei wird gelesen …</T> : <View style={{ alignSelf: 'flex-start' }}><Button primary label="Datei auswählen" onPress={importFile} /></View>}
        {error ? <T style={{ color: colors.accent }}>{error}</T> : null}
      </Card>
    </View>
  );
}
