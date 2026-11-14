/** A round axis maximum at or above v, and the tick step that goes with it. */
export function niceMax(v: number, ticks = 3): { max: number; step: number } {
  if (!(v > 0)) return { max: 1, step: 1 };
  const raw = v / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return { max: step * Math.ceil(v / step - 1e-9), step };
}

export function ticksUpTo(max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = 0; v <= max + step * 1e-6; v += step) out.push(+v.toFixed(6));
  return out;
}
