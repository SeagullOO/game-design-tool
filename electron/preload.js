const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Generic IPC
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  // File-based storage
  readFile: (filename) => ipcRenderer.invoke("fs:readFile", filename),
  readFileBinary: (filename) => ipcRenderer.invoke("fs:readFileBinary", filename),
  writeFile: (filename, data) => ipcRenderer.invoke("fs:writeFile", filename, data),
  writeFileBinary: (filename, base64Data) => ipcRenderer.invoke("fs:writeFileBinary", filename, base64Data),
  deleteFile: (filename) => ipcRenderer.invoke("fs:deleteFile", filename),
  listFiles: () => ipcRenderer.invoke("fs:listFiles"),
  // Workspace filesystem
  mkdir: (dirPath) => ipcRenderer.invoke("fs:mkdir", dirPath),
  rmdir: (dirPath) => ipcRenderer.invoke("fs:rmdir", dirPath),
  rename: (oldPath, newPath) => ipcRenderer.invoke("fs:rename", oldPath, newPath),
  listDir: (dirPath) => ipcRenderer.invoke("fs:listDir", dirPath),

  // Export / Workspace move
  selectExportFolder: () => ipcRenderer.invoke("export:selectFolder"),
  copyWorkspace: (srcDir) => ipcRenderer.invoke("fs:copyWorkspace", srcDir),
  writeExportFiles: (basePath, files) => ipcRenderer.invoke("export:writeFiles", basePath, files),

  // Dialog / file system
  selectFolder: () => ipcRenderer.invoke("dialog:selectFolder"),
  readDir: (dirPath) => ipcRenderer.invoke("fs:readDir", dirPath),
  readFileAt: (filePath) => ipcRenderer.invoke("fs:readFileAt", filePath),
  readFileAtBinary: (filePath) => ipcRenderer.invoke("fs:readFileAtBinary", filePath),

  // Shell
  getDataPath: () => ipcRenderer.invoke("getDataPath"),
  selectStoragePath: () => ipcRenderer.invoke("selectStoragePath"),
  openPath: (p) => ipcRenderer.invoke("shell:openPath", p),

  // Zoom
  setZoomFactor: (factor) => ipcRenderer.invoke("zoom:setFactor", factor),

  // Font
  getSystemFonts: () => ipcRenderer.invoke("font:getSystemFonts"),

  // Window controls
  windowClose: () => ipcRenderer.send("window-close"),
  windowMinimize: () => ipcRenderer.send("window-minimize"),
  windowMaximize: () => ipcRenderer.send("window-maximize"),

  // Max/unmax state listener
  onMaximizeChange: (cb) => {
    ipcRenderer.on("window-maximized", () => cb(true));
    ipcRenderer.on("window-unmaximized", () => cb(false));
  },

  // ── Auto-updater ──────────────────────────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateStatus: (cb) => {
    const events = ["update:checking", "update:available", "update:not-available", "update:progress", "update:downloaded", "update:error"];
    events.forEach((e) => ipcRenderer.on(e, (_ev, data) => cb(e.replace("update:", ""), data)));
    return () => events.forEach((e) => ipcRenderer.removeAllListeners(e));
  },
});
