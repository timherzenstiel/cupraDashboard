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
