# Latitude pack-service foundation

This is a **standalone backend foundation**, separate from the optional Editor and
from the recording application. It is not deployed and does not enable purchases.
It adds no desktop dependency, decoder, background server or launch-time network
request. The existing offline Creative library remains usable without it.

## What works

- Versioned, bounded catalog with creator identity, categories, tags, license
  terms, technical/rights-review records and integer one-time prices.
- Search, filtering, pagination and explicit available/owned/installed/update/
  incompatible/planned/unavailable states.
- Hash- and byte-verified downloads of the existing **data-only** preset format.
  Both the current pack validator and listing/content identity are checked.
- SQLite entitlement records with atomic events, persistent duplicate detection,
  account isolation, refunds arriving before payments, and later repurchases.
- A narrow authentication adapter boundary. No authentication is configured by
  default, and client-supplied account IDs or ownership claims are never trusted.
- Purchase and Stripe webhook endpoints return `commerce_disabled`. They cannot
  grant access, accept money, or interpret an unsigned event.

The ledger records download access, not restrictions on editing. Once downloaded
and installed, presets work offline. Applied settings remain in saved projects
without referring to the service. Revoking server download access does not alter
a user's local files or projects.

## Run a local catalog

Use Node 24.15+ on an operator-controlled machine. Node's built-in SQLite is used
only here, not in Electron. The v24 SQLite API is a release candidate; pin and
test the Node patch version in any later deployment.

```sh
mkdir -p pack-data/artifacts
cp services/packs/catalog.example.json pack-data/catalog.json
node services/packs/start.mjs
```

The default example is intentionally empty. The server binds **127.0.0.1:8787**
only. `LATITUDE_PACK_DATA` selects its private data directory;
`LATITUDE_PACK_PORT` selects a port. Do not commit the database, customer data,
private pack files or credentials. Back up the SQLite database consistently
(including an appropriate WAL checkpoint or SQLite backup), and test restoration.

This CLI does not configure accounts or payments. A production deployment needs
an HTTPS reverse proxy, access/rate limits, persistent storage and backups,
operational monitoring, and the adapters described below. Do not expose the
development server directly as a public commerce service.

## Prepare a reviewed preset pack

```sh
node services/packs/prepare.mjs ./quiet-motion.latitude-pack ./pack-data/artifacts
```

This normalizes a pack with the existing validator and writes immutable
`SHA256.latitude-pack` bytes. An existing file is never overwritten. It prints a
**review candidate**, not an approval. It strips imported metadata claims.
A curator must independently review the contents and rights before adding a
published catalog entry. Technical validation does not establish ownership.

Startup verifies every published artifact before listening. The persistent catalog
registry rejects changes to an existing version's contents, identity, license or
compatibility; publish a new version for those changes.

Catalog shape:

```json
{
  "schemaVersion": 1,
  "packs": [{
    "id": "quiet-motion",
    "version": "1.0.0",
    "name": "Quiet motion",
    "creator": { "id": "creator-id", "name": "Your name" },
    "summary": "Restrained, editable entrances for interviews.",
    "kinds": ["transition"],
    "tags": ["podcast", "restrained"],
    "status": "published",
    "review": {
      "reviewer": "Actual reviewer",
      "reviewedAt": "2026-11-16T00:00:00Z",
      "technical": true,
      "rights": true
    },
    "license": { "name": "Your content license", "text": "Actual permitted uses and terms." },
    "price": { "kind": "free", "amountMinor": 0, "currency": "USD" },
    "compatibility": { "minAppVersion": "0.9.9", "packVersion": 1 },
    "artifact": {
      "format": "latitude-editor-pack-v1",
      "sha256": "REPLACE_WITH_PREPARED_DIGEST",
      "bytes": 1,
      "presets": 1
    }
  }]
}
```

The example deliberately cannot pass validation until real preparation results
and review data replace the placeholders. Published versions are immutable:
add a version rather than changing existing bytes. Set `status: "withdrawn"` to
stop catalog visibility/downloads without touching installed content. A
`planned` listing has null review/license/artifact fields and cannot imply
approval or offer a download. Planned animation/image categories do not claim
that their renderers or asset loaders already exist.

Only preset JSON is supported. External font binaries, arbitrary animation
media, archives, clip art, URLs, scripts and executable filters are not supported
by this format. Future asset types need their own bounded, versioned loaders and
preview/export parity tests.

## API and client layout contract

| Route | Purpose |
| --- | --- |
| GET /v1/capabilities | Supported formats/categories; purchases disabled |
| GET /v1/catalog | Public catalog; q/kind/cost/creator/page/limit/appVersion |
| GET /v1/library | Authenticated owned packs; page/limit/appVersion |
| GET /v1/packs/:id/:version/download?appVersion=0.9.9 | Authorized, verified preset bytes |
| POST /v1/checkout | Disabled; HTTP 503, commerce_disabled |
| POST /v1/webhooks/stripe | Disabled; HTTP 503, commerce_disabled |

Authentication and owned-library responses are never publicly cached. Downloads
use attachment headers and are not HTML. Responses contain plain text fields;
a client must render them as text, never trusted HTML.

The future native installer must fetch only from its configured catalog service,
bound the response, verify its digest against the reviewed listing, then pass
it through the existing native pack validator before installing. The service
does not currently add remote installation IPC or an online UI to Latitude.
No pack-supplied URL is fetched by this backend.

## Stripe connection later

The desktop must never hold a Stripe secret, create ownership, validate its own
receipt or unlock packs from a checkout-success URL. Keep these trust boundaries:

1. Configure a real authentication provider. Inject `authenticate({authorization,
   signal})` returning a verified opaque account subject. Require bearer tokens;
   do not trust an account ID from query parameters, headers or pack files.
2. Add a server-owned order store and an immutable pack/price mapping. Create
   checkout sessions from that mapping, with an idempotency key and exact
   currency/amount. Never use a price sent by the renderer. An adapter must not
   make planned, incompatible or withdrawn content purchasable.
3. Use Stripe's official server SDK to verify the signature over the **raw** body
   and reject stale/invalid deliveries. Resolve the actual paid/refunded order
   on the server, bind it to its account and catalog pack, and verify live/test
   mode, product, currency and amount. Asynchronous payments need confirmed
   success; session creation or a browser redirect is not payment.
4. Only then call `ledger.recordVerifiedEvent`. Its normalized event has
   provider/eventId/purchaseId/subject/packId/action. One purchaseId identifies
   one purchased pack line. Re-delivery is idempotent; conflicting event reuse
   rolls back. Revocation is terminal for that purchase, including when a refund
   arrives first. A distinct subsequent purchase can grant access again.
5. Validate refunds, disputes, duplicate delivery, out-of-order events,
   reconciliation, account recovery and receipt export in Stripe test mode
   before enabling purchases. Add privacy/retention and support procedures.
6. One-time purchases should include updates to that pack ID. Existing editing,
   audio, exports, manual controls and installed packs must stay offline.

No order store, actual authentication provider, Stripe adapter, webhook
signature verifier, checkout UI or deployment is present yet. This separation
is intentional: those require the later account/content/payment configuration.

## Verification

`node --test tests/pack-service.test.cjs` exercises real HTTP requests, SQLite
restart/idempotency/refunds, review/format limits, exact content hashes, hostile
metadata, unauthorized downloads, disabled payment routes and bounded files.
It runs in the existing `npm test` suite. No external service or payment is used.

Primary references:
- [Node 24 SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)
- [Stripe webhooks](https://docs.stripe.com/webhooks)
