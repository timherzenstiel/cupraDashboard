#!/usr/bin/env node
// Usage: node src/cli.mjs <login | once | run | serve> [--vin VIN] [--port 8787] [--data DIR] [--origin URL]…
//
// The collector never sees your password. `login` opens a real browser window where you sign in
// yourself; the session is kept in a browser profile under the data folder and reused afterwards.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { BASE_URL, NotSignedIn, createPortal } from './portal.mjs';
import { openStore } from './store.mjs';
import { collectOnce } from './collect.mjs';
import { serve } from './serve.mjs';

const args = process.argv.slice(2);
const command = args[0];
const opt = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const all = (name) => args.flatMap((a, i) => (a === '--' + name ? [args[i + 1]] : []));

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = resolve(opt('data', join(root, 'data')));
const profile = join(dataDir, 'collector-profile');
const port = Number(opt('port', 8787));
const origins = ['http://localhost:5173', 'http://localhost:4173', 'https://timherzenstiel.github.io', ...all('origin')];
const INTERVAL = 15 * 60_000;
const log = (...m) => console.log(new Date().toLocaleTimeString('de-DE'), ...m);

async function withPortal(headless, fn) {
  const context = await chromium.launchPersistentContext(profile, { headless });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    // Opening the portal lets the single sign-on renew the session cookie when it can.
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    const request = async (url, headers) => {
      const res = await context.request.get(url, { headers, maxRedirects: 0 });
      return { status: res.status(), body: new Uint8Array(await res.body()) };
    };
    return await fn(createPortal(request), page);
  } finally {
    await context.close();
  }
}

async function login() {
  log('Ein Browserfenster öffnet sich. Melde dich dort am Portal an; das Fenster schließt sich danach von selbst.');
  await withPortal(false, async (portal) => {
    for (let i = 0; i < 200; i++) {
      try {
        const vins = await portal.vehicles();
        log(`Angemeldet. ${vins.length} Fahrzeug(e) am Konto gefunden.`);
        return;
      } catch (e) {
        if (!(e instanceof NotSignedIn)) log('Portal antwortet noch nicht:', e.message);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error('Keine Anmeldung innerhalb von zehn Minuten.');
  });
}

async function once(store) {
  try {
    const r = await withPortal(true, (portal) => collectOnce(portal, store, { vin: opt('vin') }));
    if (r.status === 'no-request') log('Am Portal gibt es noch keine Dauerabfrage für dieses Fahrzeug. Lege sie dort an (15 Minuten, „All Data“).');
    else log(`${r.downloaded} neue Pakete, ${r.changed} geänderte Werte` + (r.failed ? `, ${r.failed} fehlgeschlagen` : '') + '.');
    return true;
  } catch (e) {
    if (e instanceof NotSignedIn) log('Nicht angemeldet. Führe einmal `npm run login` aus.');
    else log('Abruf fehlgeschlagen:', e.message);
    store.note({ error: e.message });
    store.flush();
    return false;
  }
}

if (command === 'login') {
  await login();
} else if (command === 'once') {
  process.exitCode = (await once(openStore(dataDir))) ? 0 : 1;
} else if (command === 'serve' || command === 'run') {
  const store = openStore(dataDir);
  await serve(store, { port, origins });
  log(`Daten unter http://localhost:${port}/continuous.json`);
  if (command === 'run') {
    for (;;) {
      await once(store);
      await new Promise((r) => setTimeout(r, INTERVAL));
    }
  }
} else {
  console.log('Befehle: login · once · run · serve');
  process.exitCode = 1;
}
