import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Serves continuous.json to the dashboard. Bound to this computer only, and only pages from the
 * listed origins may read it: without that check any website open in the browser could fetch the
 * vehicle data from localhost.
 */
export function serve(store, { port = 8787, origins = [] } = {}) {
  const server = createServer((req, res) => {
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) {
      res.writeHead(403).end();
      return;
    }
    const cors = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Private-Network': 'true' } : {};
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET' }).end();
      return;
    }
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/continuous.json') {
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(existsSync(store.outPath) ? readFileSync(store.outPath) : '{"Data":[]}');
    } else if (req.method === 'GET' && path === '/status') {
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ packages: Object.keys(store.state.done).length, lastPackage: store.state.lastTime || null, log: store.state.log.slice(-96) }));
    } else {
      res.writeHead(404, cors).end();
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
