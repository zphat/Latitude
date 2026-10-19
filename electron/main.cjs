const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  session,
  dialog,
  shell,
  globalShortcut,
  protocol,
  net,
  powerSaveBlocker,
  Menu,
  clipboard,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { RecordingStore, runFFmpeg } = require("./recording.cjs");
// Retain the prior profile on upgrade, including device preferences and origin storage.
const legacyProfile = path.join(app.getPath("appData"), "Take Studio");
if (!fs.existsSync(app.getPath("userData")) && fs.existsSync(legacyProfile))
  app.setPath("userData", legacyProfile);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "take",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);
// Headless test environments may not support the OS single-instance socket.
const testMode = process.env.TAKE_STUDIO_TEST === "1" && !app.isPackaged;
if (!testMode && !app.requestSingleInstanceLock()) app.quit();
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
let win,
  store,
  selectedSource = null,
  powerId,
  root,
  configFile,
  ffmpeg;
const allowedRoot = path.join(__dirname, "..");
const trusted = (e) =>
  e.sender === win?.webContents && e.senderFrame?.url.startsWith("take://app/");
function handle(name, fn) {
  ipcMain.handle(name, (e, ...args) => {
    if (!trusted(e)) throw Error("Untrusted request.");
    return fn(...args);
  });
}
function getFFmpeg() {
  const candidates = [
    process.env.TAKE_FFMPEG,
    path.join(process.resourcesPath, "ffmpeg.exe"),
    path.join(process.resourcesPath, "ffmpeg"),
    path.join(
      allowedRoot,
      "vendor",
      process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
    ),
  ];
  try {
    candidates.push(require("ffmpeg-static"));
  } catch {}
  return candidates.find((x) => x && fs.existsSync(x)) || "ffmpeg";
}
function registerShortcuts(enabled = true) {
  globalShortcut.unregisterAll();
  if (!enabled) return [];
  const bindings = {
    "CommandOrControl+Shift+R": "record",
    "CommandOrControl+Shift+M": "mute",
    "CommandOrControl+Shift+B": "marker",
    "CommandOrControl+Shift+P": "pause",
  };
  for (let i = 1; i <= 5; i++)
    bindings[`CommandOrControl+Shift+${i}`] = `scene:${i - 1}`;
  return Object.entries(bindings)
    .filter(
      ([key, value]) =>
        !globalShortcut.register(key, () =>
          win?.webContents.send("action", value),
        ),
    )
    .map(([key]) => key);
}
app.whenReady().then(async () => {
  app.setAppUserModelId("studio.latitude.recorder");
  Menu.setApplicationMenu(null);
  protocol.handle("take", (request) => {
    const url = new URL(request.url);
    if (url.host !== "app") return new Response("Forbidden", { status: 403 });
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const target = path.resolve(allowedRoot, rel || "src/index.html");
    if (
      !target.startsWith(allowedRoot + path.sep) ||
      !["src", "audio", "assets"].some((p) =>
        target.startsWith(path.join(allowedRoot, p) + path.sep),
      )
    )
      return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(target).toString());
  });
  configFile = path.join(app.getPath("userData"), "settings.json");
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch {}
  root =
    config.root ||
    (fs.existsSync(path.join(app.getPath("videos"), "Take Studio"))
      ? path.join(app.getPath("videos"), "Take Studio")
      : path.join(app.getPath("videos"), "Latitude"));
  store = new RecordingStore(root);
  ffmpeg = getFFmpeg();
  win = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#090d0a",
    title: "Latitude",
    icon: path.join(allowedRoot, "assets", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("take://app/")) e.preventDefault();
  });
  session.defaultSession.setPermissionRequestHandler(
    (wc, permission, callback, details) =>
      callback(
        wc === win.webContents &&
          details.requestingUrl?.startsWith("take://app/") &&
          [
            "media",
            "display-capture",
            "speaker-selection",
            "fullscreen",
          ].includes(permission),
      ),
  );
  session.defaultSession.setPermissionCheckHandler(
    (wc, permission, origin) =>
      wc === win.webContents &&
      (origin === "take://app" || origin.startsWith("take://app/")) &&
      ["media", "display-capture", "speaker-selection", "fullscreen"].includes(
        permission,
      ),
  );
  session.defaultSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      try {
        if (!request.frame?.url.startsWith("take://app/")) return callback({});
        const sources = await desktopCapturer.getSources({
          types: ["screen", "window"],
          thumbnailSize: { width: 0, height: 0 },
        });
        const source = sources.find((s) => s.id === selectedSource);
        if (!source) return callback({});
        callback({
          video: source,
          ...(process.platform === "win32" && request.audioRequested
            ? { audio: "loopback" }
            : {}),
        });
      } catch {
        callback({});
      }
    },
  );
  const shortcutFailures = registerShortcuts();
  handle("app:info", async () => {
    let encoder = true;
    try {
      await runFFmpeg(ffmpeg, ["-version"]);
    } catch {
      encoder = false;
    }
    return {
      platform: process.platform,
      version: app.getVersion(),
      root,
      encoder,
      shortcutFailures,
      runtime: { electron: process.versions.electron, chromium: process.versions.chrome, os: os.release(), arch: process.arch, cpuThreads: os.availableParallelism(), memoryGB: Math.round(os.totalmem() / 1024 ** 3) },
    };
  });
  handle("capture:sources", async () =>
    (
      await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 320, height: 180 },
      })
    ).map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
    })),
  );
  handle("capture:choose", async (id) => {
    if (typeof id !== "string" || id.length > 512)
      throw Error("Invalid screen source.");
    selectedSource = id;
  });
  handle("folder:choose", async () => {
    if (store.active || store.exporting)
      throw Error(
        "Stop recording and wait for export before changing folders.",
      );
    const result = await dialog.showOpenDialog(win, {
      title: "Where should Latitude save recordings?",
      properties: ["openDirectory", "createDirectory"],
      defaultPath: root,
    });
    if (!result.canceled) {
      root = result.filePaths[0];
      store.root = root;
      await fs.promises.writeFile(configFile, JSON.stringify({ root }));
    }
    return root;
  });
  handle("folder:open", async (id) => {
    let target = root;
    if (id) {
      const s = await store.resolve(id);
      target = s.exports?.at(-1)?.path || s.dir;
      if (target !== s.dir && !path.resolve(target).startsWith(path.resolve(s.dir) + path.sep)) throw Error("Invalid recording path.");
    }
    await fs.promises.mkdir(target, { recursive: true });
    const error = await shell.openPath(target);
    if (error) throw Error(error);
  });
  handle("pack:save", async (pack) => {
    if (!pack || pack.version !== 1) throw Error("Invalid pack.");
    const data = JSON.stringify(pack, null, 2);
    if (Buffer.byteLength(data) > 12 * 1024 * 1024)
      throw Error("Pack is too large.");
    const r = await dialog.showSaveDialog(win, {
      title: "Save Latitude theme and layout pack",
      defaultPath: "Latitude-studio.json",
      filters: [{ name: "Latitude pack", extensions: ["json"] }],
    });
    if (r.canceled || !r.filePath) return false;
    await fs.promises.writeFile(r.filePath, data, "utf8");
    return true;
  });
  handle("app:shortcuts", (enabled) => registerShortcuts(!!enabled));
  handle("app:feedback", () => shell.openExternal("https://github.com/zphat/Latitude/issues"));
  handle("app:copy-diagnostics", (text) => {
    if (typeof text !== "string" || text.length > 32768) throw Error("Invalid diagnostics.");
    clipboard.writeText(text);
  });
  handle("record:begin", async (opts) => {
    if (!opts || ![44100, 48000].includes(opts.sampleRate))
      throw Error("Unsupported audio sample rate.");
    const result = await store.begin(opts);
    powerId = powerSaveBlocker.start("prevent-display-sleep");
    return result;
  });
  handle("record:chunk", (id, key, data) => store.append(id, key, data));
  handle("record:event", (id, event) => store.event(id, event));
  handle("record:end", async (opts) => {
    try {
      return await store.end(opts);
    } finally {
      if (powerId !== undefined && powerSaveBlocker.isStarted(powerId))
        powerSaveBlocker.stop(powerId);
    }
  });
  handle("sessions:list", () => store.list());
  handle("record:play", async (id) => {
    const s = await store.resolve(id);
    if (store.active?.manifest.id === id)
      throw Error("Stop this take before playback.");
    const target = s.exports?.at(-1)?.path
      ? path.join(s.exports.at(-1).path, "Recording.mp4")
      : path.join(s.dir, s.videoFile || "capture.webm");
    if (!path.resolve(target).startsWith(path.resolve(s.dir) + path.sep))
      throw Error("Invalid recording path.");
    const error = await shell.openPath(target);
    if (error) throw Error(error);
  });
  let exportTask;
  handle("record:export", (id, opts) => {
    if (exportTask) throw Error("An export is already running.");
    exportTask = store.export(id, opts, ffmpeg, (progress) => win?.webContents.send("export:progress", progress)).finally(() => { exportTask = null; });
    return exportTask;
  });
  handle("record:cancel-export", () => store.cancelExport());
  let closing = false, closePrompt = false;
  handle("app:quit", () => {
    if (store.active || store.exporting || store.beginning) throw Error("Finish saving before closing.");
    closing = true; win.close();
  });
  win.on("close", async (e) => {
    if (closing || (!store.active && !store.exporting && !store.beginning)) return;
    e.preventDefault();
    if (closePrompt) return;
    closePrompt = true;
    try {
    if (store.exporting) {
      const { response } = await dialog.showMessageBox(win, {
        message: "An export is in progress.",
        detail: "Canceling keeps your original recording and removes this unfinished export.",
        buttons: ["Keep open", "Cancel export and close"], defaultId: 0, cancelId: 0,
      });
      if (response === 1) { store.cancelExport(); await exportTask?.catch(() => {}); closing = true; win.close(); }
      return;
    }
    const { response } = await dialog.showMessageBox(win, {
      type: "question",
      message: "A recording is in progress.",
      detail: "Stop and save the take before closing.",
      buttons: ["Keep recording", "Save and close"],
      defaultId: 0,
      cancelId: 0,
    });
    if (response === 1) win.webContents.send("action", "stop-and-close");
    } finally { closePrompt = false; }
  });
  win.webContents.on("render-process-gone", async () => {
    await store
      .end({
        error: "The recording window closed unexpectedly.",
        status: "interrupted",
      })
      .catch(() => {});
    if (powerId !== undefined && powerSaveBlocker.isStarted(powerId))
      powerSaveBlocker.stop(powerId);
  });
  setInterval(async () => {
    if (!store.active) return;
    try {
      const stat = await fs.promises.statfs(root);
      if (Number(stat.bavail) * Number(stat.bsize) < 512 * 1024 ** 2)
        win?.webContents.send(
          "problem",
          "Low disk space. Stopping now to preserve this take.",
        );
    } catch {}
  }, 5000).unref();
  await win.loadURL("take://app/src/index.html");
  // Opt-in packaged smoke test; does not request media or upload anything.
  if (process.argv.includes("--smoke-test")) {
    try {
      const ready = await win.webContents.executeJavaScript(`document.title === 'Latitude' && !!document.querySelector('#record-button') && !!window.take?.desktop && document.querySelector('#scene-list').children.length === 5`);
      if (!ready) throw Error("The installed interface did not load.");
      await runFFmpeg(ffmpeg, ["-version"]); app.exit(0);
    } catch (error) { console.error(error.message); app.exit(1); }
  }
});
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
app.on("window-all-closed", () => app.quit());
