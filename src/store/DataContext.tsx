import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { parseExport } from '../data/parse.ts';
import { mergeDatasets } from '../data/merge.ts';
import { allSessions, capacityOf, deriveStandby, deriveTrips } from '../data/derive.ts';
import type { Dataset, Session, Standby, Trip } from '../data/types.ts';
import { clearDataset, loadDataset, loadSetting, saveDataset, saveSetting } from './storage';
import { pickExportFile } from './pickFile';

export type Derived = { ds: Dataset; trips: Trip[]; sessions: Session[]; standby: Standby[]; capacity: number };
type Status = 'loading' | 'empty' | 'importing' | 'ready';
export type Sync = { url: string | null; state: 'off' | 'syncing' | 'ok' | 'error'; message: string | null; at: number | null };
type Ctx = {
  status: Status; error: string | null; data: Derived | null; sync: Sync;
  importFile: () => void; importText: (text: string) => void; reset: () => void;
  /** Sets (or with null clears) the collector address and fetches from it. */
  connectCollector: (url: string | null) => void; syncNow: () => void;
};

const DataCtx = createContext<Ctx | null>(null);
const SYNC_EVERY = 15 * 60_000;

/** Datasets stored by an earlier version lack fields added since. */
const upgrade = (d: Dataset): Dataset => ({ ...d, outdoorTemp: d.outdoorTemp ?? [] });

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<Sync>({ url: null, state: 'off', message: null, at: null });
  const dsRef = useRef<Dataset | null>(null);
  dsRef.current = ds;

  /** Adds an import to what is already loaded and stores the result. */
  const absorb = useCallback((incoming: Dataset) => {
    const next = dsRef.current ? mergeDatasets(dsRef.current, incoming) : incoming;
    dsRef.current = next;
    setDs(next);
    setStatus('ready');
    return saveDataset(next);
  }, []);

  const importText = useCallback((text: string) => {
    try {
      const parsed = parseExport(JSON.parse(text));
      if (!parsed.odo.length && !parsed.soc.length) throw new Error('Die Datei enthält weder Kilometerstand noch Ladestand. Ist es der Export aus dem EU-Data-Act-Portal?');
      setError(null);
      absorb(parsed).catch(() => setError('Die Daten sind geladen, konnten aber nicht gespeichert werden. Nach einem Neustart musst du die Datei erneut laden.'));
    } catch (e) {
      setStatus(dsRef.current ? 'ready' : 'empty');
      setError(e instanceof SyntaxError ? 'Die Datei ist kein gültiges JSON.' : e instanceof Error ? e.message : 'Die Datei konnte nicht gelesen werden.');
    }
  }, [absorb]);

  const importFile = useCallback(() => {
    setError(null);
    pickExportFile().then((text) => {
      if (text == null) return;
      setStatus('importing');
      // Let the "wird gelesen" state paint before the parse blocks the thread.
      setTimeout(() => importText(text), 30);
    }, () => setError('Die Datei konnte nicht geöffnet werden.'));
  }, [importText]);

  const reset = useCallback(() => { clearDataset(); dsRef.current = null; setDs(null); setStatus('empty'); }, []);

  const fetchCollector = useCallback(async (url: string) => {
    setSync((s) => ({ ...s, url, state: 'syncing', message: null }));
    try {
      const res = await fetch(url.replace(/\/+$/, '') + '/continuous.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('Der Collector antwortet mit HTTP ' + res.status + '.');
      const parsed = parseExport(await res.json());
      const points = parsed.soc.length + parsed.odo.length;
      if (points) await absorb(parsed);
      setSync({ url, state: 'ok', at: Date.now(), message: points ? null : 'Der Collector ist erreichbar, hat aber noch keine Pakete geladen.' });
    } catch (e) {
      const msg = e instanceof TypeError ? 'Der Collector ist unter dieser Adresse nicht erreichbar. Läuft er, und erlaubt er diese Seite?' : e instanceof Error ? e.message : 'Abruf fehlgeschlagen.';
      setSync((s) => ({ ...s, url, state: 'error', message: msg }));
    }
  }, [absorb]);

  const connectCollector = useCallback((url: string | null) => {
    saveSetting('collector', url);
    if (url) fetchCollector(url);
    else setSync({ url: null, state: 'off', message: null, at: null });
  }, [fetchCollector]);

  const syncNow = useCallback(() => { if (sync.url) fetchCollector(sync.url); }, [sync.url, fetchCollector]);

  useEffect(() => {
    loadDataset().then((d) => {
      const loaded = d ? upgrade(d) : null;
      dsRef.current = loaded;
      setDs(loaded);
      setStatus(loaded ? 'ready' : 'empty');
      return loadSetting('collector');
    }).then((url) => { if (url) fetchCollector(url); });
  }, [fetchCollector]);

  // The portal delivers a package every 15 minutes; ask the collector at the same pace.
  useEffect(() => {
    if (!sync.url) return;
    const url = sync.url;
    const id = setInterval(() => fetchCollector(url), SYNC_EVERY);
    return () => clearInterval(id);
  }, [sync.url, fetchCollector]);

  const data = useMemo<Derived | null>(() => {
    if (!ds) return null;
    const trips = deriveTrips(ds);
    const sessions = allSessions(ds);
    return { ds, trips, sessions, standby: deriveStandby(ds, trips, sessions), capacity: capacityOf(ds) };
  }, [ds]);

  const value = useMemo(() => ({ status, error, data, sync, importFile, importText, reset, connectCollector, syncNow }), [status, error, data, sync, importFile, importText, reset, connectCollector, syncNow]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData(): Ctx {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error('useData outside DataProvider');
  return ctx;
}
