import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';

// Each package is a snapshot: a list of { dataFieldName, value } without timestamps. The collector
// stamps every value with the package time and keeps only values that changed since the previous
// package. The result has the same shape as the portal's one-time export, so the dashboard imports
// it with the same parser.

/** Package time from "…_YYYYMMDDhhmmss…" in the file name (UTC), else from createdOn. */
export function packageTime(entry) {
  for (const part of String(entry.name ?? '').replace(/\.[a-z]+$/i, '').split('_').reverse()) {
    const m = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/.exec(part);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }
  const t = Date.parse(entry.createdOn ?? '');
  return Number.isNaN(t) ? null : t;
}

/** Records inside a package ZIP. Throws when the ZIP holds no JSON. */
export function readPackage(zipBytes) {
  const files = unzipSync(zipBytes);
  const name = Object.keys(files).find((n) => n.toLowerCase().endsWith('.json'));
  if (!name) throw new Error('Kein JSON im Paket.');
  const json = JSON.parse(new TextDecoder().decode(files[name]));
  return Array.isArray(json?.Data) ? json.Data : [];
}

export function openStore(dir) {
  mkdirSync(join(dir, 'packages'), { recursive: true });
  const statePath = join(dir, 'collector-state.json');
  const outPath = join(dir, 'continuous.json');
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { done: {}, last: {}, lastTime: 0, log: [] };
  const out = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { Data: [] };

  const save = (path, value) => {
    writeFileSync(path + '.tmp', JSON.stringify(value));
    renameSync(path + '.tmp', path);
  };

  return {
    outPath,
    state,
    has: (name) => Boolean(state.done[name]),
    /** Adds one package. Returns how many values changed; packages older than the newest one are skipped. */
    add(name, time, zipBytes) {
      writeFileSync(join(dir, 'packages', name.replace(/[^\w.-]/g, '_')), zipBytes);
      let changed = 0;
      if (time >= state.lastTime) {
        const stamp = new Date(time).toISOString();
        for (const r of readPackage(zipBytes)) {
          if (!r?.dataFieldName || r.value == null) continue;
          const v = String(r.value);
          if (state.last[r.dataFieldName] === v) continue;
          state.last[r.dataFieldName] = v;
          out.Data.push({ dataFieldName: r.dataFieldName, value: v, timestampUtc: stamp });
          changed++;
        }
        state.lastTime = time;
      }
      state.done[name] = time;
      return changed;
    },
    note(entry) {
      state.log = [...state.log, { t: Date.now(), ...entry }].slice(-200);
    },
    flush() {
      save(outPath, out);
      save(statePath, state);
    },
  };
}
