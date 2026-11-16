// Pure library navigation/search. No media decoding, network or project state.
export const LOCATIONS = Object.freeze({ included: "Included", library: "My library", favorites: "Favorites", discover: "Discover" });
export const KINDS = Object.freeze({ all: "All styles", transition: "Transitions", look: "Looks", title: "Titles", font: "Fonts", packs: "Collections" });
export function libraryView(saved) {
  const result = { location: "included", filters: {} };
  for (const id of Object.keys(LOCATIONS)) {
    const value = saved?.filters?.[id];
    const filter = { category: id === "included" ? "transition" : id === "library" ? "packs" : "all", query: "", collection: "", scroll: 0 };
    if (value && typeof value === "object") {
      if (Object.hasOwn(KINDS, value.category)) filter.category = value.category;
      if (typeof value.query === "string") filter.query = value.query.slice(0, 120);
      if (typeof value.collection === "string" && /^[\w-]{0,80}$/.test(value.collection)) filter.collection = value.collection;
      if (Number.isFinite(value.scroll)) filter.scroll = Math.max(0, Math.min(1000000, value.scroll));
    }
    result.filters[id] = filter;
  }
  if (Object.hasOwn(LOCATIONS, saved?.location)) result.location = saved.location;
  return result;
}
const normalized = value => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function matches(query, values) {
  const haystack = normalized(values.join(" "));
  return normalized(query).trim().split(/\s+/).filter(Boolean).every(term => haystack.includes(term));
}
export function visiblePacks(packs, location, favorites = new Set()) {
  if (location === "discover") return [];
  return packs.filter(item => location === "included" ? item.included
    : location === "library" ? !item.included
    : location === "favorites" ? item.pack.presets.some((_, index) => favorites.has(item.id + ":" + index)) : false);
}
export function searchPresets(packs, location, filter, favorites = new Set()) {
  return visiblePacks(packs, location, favorites).flatMap(item => item.pack.presets.map((preset, index) =>
    ({ ...item, preset, key: item.id + ":" + index }))).filter(item =>
    (filter.category === "all" || filter.category === item.preset.kind)
    && (!filter.collection || filter.collection === item.id)
    && (location !== "favorites" || favorites.has(item.key))
    && matches(filter.query, [item.preset.name, item.preset.description, item.pack.name, item.pack.description, item.pack.author]));
}
export function searchCollections(packs, location, filter, favorites = new Set()) {
  return visiblePacks(packs, location, favorites).filter(item => (!filter.collection || item.id === filter.collection)
    && matches(filter.query, [item.pack.name, item.pack.description, item.pack.author,
      ...item.pack.presets.flatMap(p => [p.name, p.description])]));
}
