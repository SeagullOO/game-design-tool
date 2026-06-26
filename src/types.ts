/**
 * types.ts — 核心数据类型定义
 *
 * 定义应用的三个核心数据模型：
 * - FolderFile:  工作区中的单个文件（Markdown / Word / Excel）
 * - Folder:      工作区/文件夹，包含多个文件和子文件夹路径
 * - Template:    工作区模版，用于快速创建预设结构
 *
 * 还提供 generateId() 工具函数，生成基于时间戳和随机数的唯一 ID 字符串。
 * 所有模型均通过 storage.ts 的抽象层持久化（Electron 文件系统或 IndexedDB）。
 */

/** 工作区中的单个文件 */
export interface FolderFile {
  /** 唯一标识符（generateId() 生成） */
  id: string;
  /** 文件名（含路径，如 "subdir/doc.md"） */
  name: string;
  /** 文件类型：Markdown / Excel 表格 / Word 文档 */
  type: "md" | "excel" | "docx";
  /** 文件内容：
   *  - md: 字符串（plain text markdown）或 TipTap JSON 对象（旧格式兼容）
   *  - excel: { data: string[][], colHeaders: string[], cellMeta?: any[][] }
   *  - docx: HTML 字符串（Tiptap 富文本格式，可编辑）
   */
  content: any;
  /** 创建时间戳 */
  createdAt: number;
  /** 最后更新时间戳 */
  updatedAt: number;
}

/** 工作区 / 文件夹 */
export interface Folder {
  /** 数据库自增 ID（新建时可能为 undefined） */
  id?: number;
  /** 文件夹名称 */
  name: string;
  /** 包含的文件列表 */
  files: FolderFile[];
  /** 子文件夹路径列表（虚拟路径，如 ["subdir", "subdir/nested"]） */
  folders?: string[];
  /** 创建时间戳 */
  createdAt: number;
  /** 最后更新时间戳 */
  updatedAt: number;
}

/** 工作区模版 */
export interface Template {
  /** 数据库自增 ID（新建时可能为 undefined） */
  id?: number;
  /** 模版名称 */
  name: string;
  /** 预置文件结构 */
  files: FolderFile[];
  /** 创建时间戳 */
  createdAt: number;
}

/**
 * 生成唯一 ID 字符串
 *
 * 格式：时间戳(36进制) + 随机字符串(6位)
 * 例如："lr9x3kq8f2k"
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
