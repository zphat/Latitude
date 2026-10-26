export function installModsPage({
  $,
  escape,
  icon,
  registry,
  studioTools,
  attempt,
  isBusy,
  modal,
  closeModal,
}) {
  const render = () => {
    const pack = studioTools.getPack(),
      items = registry.list(),
      count = items.length + (pack ? 1 : 0),
      busy = isBusy();
    $("#mod-count").textContent = `${count} installed`;
    $("#mods-empty").hidden = count > 0;
    $("#mods-busy").hidden = !busy;
    $("#mods-import").disabled = busy;
    $("#mods-list").innerHTML =
      (pack
        ? `<article class="mod-card"><div class="mod-glyph">${icon("layout")}</div><div class="mod-copy"><span class="eyebrow">THEMES & LAYOUTS</span><h3>${escape(pack.name)}</h3><p>${pack.themes.length} ${pack.themes.length === 1 ? "theme" : "themes"} · ${pack.templates.length} ${pack.templates.length === 1 ? "layout" : "layouts"}. Settings only; no code runs.</p><small>Turning this off hides its choices. Scenes you already made stay intact.</small></div><div class="mod-actions"><label class="mod-switch"><input type="checkbox" id="mod-pack-enabled" ${pack.enabled ? "checked" : ""} ${busy ? "disabled" : ""}>${pack.enabled ? "Enabled" : "Disabled"}</label><button class="text-button" id="mod-pack-remove" ${busy ? "disabled" : ""}>Remove</button></div></article>`
        : "") +
      items
        .map(
          (m) =>
            `<article class="mod-card"><div class="mod-glyph">${icon("puzzle")}</div><div class="mod-copy"><span class="eyebrow">${escape(m.version || "")} · ${escape(m.author || "Community")}</span><h3>${escape(m.name)}</h3><p>${escape(m.description || "")}</p><small>Access: ${escape(m.capabilities.join(", ") || "no additional services")}</small>${m.error || m.unavailable ? `<p class="mod-error" role="status">${escape(m.error || m.unavailable)}</p>` : ""}</div><label class="mod-switch"><input type="checkbox" data-mod-id="${escape(m.id)}" ${m.enabled ? "checked" : ""} ${busy || m.pending || m.unavailable ? "disabled" : ""}>${m.pending ? "Working…" : m.enabled ? "Enabled" : "Disabled"}</label></article>`,
        )
        .join("");
    if (pack) {
      $("#mod-pack-enabled").onchange = attempt(async (e) => {
        try {
          studioTools.setPackEnabled(e.target.checked);
        } finally {
          render();
        }
      });
      $("#mod-pack-remove").onclick = () => {
        modal(
          "Remove this pack?",
          `<p>${escape(pack.name)} will leave your installed add-ons. Existing scenes and takes stay intact.</p><div class="modal-footer"><button class="button" id="cancel-remove-pack">Keep pack</button><button class="button primary" id="confirm-remove-pack">Remove pack</button></div>`,
          "MODS",
        );
        $("#cancel-remove-pack").onclick = closeModal;
        $("#confirm-remove-pack").onclick = attempt(() => {
          studioTools.removePack();
          closeModal();
          render();
        });
      };
    }
    $("#mods-list")
      .querySelectorAll("[data-mod-id]")
      .forEach(
        (input) =>
          (input.onchange = attempt(async () => {
            try {
              await registry.setEnabled(input.dataset.modId, input.checked);
            } finally {
              render();
            }
          })),
      );
  };
  $("#mods-import").onclick = () => $("#import-pack").click();
  $("#manage-mods").onclick = () =>
    document.querySelector('[data-view="mods"]').click();
  $("#mods-guide").onclick = () => {
    modal(
      "Build for Latitude",
      `<div class="guide"><p>Start with a theme or layout pack, or contribute an optional module to the open-source project.</p><p>This beta loads settings packs and reviewed modules included in a build. The optional Streaming mod broadcasts to RTMP or RTMPS. The optional Editor mod offers layered editing, titles, fades and exports. Executable third-party installation is not included yet.</p><p>Disabled modules do not load their code. Future tools can reuse composed video, the finished audio mix, and separate audio originals.</p><button class="button primary" id="open-mod-guide">Open developer guide ↗</button></div>`,
      "OPEN SOURCE",
    );
    $("#open-mod-guide").onclick = attempt(async () => {
      if (window.take?.modding) await window.take.modding();
      else
        window.open(
          "https://github.com/zphat/Latitude/blob/main/MODDING.md",
          "_blank",
          "noopener",
        );
    });
  };
  registry.addEventListener("change", render);
  window.addEventListener("latitude-pack", render);
  window.addEventListener("latitude-view", render);
  render();
  return { render };
}
