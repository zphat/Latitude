import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validatePack, PACK_LIMITS } from '../../src/mods/editor/packs.js';
import { readBoundedFile } from './artifacts.mjs';

// Operator-side preparation only. Produces a review candidate, never an approval or a paid listing.
const [source, directory, ...extra] = process.argv.slice(2);
if (!source || !directory || extra.length) throw Error('Usage: node services/packs/prepare.mjs INPUT.latitude-pack ARTIFACT_DIRECTORY');
const original = await readBoundedFile(path.resolve(source), PACK_LIMITS.bytes);
const pack = validatePack(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(original)));
const bytes = Buffer.from(JSON.stringify(pack) + '\n');
if (bytes.length > PACK_LIMITS.bytes) throw Error('Normalized pack exceeds its byte limit.');
const sha256 = createHash('sha256').update(bytes).digest('hex'), root = path.resolve(directory);
await mkdir(root, { recursive: true, mode: 0o700 });
const file = path.join(root, sha256 + '.latitude-pack');
try { await writeFile(file, bytes, { flag: 'wx', mode: 0o600 }); }
catch (error) {
  if (error.code !== 'EEXIST' || !(await readBoundedFile(file, PACK_LIMITS.bytes)).equals(bytes)) throw error;
}
console.log(JSON.stringify({
  name: pack.name, creatorName: pack.author, kinds: [...new Set(pack.presets.map(p => p.kind))],
  artifact: { format: 'latitude-editor-pack-v1', sha256, bytes: bytes.length, presets: pack.presets.length },
  reviewRequired: ['contents', 'preview/export compatibility', 'rights and license terms'],
  note: 'Not published. An operator must supply catalog identity, version, compatibility, price, license and completed review.'
}, null, 2));
