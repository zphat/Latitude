// Pure library navigation/search. No media decoding, network or project state.
export const LOCATIONS = Object.freeze({ included: "Included", library: "My library", favorites: "Favorites", discover: "Discover" });
export const KINDS = Object.freeze({ all: "All styles", transition: "Transitions", look: "Looks", title: "Titles", font: "Fonts", packs: "Collections" });
export function libraryView(saved) {
  const result = { location: "included", hidePremium: saved?.hidePremium !== false, filters: {} };
  for (const id of Object.keys(LOCATIONS)) {
    const value = saved?.filters?.[id];
    const filter = { category: id === "included" ? "transition" : id === "library" ? "packs" : "all", query: "", collection: "", scroll: 0, limit: 60 };
    if (value && typeof value === "object") {
      if (Object.hasOwn(KINDS, value.category)) filter.category = value.category;
      if (typeof value.query === "string") filter.query = value.query.slice(0, 120);
      if (typeof value.collection === "string" && /^[\w-]{0,80}$/.test(value.collection)) filter.collection = value.collection;
      if (Number.isSafeInteger(value.limit)) filter.limit = Math.max(60, Math.min(1280, value.limit));
      if (Number.isFinite(value.scroll)) filter.scroll = Math.max(0, Math.min(1000000, value.scroll));
    }
    result.filters[id] = filter;
  }
  if (Object.hasOwn(LOCATIONS, saved?.location)) result.location = saved.location;
  return result;
}
const normalized = value => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
// Only catalog metadata supplied by the host can classify an item as paid.
// Never read a price/approval claim from a user-authored preset file.
export function isPremium(item) { return item.catalog?.price?.kind === "one-time"; }
const termsFor = query => normalized(query || "").trim().split(/\s+/).filter(Boolean);
function matches(terms, values) {
  if (!terms.length) return true;
  const haystack = normalized(values.join(" "));
  return terms.every(term => haystack.includes(term));
}
export function visiblePacks(packs, location, favorites = new Set(), hidePremium = true) {
  if (location === "discover") return [];
  return packs.filter(item => (!hidePremium || !isPremium(item)) && (location === "included" ? item.included
    : location === "library" ? !item.included
    : location === "favorites" ? item.pack.presets.some((_, index) => favorites.has(item.id + ":" + index)) : false));
}
export function searchPresets(packs, location, filter, favorites = new Set(), hidePremium = true) {
  const terms = termsFor(filter.query), result = [];
  for (const item of visiblePacks(packs, location, favorites, hidePremium)) {
    if (filter.collection && filter.collection !== item.id) continue;
    item.pack.presets.forEach((preset, i) => {
      const key = item.id + ":" + i;
      if ((filter.category === "all" || filter.category === preset.kind)
        && (location !== "favorites" || favorites.has(key))
        && matches(terms, [preset.name, preset.description, item.pack.name, item.pack.description, item.pack.author]))
        result.push({ ...item, preset, key });
    });
  }
  return result;
}
export function searchCollections(packs, location, filter, favorites = new Set(), hidePremium = true) {
  const terms = termsFor(filter.query);
  return visiblePacks(packs, location, favorites, hidePremium).filter(item => (!filter.collection || item.id === filter.collection)
    && (!terms.length || matches(terms, [item.pack.name, item.pack.description, item.pack.author,
      ...item.pack.presets.flatMap(p => [p.name, p.description])])));
}
