const { app, BrowserWindow, ipcMain, dialog, protocol, Menu, screen, shell, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
// electron-updater 是可选依赖，打包时可能不存在
let autoUpdater = null;
try {
  autoUpdater = require("electron-updater").autoUpdater;
} catch { /* electron-updater not available */ }

// Register custom scheme BEFORE app ready — required for CORS
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// Dev mode: running from source (not inside app.asar)
const isDev = !__dirname.includes("app.asar");
const distDir = path.join(__dirname, "..", "dist");
let mainWindow = null;

// ── App root — where config/ and data/ live ─────────────────────────────────
// In packaged app: next to the exe. In dev: project root.
function getAppRoot() {
  if (!isDev) return path.dirname(process.execPath);
  return path.join(__dirname, "..");
}

// ── Auto-updater 配置 ─────────────────────────────────────────────────────
if (autoUpdater && !isDev) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
}

// ── Auto-updater 事件：转发到渲染进程 ────────────────────────────────────
if (autoUpdater) {
  autoUpdater.on("checking-for-update", () => {
    mainWindow?.webContents.send("update:checking");
  });
  autoUpdater.on("update-available", (info) => {
    mainWindow?.webContents.send("update:available", info.version);
  });
  autoUpdater.on("update-not-available", () => {
    mainWindow?.webContents.send("update:not-available");
  });
  autoUpdater.on("download-progress", (progress) => {
    mainWindow?.webContents.send("update:progress", Math.round(progress.percent));
  });
  autoUpdater.on("update-downloaded", () => {
    mainWindow?.webContents.send("update:downloaded");
  });
  autoUpdater.on("error", (err) => {
    mainWindow?.webContents.send("update:error", err.message);
  });
}

// ── Migration: move old userData to app root structure ─────────────────────
function migrateIfNeeded() {
  const oldDataPath = path.join(app.getPath("userData"), "data");
  const newDataPath = path.join(getAppRoot(), "data");
  if (fs.existsSync(oldDataPath) && !fs.existsSync(newDataPath)) {
    try {
      fs.cpSync(oldDataPath, newDataPath, { recursive: true });
    } catch {}
  }
  // Migrate storage-config
  const oldConfig = path.join(app.getPath("userData"), "storage-config.json");
  const newConfigDir = path.join(getAppRoot(), "config");
  if (fs.existsSync(oldConfig) && !fs.existsSync(path.join(newConfigDir, "storage-config.json"))) {
    try {
      if (!fs.existsSync(newConfigDir)) fs.mkdirSync(newConfigDir, { recursive: true });
      fs.copyFileSync(oldConfig, path.join(newConfigDir, "storage-config.json"));
    } catch {}
  }
  // Migrate window state
  const oldState = path.join(app.getPath("userData"), "window-state.json");
  if (fs.existsSync(oldState) && !fs.existsSync(path.join(newConfigDir, "window-state.json"))) {
    try {
      if (!fs.existsSync(newConfigDir)) fs.mkdirSync(newConfigDir, { recursive: true });
      fs.copyFileSync(oldState, path.join(newConfigDir, "window-state.json"));
    } catch {}
  }
}

function getStorageConfigPath() {
  const configDir = path.join(getAppRoot(), "config");
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  return path.join(configDir, "storage-config.json");
}

function getStorageConfig() {
  try {
    const p = getStorageConfigPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {}
  return {};
}

function getDataPath() {
  const cfg = getStorageConfig();
  const defaultDir = path.join(getAppRoot(), "data");
  const dataDir = cfg.customPath || defaultDir;
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

// ── Window state persistence ───────────────────────────────────────────────
const STATE_PATH = path.join(getAppRoot(), "config", "window-state.json");

function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")); }
  catch { return null; }
}

function saveWindowState(win) {
  try {
    const dir = path.dirname(STATE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const state = win.isMaximized()
      ? { isMaximized: true }
      : { ...win.getBounds(), isMaximized: false };
    fs.writeFileSync(STATE_PATH, JSON.stringify(state));
  } catch {}
}

function createWindow() {
  Menu.setApplicationMenu(null);

  // Migrate data from old userData location to app root structure
  migrateIfNeeded();

  const saved = loadWindowState();
  const opts = {
    width: 1400, height: 900,
    minWidth: 600, minHeight: 400,
    frame: false,
    show: false,                  // 等待 ready-to-show 再显示，避免白屏闪烁
    backgroundColor: "#181818",    // 暗色背景，防止窗口出现时闪白
    title: "GullDoc",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // 允许在 dev 模式下使用 DevTools（配合 contextIsolation）
      ...(isDev ? { devTools: true } : {}),
    },
  };

  // 恢复上次的窗口位置/大小（验证是否仍在可用显示器范围内）
  if (saved && !saved.isMaximized && saved.width && saved.height) {
    const displays = screen.getAllDisplays();
    const onScreen = displays.some((d) => {
      const { x, y, width, height } = d.workArea;
      return (
        saved.x >= x - 50 && saved.y >= y - 50 &&
        saved.x + 50 <= x + width &&
        saved.y + 50 <= y + height
      );
    });
    if (onScreen) {
      Object.assign(opts, { x: saved.x, y: saved.y, width: saved.width, height: saved.height });
    }
  }

  mainWindow = new BrowserWindow(opts);

  // 如果上次是最大化状态，恢复最大化
  if (saved?.isMaximized) mainWindow.maximize();

  // 锁定 Electron 原生缩放为 1.0，仅由 CSS zoom 控制界面缩放
  // 必须在 loadURL 之前设置，否则 dev/packaged 加载时序差异会导致不同的默认缩放
  mainWindow.webContents.setZoomFactor(1);
  // 页面完成加载后再次确保（覆盖可能的 origin 级别覆盖）
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.setZoomFactor(1);
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadURL("app://./");
  }

  // ready-to-show: 首帧渲染完成后才显示窗口，消除启动白屏
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // ── Window state persistence: debounced save on move/resize ──
  let saveTimeout;
  const scheduleSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveWindowState(mainWindow), 500);
  };
  mainWindow.on("resize", scheduleSave);
  mainWindow.on("move", scheduleSave);
  mainWindow.on("maximize", () => {
    mainWindow.webContents.send("window-maximized");
    scheduleSave();
  });
  mainWindow.on("unmaximize", () => {
    mainWindow.webContents.send("window-unmaximized");
    scheduleSave();
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

// IPC
ipcMain.handle("fs:readFile", async (_e, filename) => {
  const fp = path.join(getDataPath(), filename);
  try { return fs.existsSync(fp) ? fs.readFileSync(fp, "utf-8") : null; }
  catch { return null; }
});
ipcMain.handle("fs:readFileBinary", async (_e, filename) => {
  const fp = path.join(getDataPath(), filename);
  try {
    if (!fs.existsSync(fp)) return null;
    return fs.readFileSync(fp).toString("base64");
  } catch { return null; }
});
ipcMain.handle("fs:writeFile", async (_e, filename, data) => {
  try { fs.writeFileSync(path.join(getDataPath(), filename), data, "utf-8"); return true; }
  catch { return false; }
});
ipcMain.handle("fs:writeFileBinary", async (_e, filename, base64Data) => {
  try {
    const buf = Buffer.from(base64Data, "base64");
    const fp = path.join(getDataPath(), filename);
    const d = path.dirname(fp);
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(fp, buf);
    return true;
  } catch { return false; }
});
ipcMain.handle("fs:deleteFile", async (_e, filename) => {
  try { const fp = path.join(getDataPath(), filename); if (fs.existsSync(fp)) fs.unlinkSync(fp); return true; }
  catch { return false; }
});
ipcMain.handle("fs:listFiles", async () => {
  try {
    const dp = getDataPath();
    if (!fs.existsSync(dp)) return [];
    return fs.readdirSync(dp, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => ({ name: e.name, isDirectory: true }));
  }
  catch { return []; }
});
// ── 工作区文件系统 IPC ───────────────────────────────────────────────────
ipcMain.handle("fs:mkdir", async (_e, dirPath) => {
  const fp = path.join(getDataPath(), dirPath);
  try { fs.mkdirSync(fp, { recursive: true }); return true; }
  catch { return false; }
});
ipcMain.handle("fs:rmdir", async (_e, dirPath) => {
  const fp = path.join(getDataPath(), dirPath);
  try { fs.rmSync(fp, { recursive: true, force: true }); return true; }
  catch { return false; }
});
ipcMain.handle("fs:rename", async (_e, oldPath, newPath) => {
  const fpOld = path.join(getDataPath(), oldPath);
  const fpNew = path.join(getDataPath(), newPath);
  try { fs.renameSync(fpOld, fpNew); return true; }
  catch { return false; }
});
ipcMain.handle("fs:listDir", async (_e, dirPath) => {
  const fp = path.join(getDataPath(), dirPath || "");
  try {
    if (!fs.existsSync(fp)) return [];
    const walk = (dir, prefix) => {
      const results = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          results.push({ name: entry.name, path: rel, isDirectory: true });
          results.push(...walk(path.join(dir, entry.name), rel));
        } else {
          results.push({ name: entry.name, path: rel, isDirectory: false });
        }
      }
      return results;
    };
    return walk(fp, "");
  } catch { return []; }
});
// 复制工作区到用户选择的目录
ipcMain.handle("fs:copyWorkspace", async (_e, srcDir) => {
  const src = path.join(getDataPath(), srcDir);
  if (!fs.existsSync(src)) return null;
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
    title: "选择目标位置",
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const dest = path.join(r.filePaths[0], srcDir);
  try {
    fs.cpSync(src, dest, { recursive: true });
    return dest;
  } catch { return null; }
});
ipcMain.handle("export:selectFolder", async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"], title: "选择导出目录" });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("export:writeFiles", async (_e, basePath, files) => {
  try {
    for (const f of files) {
      const fp = path.join(basePath, f.relativePath);
      const d = path.dirname(fp);
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      if (f.encoding === "base64") {
        fs.writeFileSync(fp, Buffer.from(f.content, "base64"));
      } else {
        fs.writeFileSync(fp, f.content, "utf-8");
      }
    }
    return { success: true, count: files.length };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle("dialog:selectFolder", async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"], title: "选择工作区文件夹" });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("fs:readDir", async (_e, dirPath) => {
  try {
    if (typeof dirPath !== "string" || !dirPath) return [];
    const resolved = path.resolve(dirPath);
    if (resolved.includes("..")) return [];
    if (!fs.existsSync(resolved)) return [];
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) return [];
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory(), isFile: e.isFile() }));
  } catch { return []; }
});
ipcMain.handle("fs:readFileAt", async (_e, filePath) => {
  try {
    if (typeof filePath !== "string" || !filePath) return null;
    const resolved = path.resolve(filePath);
    if (resolved.includes("..")) return null;
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return null;
    if (stat.size > 10 * 1024 * 1024) return null;
    return fs.readFileSync(resolved, "utf-8");
  } catch { return null; }
});
ipcMain.handle("fs:readFileAtBinary", async (_e, filePath) => {
  try {
    if (typeof filePath !== "string" || !filePath) return null;
    const resolved = path.resolve(filePath);
    if (resolved.includes("..")) return null;
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return null;
    if (stat.size > 10 * 1024 * 1024) return null;
    return fs.readFileSync(resolved).toString("base64");
  } catch { return null; }
});

ipcMain.handle("zoom:setFactor", async (_e, factor) => {
  if (mainWindow) mainWindow.webContents.setZoomFactor(factor);
});

ipcMain.handle("getDataPath", async () => {
  return getDataPath();
});

ipcMain.handle("selectStoragePath", async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
    title: "选择默认文件存储位置",
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const newPath = r.filePaths[0];
  try {
    fs.writeFileSync(getStorageConfigPath(), JSON.stringify({ customPath: newPath }), "utf-8");
  } catch {}
  return newPath;
});

ipcMain.handle("shell:openPath", async (_e, p) => {
  return shell.openPath(p);
});

// ── 系统字体扫描 ───────────────────────────────────────────────────────
// 缓存：只扫描一次，后续调用直接返回缓存
let _cachedFonts = null;

function getSystemFonts() {
  if (_cachedFonts) return _cachedFonts;
  try {
    if (process.platform === "win32") {
      // PowerShell 通过 System.Drawing 枚举已安装字体
      const cmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Drawing; [System.Drawing.Text.InstalledFontCollection]::new().Families | ForEach-Object { \\$_.Name } | Sort-Object -Unique"`;
      const output = execSync(cmd, { encoding: "utf-8", timeout: 15000, windowsHide: true });
      _cachedFonts = output.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    } else if (process.platform === "darwin") {
      // macOS: system_profiler 查询字体
      const cmd = `system_profiler SPFontsDataType 2>/dev/null | grep "Family:" | sed 's/.*Family: //' | sort -u`;
      const output = execSync(cmd, { encoding: "utf-8", timeout: 15000, shell: "/bin/bash" });
      _cachedFonts = output.split(/\n/).map(s => s.trim()).filter(Boolean);
    } else {
      // Linux: fc-list 查询 fontconfig
      const output = execSync("fc-list : family", { encoding: "utf-8", timeout: 15000 });
      const lines = output.split(/\n/).flatMap(line => line.split(",").map(s => s.trim()).filter(Boolean));
      _cachedFonts = [...new Set(lines)].sort();
    }
  } catch {
    _cachedFonts = [];
  }
  return _cachedFonts;
}

ipcMain.handle("font:getSystemFonts", async () => {
  return getSystemFonts();
});

// ── 自定义字体管理 ─────────────────────────────────────────────────────
// 用户选择的字体文件存放在 data/fonts/ 目录
// 格式：{ filename, displayName (从字体文件提取的 family name) }

function getFontsDir() {
  const d = path.join(getDataPath(), "fonts");
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

/**
 * 从 TTF/OTF 字体文件中提取 family name
 * 解析 name 表 (tag=name) 中的 Name ID 1 (Font Family)
 * 支持 TTF (TrueType) 和 OTF (CFF/PostScript outline) 格式
 */
function extractFontFamily(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length < 12) return null;

    // Parse offset table (Big Endian)
    const sfVersion = buf.readUInt16BE(0);
    const numTables = buf.readUInt16BE(4);

    // Find 'name' table
    let nameOffset = null;
    for (let i = 0; i < numTables; i++) {
      const recordOff = 12 + i * 16;
      if (recordOff + 16 > buf.length) return null;
      const tag = buf.toString("ascii", recordOff, recordOff + 4);
      if (tag === "name") {
        nameOffset = {
          offset: buf.readUInt32BE(recordOff + 8),
          length: buf.readUInt32BE(recordOff + 12),
        };
        break;
      }
    }
    if (!nameOffset) return null;

    const nameStart = nameOffset.offset;
    const nameEnd = nameStart + nameOffset.length;
    if (nameEnd > buf.length) return null;

    // Parse name table header
    const format = buf.readUInt16BE(nameStart);
    const count = buf.readUInt16BE(nameStart + 2);
    const stringOffset = buf.readUInt16BE(nameStart + 4);

    // Iterate name records to find Name ID 1 (Font Family)
    let best = null;
    for (let i = 0; i < count; i++) {
      const recOff = nameStart + 6 + i * 12;
      if (recOff + 12 > nameEnd) break;
      const platformID = buf.readUInt16BE(recOff);
      const encodingID = buf.readUInt16BE(recOff + 2);
      const nameID = buf.readUInt16BE(recOff + 6);
      const length = buf.readUInt16BE(recOff + 8);
      const offset = buf.readUInt16BE(recOff + 10);

      if (nameID !== 1) continue;

      const strOff = nameStart + stringOffset + offset;
      if (strOff + length > nameEnd) continue;

      let family = null;
      // Platform ID 3 (Windows), Encoding 1 (Unicode BMP) — UTF-16BE
      if (platformID === 3 && encodingID === 1) {
        const raw = buf.subarray(strOff, strOff + length);
        // Swap byte pairs: UTF-16BE → UTF-16LE for Node.js utf16le
        const swapped = Buffer.alloc(raw.length);
        for (let j = 0; j + 1 < raw.length; j += 2) {
          swapped[j] = raw[j + 1];
          swapped[j + 1] = raw[j];
        }
        family = swapped.toString("utf16le").replace(/\0$/, "");
        if (family) return family;
      }
      if (platformID === 3 && encodingID === 10) {
        family = buf.toString("utf-8", strOff, strOff + length).replace(/\0$/, "");
      }
      // Platform ID 1 (Mac)
      if (platformID === 1) {
        family = buf.toString("utf8", strOff, strOff + length).replace(/\0$/, "");
      }

      if (family && !best) best = family;
    }
    return best;
  } catch {
    return null;
  }
}

// 已安装自定义字体缓存
let _cachedCustomFonts = null;

function getCustomFonts() {
  if (_cachedCustomFonts) return _cachedCustomFonts;
  try {
    const dir = getFontsDir();
    const files = fs.readdirSync(dir).filter(f => /\.(ttf|otf|woff|woff2)$/i.test(f));
    _cachedCustomFonts = files.map(f => {
      const fp = path.join(dir, f);
      const family = extractFontFamily(fp) || path.basename(f, path.extname(f));
      return { filename: f, displayName: family };
    });
  } catch {
    _cachedCustomFonts = [];
  }
  return _cachedCustomFonts;
}

function resetCustomFontsCache() {
  _cachedCustomFonts = null;
}

ipcMain.handle("font:selectFont", async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: "Font Files", extensions: ["ttf", "otf", "woff", "woff2"] }],
    properties: ["openFile"],
    title: "选择字体文件",
  });
  if (r.canceled || !r.filePaths[0]) return null;

  const src = r.filePaths[0];
  const ext = path.extname(src);
  const baseName = path.basename(src, ext);
  // 生成唯一文件名，避免冲突
  const safeName = baseName.replace(/[^a-zA-Z0-9一-鿿_-]/g, "_");
  let destName = safeName + ext;
  const fontsDir = getFontsDir();
  // 如果同名文件已存在，加序号
  let counter = 1;
  while (fs.existsSync(path.join(fontsDir, destName))) {
    destName = `${safeName}_${counter}${ext}`;
    counter++;
  }
  try {
    fs.copyFileSync(src, path.join(fontsDir, destName));
  } catch (e) {
    return { error: e.message };
  }

  const family = extractFontFamily(path.join(fontsDir, destName)) || safeName;
  resetCustomFontsCache();
  return { filename: destName, displayName: family };
});

ipcMain.handle("font:getCustomFonts", async () => {
  return getCustomFonts();
});

ipcMain.handle("font:deleteCustomFont", async (_e, filename) => {
  try {
    const fp = path.join(getFontsDir(), filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    resetCustomFontsCache();
    return true;
  } catch {
    return false;
  }
});

// ── Auto-updater IPC ───────────────────────────────────────────────────
ipcMain.handle("update:check", async () => {
  if (!autoUpdater) return { error: "electron-updater not available" };
  if (isDev) return { dev: true };
  // 检查 app-update.yml 是否存在（portable 打包可能不包含此文件）
  const updateConfigPath = path.join(process.resourcesPath || "", "app-update.yml");
  if (!fs.existsSync(updateConfigPath)) {
    return { error: "更新配置不存在（当前为便携版或未配置发布目标）" };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, version: result?.updateInfo?.version };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle("update:download", async () => {
  if (!autoUpdater) return { error: "electron-updater not available" };
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle("update:install", () => {
  if (autoUpdater) autoUpdater.quitAndInstall();
});

// Clipboard IPC
ipcMain.handle("clipboard:read", () => clipboard.readText());
ipcMain.handle("clipboard:write", (_e, text) => clipboard.writeText(text));
ipcMain.on("clipboard:paste", () => {
  if (mainWindow) mainWindow.webContents.paste();
});

// Window control IPC
ipcMain.on("window-close", () => { if (mainWindow) mainWindow.close(); });
ipcMain.on("window-minimize", () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on("window-maximize", () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on("window-query-max", () => {
  if (mainWindow) mainWindow.webContents.send("window-maximized", mainWindow.isMaximized());
});

// Lifecycle
app.whenReady().then(() => {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    const reqPath = decodeURIComponent(url.pathname);
    const baseDir = isDev ? path.join(__dirname, "..") : distDir;

    // Serve custom fonts from data/fonts/ directory
    if (reqPath.startsWith("/fonts/")) {
      const fontName = reqPath.replace("/fonts/", "");
      const fontPath = path.join(getFontsDir(), fontName);
      const fontMime = {
        ".ttf": "font/ttf", ".otf": "font/otf",
        ".woff": "font/woff", ".woff2": "font/woff2",
      };
      const ft = fontMime[path.extname(fontName).toLowerCase()] || "application/octet-stream";
      try {
        return new Response(fs.readFileSync(fontPath), {
          status: 200,
          headers: { "content-type": ft, "access-control-allow-origin": "*" },
        });
      } catch {
        return new Response("Font not found", { status: 404 });
      }
    }

    const filePath = path.join(baseDir, reqPath);

    const mime = {
      ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
      ".css": "text/css", ".json": "application/json",
      ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon",
    };
    const ct = mime[path.extname(filePath).toLowerCase()] || "application/octet-stream";

    try {
      return new Response(fs.readFileSync(filePath), {
        status: 200,
        headers: { "content-type": ct, "access-control-allow-origin": "*" },
      });
    } catch {
      try {
        return new Response(fs.readFileSync(path.join(baseDir, "index.html")), {
          status: 200, headers: { "content-type": "text/html" },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }
  });

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
