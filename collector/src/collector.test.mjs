import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { NotSignedIn, createPortal } from './portal.mjs';
import { openStore, packageTime } from './store.mjs';
import { collectOnce } from './collect.mjs';
import { serve } from './serve.mjs';

const VIN = 'TESTVIN0000000001';
const zip = (records) => zipSync({ 'data.json': new TextEncoder().encode(JSON.stringify({ user_id: 'u', Data: records })) });
const snap = (soc, km) => [{ key: 'a', dataFieldName: 'battery_state_report.soc', value: String(soc) }, { key: 'b', dataFieldName: 'mileage.value', value: String(km) }];

/** A stand-in for the portal with the same paths, headers and status codes. */
function mockPortal(packages, { signedIn = true } = {}) {
  const state = { signedIn, packages, failDownload: null };
  const server = createServer((req, res) => {
    const json = (v) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(v));
    if (!state.signedIn) return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>login</html>');
    if (req.url.startsWith('/proxy_api/consent/me/vehicles')) return json({ vehicles: [{ data: { vin: VIN } }] });
    if (req.url.endsWith('/metadata/partial')) return json({ Identifier: 'req-1' });
    if (req.url.endsWith('/req-1/list')) return req.headers.type === 'partial' ? json(Object.keys(state.packages).map((name) => ({ name }))) : res.writeHead(500).end();
    if (req.url.endsWith('/req-1/download')) {
      const body = state.packages[req.headers.filename];
      if (!body || req.headers.filename === state.failDownload) return res.writeHead(500).end();
      return res.writeHead(200).end(body);
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const base = 'http://127.0.0.1:' + server.address().port;
    const request = async (url, headers) => { const r = await fetch(url, { headers }); return { status: r.status, body: new Uint8Array(await r.arrayBuffer()) }; };
    resolve({ state, portal: createPortal(request, base), close: () => server.close() });
  }));
}

test('packageTime reads the timestamp from either file-name layout', () => {
  assert.equal(packageTime({ name: `${VIN}_20261114101500.zip` }), Date.UTC(2026, 10, 14, 10, 15, 0));
  assert.equal(packageTime({ name: `20261114101500_${VIN}.zip` }), Date.UTC(2026, 10, 14, 10, 15, 0));
  assert.equal(packageTime({ name: 'x.zip', createdOn: '2026-11-14T10:15:00Z' }), Date.UTC(2026, 10, 14, 10, 15, 0));
  assert.equal(packageTime({ name: 'x.zip' }), null);
});

test('collectOnce downloads new packages once, keeps only changes and retries failures', async () => {
  const m = await mockPortal({ [`${VIN}_20261114100000.zip`]: zip(snap(80, 1000)), [`${VIN}_20261114101500.zip`]: zip(snap(80, 1003)), [`${VIN}_20261114103000.zip`]: zip(snap(79, 1003)) });
  const dir = mkdtempSync(join(tmpdir(), 'collector-'));
  try {
    m.state.failDownload = `${VIN}_20261114103000.zip`;
    let store = openStore(dir);
    assert.deepEqual(await collectOnce(m.portal, store), { status: 'ok', downloaded: 2, changed: 3, failed: 1 });
    m.state.failDownload = null;
    store = openStore(dir); // a restart must pick up where the last run stopped
    assert.deepEqual(await collectOnce(m.portal, store), { status: 'ok', downloaded: 1, changed: 1, failed: 0 });
    assert.equal((await collectOnce(m.portal, store)).downloaded, 0);
    const out = JSON.parse(readFileSync(join(dir, 'continuous.json'), 'utf8')).Data;
    assert.deepEqual(out.map((r) => [r.dataFieldName, r.value, r.timestampUtc.slice(11, 16)]), [
      ['battery_state_report.soc', '80', '10:00'], ['mileage.value', '1000', '10:00'], ['mileage.value', '1003', '10:15'], ['battery_state_report.soc', '79', '10:30'],
    ]);
    assert.ok(!readFileSync(join(dir, 'continuous.json'), 'utf8').includes(VIN));
  } finally {
    m.close();
  }
});

test('a signed-out session is reported as NotSignedIn', async () => {
  const m = await mockPortal({}, { signedIn: false });
  try {
    await assert.rejects(() => collectOnce(m.portal, openStore(mkdtempSync(join(tmpdir(), 'collector-')))), NotSignedIn);
  } finally {
    m.close();
  }
});

test('the local server answers listed origins only', async () => {
  const store = openStore(mkdtempSync(join(tmpdir(), 'collector-')));
  const server = await serve(store, { port: 0, origins: ['https://ok.example'] });
  const url = 'http://127.0.0.1:' + server.address().port + '/continuous.json';
  try {
    const ok = await fetch(url, { headers: { Origin: 'https://ok.example' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://ok.example');
    assert.deepEqual(await ok.json(), { Data: [] });
    assert.equal((await fetch(url, { headers: { Origin: 'https://evil.example' } })).status, 403);
  } finally {
    server.close();
  }
});
