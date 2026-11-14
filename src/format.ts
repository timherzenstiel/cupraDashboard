const nf = (d: number) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const cache: Record<number, Intl.NumberFormat> = {};

/** German number formatting; "–" for missing values. */
export function num(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return '–';
  return (cache[digits] ??= nf(digits)).format(v);
}

const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
export const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

export const dayMonth = (t: number) => { const d = new Date(t); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.'; };
export const dateShort = (t: number) => dayMonth(t) + String(new Date(t).getFullYear()).slice(2);
export const clock = (t: number) => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
export const monthLabel = (t: number) => { const d = new Date(t); return MONTHS[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2); };
export const weekdayIndex = (t: number) => (new Date(t).getDay() + 6) % 7;

export function duration(minutes: number): string {
  const m = Math.round(minutes);
  return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + pad(m % 60) + ' min';
}
