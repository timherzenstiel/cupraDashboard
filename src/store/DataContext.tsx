import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { parseExport } from '../data/parse.ts';
import { allSessions, capacityOf, deriveStandby, deriveTrips } from '../data/derive.ts';
import type { Dataset, Session, Standby, Trip } from '../data/types.ts';
import { clearDataset, loadDataset, saveDataset } from './storage';
import { pickExportFile } from './pickFile';

export type Derived = { ds: Dataset; trips: Trip[]; sessions: Session[]; standby: Standby[]; capacity: number };
type Status = 'loading' | 'empty' | 'importing' | 'ready';
type Ctx = { status: Status; error: string | null; data: Derived | null; importFile: () => void; importText: (text: string) => void; reset: () => void };

const DataCtx = createContext<Ctx | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDataset().then((d) => { setDs(d); setStatus(d ? 'ready' : 'empty'); });
  }, []);

  const importText = useCallback((text: string) => {
    try {
      const parsed = parseExport(JSON.parse(text));
      if (!parsed.odo.length && !parsed.soc.length) throw new Error('Die Datei enthält weder Kilometerstand noch Ladestand. Ist es der Export aus dem EU-Data-Act-Portal?');
      setDs(parsed);
      setStatus('ready');
      setError(null);
      saveDataset(parsed).catch(() => setError('Die Daten sind geladen, konnten aber nicht gespeichert werden. Nach einem Neustart musst du die Datei erneut laden.'));
    } catch (e) {
      setStatus((s) => (s === 'importing' ? (ds ? 'ready' : 'empty') : s));
      setError(e instanceof SyntaxError ? 'Die Datei ist kein gültiges JSON.' : e instanceof Error ? e.message : 'Die Datei konnte nicht gelesen werden.');
    }
  }, [ds]);

  const importFile = useCallback(() => {
    setError(null);
    pickExportFile().then((text) => {
      if (text == null) return;
      setStatus('importing');
      // Let the "wird gelesen" state paint before the parse blocks the thread.
      setTimeout(() => importText(text), 30);
    }, () => setError('Die Datei konnte nicht geöffnet werden.'));
  }, [importText]);

  const reset = useCallback(() => { clearDataset(); setDs(null); setStatus('empty'); }, []);

  const data = useMemo<Derived | null>(() => {
    if (!ds) return null;
    const trips = deriveTrips(ds);
    const sessions = allSessions(ds);
    return { ds, trips, sessions, standby: deriveStandby(ds, trips, sessions), capacity: capacityOf(ds) };
  }, [ds]);

  const value = useMemo(() => ({ status, error, data, importFile, importText, reset }), [status, error, data, importFile, importText, reset]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData(): Ctx {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error('useData outside DataProvider');
  return ctx;
}
