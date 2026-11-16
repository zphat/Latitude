import path from 'node:path';
import { mkdir, chmod } from 'node:fs/promises';
import { parseCatalog } from './catalog.mjs';
import { readCatalogFile, artifactStore } from './artifacts.mjs';
import { EntitlementLedger } from './ledger.mjs';
import { createPackServer } from './server.mjs';

// Standalone, operator-started service. Never imported or started by the desktop application.
const root = path.resolve(process.env.LATITUDE_PACK_DATA || './pack-data');
await mkdir(root, { recursive: true, mode: 0o700 });
await chmod(root, 0o700);
const ledger = new EntitlementLedger(path.join(root, 'entitlements.sqlite'));
try {
  await chmod(path.join(root, 'entitlements.sqlite'), 0o600);
  const catalog = parseCatalog(await readCatalogFile(path.join(root, 'catalog.json')));
  const port = Number(process.env.LATITUDE_PACK_PORT || 8787);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Use a port from 1024 through 65535.');
  const readArtifact = artifactStore(path.join(root, 'artifacts'));
  // Fail startup for missing or changed published contents instead of advertising broken downloads.
  for (const item of catalog.packs) if (item.status === 'published') await readArtifact(item);
  const server = createPackServer({ catalog, ledger, readArtifact });
  server.once('error', () => { ledger.close(); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log('Latitude pack foundation: http://127.0.0.1:' + port + ' (purchases disabled)'));
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    server.close(() => ledger.close());
    server.closeAllConnections();
  };
  process.once('SIGINT', close); process.once('SIGTERM', close);
} catch (error) { ledger.close(); throw error; }
