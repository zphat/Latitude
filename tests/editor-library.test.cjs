const test = require("node:test");
const assert = require("node:assert/strict");
const modulePromise = import("../src/mods/editor/library-model.js");
const included = { id: "builtin-0", included: true, pack: { name: "Studio motion", author: "Latitude", description: "Everyday styles", presets: [
  { name: "Soft fade", kind: "transition", description: "Gentle entrance" },
  { name: "Guest title", kind: "title", description: "Readable name" },
] } };
const local = { id: "local-1", pack: { name: "Café interviews", author: "José", description: "Warm podcast looks", approved: true, included: true, presets: [
  { name: "Warm light", kind: "look", description: "Portrait color" },
  { name: "Soft slide", kind: "transition", description: "Smooth entrance" },
] } };
const filter = { category: "all", query: "", collection: "" };
test("library destinations keep local, included and favorites distinct without trusting pack claims", async () => {
  const { visiblePacks, searchPresets } = await modulePromise;
  assert.deepEqual(visiblePacks([included, local], "included").map(p => p.id), ["builtin-0"]);
  assert.deepEqual(visiblePacks([included, local], "library").map(p => p.id), ["local-1"]);
  const favorites = new Set(["builtin-0:1", "local-1:0", "missing:4"]);
  assert.deepEqual(searchPresets([included, local], "favorites", filter, favorites).map(p => p.key), ["builtin-0:1", "local-1:0"]);
  assert.deepEqual(visiblePacks([included, local], "discover"), []);
});
test("library search finds creators and collections across accents, categories and multiword queries", async () => {
  const { searchPresets, searchCollections } = await modulePromise;
  assert.equal(searchPresets([included, local], "library", { ...filter, query: "JOSE cafe", category: "look" })[0].preset.name, "Warm light");
  assert.equal(searchPresets([included, local], "included", { ...filter, query: "Latitude readable" })[0].preset.name, "Guest title");
  assert.equal(searchPresets([included, local], "library", { ...filter, collection: "builtin-0" }).length, 0);
  assert.equal(searchCollections([included, local], "library", { ...filter, query: "portrait Jose" })[0].id, "local-1");
  assert.equal(searchPresets([included, local], "library", { ...filter, query: "not present" }).length, 0);
});
test("navigation preferences migrate independently, reject corrupt values and never mutate project or pack data", async () => {
  const { libraryView, searchPresets } = await modulePromise;
  assert.equal(libraryView(null).location, "included");
  assert.equal(libraryView({ installed: [local] }).filters.library.category, "packs");
  const saved = { location: "library", filters: {
    included: { category: "all", query: "warm", collection: "builtin-0", scroll: 200, limit: 240 },
    library: { category: "__proto__", query: "x".repeat(1000), collection: "../escape", scroll: Infinity },
  } };
  const before = structuredClone(saved), view = libraryView(saved);
  assert.equal(view.location, "library"); assert.equal(view.filters.library.category, "packs");
  assert.equal(view.filters.library.query.length, 120); assert.equal(view.filters.library.collection, "");
  assert.equal(view.filters.library.scroll, 0); assert.equal(view.filters.included.scroll, 200);
  assert.equal(view.filters.included.limit, 240, "Returning restores the expanded result count");
  view.filters.included.query = "changed";
  assert.deepEqual(saved, before);
  const packs = structuredClone([included, local]), snapshot = structuredClone(packs);
  searchPresets(packs, "library", filter);
  assert.deepEqual(packs, snapshot);
});

test("premium visibility is local, defaults to hidden and filters trusted pricing before search, counts and favorites", async () => {
  const { libraryView, visiblePacks, searchPresets, searchCollections } = await modulePromise;
  const paid = { ...local, id: "paid", catalog: { price: { kind: "one-time" } } };
  const free = { ...local, id: "free", catalog: { price: { kind: "free" } } };
  const personal = { ...local, pack: { ...local.pack, price: { kind: "one-time" } } };
  const packs = [included, personal, free, paid], favorites = new Set(["paid:0", "local-1:0"]);
  assert.equal(libraryView(null).hidePremium, true);
  assert.equal(libraryView({ hidePremium: "false" }).hidePremium, true);
  assert.equal(libraryView({ hidePremium: false }).hidePremium, false);
  assert.deepEqual(visiblePacks(packs, "library", favorites, true).map(p => p.id), ["local-1", "free"]);
  assert.deepEqual(searchPresets(packs, "favorites", filter, favorites, true).map(p => p.key), ["local-1:0"]);
  assert.deepEqual(searchCollections(packs, "library", { ...filter, collection: "paid" }, favorites, true), []);
  assert.deepEqual(searchPresets(packs, "favorites", filter, favorites, false).map(p => p.key), ["local-1:0", "paid:0"]);
  assert.equal(favorites.size, 2);
});
