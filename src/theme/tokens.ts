import { Platform } from 'react-native';

export const colors = {
  ground: '#121518',
  card: '#1B1F23',
  inset: '#161A1D',
  raised: '#252B31',
  border: '#2A3036',
  axis: '#3A424A',
  grid: '#252B31',
  dashed: '#4A535C',
  text: '#EEF0F2',
  text2: '#A9B1B9',
  muted: '#8C959E',
  accent: '#C8733F',
  // Chart series, in fixed order. Validated together on the card surface.
  blue: '#3987E5',
  copper: '#C8733F',
  aqua: '#199E70',
  violet: '#9085E9',
  good: '#199E70',
};

/** One hue, dark to light, for magnitudes (heat map). Index 0 is "nothing". */
export const seq = ['#22272C', '#1F3350', '#26528A', '#3987E5', '#8DBDF5'];

const web = Platform.OS === 'web';
export const font = {
  body: web ? 'Inter, system-ui, sans-serif' : undefined,
  head: web ? "'Space Grotesk', Inter, system-ui, sans-serif" : undefined,
  mono: web ? "'JetBrains Mono', ui-monospace, monospace" : Platform.select({ ios: 'Menlo', default: 'monospace' }),
};

export const space = { page: 24, gap: 16, card: 20, radius: 10 };
