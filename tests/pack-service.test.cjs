const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { once } = require('node:events');

const modules = Promise.all([
  import('../services/packs/catalog.mjs'), import('../services/packs/ledger.mjs'),
  import('../services/packs/server.mjs'), import('../services/packs/artifacts.mjs')
]);
function fixture({ id = 'quiet-motion', paid = false, version = '1.0.0' } = {}) {
  const pack = { type: 'latitude-editor-pack', version: 1, name: 'Quiet motion', author: 'Latitude',
    presets: [{ name: 'Soft fade', kind: 'transition', settings: { transition: 'fade', fadeIn: 0.5, easing: 'smooth' } }] };
  const bytes = Buffer.from(JSON.stringify(pack));
  const item = { id, version, name: pack.name, creator: { id: 'latitude', name: pack.author },
    summary: 'Restrained transitions for interviews.', kinds: ['transition'], tags: ['podcast', 'restrained'],
    status: 'published', review: { reviewer: 'Test reviewer', reviewedAt: '2026-11-16T00:00:00Z', technical: true, rights: true },
    license: { name: 'Test fixture', text: 'These synthetic fixtures are for tests.\nNo premium content is included.' },
    price: { kind: paid ? 'one-time' : 'free', amountMinor: paid ? 500 : 0, currency: 'USD' },
    compatibility: { minAppVersion: '0.9.8', packVersion: 1 },
    artifact: { format: 'latitude-editor-pack-v1', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, presets: 1 } };
  return { pack, bytes, item };
}
const encode = packs => Buffer.from(JSON.stringify({ schemaVersion: 1, packs }));
const event = (overrides = {}) => ({ provider: 'test-provider', eventId: 'event-1', purchaseId: 'purchase-1',
  subject: 'account-1', packId: 'quiet-motion', action: 'grant', ...overrides });

test('curated catalog validates byte bounds, immutable identity, review, prices and format separately from imported packs', async () => {
  const [{ parseCatalog, LIMITS }] = await modules;
  const { item } = fixture();
  const catalog = parseCatalog(encode([item]));
  assert.ok(Object.isFrozen(catalog.packs[0].review));
  for (const mutate of [
    x => { x.review.rights = false; }, x => { x.review.reviewedAt = '2026-02-31T00:00:00Z'; },
    x => { x.price.amountMinor = 3.5; }, x => { x.price.currency = ['USD']; },
    x => { x.artifact.url = 'https://untrusted.example/payload'; },
    x => { x.artifact.bytes = 128 * 1024 + 1; }, x => { x.artifact.sha256 = [x.artifact.sha256]; }, x => { x.artifact.sha256 = '../escape'; },
    x => { x.id = '../escape'; }, x => { x.version = '1.00.0'; },
    x => { x.kinds = ['animation']; }, x => { x.approved = true; },
    x => { x.compatibility.packVersion = 2; }
  ]) {
    const changed = structuredClone(item); mutate(changed);
    assert.throws(() => parseCatalog(encode([changed])));
  }
  assert.throws(() => parseCatalog(encode([item, item])), /Duplicate/);
  assert.throws(() => parseCatalog(Buffer.alloc(LIMITS.catalogBytes + 1)), /byte limit/);
  assert.throws(() => parseCatalog(Buffer.from([0xff, 0xfe])));
  assert.throws(() => parseCatalog(encode(Array.from({ length: 501 }, () => item))), /too many/);
});

test('catalog browsing is bounded, searchable by creator/tags, ordered by semantic version and honest about unavailable commerce', async () => {
  const [{ parseCatalog, queryCatalog, availability }] = await modules;
  const old = fixture({ version: '1.2.0' }).item, newer = fixture({ version: '1.10.0' }).item;
  const paid = fixture({ id: 'paid-motion', paid: true }).item;
  const planned = { ...fixture({ id: 'planned-art' }).item, status: 'planned', kinds: ['image'],
    review: null, license: null, artifact: null };
  const plannedUpdate = { ...planned, id: old.id, version: '2.0.0', kinds: ['animation'] };
  const withdrawn = { ...fixture({ id: 'withdrawn' }).item, status: 'withdrawn' };
  const catalog = parseCatalog(encode([old, newer, paid, planned, plannedUpdate, withdrawn]));
  const result = queryCatalog(catalog, { query: 'Latitude podcast', kind: 'transition', cost: 'free' });
  assert.equal(result.total, 1); assert.equal(result.items[0].version, '1.10.0');
  assert.equal(queryCatalog(catalog, { limit: 1, page: 2 }).items.length, 1);
  assert.equal(queryCatalog(catalog).total, 3);
  assert.throws(() => queryCatalog(catalog, { limit: 49 }), /filters/);
  assert.throws(() => queryCatalog(catalog, { appVersion: 'garbage' }));
  assert.equal(availability(paid).enabled, false);
  assert.equal(availability(paid, { owned: true }).state, 'owned');
  assert.equal(availability(paid, { owned: true, appVersion: '0.9.7' }).state, 'incompatible');
  assert.equal(availability(paid, { owned: true, installedVersion: '1.0.0' }).state, 'installed');
  assert.equal(availability(planned).state, 'planned');
  assert.equal(availability(withdrawn, { owned: true }).state, 'unavailable');
  assert.equal(availability(newer, { installedVersion: '1.2.0' }).state, 'update');
});

test('downloads verify exact bytes and the existing data-only pack schema, not just a matching digest', async () => {
  const [{ verifyArtifact }] = await modules;
  const { bytes, item, pack } = fixture();
  assert.equal(verifyArtifact(bytes, item).name, 'Quiet motion');
  assert.throws(() => verifyArtifact(Buffer.from(bytes).fill(0), item), /integrity/);
  assert.throws(() => verifyArtifact(bytes.subarray(1), item), /integrity/);
  for (const field of ['name', 'author']) {
    const altered = Buffer.from(JSON.stringify({ ...pack, [field]: 'Different identity' }));
    const changed = { ...item, artifact: { ...item.artifact, bytes: altered.length, sha256: createHash('sha256').update(altered).digest('hex') } };
    assert.throws(() => verifyArtifact(altered, changed), /listing/);
  }
  const malicious = Buffer.from(JSON.stringify({ ...pack, presets: [{ name: 'Script', kind: 'transition', settings: { script: 'execute()' } }] }));
  const listed = { ...item, artifact: { ...item.artifact, bytes: malicious.length, sha256: createHash('sha256').update(malicious).digest('hex') } };
  assert.throws(() => verifyArtifact(malicious, listed), /Unsupported/);
});

test('entitlement ledger persists idempotently, isolates accounts, rolls back conflicts and handles refunds arriving first', async t => {
  const [, { EntitlementLedger }] = await modules;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'latitude-pack-ledger-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'ledger.sqlite');
  let ledger = new EntitlementLedger(file);
  t.after(() => ledger.close());
  assert.deepEqual(ledger.recordVerifiedEvent(event()), { duplicate: false });
  assert.deepEqual(ledger.recordVerifiedEvent(event()), { duplicate: true });
  assert.throws(() => ledger.recordVerifiedEvent(event({ subject: 'account-2' })), /reused/);
  assert.throws(() => ledger.recordVerifiedEvent(event({ eventId: 'conflict', subject: 'account-2' })), /bound/);
  assert.equal(ledger.has('account-1', 'quiet-motion'), true);
  assert.equal(ledger.has('account-2', 'quiet-motion'), false);
  ledger.close(); ledger = new EntitlementLedger(file);
  assert.equal(ledger.has('account-1', 'quiet-motion'), true, 'Restored after service restart');
  ledger.recordVerifiedEvent(event({ eventId: 'refund', action: 'revoke' }));
  ledger.recordVerifiedEvent(event({ eventId: 'late-payment' }));
  assert.equal(ledger.has('account-1', 'quiet-motion'), false, 'Late success cannot resurrect a refund');
  ledger.recordVerifiedEvent(event({ eventId: 'refund-first', purchaseId: 'purchase-2', action: 'revoke' }));
  ledger.recordVerifiedEvent(event({ eventId: 'payment-second', purchaseId: 'purchase-2' }));
  assert.equal(ledger.has('account-1', 'quiet-motion'), false);
  ledger.recordVerifiedEvent(event({ eventId: 'repurchase', purchaseId: 'purchase-3' }));
  assert.equal(ledger.has('account-1', 'quiet-motion'), true, 'Independent later purchase restores download access');
  ledger.recordVerifiedEvent(event({ eventId: 'second-pack', purchaseId: 'purchase-4', packId: 'other-pack' }));
  assert.equal(ledger.owned('account-1', { limit: 1 }).total, 2);
  assert.equal(ledger.owned('account-1', { limit: 1, page: 2 }).ids.length, 1);
  assert.throws(() => ledger.owned('account-1', { limit: 1000000 }));
});

test('HTTP catalog, ownership and downloads enforce authentication, integrity, compatibility and disabled payments', async t => {
  const [{ parseCatalog }, { EntitlementLedger }, { createPackServer }] = await modules;
  const free = fixture(), paid = fixture({ id: 'paid-motion', paid: true });
  const ledger = new EntitlementLedger(':memory:');
  ledger.recordVerifiedEvent(event({ packId: paid.item.id }));
  let reads = 0, corrupted = false;
  const server = createPackServer({
    catalog: parseCatalog(encode([free.item, paid.item])), ledger,
    readArtifact: async () => { reads++; return corrupted ? Buffer.from('tampered') : free.bytes; },
    authenticate: async ({ authorization }) => authorization === 'Bearer owner-token' ? { subject: 'account-1' }
      : authorization === 'Bearer other-token' ? { subject: 'account-2' } : null
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); ledger.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const owner = { headers: { Authorization: 'Bearer owner-token' } };
  const url = '/v1/packs/paid-motion/1.0.0/download?appVersion=0.9.9';
  assert.equal((await fetch(base + '/v1/catalog?limit=49')).status, 400);
  assert.equal((await fetch(base + '/v1/catalog?subject=account-1')).status, 400);
  assert.equal((await fetch(base + '/v1/catalog?limit=1&limit=2')).status, 400);
  const publicList = await (await fetch(base + '/v1/catalog?q=podcast')).json();
  assert.equal(publicList.items.length, 2);
  assert.equal(publicList.items.find(p => p.id === paid.item.id).availability.enabled, false);
  assert.equal((await fetch(base + url)).status, 401);
  assert.equal((await fetch(base + url, { headers: { Authorization: 'Bearer other-token' } })).status, 403);
  assert.equal(reads, 0, 'Unauthorized requests never read premium files');
  assert.equal((await fetch(base + '/v1/library?subject=account-1', owner)).status, 400);
  assert.equal((await fetch(base + '/v1/library', { headers: { 'X-Subject': 'account-1' } })).status, 401);
  const library = await fetch(base + '/v1/library?appVersion=0.9.9', owner);
  assert.equal(library.headers.get('cache-control'), 'no-store');
  assert.equal((await library.json()).items[0].availability.state, 'owned');
  const downloaded = await fetch(base + url, owner);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get('x-pack-sha256'), paid.item.artifact.sha256);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), paid.bytes);
  assert.equal((await fetch(base + '/v1/packs/quiet-motion/1.0.0/download?appVersion=0.9.7')).status, 409);
  assert.equal((await fetch(base + '/v1/packs/quiet-motion/1.0.0/download')).status, 400);
  assert.equal((await fetch(base + '/v1/packs/quiet-motion/1.0.0/download?appVersion=0.9.9')).status, 200);
  for (const route of ['/v1/checkout', '/v1/webhooks/stripe']) {
    const response = await fetch(base + route, { method: 'POST', body: JSON.stringify({ paid: true, subject: 'account-2' }) });
    assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'commerce_disabled');
  }
  assert.equal(ledger.has('account-2', 'quiet-motion'), false);
  corrupted = true;
  const failed = await fetch(base + url, owner);
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes('tampered'));
});

test('unconfigured authentication never accepts browser claims and unsupported content remains unavailable', async t => {
  const [{ parseCatalog }, , { createPackServer }] = await modules;
  const { item } = fixture({ paid: true });
  const server = createPackServer({ catalog: parseCatalog(encode([item])), readArtifact: () => { throw Error('Must not read'); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const response = await fetch(base + '/v1/library', { headers: { Authorization: 'Bearer fake', Cookie: 'subject=account-1' } });
  assert.equal(response.status, 401);
  const capabilities = await (await fetch(base + '/v1/capabilities')).json();
  assert.equal(capabilities.purchases, false); assert.equal(capabilities.accountsConfigured, false);
  assert.equal(capabilities.editingRequiresAccount, false);
});

test('artifact store refuses oversized files, changed bytes and symlinks without following user paths', async t => {
  const [{ verifyArtifact }, , , { artifactStore, readBoundedFile }] = await modules;
  const { item, bytes } = fixture();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'latitude-pack-artifacts-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, item.artifact.sha256 + '.latitude-pack');
  await fs.writeFile(file, bytes);
  assert.equal(verifyArtifact(await artifactStore(root)(item), item).name, item.name);
  await fs.writeFile(file, Buffer.alloc(128 * 1024 + 1));
  await assert.rejects(artifactStore(root)(item), /oversized/);
  await fs.writeFile(file, Buffer.from(bytes).fill(0));
  await assert.rejects(artifactStore(root)(item), /integrity/);
  await assert.rejects(readBoundedFile(root, 1024), /Invalid|illegal|directory/i);
  if (process.platform !== 'win32') {
    const actual = path.join(root, 'actual'); await fs.writeFile(actual, bytes);
    await fs.rm(file); await fs.symlink(actual, file);
    await assert.rejects(artifactStore(root)(item), /regular file/);
  }
});

test('pack service remains outside the desktop package and recording startup', async () => {
  const config = JSON.parse(await fs.readFile(path.join(__dirname, '../package.json'), 'utf8'));
  assert.ok(config.build.files.every(pattern => !pattern.startsWith('services')));
  const main = await fs.readFile(path.join(__dirname, '../electron/main.cjs'), 'utf8');
  assert.ok(!main.includes('services/packs'));
  const lock = JSON.parse(await fs.readFile(path.join(__dirname, '../package-lock.json'), 'utf8'));
  assert.deepEqual(Object.keys(lock.packages[''].devDependencies).sort(), ['electron', 'electron-builder', 'ffmpeg-static']);
});

test('published pack identity survives catalog reloads and cannot be silently replaced', async () => {
  const [{ parseCatalog }, { EntitlementLedger }] = await modules;
  const ledger = new EntitlementLedger(':memory:');
  try {
    const { item } = fixture();
    const catalog = parseCatalog(encode([item]));
    ledger.registerCatalog(catalog); ledger.registerCatalog(catalog);
    const reordered = { ...item, artifact: Object.fromEntries(Object.entries(item.artifact).reverse()) };
    ledger.registerCatalog(parseCatalog(encode([reordered])));
    const changedPrice = structuredClone(item); changedPrice.price = { kind: 'one-time', currency: 'USD', amountMinor: 500 };
    ledger.registerCatalog(parseCatalog(encode([changedPrice])));
    for (const mutate of [
      x => { x.artifact.sha256 = '0'.repeat(64); },
      x => { x.license.text = 'Different terms'; },
      x => { x.creator.name = 'Different creator'; }
    ]) {
      const changed = structuredClone(item); mutate(changed);
      assert.throws(() => ledger.registerCatalog(parseCatalog(encode([changed]))), /cannot be replaced/);
    }
    const withdrawn = { ...item, status: 'withdrawn' };
    ledger.registerCatalog(parseCatalog(encode([withdrawn])));
    ledger.registerCatalog(parseCatalog(encode([{ ...item, version: '2.0.0' }])));
  } finally { ledger.close(); }
});

test('operator preparation produces immutable normalized bytes without approving imported claims', async t => {
  const { spawnSync } = require('node:child_process');
  const { item, pack } = fixture();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'latitude-pack-prepare-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'input.latitude-pack'), artifacts = path.join(root, 'artifacts');
  await fs.writeFile(source, JSON.stringify({ ...pack, approved: true, script: 'not executable metadata' }));
  const run = () => spawnSync(process.execPath, [path.join(__dirname, '../services/packs/prepare.mjs'), source, artifacts],
    { encoding: 'utf8', timeout: 10000 });
  const first = run(); assert.equal(first.status, 0, first.stderr);
  const report = JSON.parse(first.stdout);
  assert.ok(report.reviewRequired.includes('rights and license terms'));
  assert.equal(report.approved, undefined);
  const file = path.join(artifacts, report.artifact.sha256 + '.latitude-pack');
  const bytes = await fs.readFile(file), normalized = JSON.parse(bytes);
  assert.equal(normalized.approved, undefined); assert.equal(normalized.script, undefined);
  assert.equal(report.name, item.name);
  assert.equal(report.artifact.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(run().status, 0, 'Identical re-preparation reuses exact bytes');
  await fs.writeFile(file, 'changed');
  assert.notEqual(run().status, 0, 'Corrupt existing bytes are never overwritten');
  assert.equal(await fs.readFile(file, 'utf8'), 'changed');
});

test('standalone startup refuses missing published contents before listening', async t => {
  const { spawnSync } = require('node:child_process');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'latitude-pack-start-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'artifacts'));
  await fs.writeFile(path.join(root, 'catalog.json'), encode([fixture().item]));
  const run = spawnSync(process.execPath, [path.join(__dirname, '../services/packs/start.mjs')],
    { env: { ...process.env, LATITUDE_PACK_DATA: root }, encoding: 'utf8', timeout: 10000 });
  assert.notEqual(run.status, 0);
  assert.equal(run.error, undefined, 'Exits on missing contents instead of listening until timeout');
  assert.ok(!run.stdout.includes('http://127.0.0.1'));
});
