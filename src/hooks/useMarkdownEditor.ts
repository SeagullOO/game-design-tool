/**
 * useMarkdownEditor.ts — Markdown 编辑器 hook（Monaco Editor + 自动保存）
 *
 * 管理 Markdown 源文本状态和 Monaco 编辑器生命周期：
 *
 * 文件缓存机制：
 * - fileCache ref 缓存已编辑但未保存的文件内容（以 fileId 为 key）
 * - 当用户切换 Tab 时，当前编辑内容保留在 fileCache 中
 * - 切回该文件时优先从 fileCache 读取（避免丢失未保存的编辑内容）
 * - 同时保留 lastSaved ref，用于判断是否需要触发自动保存
 *
 * 自动保存架构：
 * - 1.5 秒防抖：用户停止输入 1.5 秒后自动写入存储
 * - 状态机：saved → (编辑) unsaved → (保存中) saving → (完成) saved / unsaved
 * - saveTimer ref 存储当前定时器，cleanup 时清除
 * - 通过 setSaveStatus 回调通知 UI（StatusBadge 组件）
 *
 * TipTap JSON 兼容：
 * - 旧格式文件内容为 TipTap JSON 对象，通过 markdown-converter 的
 *   extractTextFromJson() 转为纯文本 markdown
 * - 新格式文件内容为纯字符串，直接使用
 *
 * 导出：
 * - source:          当前编辑的 markdown 源文本
 * - setSource:       设置源文本（由 Monaco onChange 调用）
 * - handleForceSave: 强制立即保存（Ctrl+S 键盘快捷键触发）
 * - editorRef:       Monaco 编辑器实例 ref（供工具栏插入语法用）
 */

import { useEffect, useRef, useCallback, useState } from "react";
import type * as Monaco from "monaco-editor";
import { storageGetFolder, storageUpdateFolder, storageWriteWorkspaceFile } from "../storage";
import type { FolderFile } from "../types";
import { extractTextFromJson } from "./markdown-converter";

/**
 * useMarkdownEditor — raw markdown 源文本编辑与自动保存
 *
 * @param currentFile   当前激活的文件（null 表示无 Markdown 文件激活）
 * @param folderId      当前工作区文件夹 ID
 * @param saveStatus    当前文件保存状态（由父组件管理）
 * @param setSaveStatus 设置保存状态的回调
 */
export function useMarkdownEditor(
  currentFile: FolderFile | null,
  folderId: number | null,
  folderName: string | null,
  saveStatus: "saved" | "saving" | "unsaved",
  setSaveStatus: (status: "saved" | "saving" | "unsaved") => void,
) {
  const [source, setSource] = useState("");
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  /** 防抖定时器 ref：清除前一个定时器以实现 debounce */
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  /** 文件编辑缓存：以 fileId 为 key，缓存未持久化的编辑内容 */
  const fileCache = useRef<Record<string, string>>({});
  /** 最近一次成功保存的内容：用于判断 source 是否有未保存的变更 */
  const lastSaved = useRef("");
  /** 当前文件 ref：确保异步保存时始终使用最新文件信息 */
  const currentFileRef = useRef(currentFile);
  currentFileRef.current = currentFile;

  /**
   * 加载文件内容（切换文件时触发）
   *
   * 优先级：
   * 1. fileCache（未保存的编辑内容）
   * 2. 原始 content（字符串格式）
   * 3. 原始 content（TipTap JSON → 提取纯文本）
   */
  useEffect(() => {
    if (!currentFile || currentFile.type !== "md") return;
    const cached = fileCache.current[currentFile.id];
    if (cached !== undefined) {
      setSource(cached);
      lastSaved.current = cached;
      return;
    }
    const content = currentFile.content;
    let text = "";
    if (typeof content === "string") {
      text = content;
    } else if (content && typeof content === "object") {
      // 旧格式 TipTap JSON：提取纯文本内容作为 markdown
      text = extractTextFromJson(content);
    }
    fileCache.current[currentFile.id] = text;
    setSource(text);
    lastSaved.current = text;
  }, [currentFile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * 防抖自动保存
   *
   * 每当 source 变化时：
   * 1. 清除前一个定时器（实现 debounce）
   * 2. 若内容与上次保存相同则跳过
   * 3. 设置状态为 "unsaved"
   * 4. 1.5 秒后执行保存：从存储读取 → 更新对应文件 → 写回存储
   * 5. 保存成功后更新 fileCache 和 lastSaved
   *
   * 依赖项使用 currentFile?.id 而非 currentFile 对象，避免对象引用变化
   * 导致不必要的保存触发。
   */
  useEffect(() => {
    if (!currentFile || currentFile.type !== "md" || !folderId) return;
    const fileId = currentFile.id;
    clearTimeout(saveTimer.current);
    if (source === lastSaved.current) return;
    setSaveStatus("unsaved");
    saveTimer.current = setTimeout(async () => {
      const text = source;
      setSaveStatus("saving");
      try {
        if (currentFile && folderName && (window as any).electronAPI) {
          await storageWriteWorkspaceFile(folderName, currentFile.name, text);
        } else {
          const f = await storageGetFolder(folderId);
          if (!f) return;
          const files = f.files.map((file) =>
            file.id === fileId
              ? { ...file, content: text, updatedAt: Date.now() }
              : file,
          );
          await storageUpdateFolder(folderId, { files, updatedAt: Date.now() });
        }
        fileCache.current[fileId] = text;
        lastSaved.current = text;
        setSaveStatus("saved");
      } catch {
        setSaveStatus("unsaved");
      }
    }, 1500);
    return () => {
      clearTimeout(saveTimer.current);
    };
  }, [source, currentFile?.id, folderId]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * 强制保存（立即执行，不等防抖）
   *
   * 由 Ctrl+S 键盘快捷键或 File 菜单触发。
   * 逻辑与自动保存相同，但不经过 setTimeout。
   * 使用 currentFileRef 确保始终保存当前文件，避免闭包过期。
   */
  const handleForceSave = useCallback(async () => {
    const file = currentFileRef.current;
    if (!file || file.type !== "md" || !folderId) return;
    const text = source;
    const fileId = file.id;
    const fileName = file.name;
    setSaveStatus("saving");
    try {
      if (folderName && (window as any).electronAPI) {
        await storageWriteWorkspaceFile(folderName, fileName, text);
      } else {
        const f = await storageGetFolder(folderId);
        if (!f) return;
        const files = f.files.map((f) =>
          f.id === fileId
            ? { ...f, content: text, updatedAt: Date.now() }
            : f,
        );
        await storageUpdateFolder(folderId, { files, updatedAt: Date.now() });
      }
      fileCache.current[fileId] = text;
      lastSaved.current = text;
      setSaveStatus("saved");
    } catch {
      setSaveStatus("unsaved");
    }
  }, [source, folderId, folderName]); // eslint-disable-line react-hooks/exhaustive-deps

  return { source, setSource, handleForceSave, editorRef };
}

