import { createServer } from 'node:http';
import { parseCatalog, queryCatalog, availability, slug, version, text, verifyArtifact } from './catalog.mjs';

export const CAPABILITIES = Object.freeze({
  apiVersion: 1, purchases: false, accountsConfigured: false,
  packFormats: ['latitude-editor-pack-v1'],
  categories: ['transition', 'look', 'title', 'font'],
  plannedCategories: ['animation', 'image'],
  editingRequiresAccount: false, exportRequiresAccount: false
});
class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new HttpError(status, code, message); };
function send(res, status, value, head = false) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" });
  res.end(head ? undefined : body);
}
export function createPackServer({ catalog, readArtifact, ledger, authenticate = null, onError = () => {} }) {
  if (!catalog || !Array.isArray(catalog.packs) || typeof readArtifact !== 'function')
    throw Error('A validated catalog and bounded artifact reader are required.');
  if (authenticate !== null && typeof authenticate !== 'function') throw Error('Invalid authentication adapter.');
  catalog = parseCatalog(Buffer.from(JSON.stringify(catalog)));
  ledger?.registerCatalog(catalog);
  let active = 0;
  const server = createServer({ maxHeaderSize: 8192 }, async (req, res) => {
    if (active >= 16) { send(res, 503, { error: { code: 'busy', message: 'Try again shortly.' } }); return; }
    active++;
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); if (!res.writableEnded) res.destroy(); }, 15000);
    res.once('close', () => controller.abort());
    const head = req.method === 'HEAD';
    let authTask;
    const identity = () => authTask ||= (async () => {
      const authorization = req.headers.authorization;
      if (!authenticate || typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9._~+/-]{1,2048}=*$/.test(authorization))
        fail(401, 'sign_in_required', 'Sign in to view owned packs.');
      let timer;
      try {
        const result = await Promise.race([
          Promise.resolve().then(() => authenticate({ authorization, signal: controller.signal })),
          new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Authentication timed out.')), 5000); })
        ]);
        if (!result || typeof result.subject !== 'string') fail(401, 'sign_in_required', 'Sign in to view owned packs.');
        return text(result.subject, 160, 'account identifier');
      } catch {
        fail(401, 'sign_in_required', 'Sign in to view owned packs.');
      } finally { clearTimeout(timer); }
    })();
    try {
      if (!req.url || req.url.length > 2048) fail(414, 'invalid_request', 'The request is too long.');
      const url = new URL(req.url, 'http://localhost');
      // No purchase adapter or webhook trust path is installed in this foundation.
      if (url.pathname === '/v1/checkout' || url.pathname === '/v1/webhooks/stripe') {
        if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); fail(405, 'method_not_allowed', 'Use POST.'); }
        fail(503, 'commerce_disabled', 'Purchases are not enabled. Editing and installed packs work offline.');
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); fail(405, 'method_not_allowed', 'Use GET.'); }
      if (url.pathname === '/health') { send(res, 200, { status: 'ok' }, head); return; }
      if (url.pathname === '/v1/capabilities') {
        send(res, 200, { ...CAPABILITIES, accountsConfigured: !!authenticate }, head); return;
      }
      if (url.pathname === '/v1/catalog') {
        let result;
        try {
          const permitted = ['q', 'kind', 'cost', 'creator', 'page', 'limit', 'appVersion'];
          if ([...url.searchParams.keys()].some(key => !permitted.includes(key) || url.searchParams.getAll(key).length !== 1))
            throw Error('Unsupported filter.');
          result = queryCatalog(catalog, { query: url.searchParams.get('q') || '', kind: url.searchParams.get('kind') || '',
            cost: url.searchParams.get('cost') || '', creator: url.searchParams.get('creator') || '',
            page: Number(url.searchParams.get('page') || 1), limit: Number(url.searchParams.get('limit') || 24),
            appVersion: url.searchParams.get('appVersion') || undefined });
        } catch { fail(400, 'invalid_filters', 'Check the catalog filters and application version.'); }
        send(res, 200, result, head); return;
      }
      if (url.pathname === '/v1/library') {
        const subject = await identity();
        if (!ledger) fail(503, 'library_unavailable', 'The owned-pack library is unavailable.');
        let owned, appVersion;
        try {
          if ([...url.searchParams.keys()].some(key => !['page', 'limit', 'appVersion'].includes(key) || url.searchParams.getAll(key).length !== 1))
            throw Error('Unsupported library filter.');
          appVersion = url.searchParams.get('appVersion') || undefined;
          if (appVersion) version(appVersion);
          owned = ledger.owned(subject, { page: Number(url.searchParams.get('page') || 1), limit: Number(url.searchParams.get('limit') || 24) });
        } catch { fail(400, 'invalid_filters', 'Check the library page and application version.'); }
        const items = owned.ids.map(id => {
          const candidates = catalog.packs.filter(item => item.id === id && item.status === 'published');
          const latest = queryCatalog({ packs: candidates }, { limit: 1 }).items[0];
          return latest ? { ...latest, availability: availability(latest, { owned: true, appVersion }) }
            : { id, availability: { state: 'unavailable', label: 'Unavailable for download', enabled: false } };
        });
        send(res, 200, { items, total: owned.total, page: owned.page, limit: owned.limit }, head); return;
      }
      const match = /^\/v1\/packs\/([^/]+)\/([^/]+)\/download$/.exec(url.pathname);
      if (match) {
        let id, ver;
        try { id = slug(match[1]); ver = version(match[2]); } catch { fail(404, 'not_found', 'Pack not found.'); }
        const item = catalog.packs.find(p => p.id === id && p.version === ver && p.status === 'published');
        if (!item) fail(404, 'not_found', 'Pack not found.');
        // Authorization precedes file access and integrity checks.
        if (item.price.kind === 'one-time') {
          const subject = await identity();
          if (!ledger || !ledger.has(subject, id)) fail(403, 'not_owned', 'This pack is not in your owned library.');
        }
        const appVersion = url.searchParams.get('appVersion');
        if (!appVersion) fail(400, 'app_version_required', 'Send the installed Latitude version.');
        try { version(appVersion); } catch { fail(400, 'invalid_version', 'Send a stable three-part application version.'); }
        if (!availability(item, { appVersion, owned: true }).enabled)
          fail(409, 'incompatible', 'Update Latitude before installing this pack.');
        let onAbort;
        const aborted = new Promise((_, reject) => {
          onAbort = () => reject(Error('Download canceled.'));
          if (controller.signal.aborted) onAbort();
          else controller.signal.addEventListener('abort', onAbort, { once: true });
        });
        let bytes;
        try { bytes = await Promise.race([Promise.resolve().then(() => readArtifact(item, { signal: controller.signal })), aborted]); }
        finally { controller.signal.removeEventListener('abort', onAbort); }
        verifyArtifact(bytes, item); // Also enforced for custom storage adapters.
        if (controller.signal.aborted) return;
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length,
          'Content-Disposition': 'attachment; filename="' + item.id + '-' + item.version + '.latitude-pack"',
          'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
          'X-Pack-SHA256': item.artifact.sha256 });
        res.end(head ? undefined : bytes); return;
      }
      fail(404, 'not_found', 'Not found.');
    } catch (error) {
      if (res.destroyed || res.writableEnded) return;
      if (!(error instanceof HttpError)) { try { onError(error); } catch {} }
      send(res, error instanceof HttpError ? error.status : 503, {
        error: { code: error instanceof HttpError ? error.code : 'service_unavailable',
          message: error instanceof HttpError ? error.message : 'Pack service unavailable. Your installed packs and edits are unaffected.' }
      }, head);
    } finally { clearTimeout(timeout); active--; }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 3000;
  server.maxConnections = 64; server.maxRequestsPerSocket = 100;
  return server;
}
