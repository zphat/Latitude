const { contextBridge, ipcRenderer } = require("electron");
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld("take", {
  desktop: true,
  platform: process.platform,
  audioOutputs: () => call("audio:outputs"),
  connectDesktopAudio: (sink) => call("audio:connect", sink),
  disconnectDesktopAudio: () => call("audio:disconnect"),
  onAudioDisconnect: (fn) => {
    const cb = (_, message) => fn(message);
    ipcRenderer.on("audio:disconnected", cb);
    return () => ipcRenderer.removeListener("audio:disconnected", cb);
  },
  info: () => call("app:info"),
  sources: () => call("capture:sources"),
  chooseSource: (id) => call("capture:choose", id),
  chooseFolder: () => call("folder:choose"),
  openFolder: (id) => call("folder:open", id),
  begin: (opts) => call("record:begin", opts),
  chunk: (id, key, buffer) => call("record:chunk", id, key, buffer),
  end: (opts) => call("record:end", opts),
  event: (id, event) => call("record:event", id, event),
  sessions: () => call("sessions:list"),
  export: (id, options) => call("record:export", id, options),
  cancelExport: () => call("record:cancel-export"),
  feedback: () => call("app:feedback"),
  modding: () => call("app:modding"),
  copyDiagnostics: (text) => call("app:copy-diagnostics", text),
  quit: () => call("app:quit"),
  play: (id) => call("record:play", id),
  shortcuts: (enabled) => call("app:shortcuts", enabled),
  savePack: (pack) => call("pack:save", pack),
  onAction: (fn) => {
    const cb = (_, v) => fn(v);
    ipcRenderer.on("action", cb);
    return () => ipcRenderer.removeListener("action", cb);
  },
  onProgress: (fn) => {
    const cb = (_, v) => fn(v);
    ipcRenderer.on("export:progress", cb);
    return () => ipcRenderer.removeListener("export:progress", cb);
  },
  onProblem: (fn) => {
    const cb = (_, v) => fn(v);
    ipcRenderer.on("problem", cb);
    return () => ipcRenderer.removeListener("problem", cb);
  },
});
