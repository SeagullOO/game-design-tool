/**
 * storage.ts — 存储抽象层
 *
 * 核心架构：提供统一的存储接口，底层根据运行环境自动切换：
 * - Electron 桌面端：工作区索引存 folders.json，文件存真实目录结构
 * - 浏览器端：使用 IndexedDB（Dexie.js 封装的 db 实例）
 */

import { db } from "./db";
import type { Folder, FolderFile, Template } from "./types";
import { generateId } from "./types";

declare global {
  interface Window {
    electronAPI?: {
      readFile: (filename: string) => Promise<string | null>;
      readFileBinary: (filename: string) => Promise<string | null>;
      writeFile: (filename: string, data: string) => Promise<boolean>;
      writeFileBinary: (filename: string, base64Data: string) => Promise<boolean>;
      deleteFile: (filename: string) => Promise<boolean>;
      listFiles: () => Promise<{ name: string; isDirectory: boolean }[]>;
      mkdir: (dirPath: string) => Promise<boolean>;
      rmdir: (dirPath: string) => Promise<boolean>;
      rename: (oldPath: string, newPath: string) => Promise<boolean>;
      listDir: (dirPath: string) => Promise<{ name: string; path: string; isDirectory: boolean }[]>;
      copyWorkspace: (srcDir: string) => Promise<string | null>;
      selectExportFolder: () => Promise<string | null>;
      writeExportFiles: (basePath: string, files: { relativePath: string; content: string; encoding?: "base64" }[]) => Promise<{ success: boolean; error?: string; count: number }>;
      selectFolder: () => Promise<string | null>;
      readDir: (dirPath: string) => Promise<{ name: string; isDirectory: boolean; isFile: boolean }[]>;
      readFileAt: (filePath: string) => Promise<string | null>;
      readFileAtBinary: (filePath: string) => Promise<string | null>;
      setZoomFactor: (factor: number) => void;
      checkForUpdates: () => Promise<{ dev?: boolean; success?: boolean; version?: string; error?: string }>;
      downloadUpdate: () => Promise<{ success?: boolean; error?: string }>;
      installUpdate: () => void;
      onUpdateStatus: (cb: (status: string, data?: any) => void) => () => void;
    };
  }
}

const isElectron = !!window.electronAPI;

async function ensureDbReady(timeoutMs = 3000): Promise<void> {
  if (isElectron) return;
  try {
    await Promise.race([
      db.open(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("数据库连接超时")), timeoutMs)
      ),
    ]);
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════
// Folder 索引 CRUD（Electron: 直接扫描磁盘目录，无 folders.json）
// ═══════════════════════════════════════════════════════════════════════════

/** 目录名 → 数字 ID（简单 hash，确定性） */
function nameToId(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) & 0x7fffffff;
  return h;
}
/** 数字 ID → 目录名。loadFolders 时建立反向映射，存入 window.__folderNameMap */
let nameMap: Map<number, string> = new Map();

// ── CSV helpers（保留用于 legacy .csv 文件兼容） ─────────────────────────

export function dataToCsv(data: string[][]): string {
  return data.map(row =>
    row.map(cell => {
      const s = cell ?? "";
      return (s.includes(",") || s.includes("\n") || s.includes('"')) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")
  ).join("\n");
}

export function csvToData(csv: string): string[][] {
  const lines = csv.split("\n");
  const result: string[][] = [];
  for (const line of lines) {
    const row: string[] = [];
    let cell = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cell += '"'; i++; }
          else { inQuote = false; }
        } else { cell += ch; }
      } else {
        if (ch === '"') { inQuote = true; }
        else if (ch === ",") { row.push(cell); cell = ""; }
        else { cell += ch; }
      }
    }
    row.push(cell);
    result.push(row);
  }
  return result;
}

/** 列出 dataPath 下所有子目录 → 每个子目录即一个工作区 */
export async function storageLoadFolders(): Promise<Folder[]> {
  if (isElectron) {
    const entries = await window.electronAPI!.listFiles();
    nameMap = new Map();
    const folders: Folder[] = [];
    for (const e of entries) {
      if (typeof e === 'object' && e.isDirectory) {
        const id = nameToId(e.name);
        nameMap.set(id, e.name);
        folders.push({ id, name: e.name, files: [], folders: [], createdAt: Date.now(), updatedAt: Date.now() });
      }
    }
    return folders.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return db.folders.orderBy("updatedAt").reverse().toArray();
}
/** 根据 ID 获取目录名 */
export function getFolderNameById(id: number): string | undefined { return nameMap.get(id); }

/** 创建工作区：只建目录 */
export async function storageSaveFolder(folder: Folder): Promise<number> {
  if (isElectron) {
    await window.electronAPI!.mkdir(folder.name);
    folder.id = nameToId(folder.name);
    nameMap.set(folder.id, folder.name);
    return folder.id!;
  }
  if (folder.id) {
    await db.folders.update(folder.id, folder as any);
    return folder.id;
  }
  return db.folders.add(folder as any);
}

export async function storageGetFolder(id: number): Promise<Folder | undefined> {
  if (isElectron) {
    const name = nameMap.get(id);
    if (!name) { const folders = await storageLoadFolders(); return folders.find((f) => f.id === id); }
    // 直接从已知名称加载，避免重新扫描
    const { files, folders } = await storageListWorkspaceFiles(name);
    return { id, name, files, folders, createdAt: Date.now(), updatedAt: Date.now() };
  }
  return db.folders.get(id);
}

export async function storageDeleteFolder(id: number, name?: string): Promise<void> {
  if (isElectron) {
    if (name) await window.electronAPI!.rmdir(name);
    return;
  }
  await db.folders.delete(id);
}

export async function storageUpdateFolder(id: number, changes: Partial<Folder>): Promise<void> {
  if (isElectron) {
    const folders = await storageLoadFolders();
    const folder = folders.find((f) => f.id === id);
    if (folder && changes.name && changes.name !== folder.name) {
      await window.electronAPI!.rename(folder.name, changes.name);
    }
    return;
  }
  await db.folders.update(id, { ...changes, updatedAt: Date.now() });
}

// ═══════════════════════════════════════════════════════════════════════════
// 工作区文件系统操作（Electron only）
// ═══════════════════════════════════════════════════════════════════════════

/** Excel 文件扩展名列表 */
const EXCEL_EXTENSIONS = ["xlsx", "csv"];

/** 列出工作区目录下的所有文件和文件夹 */
export async function storageListWorkspaceFiles(folderName: string): Promise<{ files: FolderFile[]; folders: string[] }> {
  if (!isElectron) return { files: [], folders: [] };
  const entries = await window.electronAPI!.listDir(folderName);
  const folderFileMap = new Map<string, FolderFile>();
  const folderPaths: string[] = [];
  for (const e of entries) {
    if (e.isDirectory) {
      folderPaths.push(e.path);
    } else {
      // 跳过 .meta 元数据文件（legacy CSV 配套文件）
      if (e.name.endsWith(".meta")) continue;
      const ext = e.name.split(".").pop()?.toLowerCase();
      let type: "md" | "excel" | "docx" | null = null;
      if (ext === "md") type = "md";
      else if (ext === "docx") type = "docx";
      else if (ext && EXCEL_EXTENSIONS.includes(ext)) type = "excel";
      else continue; // 忽略不识别文件
      folderFileMap.set(e.path, {
        id: generateId(), name: e.path, type,
        content: type === "md" ? "" : type === "docx" ? "" : { data: [[]] },
        createdAt: Date.now(), updatedAt: Date.now(),
      });
    }
  }
  // Sort: folders first, then files
  folderPaths.sort();
  const files = Array.from(folderFileMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  return { files, folders: folderPaths };
}

/** 读工作区中的文件内容（文本） */
export async function storageReadWorkspaceFile(folderName: string, relPath: string): Promise<string | null> {
  if (!isElectron) return null;
  return window.electronAPI!.readFile(`${folderName}/${relPath}`);
}

/** 读工作区中的文件内容（二进制 base64） */
export async function storageReadWorkspaceFileBinary(folderName: string, relPath: string): Promise<string | null> {
  if (!isElectron) return null;
  return window.electronAPI!.readFileBinary(`${folderName}/${relPath}`);
}

/** 写/创建工作区文件（文本） */
export async function storageWriteWorkspaceFile(folderName: string, relPath: string, content: string): Promise<boolean> {
  if (!isElectron) return false;
  const dir = relPath.includes("/") ? relPath.split("/").slice(0, -1).join("/") : "";
  if (dir) await window.electronAPI!.mkdir(`${folderName}/${dir}`);
  return window.electronAPI!.writeFile(`${folderName}/${relPath}`, content);
}

/** 写/创建工作区文件（二进制 base64） */
export async function storageWriteWorkspaceFileBinary(folderName: string, relPath: string, base64Content: string): Promise<boolean> {
  if (!isElectron) return false;
  const dir = relPath.includes("/") ? relPath.split("/").slice(0, -1).join("/") : "";
  if (dir) await window.electronAPI!.mkdir(`${folderName}/${dir}`);
  return window.electronAPI!.writeFileBinary(`${folderName}/${relPath}`, base64Content);
}

/** 删除工作区文件 */
export async function storageDeleteWorkspaceFile(folderName: string, relPath: string): Promise<boolean> {
  if (!isElectron) return false;
  return window.electronAPI!.deleteFile(`${folderName}/${relPath}`);
}

/** 重命名/移动工作区文件或目录 */
export async function storageRenameWorkspaceEntry(folderName: string, oldPath: string, newPath: string): Promise<boolean> {
  if (!isElectron) return false;
  const dir = newPath.includes("/") ? newPath.split("/").slice(0, -1).join("/") : "";
  if (dir) await window.electronAPI!.mkdir(`${folderName}/${dir}`);
  return window.electronAPI!.rename(`${folderName}/${oldPath}`, `${folderName}/${newPath}`);
}

/** 创建工作区子目录 */
export async function storageCreateWorkspaceDir(folderName: string, dirPath: string): Promise<boolean> {
  if (!isElectron) return false;
  return window.electronAPI!.mkdir(`${folderName}/${dirPath}`);
}

/** 删除工作区子目录 */
export async function storageDeleteWorkspaceDir(folderName: string, dirPath: string): Promise<boolean> {
  if (!isElectron) return false;
  return window.electronAPI!.rmdir(`${folderName}/${dirPath}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Template CRUD
// ═══════════════════════════════════════════════════════════════════════════

export async function storageLoadTemplates(): Promise<Template[]> {
  if (isElectron) {
    const data = await window.electronAPI!.readFile("templates.json");
    return data ? JSON.parse(data) : [];
  }
  return db.templates.orderBy("createdAt").reverse().toArray();
}

export async function storageAddTemplate(template: Template): Promise<number> {
  if (isElectron) {
    const templates = await storageLoadTemplates();
    template.id = Date.now();
    templates.push(template);
    await window.electronAPI!.writeFile("templates.json", JSON.stringify(templates, null, 2));
    return template.id;
  }
  return db.templates.add(template as any);
}

export async function storageDeleteTemplate(id: number): Promise<void> {
  if (isElectron) {
    const templates = await storageLoadTemplates();
    await window.electronAPI!.writeFile("templates.json", JSON.stringify(templates.filter((t) => t.id !== id), null, 2));
    return;
  }
  await db.templates.delete(id);
}

// ═══════════════════════════════════════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════════════════════════════════════

export async function storageExportFiles(files: { relativePath: string; content: string; encoding?: "base64" }[]): Promise<string> {
  if (isElectron) {
    const basePath = await window.electronAPI!.selectExportFolder();
    if (!basePath) throw new Error("AbortError");
    const result = await window.electronAPI!.writeExportFiles(basePath, files);
    if (!result.success) throw new Error(result.error || "Export failed");
    return `已导出 ${result.count} 个文件`;
  }
  files.forEach((f) => {
    if (f.encoding === "base64") {
      // 将 base64 解码为二进制 blob 下载
      const binaryStr = atob(f.content);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.relativePath.split("/").pop() || f.relativePath;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      const blob = new Blob([f.content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.relativePath.split("/").pop() || f.relativePath;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  });
  return `已下载 ${files.length} 个文件`;
}
