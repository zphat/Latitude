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
const { LinuxAudio } = require("./linux-audio.cjs");
const { capturePlatform, selectedCapture } = require("./capture-platform.cjs");
const capture = capturePlatform();
if (process.platform === "linux")
  app.setDesktopName("studio.latitude.recorder.desktop");
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
if (testMode && process.env.LATITUDE_TEST_PROFILE)
  app.setPath("userData", path.resolve(process.env.LATITUDE_TEST_PROFILE));
if (!testMode && !app.requestSingleInstanceLock()) app.quit();
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
let win,
  store,
  selectedSource = null,
  powerId,
  root,
  configFile,
  ffmpeg,
  publisher,
  editor,
  streamPowerId,
  updater;
const allowedRoot = path.join(__dirname, "..");
const linuxAudio =
  process.platform === "linux"
    ? new LinuxAudio(
        path.join(
          app.isPackaged
            ? process.resourcesPath
            : path.join(allowedRoot, "vendor"),
          "latitude-audio",
        ),
        {
          onDisconnect: (message) => {
            if (!win?.isDestroyed())
              win?.webContents.send("audio:disconnected", message);
          },
        },
      )
    : null;
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
    if (url.pathname.startsWith("/editor-media/")) {
      const id = url.pathname.slice("/editor-media/".length);
      const file = /^[\w-]{1,80}$/.test(id) && editor?.mediaPath(id);
      if (!file) return new Response("Media unavailable", { status: 404 });
      return require("./editor-media.cjs").mediaResponse(request, file);
    }
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
        const source = selectedCapture(sources, selectedSource, capture);
        if (!source) return callback({});
        callback({
          video: source,
          ...(["win32", "darwin"].includes(process.platform) && request.audioRequested
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
      const streamEncoder = await win.webContents
        .executeJavaScript(`(async () => {
        const { header, packet } = await import('./mods/streaming/matroska.js');
        const cfg = { codec: 'avc1.42002a', width: 640, height: 360, bitrate: 1500000,
          framerate: 30, bitrateMode: 'constant', latencyMode: 'realtime', avc: { format: 'avc' } };
        if (!(await VideoEncoder.isConfigSupported(cfg)).supported) throw Error('Installed H.264 streaming encoder unavailable');
        let packets = 0, bytes = 0, failure;
        const encoder = new VideoEncoder({ output: (chunk, metadata) => {
          if (!packets) bytes += header({ ...cfg, sampleRate: 48000, description: metadata.decoderConfig.description }).length;
          const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
          bytes += packet(1, chunk.timestamp, data, chunk.type === 'key').length; packets++;
        }, error: error => { failure = error; } });
        try {
          encoder.configure(cfg);
          const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
          canvas.getContext('2d').fillRect(0, 0, 640, 360);
          for (let i = 0; i < 3; i++) {
            const frame = new VideoFrame(canvas, { timestamp: i * 33333 });
            try { encoder.encode(frame, { keyFrame: i === 0 }); } finally { frame.close(); }
          }
          await encoder.flush();
          if (failure || packets !== 3 || !bytes) throw failure || Error('Installed encoder produced no usable packets');
          return { packets, bytes };
        } finally { if (encoder.state !== 'closed') encoder.close(); }
      })()`);
      console.log("STREAM_ENCODER_SMOKE " + JSON.stringify(streamEncoder));
    } catch {
      encoder = false;
    }
    return {
      platform: process.platform,
      capture,
      version: app.getVersion(),
      root,
      encoder,
      shortcutFailures,
      runtime: {
        electron: process.versions.electron,
        chromium: process.versions.chrome,
        os: os.release(),
        arch: process.arch,
        cpuThreads: os.availableParallelism(),
        memoryGB: Math.round(os.totalmem() / 1024 ** 3),
      },
    };
  });
  handle("capture:sources", async () =>
    capture.picker === "portal"
      ? [
          {
            id: "portal",
            name: "Choose a screen or window with your desktop…",
            thumbnail: "",
          },
        ]
      : (
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
  handle("audio:outputs", () => (linuxAudio ? linuxAudio.outputs() : []));
  handle("audio:connect", (sink) => {
    if (!linuxAudio) throw Error("Desktop audio bridge is Linux only.");
    if (store.active || store.beginning)
      throw Error("Change audio devices between takes.");
    return linuxAudio.connect(sink);
  });
  handle("audio:disconnect", () => linuxAudio?.stop());
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
      if (
        target !== s.dir &&
        !path.resolve(target).startsWith(path.resolve(s.dir) + path.sep)
      )
        throw Error("Invalid recording path.");
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
  handle("app:feedback", () =>
    shell.openExternal("https://github.com/zphat/Latitude/issues"),
  );
  handle("app:modding", () =>
    shell.openExternal(
      "https://github.com/zphat/Latitude/blob/main/MODDING.md",
    ),
  );
  handle("app:copy-diagnostics", (text) => {
    if (typeof text !== "string" || text.length > 32768)
      throw Error("Invalid diagnostics.");
    clipboard.writeText(text);
  });
  handle("record:begin", async (opts) => {
    if (updater?.busy) throw Error("Finish or cancel the update before starting an output.");
    if (editor?.busy)
      throw Error("Finish the editor operation before recording.");
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
    const target = await store.playbackPath(id);
    const error = await shell.openPath(target);
    if (error) throw Error(error);
  });
  let exportTask;
  handle("stream:start", async (options) => {
    if (updater?.busy) throw Error("Finish or cancel the update before starting an output.");
    if (editor?.busy)
      throw Error("Finish the editor operation before streaming.");
    if (exportTask) throw Error("Finish the export before streaming.");
    if (!publisher) {
      const { StreamPublisher } = require("./stream-publisher.cjs");
      publisher = new StreamPublisher({
        ffmpeg,
        onState: (state) => {
          if (!win?.isDestroyed()) win?.webContents.send("stream:state", state);
          if (
            state.state === "stopped" &&
            streamPowerId !== undefined &&
            powerSaveBlocker.isStarted(streamPowerId)
          )
            powerSaveBlocker.stop(streamPowerId);
        },
      });
    }
    const result = await publisher.start(options);
    if (!publisher.active)
      throw Error("The streaming encoder could not start.");
    streamPowerId = powerSaveBlocker.start("prevent-display-sleep");
    return result;
  });
  handle("stream:write", (id, bytes) => {
    if (!publisher) throw Error("Streaming is not active.");
    return publisher.write(id, bytes);
  });
  handle("stream:stop", (id) => publisher?.stop(id));
  handle("record:export", (id, opts) => {
    if (updater?.busy) throw Error("Finish or cancel the update before starting an output.");
    if (editor?.busy)
      throw Error("Finish the editor operation before exporting a take.");
    if (publisher?.active)
      throw Error(
        "End the stream before exporting to keep the broadcast smooth.",
      );
    if (exportTask) throw Error("An export is already running.");
    exportTask = store
      .export(id, opts, ffmpeg, (progress) =>
        win?.webContents.send("export:progress", progress),
      )
      .finally(() => {
        exportTask = null;
      });
    return exportTask;
  });
  handle("record:cancel-export", () => store.cancelExport());
  handle("editor:call", async (operation, data) => {
    if (!editor) {
      const { EditorStore } = require("./editor.cjs");
      editor = new EditorStore({
        ffmpeg,
        profile: app.getPath("userData"),
        onProgress: (state) => {
          if (!win?.isDestroyed())
            win.webContents.send("editor:progress", state);
        },
      });
    }
    if (operation === "cancel") {
      editor.cancel();
      return true;
    }
    if (operation === "draft") return editor.draft(data);
    if (operation === "draft-info") return editor.draftInfo();
    if (operation === "dispose") return editor.dispose();
    if (updater?.busy) throw Error("Finish or cancel the update before using the editor’s media tools.");
    if (store.active || store.beginning || store.exporting || publisher?.active)
      throw Error(
        "Finish recording, streaming or exporting before using the editor’s media tools.",
      );
    const mediaFilters = [
      {
        name: "Video, audio and images",
        extensions: [
          "mp4",
          "m4v",
          "mov",
          "mkv",
          "webm",
          "avi",
          "wav",
          "mp3",
          "m4a",
          "aac",
          "flac",
          "ogg",
          "opus",
          "png",
          "jpg",
          "jpeg",
          "webp",
        ],
      },
    ];
    if (operation === "import") {
      const result = await dialog.showOpenDialog(win, {
        title: "Add media to your edit",
        properties: ["openFile", "multiSelections"],
        filters: mediaFilters,
      });
      return result.canceled ? null : editor.importFiles(result.filePaths);
    }
    if (operation === "take") {
      const take = await store.resolve(data);
      if (take.status === "recording")
        throw Error("Save this take before editing.");
      return editor.importTake(take);
    }
    if (operation === "relink") {
      const result = await dialog.showOpenDialog(win, {
        title: "Locate replacement media",
        properties: ["openFile"],
        filters: mediaFilters,
      });
      return result.canceled ? null : editor.relink(data, result.filePaths[0]);
    }
    if (operation === "save") {
      const result = await dialog.showSaveDialog(win, {
        title: "Save a Latitude edit project",
        defaultPath: "Latitude-edit.latitude-edit",
        filters: [{ name: "Latitude edit", extensions: ["latitude-edit"] }],
      });
      return result.canceled ? null : editor.save(data, result.filePath);
    }
    if (operation === "open") {
      const result = await dialog.showOpenDialog(win, {
        title: "Open a Latitude edit project",
        properties: ["openFile"],
        filters: [{ name: "Latitude edit", extensions: ["latitude-edit"] }],
      });
      return result.canceled ? null : editor.open(result.filePaths[0]);
    }
    if (operation === "restore") return editor.open(editor.draftPath);
    if (operation === "waveform") return editor.waveform(data?.id, data?.audio);
    if (operation === "preview")
      return editor.prepare(data?.id, data?.audio, !!data?.video);
    if (operation === "export") {
      const result = await dialog.showOpenDialog(win, {
        title: "Choose where to save this edit",
        defaultPath: root,
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled) return null;
      return editor.export(
        data?.project,
        data?.options,
        result.filePaths[0],
        data?.titles,
      );
    }
    if (operation === "reveal" && editor.lastExport)
      return shell.openPath(editor.lastExport);
    throw Error("Unsupported editor operation.");
  });
  let closing = false,
    closePrompt = false;
  const { Updater, RELEASES } = require("./updater.cjs");
  const updatePrefs = path.join(app.getPath("userData"), "updates.json");
  let updateEnabled = true;
  try { updateEnabled = JSON.parse(fs.readFileSync(updatePrefs, "utf8")).checkAtLaunch !== false; } catch {}
  const updateMode = app.isPackaged && process.arch === "x64"
    ? process.platform === "win32"
      ? fs.existsSync(path.join(path.dirname(process.execPath), "Uninstall Latitude.exe")) ? "windows" : "portable"
      : process.platform === "linux" && process.env.FLATPAK_ID === "studio.latitude.recorder" ? "flatpak" : "development"
    : "development";
  updater = new Updater({
    current: app.getVersion(),
    mode: testMode && ["windows", "portable", "flatpak"].includes(process.env.LATITUDE_UPDATE_TEST_MODE)
      ? process.env.LATITUDE_UPDATE_TEST_MODE : updateMode,
    cache: path.join(app.getPath("userData"), "update-cache"),
    enabled: updateEnabled,
    // Node fetch exposes manual redirect responses; Electron net.fetch aborts them.
    // Every redirect is inspected by the updater before following it.
    fetcher: (url, options) => fetch(url, options),
    isBusy: () => !!(store.active || store.beginning || store.exporting || exportTask || publisher?.active || editor?.busy),
    prepare: async () => {
      await editor?.draftTask;
      await win.webContents.session.flushStorageData();
    },
    handoff: async (file, mode) => {
      if (mode === "windows") {
        // Run the fixed, verified NSIS file directly, never through a shell.
        const { spawn } = require("node:child_process");
        const child = spawn(file, [], { detached: true, stdio: "ignore", cwd: path.dirname(file) });
        await new Promise((resolve, reject) => { child.once("error", reject); child.once("spawn", resolve); });
        child.unref();
        closing = true;
        win.close();
      } else {
        const error = await shell.openPath(file);
        if (error) throw Error("Could not open the update. Install it from the release page using your system’s software center or archive manager.");
      }
    },
    onState: (state) => { if (!win?.isDestroyed()) win.webContents.send("updates:state", state); },
  });
  // Test injection remains in the main process of unpackaged test runs only.
  if (testMode) require("./updater.cjs").testing = updater;
  handle("updates:call", async (operation, value) => {
    if (operation === "state") return updater.snapshot();
    if (operation === "launch") {
      if (process.argv.includes("--smoke-test")) return updater.snapshot();
      return updater.check();
    }
    if (operation === "check") return updater.check({ manual: true });
    if (operation === "skip") return updater.skip();
    if (operation === "cancel") return updater.cancel();
    if (operation === "download") return updater.download();
    if (operation === "install") return updater.install();
    if (operation === "notes") return shell.openExternal(updater.selected?.notes || RELEASES);
    if (operation === "enabled") {
      if (typeof value !== "boolean") throw Error("Invalid update preference.");
      await fs.promises.writeFile(updatePrefs + ".tmp", JSON.stringify({ checkAtLaunch: value }), { mode: 0o600 });
      await fs.promises.rename(updatePrefs + ".tmp", updatePrefs);
      return updater.setEnabled(value);
    }
    throw Error("Unsupported update operation.");
  });
  handle("app:quit", () => {
    if (
      store.active ||
      store.exporting ||
      store.beginning ||
      publisher?.active ||
      editor?.busy
    )
      throw Error("Finish saving before closing.");
    closing = true;
    win.close();
  });
  win.on("close", async (e) => {
    if (
      closing ||
      (!store.active &&
        !store.exporting &&
        !store.beginning &&
        !publisher?.active &&
        !editor?.busy)
    )
      return;
    e.preventDefault();
    if (closePrompt) return;
    closePrompt = true;
    try {
      if (editor?.busy) {
        const { response } = await dialog.showMessageBox(win, {
          message: "The editor is still working.",
          detail:
            "Cancel the editor operation, then close after it stops. Your original files and autosaved edit are kept.",
          buttons: ["Keep open", "Cancel editor operation"],
          defaultId: 0,
          cancelId: 0,
        });
        if (response === 1) editor.cancel();
        return;
      }
      if (store.exporting) {
        const { response } = await dialog.showMessageBox(win, {
          message: "An export is in progress.",
          detail:
            "Canceling keeps your original recording and removes this unfinished export.",
          buttons: ["Keep open", "Cancel export and close"],
          defaultId: 0,
          cancelId: 0,
        });
        if (response === 1) {
          store.cancelExport();
          await exportTask?.catch(() => {});
          closing = true;
          win.close();
        }
        return;
      }
      const { response } = await dialog.showMessageBox(win, {
        type: "question",
        message: "A recording or stream is in progress.",
        detail: "End the broadcast and save any local take before closing.",
        buttons: ["Keep open", "End outputs and close"],
        defaultId: 0,
        cancelId: 0,
      });
      if (response === 1) win.webContents.send("action", "stop-and-close");
    } finally {
      closePrompt = false;
    }
  });
  win.webContents.on("render-process-gone", async () => {
    editor?.cancel();
    await publisher?.stop().catch(() => {});
    await linuxAudio?.stop().catch(() => {});
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
  // Opt-in package checks. Desktop audio is requested only with --audio-smoke-test.
  if (process.argv.includes("--smoke-test")) {
    try {
      const ready = await win.webContents.executeJavaScript(
        `document.title === 'Latitude' && !!document.querySelector('#record-button') && !!window.take?.desktop && document.querySelector('#scene-list').children.length === 5 && document.querySelectorAll('#default-format option').length === 8`,
      );
      if (!ready) throw Error("The installed interface did not load.");
      const { exportFormat } = await import("../src/export-formats.js");
      if (exportFormat("mkv").audio !== "flac")
        throw Error("Packaged format registry is missing.");
      await runFFmpeg(ffmpeg, ["-version"]);
      if (
        process.platform === "linux" &&
        process.argv.includes("--audio-smoke-test")
      ) {
        const audio = await win.webContents.executeJavaScript(`(async () => {
          const { StudioEngine } = await import('./engine.js');
          const engine = new StudioEngine(document.createElement('canvas'), {});
          const peaks = [];
          engine.addEventListener('meters', e => peaks.push(e.detail.peaks[2]));
          try {
            await engine.linuxDesktopInput('system');
            await new Promise(resolve => setTimeout(resolve, 2500));
            if (!peaks.some(peak => peak > 0.001)) throw Error('No desktop audio reached the renderer worklet');
            return { sampleRate: engine.ctx.sampleRate, meterMessages: peaks.length, peak: Math.max(...peaks) };
          } finally { engine.remove('desktop'); await engine.ctx?.close(); }
        })()`);
        console.log("LINUX_AUDIO_SMOKE " + JSON.stringify(audio));
        await linuxAudio.stop();
      }
      app.exit(0);
    } catch (error) {
      console.error(error.message);
      app.exit(1);
    }
  }
});
app.on("will-quit", (event) => {
  updater?.dispose();
  editor?.cancel();
  globalShortcut.unregisterAll();
  if (linuxAudio?.active || publisher?.active) {
    event.preventDefault();
    Promise.allSettled([linuxAudio?.stop(), publisher?.stop()]).finally(() =>
      app.quit(),
    );
  }
});
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
app.on("window-all-closed", () => app.quit());
