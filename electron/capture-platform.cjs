function capturePlatform(platform = process.platform, env = process.env) {
  const linux = platform === "linux";
  const wayland =
    linux && (env.XDG_SESSION_TYPE === "wayland" || !!env.WAYLAND_DISPLAY);
  return {
    picker: wayland ? "portal" : "thumbnails",
    desktopAudio: linux ? "pulse" : ["win32", "darwin"].includes(platform) ? "loopback" : "input",
    session: linux ? (wayland ? "wayland" : "x11") : platform,
    flatpak: linux && !!env.FLATPAK_ID,
  };
}
function selectedCapture(sources, id, capabilities) {
  return capabilities.picker === "portal"
    ? sources[0]
    : sources.find((s) => s.id === id);
}
module.exports = { capturePlatform, selectedCapture };
