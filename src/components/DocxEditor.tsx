/**
 * DocxEditor.tsx — Tiptap 富文本编辑器（.docx WYSIWYG）
 *
 * 读取：mammoth .docx 二进制 → HTML → Tiptap
 * 存储：Tiptap HTML → altChunk .docx 二进制 → 磁盘
 *
 * 工具栏已提取为 DocxToolbar 组件，渲染在 zoom 容器外部。
 */

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import type { Editor } from "@tiptap/react";
import type { FolderFile } from "../types";
import { sanitizeDocxHtml } from "../utils/docxUtils";

interface DocxEditorProps {
  currentFile: FolderFile;
  editorRef: React.MutableRefObject<Editor | null>;
  onEditorReady?: (editor: Editor | null) => void;
}

function DocxEditor({ currentFile, editorRef, onEditorReady }: DocxEditorProps) {
  const [contentLoaded, setContentLoaded] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: "<p></p>",
    editorProps: {
      attributes: {
        style: "padding:16px 24px;outline:none;min-height:100%;font-size:14px;line-height:1.7;color:var(--text-primary);",
      },
      handleDOMEvents: {
        // 禁用文本拖拽移动
        dragstart: (_view, event) => { event.preventDefault(); return true; },
        drop: (_view, event) => { event.preventDefault(); return true; },
      },
    },
  });

  // 同步 editor 实例到 ref 和父组件
  useEffect(() => {
    if (editor) {
      editorRef.current = editor as Editor;
      onEditorReady?.(editor as Editor);
    }
    return () => {
      editorRef.current = null;
      onEditorReady?.(null);
    };
  }, [editor, editorRef, onEditorReady]);

  // 加载文件内容
  useEffect(() => {
    if (!editor || editor.isDestroyed || contentLoaded) return;
    const content = currentFile.content;
    if (typeof content === "string" && content.length > 0) {
      try {
        const clean = sanitizeDocxHtml(content);
        editor.commands.setContent(clean);
      } catch {
        editor.commands.setContent("<p></p>");
      }
    }
    setContentLoaded(true);
  }, [editor, currentFile.content, contentLoaded]);

  // 文件切换
  useEffect(() => {
    setContentLoaded(false);
  }, [currentFile.id]);

  if (!editor) {
    return <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-tertiary)" }}>加载编辑器中...</div>;
  }

  return (
    <div className="flex-1 overflow-auto" style={{ background: "var(--bg-root)" }}>
      <EditorContent editor={editor} />
    </div>
  );
}

export default DocxEditor;
