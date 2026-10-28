// Workspace preferences never enter project history, autosave or the render plan.
const bound = (n) => Math.max(25, Math.min(75, n));
export function installLayout(root, ui) {
  const $ = (s) => root.querySelector(s);
  const workspace = $(".editor-workspace"), divider = $("#edit-divider");
  const defaults = () => ({ preview: 50, media: innerWidth >= 1200, inspector: true });
  let saved;
  try { saved = ui.readSettings?.("latitude-editor"); } catch {}
  let state = { ...defaults(),
    ...(typeof saved?.media === "boolean" ? { media: saved.media } : {}),
    ...(typeof saved?.inspector === "boolean" ? { inspector: saved.inspector } : {}),
    ...(Number.isFinite(saved?.preview) ? { preview: bound(saved.preview) } : {}),
  };
  const controller = new AbortController();
  const listen = (el, event, fn) => el.addEventListener(event, fn, { signal: controller.signal });
  let start = null;
  function apply() {
    root.style.setProperty("--edit-preview-share", `${state.preview}fr`);
    root.style.setProperty("--edit-timeline-share", `${100 - state.preview}fr`);
    root.dataset.media = String(state.media);
    root.dataset.inspector = String(state.inspector);
    for (const name of ["media", "inspector"]) {
      const button = $(`#edit-toggle-${name}`);
      button.setAttribute("aria-expanded", String(state[name]));
      button.title = `${state[name] ? "Hide" : "Show"} ${name === "media" ? "Media" : "Inspector"}`;
      $(name === "media" ? "#edit-media-panel" : "#edit-inspector").hidden = !state[name];
    }
    divider.setAttribute("aria-valuenow", String(Math.round(state.preview)));
  }
  function save() {
    try { ui.writeSettings?.("latitude-editor", { ...state }); }
    catch { ui.toast?.("Layout could not be remembered. Your edit is unchanged.", true); }
  }
  for (const name of ["media", "inspector"])
    listen($(`#edit-toggle-${name}`), "click", () => {
      state[name] = !state[name]; apply(); save();
    });
  listen($("#edit-reset-layout"), "click", () => { state = defaults(); apply(); save(); });
  listen(divider, "dblclick", () => { state.preview = 50; apply(); save(); });
  listen(divider, "keydown", (e) => {
    const value = { ArrowUp: state.preview - 5, ArrowDown: state.preview + 5, Home: 25, End: 75 }[e.key];
    if (value === undefined) return;
    e.preventDefault(); e.stopPropagation(); state.preview = bound(value); apply(); save();
  });
  listen(divider, "pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); divider.focus();
    start = { y: e.clientY, preview: state.preview, height: workspace.clientHeight - divider.offsetHeight };
    divider.setPointerCapture(e.pointerId);
  });
  listen(divider, "pointermove", (e) => {
    if (!start) return;
    state.preview = bound(start.preview + 100 * (e.clientY - start.y) / Math.max(1, start.height));
    apply();
  });
  listen(divider, "pointerup", () => { if (start) { start = null; save(); } });
  listen(divider, "pointercancel", () => { if (start) { state.preview = start.preview; start = null; apply(); } });
  listen(divider, "lostpointercapture", () => { if (start) { state.preview = start.preview; start = null; apply(); } });
  apply();
  return { destroy() { start = null; controller.abort(); } };
}
