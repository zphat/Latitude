// Only source-reviewed catalog entries can load code. JSON packs cannot.
export class ModRegistry extends EventTarget {
  constructor({
    entries = [],
    enabled = {},
    capabilities = {},
    isBusy = () => false,
    save = () => {},
  } = {}) {
    super();
    Object.assign(this, { enabled, capabilities, isBusy, save });
    this.mods = new Map();
    for (const entry of entries) {
      const m = entry.manifest;
      if (
        !m ||
        !/^[a-z][a-z0-9-]{1,50}$/.test(m.id) ||
        this.mods.has(m.id) ||
        typeof m.name !== "string" ||
        !m.name.trim() ||
        m.name.length > 80 ||
        typeof entry.load !== "function" ||
        !Array.isArray(m.capabilities) ||
        m.capabilities.some((c) => typeof c !== "string")
      )
        throw Error("Invalid mod registration.");
      this.mods.set(m.id, {
        manifest: Object.freeze({
          ...m,
          capabilities: Object.freeze([...m.capabilities]),
        }),
        load: entry.load,
        instance: null,
        pending: false,
        error: "",
      });
    }
  }
  unsupported(m) {
    if (m.apiVersion !== 1) return "Requires a different Latitude mod API.";
    if (m.capabilities.some((c) => !Object.hasOwn(this.capabilities, c)))
      return "This build does not provide the features this mod needs.";
    return "";
  }
  list() {
    return [...this.mods.values()].map((m) => ({
      ...m.manifest,
      enabled: !!m.instance,
      pending: m.pending,
      error: m.error,
      unavailable: this.unsupported(m.manifest),
    }));
  }
  changed() {
    this.save();
    this.dispatchEvent(new Event("change"));
  }
  async setEnabled(id, on) {
    const m = this.mods.get(id);
    if (!m) throw Error("Unknown mod.");
    if (this.isBusy())
      throw Error("Change mods between recordings and exports.");
    if (this.changing) throw Error("An add-on is still changing state.");
    if (!!m.instance === on) return;
    if (on && this.unsupported(m.manifest))
      throw Error(this.unsupported(m.manifest));
    m.pending = true;
    m.error = "";
    this.dispatchEvent(new Event("change"));
    let candidate;
    try {
      if (on) {
        candidate = await m.load();
        if (
          typeof candidate?.activate !== "function" ||
          typeof candidate?.deactivate !== "function"
        )
          throw Error("Mod must provide activate and deactivate functions.");
        if (this.isBusy())
          throw Error("Recording or export started while the mod was loading.");
        const services = Object.fromEntries(
          m.manifest.capabilities.map((c) => [c, this.capabilities[c]]),
        );
        await candidate.activate(
          Object.freeze({ apiVersion: 1, services: Object.freeze(services) }),
        );
        if (this.isBusy())
          throw Error(
            "Recording or export started while the mod was enabling.",
          );
        m.instance = candidate;
      } else {
        await m.instance.deactivate();
        m.instance = null;
      }
      this.enabled[id] = on;
    } catch (error) {
      if (on) {
        try {
          await candidate?.deactivate?.();
        } catch {}
        this.enabled[id] = false;
      }
      m.error = error.message || "The mod could not change state.";
      throw error;
    } finally {
      m.pending = false;
      this.changed();
    }
  }
  async restore() {
    for (const [id, m] of this.mods) {
      if (this.enabled[id] !== true) continue;
      if (this.unsupported(m.manifest)) {
        this.enabled[id] = false;
        m.error = this.unsupported(m.manifest);
        this.changed();
        continue;
      }
      try {
        await this.setEnabled(id, true);
      } catch {}
    }
  }
  get changing() {
    return [...this.mods.values()].some((m) => m.pending);
  }
}
