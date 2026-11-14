// Compact dataset built from the VW Group EU Data Act export.
// Every series is [timestampMs, value][] sorted by time; consecutive equal values are dropped.

export type Series = [number, number][];

export type ChargeType = 'ac' | 'dc';

export type Session = {
  id: string;
  start: number;
  stop: number;
  type: ChargeType;
  startSoc: number;
  endSoc: number;
  activeSec: number;
  peakKw: number;
  /** kWh into the battery: integrated from the power curve when there is one, else estimated from the SoC gain. */
  kwh: number;
  kwhFromCurve: boolean;
  /** True when the session was reconstructed from the charge-power series because the car reported none. */
  derived?: boolean;
};

export type CurvePoint = [t: number, soc: number, kw: number];

export type Warning = { t: number; text: string; category: string; priority: number };

export type Dataset = {
  version: 1;
  importedAt: number;
  from: number;
  to: number;
  /** State of charge in percent. */
  soc: Series;
  /** Range shown by the car, km. */
  rangeKm: Series;
  /** Odometer, km. One point per change. */
  odo: Series;
  /** Charge power in kW. */
  power: Series;
  /** 1 while the plug is connected. */
  plug: Series;
  /** 0 off, 1 heating, 2 cooling, 3 ventilation. */
  clima: Series;
  inspectionDays: Series;
  sessions: Session[];
  curves: Record<string, CurvePoint[]>;
  /** Charged energy per day as reported by the car: [dayStartMs, kWh]. */
  aggDay: Series;
  aggMonth: Series;
  warnings: Warning[];
  /** Last known single values (doors, windows, battery temperature …). */
  snapshot: Record<string, string>;
  /** Usable capacity in kWh estimated from the power curves; null when no curve allows it. */
  capacityKwh: number | null;
  recordCount: number;
};

export type Trip = {
  start: number;
  end: number;
  km: number;
  minutes: number;
  kmh: number;
  socStart: number | null;
  socEnd: number | null;
  /** kWh used, from the SoC drop and the capacity; null when the SoC is unknown or rose. */
  kwh: number | null;
  /** kWh per 100 km; null for short trips where 1 % SoC resolution is too coarse. */
  per100: number | null;
};

export type Standby = {
  start: number;
  end: number;
  hours: number;
  socStart: number;
  socEnd: number;
  /** Percentage points lost per day. */
  perDay: number;
};

export type Bucket = {
  key: string;
  start: number;
  km: number;
  trips: number;
  driveKwh: number;
  driveKm: number;
  chargedKwh: number;
  acKwh: number;
  dcKwh: number;
  sessions: number;
};
