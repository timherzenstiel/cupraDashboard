// Calls to the EU Data Act portal's own web API. Endpoint paths and required headers follow the
// open-source Home Assistant integration by Jernej Fijačko (MIT), github.com/TommiG1/HA_VAG-EU-Data-Act.
// `request(url, headers)` must resolve to { status, body: Uint8Array } and carry the signed-in session.

export const BASE_URL = 'https://eu-data-act.drivesomethinggreater.com';

export class PortalError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
export class NotSignedIn extends PortalError {}

const text = (body) => new TextDecoder().decode(body);

export function createPortal(request, base = BASE_URL) {
  async function getJson(path, headers = {}) {
    const { status, body } = await request(base + path, headers);
    if (status === 401 || status === 403) throw new NotSignedIn('Die Sitzung am Portal ist abgelaufen.', status);
    if (status >= 400) throw new PortalError(`GET ${path} → HTTP ${status}`, status);
    try {
      return JSON.parse(text(body));
    } catch {
      // A signed-out session is redirected to an HTML login page that answers 200.
      throw new NotSignedIn('Das Portal hat statt Daten eine Anmeldeseite geliefert.', status);
    }
  }

  return {
    /** VINs linked to the signed-in account. */
    async vehicles() {
      const payload = await getJson('/proxy_api/consent/me/vehicles?viewPosition=FRONT_LEFT');
      const vins = new Set();
      (function walk(node) {
        if (Array.isArray(node)) node.forEach(walk);
        else if (node && typeof node === 'object') {
          for (const [k, v] of Object.entries(node)) {
            if (k.toLowerCase() === 'vin' && typeof v === 'string' && v.length === 17) vins.add(v);
            else walk(v);
          }
        }
      })(payload);
      return [...vins];
    },

    /** Identifier of the continuous data request; null while none exists. */
    async identifier(vin) {
      const meta = await getJson(`/proxy_api/euda-apim/datarequest/vehicles/${vin}/metadata/partial`);
      return meta?.Identifier ?? meta?.identifier ?? null;
    },

    /** Available packages: [{ name, createdOn, size }]. Empty until the first package is delivered. */
    async list(vin, identifier) {
      try {
        const data = await getJson(`/proxy_api/euda-apim/datadelivery/vehicles/${vin}/${identifier}/list`, { type: 'partial' });
        return Array.isArray(data) ? data : data?.files ?? [];
      } catch (e) {
        if (e.status === 404) return [];
        throw e;
      }
    },

    /** Raw ZIP bytes of one package. */
    async download(vin, identifier, name) {
      const path = `/proxy_api/euda-apim/datadelivery/vehicles/${vin}/${identifier}/download`;
      const { status, body } = await request(base + path, { filename: name, type: 'partial' });
      if (status === 401 || status === 403) throw new NotSignedIn('Die Sitzung am Portal ist abgelaufen.', status);
      if (status >= 400) throw new PortalError(`Download ${name} → HTTP ${status}`, status);
      return body;
    },
  };
}
