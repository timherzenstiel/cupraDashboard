import { packageTime } from './store.mjs';

/**
 * One polling round: find the vehicle and its data request, download every package not seen yet,
 * oldest first. Returns a summary; throws NotSignedIn when the session is gone.
 */
export async function collectOnce(portal, store, { vin } = {}) {
  const vins = await portal.vehicles();
  const useVin = vin ?? vins[0];
  if (!useVin) throw new Error('Am Konto ist kein Fahrzeug verknüpft.');
  if (vin && !vins.includes(vin)) throw new Error('Das angegebene Fahrzeug ist diesem Konto nicht zugeordnet.');
  const identifier = await portal.identifier(useVin);
  if (!identifier) return { status: 'no-request', downloaded: 0, changed: 0 };

  const entries = (await portal.list(useVin, identifier))
    .filter((e) => e?.name && !store.has(e.name))
    .map((e) => ({ ...e, time: packageTime(e) }))
    .filter((e) => e.time != null)
    .sort((a, b) => a.time - b.time);

  let downloaded = 0;
  let changed = 0;
  let failed = 0;
  for (const e of entries) {
    try {
      changed += store.add(e.name, e.time, await portal.download(useVin, identifier, e.name));
      downloaded++;
    } catch (err) {
      if (err.constructor.name === 'NotSignedIn') throw err;
      failed++; // Retried on the next round because the package is not marked as done.
    }
  }
  store.note({ downloaded, changed, failed });
  store.flush();
  return { status: 'ok', downloaded, changed, failed };
}
