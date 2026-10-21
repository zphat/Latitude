const paths = {
  puzzle:
    '<path d="M9 3H4a1 1 0 0 0-1 1v5h2a2 2 0 1 1 0 4H3v7a1 1 0 0 0 1 1h5v-2a2 2 0 1 1 4 0v2h7a1 1 0 0 0 1-1v-7h-2a2 2 0 1 1 0-4h2V4a1 1 0 0 0-1-1h-7v2a2 2 0 1 1-4 0z"/>',
  type: '<path d="M4 5V3h16v2M12 3v18M8 21h8"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  monitor:
    '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  camera:
    '<rect x="2" y="6" width="14" height="13" rx="2"/><path d="m16 10 6-3v11l-6-3"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
  headphones:
    '<path d="M3 14v-3a9 9 0 0 1 18 0v3"/><rect x="3" y="12" width="4" height="9" rx="2"/><rect x="17" y="12" width="4" height="9" rx="2"/>',
  speaker:
    '<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  wave: '<path d="M3 10v4M7 6v12M11 2v20M15 5v14M19 8v8M23 11v2"/>',
  folder:
    '<path d="M3 7V5a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  library: '<path d="M4 4v16M9 4v16M14 4v16m4-15 4 14"/>',
  sliders:
    '<path d="M4 3v7m0 4v7M12 3v12m0 4v2M20 3v3m0 4v11M1 10h6m2 5h6m2-9h6"/>',
  settings:
    '<path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>',
  layout:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="12" y="12" width="7" height="6" rx="1"/>',
  columns:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M14 3v18"/>',
  coffee:
    '<path d="M3 8h13v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM16 9h2a3 3 0 0 1 0 6h-2M6 2v3m4-3v3m4-3v3"/>',
  flag: '<path d="M4 22V3c5-4 10 4 16 0v12c-6 4-11-4-16 0"/>',
  sparkles:
    '<path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8zM20 2v4m-2-2h4"/>',
  shield:
    '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z"/><path d="m8 12 3 3 5-6"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  refresh: '<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
  video:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m10 8 6 4-6 4z"/>',
  keyboard:
    '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 15h10"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.wave}</svg>`;
export const paintIcons = (root = document) =>
  root
    .querySelectorAll("[data-icon]")
    .forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
