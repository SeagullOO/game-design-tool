/**
 * useDocxEditor.ts — Tiptap 富文本编辑器 hook（.docx 可编辑）
 *
 * 管理 Tiptap editor 实例生命周期：
 *   init → edit → auto-save (1.5s debounce) → destroy
 *
 * 存储：Tiptap HTML → @turbodocx/html-to-docx → .docx 二进制 → 磁盘
 * （对标 useExcelEditor 的 dataToXlsxBase64 + storageWriteWorkspaceFileBinary 模式）
 */

import { useEffect, useRef, useCallback, useState } from "react";
import type { Editor } from "@tiptap/react";
import { storageGetFolder, storageUpdateFolder, storageWriteWorkspaceFileBinary } from "../storage";
import { htmlToDocxBase64 } from "../utils/docxUtils";
import type { FolderFile } from "../types";

export function useDocxEditor(
  currentFile: FolderFile | null,
  folderId: number | null,
  folderName: string | null,
) {
  const editorRef = useRef<Editor | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastSavedHtml = useRef("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");

  // 用 ref 保持 currentFile 的最新引用，避免闭包过期
  const currentFileRef = useRef(currentFile);
  currentFileRef.current = currentFile;

  /** 核心保存逻辑：Electron → .docx 二进制写入磁盘；浏览器 → HTML 存入 IndexedDB */
  const performSave = useCallback(async (html: string, fileId: string, fileName: string) => {
    if (folderName && (window as any).electronAPI) {
      // Electron：HTML → .docx 二进制 → 写入磁盘
      const docxBase64 = await htmlToDocxBase64(html);
      await storageWriteWorkspaceFileBinary(folderName, fileName, docxBase64);
    } else if (folderId) {
      // 浏览器：HTML 字符串直接存入 IndexedDB
      const folder = await storageGetFolder(folderId);
      if (!folder) return;
      const files = folder.files.map((f) =>
        f.id === fileId ? { ...f, content: html, updatedAt: Date.now() } : f,
      );
      await storageUpdateFolder(folderId, { files, updatedAt: Date.now() });
    }
  }, [folderId, folderName]);

  /** 强制保存（立即执行） */
  const handleForceSave = useCallback(async () => {
    const editor = editorRef.current;
    const file = currentFileRef.current;
    if (!editor || editor.isDestroyed || !file || !folderId) return;
    const html = editor.getHTML();
    setSaveStatus("saving");
    try {
      await performSave(html, file.id, file.name);
      lastSavedHtml.current = html;
      setSaveStatus("saved");
    } catch {
      setSaveStatus("unsaved");
    }
  }, [folderId, performSave]);

  // 防抖自动保存
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed || !currentFile || !folderId) return;

    const onUpdate = () => {
      // 每次触发时从 editor 实时读取最新 HTML，避免闭包中捕获过期值
      const html = editor.getHTML();
      if (html === lastSavedHtml.current) return;
      setSaveStatus("unsaved");
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const file = currentFileRef.current;
        if (!file) return;
        setSaveStatus("saving");
        try {
          await performSave(html, file.id, file.name);
          lastSavedHtml.current = html;
          setSaveStatus("saved");
        } catch {
          setSaveStatus("unsaved");
        }
      }, 1500);
    };

    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      clearTimeout(saveTimer.current);
    };
  }, [currentFile?.id, folderId, performSave]);

  return { editorRef, saveStatus, handleForceSave };
}
