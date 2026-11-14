import type { Dataset } from '../data/types';

// The compact dataset (about 2 MB) lives in IndexedDB; the raw export is never stored.
const DB = 'born-datenlabor';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export const loadDataset = () => run<Dataset | undefined>('readonly', (s) => s.get('dataset')).then((d) => (d && d.version === 1 ? d : null)).catch(() => null);
export const saveDataset = (ds: Dataset) => run('readwrite', (s) => s.put(ds, 'dataset')).then(() => undefined);
export const clearDataset = () => run('readwrite', (s) => s.delete('dataset')).then(() => undefined);

// Small settings (collector address) live in localStorage; private browsing may refuse it.
export async function loadSetting(key: string): Promise<string | null> {
  try { return localStorage.getItem('born-datenlabor/' + key); } catch { return null; }
}
export async function saveSetting(key: string, value: string | null): Promise<void> {
  try { if (value == null) localStorage.removeItem('born-datenlabor/' + key); else localStorage.setItem('born-datenlabor/' + key, value); } catch { /* not persisted */ }
}
