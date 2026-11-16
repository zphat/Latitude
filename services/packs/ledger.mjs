import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { slug, text } from './catalog.mjs';

// Server-only entitlement storage. No renderer, request body or imported pack may call this directly.
// A future payment adapter must verify the provider event AND resolve its server-owned order first.
export class EntitlementLedger {
  constructor(file) {
    this.db = new DatabaseSync(file, { enableForeignKeyConstraints: true });
    try {
      this.db.exec('PRAGMA busy_timeout=2000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
      const schema = this.db.prepare('PRAGMA user_version').get().user_version;
      if (schema !== 0 && schema !== 1) throw Error('Unsupported entitlement database version.');
      if (schema === 0) this.db.exec(
        'BEGIN IMMEDIATE;' +
        'CREATE TABLE grants (provider TEXT NOT NULL, purchase_id TEXT NOT NULL, subject TEXT NOT NULL, pack_id TEXT NOT NULL,' +
        ' state TEXT NOT NULL CHECK(state IN (\'active\',\'revoked\')), PRIMARY KEY(provider,purchase_id)) STRICT;' +
        'CREATE INDEX grants_subject ON grants(subject,state,pack_id);' +
        'CREATE TABLE events (provider TEXT NOT NULL, event_id TEXT NOT NULL, fingerprint TEXT NOT NULL,' +
        ' received_at TEXT NOT NULL, PRIMARY KEY(provider,event_id)) STRICT;' +
        'CREATE TABLE releases (pack_id TEXT NOT NULL, version TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(pack_id,version)) STRICT;' +
        'PRAGMA user_version=1; COMMIT;');
      this.findEvent = this.db.prepare('SELECT fingerprint FROM events WHERE provider=? AND event_id=?');
      this.findGrant = this.db.prepare('SELECT subject,pack_id,state FROM grants WHERE provider=? AND purchase_id=?');
      this.addGrant = this.db.prepare('INSERT INTO grants VALUES (?,?,?,?,?)');
      this.revokeGrant = this.db.prepare('UPDATE grants SET state=\'revoked\' WHERE provider=? AND purchase_id=?');
      this.addEvent = this.db.prepare('INSERT INTO events VALUES (?,?,?,?)');
      this.findOwned = this.db.prepare('SELECT DISTINCT pack_id FROM grants WHERE subject=? AND state=\'active\' ORDER BY pack_id LIMIT ? OFFSET ?');
      this.countOwned = this.db.prepare('SELECT COUNT(DISTINCT pack_id) AS total FROM grants WHERE subject=? AND state=\'active\'');
      this.findAccess = this.db.prepare('SELECT 1 AS found FROM grants WHERE subject=? AND pack_id=? AND state=\'active\' LIMIT 1');
    } catch (error) { this.db.close(); throw error; }
  }
  registerCatalog(catalog) {
    const find = this.db.prepare('SELECT fingerprint FROM releases WHERE pack_id=? AND version=?');
    const add = this.db.prepare('INSERT INTO releases VALUES (?,?,?)');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const item of catalog.packs) {
        if (!item.artifact) continue;
        const fingerprint = createHash('sha256').update(JSON.stringify({
          id: item.id, version: item.version, name: item.name, creator: item.creator,
          kinds: [...item.kinds].sort(), license: item.license, compatibility: item.compatibility, artifact: item.artifact
        })).digest('hex');
        const existing = find.get(item.id, item.version);
        if (existing && existing.fingerprint !== fingerprint) throw Error('A published pack version cannot be replaced: ' + item.id);
        if (!existing) add.run(item.id, item.version, fingerprint);
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  recordVerifiedEvent(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some(key => !['provider', 'eventId', 'purchaseId', 'subject', 'packId', 'action'].includes(key)))
      throw Error('Invalid entitlement event.');
    const event = { provider: slug(input.provider), eventId: text(input.eventId, 160, 'event identifier'),
      purchaseId: text(input.purchaseId, 160, 'purchase identifier'), subject: text(input.subject, 160, 'account identifier'),
      packId: slug(input.packId), action: input.action };
    if (!['grant', 'revoke'].includes(event.action)) throw Error('Unsupported entitlement operation.');
    const fingerprint = createHash('sha256').update(JSON.stringify(event)).digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.findEvent.get(event.provider, event.eventId);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw Error('Event identifier was reused with different data.');
        this.db.exec('COMMIT'); return { duplicate: true };
      }
      const grant = this.findGrant.get(event.provider, event.purchaseId);
      if (grant && (grant.subject !== event.subject || grant.pack_id !== event.packId))
        throw Error('Purchase is already bound to another account or pack.');
      if (!grant) this.addGrant.run(event.provider, event.purchaseId, event.subject, event.packId,
        event.action === 'grant' ? 'active' : 'revoked');
      else if (event.action === 'revoke') this.revokeGrant.run(event.provider, event.purchaseId);
      // Revocation is terminal for this purchase. An out-of-order paid event cannot resurrect a refund.
      // A later real purchase has a different purchaseId and can grant access independently.
      this.addEvent.run(event.provider, event.eventId, fingerprint, new Date().toISOString());
      this.db.exec('COMMIT'); return { duplicate: false };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  owned(subject, { page = 1, limit = 24 } = {}) {
    subject = text(subject, 160, 'account identifier');
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000
        || !Number.isSafeInteger(limit) || limit < 1 || limit > 48) throw Error('Invalid library page.');
    return { ids: this.findOwned.all(subject, limit, (page - 1) * limit).map(row => row.pack_id),
      total: this.countOwned.get(subject).total, page, limit };
  }
  has(subject, packId) {
    return !!this.findAccess.get(text(subject, 160, 'account identifier'), slug(packId));
  }
  close() { this.db.close(); }
}
