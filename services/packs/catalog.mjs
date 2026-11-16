import { PACK_LIMITS, CATEGORIES, validatePack } from '../../src/mods/editor/packs.js';
import { createHash } from 'node:crypto';

export const LIMITS = Object.freeze({ catalogBytes: 2 * 1024 * 1024, entries: 500, page: 48 });
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const VERSION = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
export function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value))
    throw Error('Invalid ' + label + '.');
  return value.trim();
}
export function slug(value) {
  if (typeof value !== 'string' || !SLUG.test(value)) throw Error('Invalid pack identifier.');
  return value;
}
export function version(value) {
  if (typeof value !== 'string' || !VERSION.test(value)) throw Error('Use a stable three-part version.');
  return value;
}
export function compare(a, b) {
  const x = version(a).split('.').map(Number), y = version(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return Math.sign(x[i] - y[i]);
  return 0;
}
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
      || Object.keys(value).some(key => !keys.includes(key))) throw Error('Invalid ' + label + '.');
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().replace('.000Z', 'Z') !== value)
    throw Error('Use a UTC review date.');
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function entry(input) {
  object(input, ['id', 'version', 'name', 'creator', 'summary', 'kinds', 'tags', 'status', 'review', 'license', 'price', 'compatibility', 'artifact'], 'catalog entry');
  const id = slug(input.id), ver = version(input.version), name = text(input.name, 80, 'pack name');
  object(input.creator, ['id', 'name'], 'creator');
  const creator = { id: slug(input.creator.id), name: text(input.creator.name, 80, 'creator name') };
  if (!['published', 'planned', 'withdrawn'].includes(input.status)) throw Error('Invalid publication state.');
  const planned = input.status === 'planned';
  const supported = planned ? [...CATEGORIES, 'animation', 'image'] : CATEGORIES;
  if (!Array.isArray(input.kinds) || !input.kinds.length || input.kinds.length > 6
      || input.kinds.some(k => !supported.includes(k)) || new Set(input.kinds).size !== input.kinds.length)
    throw Error('Unsupported pack category.');
  if (!Array.isArray(input.tags) || input.tags.length > 8) throw Error('Too many pack tags.');
  const tags = [...new Set(input.tags.map(t => text(t, 32, 'tag').toLowerCase()))];
  object(input.compatibility, ['minAppVersion', 'packVersion'], 'compatibility');
  if (input.compatibility.packVersion !== 1) throw Error('Unsupported pack format.');
  const compatibility = { minAppVersion: version(input.compatibility.minAppVersion), packVersion: 1 };
  object(input.price, ['kind', 'amountMinor', 'currency'], 'price');
  if (!['free', 'one-time'].includes(input.price.kind) || !Number.isSafeInteger(input.price.amountMinor)
      || input.price.amountMinor < 0 || input.price.amountMinor > 1000000
      || (input.price.kind === 'free') !== (input.price.amountMinor === 0)
      || typeof input.price.currency !== 'string' || !/^[A-Z]{3}$/.test(input.price.currency)) throw Error('Invalid one-time price.');
  const price = { kind: input.price.kind, amountMinor: input.price.amountMinor, currency: input.price.currency };
  let review = null, license = null, artifact = null;
  if (planned) {
    if (input.review != null || input.artifact != null || input.license != null)
      throw Error('Planned packs cannot claim review or downloadable assets.');
  } else {
    object(input.review, ['reviewer', 'reviewedAt', 'technical', 'rights'], 'review');
    if (input.review.technical !== true || input.review.rights !== true) throw Error('Published packs require technical and rights review.');
    review = { reviewer: text(input.review.reviewer, 80, 'reviewer'), reviewedAt: date(input.review.reviewedAt), technical: true, rights: true };
    object(input.license, ['name', 'text'], 'license');
    // Rights are reviewed by a person; this validates the recorded declaration, not ownership.
    if (typeof input.license.text !== 'string' || !input.license.text.trim() || input.license.text.length > 16000
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.license.text)) throw Error('Invalid license terms.');
    license = { name: text(input.license.name, 120, 'license name'), text: input.license.text.trim() };
    object(input.artifact, ['format', 'sha256', 'bytes', 'presets'], 'artifact');
    if (input.artifact.format !== 'latitude-editor-pack-v1'
        || typeof input.artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.artifact.sha256)
        || !Number.isSafeInteger(input.artifact.bytes) || input.artifact.bytes < 1 || input.artifact.bytes > PACK_LIMITS.bytes
        || !Number.isSafeInteger(input.artifact.presets) || input.artifact.presets < 1 || input.artifact.presets > PACK_LIMITS.presets)
      throw Error('Invalid preset artifact.');
    artifact = { format: input.artifact.format, sha256: input.artifact.sha256,
      bytes: input.artifact.bytes, presets: input.artifact.presets };
  }
  return { id, version: ver, name, creator, summary: text(input.summary, 400, 'summary'),
    kinds: [...input.kinds], tags, status: input.status, review, license, price, compatibility, artifact };
}
export function parseCatalog(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > LIMITS.catalogBytes) throw Error('Catalog exceeds its byte limit.');
  const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  object(input, ['schemaVersion', 'packs'], 'catalog');
  if (input.schemaVersion !== 1 || !Array.isArray(input.packs) || input.packs.length > LIMITS.entries)
    throw Error('Unsupported catalog or too many entries.');
  const seen = new Set();
  const packs = input.packs.map(value => {
    const result = entry(value), key = result.id + '@' + result.version;
    if (seen.has(key)) throw Error('Duplicate pack version.');
    seen.add(key); return result;
  });
  return freeze({ schemaVersion: 1, packs });
}
export function verifyArtifact(bytes, item) {
  if (!Buffer.isBuffer(bytes) || !item.artifact || bytes.length !== item.artifact.bytes
      || bytes.length > PACK_LIMITS.bytes || createHash('sha256').update(bytes).digest('hex') !== item.artifact.sha256)
    throw Error('Pack integrity check failed.');
  const pack = validatePack(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  const kinds = [...new Set(pack.presets.map(p => p.kind))].sort();
  if (pack.name !== item.name || pack.author !== item.creator.name || pack.presets.length !== item.artifact.presets
      || JSON.stringify(kinds) !== JSON.stringify([...item.kinds].sort()))
    throw Error('Pack contents do not match the reviewed listing.');
  return pack;
}
export function availability(item, { appVersion, owned = false, installedVersion } = {}) {
  if (item.status === 'withdrawn') return { state: 'unavailable', label: 'Unavailable', enabled: false };
  if (item.status === 'planned') return { state: 'planned', label: 'Coming later', enabled: false };
  if (appVersion && compare(appVersion, item.compatibility.minAppVersion) < 0)
    return { state: 'incompatible', label: 'Update Latitude', enabled: false };
  if (installedVersion && compare(installedVersion, item.version) >= 0)
    return { state: 'installed', label: 'Installed', enabled: false };
  if (item.price.kind === 'free' || owned)
    return { state: installedVersion ? 'update' : owned ? 'owned' : 'free',
      label: installedVersion ? 'Update pack' : owned ? 'Download again' : 'Add to library', enabled: true };
  return { state: 'not-for-sale', label: 'Purchases not enabled', enabled: false };
}
export function queryCatalog(catalog, { query = '', kind = '', cost = '', creator = '', page = 1, limit = 24, appVersion } = {}) {
  if (typeof query !== 'string' || query.length > 120 || (kind && ![...CATEGORIES, 'animation', 'image'].includes(kind))
      || (cost && !['free', 'one-time'].includes(cost)) || (creator && !SLUG.test(creator))
      || !Number.isSafeInteger(page) || page < 1 || page > 500
      || !Number.isSafeInteger(limit) || limit < 1 || limit > LIMITS.page) throw Error('Invalid catalog filters.');
  if (appVersion) version(appVersion);
  const latest = new Map();
  for (const item of catalog.packs) {
    if (item.status === 'withdrawn') continue;
    const previous = latest.get(item.id);
    // Planned versions must not hide an existing usable version.
    if (!previous || (previous.status === 'planned' && item.status === 'published')
        || (previous.status === item.status && compare(item.version, previous.version) > 0)) latest.set(item.id, item);
  }
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = [...latest.values()].filter(item => {
    const haystack = [item.name, item.summary, item.creator.name, ...item.tags].join(' ').toLowerCase();
    return (!kind || item.kinds.includes(kind)) && (!cost || item.price.kind === cost) && (!creator || item.creator.id === creator)
      && terms.every(term => haystack.includes(term));
  }).sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id, 'en'));
  return { total: matches.length, page, limit,
    items: matches.slice((page - 1) * limit, page * limit).map(item => ({ ...item, availability: availability(item, { appVersion }) })) };
}
