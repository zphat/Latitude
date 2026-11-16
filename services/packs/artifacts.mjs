import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { PACK_LIMITS } from '../../src/mods/editor/packs.js';
import { verifyArtifact, LIMITS } from './catalog.mjs';

// The configured directory is operator-owned. No URL, pathname or archive supplied by a client is opened.
export async function readBoundedFile(file, limit) {
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size < 1 || info.size > limit) throw Error('Invalid or oversized pack data.');
    const bytes = Buffer.alloc(limit + 1);
    let used = 0;
    while (used < bytes.length) {
      const { bytesRead } = await handle.read(bytes, used, bytes.length - used, used);
      if (!bytesRead) break;
      used += bytesRead;
    }
    if (used !== info.size || used > limit) throw Error('Pack data changed while reading.');
    return bytes.subarray(0, used);
  } finally { await handle.close(); }
}
export const readCatalogFile = file => readBoundedFile(file, LIMITS.catalogBytes);
export function artifactStore(directory) {
  return async item => {
    if (!item.artifact || !/^[a-f0-9]{64}$/.test(item.artifact.sha256)) throw Error('Unsupported pack artifact.');
    const root = await realpath(directory);
    const file = path.join(root, item.artifact.sha256 + '.latitude-pack');
    // Reject symlinks even where O_NOFOLLOW is unavailable. Only the service operator writes this root.
    if (await realpath(file) !== file) throw Error('Pack artifact must be a regular file inside its store.');
    const bytes = await readBoundedFile(file, PACK_LIMITS.bytes);
    verifyArtifact(bytes, item);
    return bytes;
  };
}
