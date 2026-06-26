/**
 * DocxToolbar.tsx — Word 文档格式工具栏
 *
 * 从 DocxEditor 中独立出来，继承 ToolbarContainer + ToolbarButton + ToolbarDivider。
 * 使用 Tiptap 3 的 useEditorState hook 同步按钮高亮状态（active class），
 * 所有样式由 .tool-btn / .tool-btn:hover / .tool-btn.active CSS 统一管理。
 */

import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { ToolbarContainer, ToolbarButton, ToolbarDivider } from "./Toolbar";

interface DocxToolbarProps {
  editor: Editor | null;
}

/** 工具栏按钮需要追踪的活跃状态 */
interface ActiveStates {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  h1: boolean;
  h2: boolean;
  h3: boolean;
  bulletList: boolean;
  orderedList: boolean;
  blockquote: boolean;
}

const EMPTY_STATES: ActiveStates = {
  bold: false, italic: false, underline: false,
  h1: false, h2: false, h3: false,
  bulletList: false, orderedList: false, blockquote: false,
};

function DocxToolbar({ editor }: DocxToolbarProps) {
  // useEditorState 基于 useSyncExternalStore，编辑器事务提交后触发重渲染
  const active = useEditorState({
    editor,
    selector: (ctx): ActiveStates => {
      if (!ctx.editor) return EMPTY_STATES;
      const e = ctx.editor;
      return {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        h1: e.isActive("heading", { level: 1 }),
        h2: e.isActive("heading", { level: 2 }),
        h3: e.isActive("heading", { level: 3 }),
        bulletList: e.isActive("bulletList"),
        orderedList: e.isActive("orderedList"),
        blockquote: e.isActive("blockquote"),
      };
    },
  });

  if (!editor || editor.isDestroyed) return null;

  const a = active ?? EMPTY_STATES;

  /** 阻止 focus 转移，保持编辑焦点 */
  const preventFocusLoss = (e: React.MouseEvent) => { e.preventDefault(); };

  return (
    <ToolbarContainer>
      {/* ── 加粗 / 斜体 / 下划线 ── */}
      <ToolbarButton active={a.bold} style={{ minWidth: 30, fontWeight: 700, fontSize: 13, justifyContent: "center" }}
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().focus().toggleBold().run()}>B</ToolbarButton>
      <ToolbarButton active={a.italic} style={{ minWidth: 30, fontStyle: "italic", fontSize: 13, justifyContent: "center" }}
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().focus().toggleItalic().run()}>I</ToolbarButton>
      <ToolbarButton active={a.underline} style={{ minWidth: 30, textDecoration: "underline", fontSize: 13, justifyContent: "center" }}
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().focus().toggleUnderline().run()}>U</ToolbarButton>

      <ToolbarDivider />

      {/* ── 标题 H1-H3 ── */}
      <ToolbarButton active={a.h1} style={{ minWidth: 30, fontWeight: 700, fontSize: 12, justifyContent: "center" }}
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarButton>
      <ToolbarButton active={a.h2} style={{ minWidth: 30, fontWeight: 600, fontSize: 12, justifyContent: "center" }}
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
      <ToolbarButton active={a.h3} style={{ minWidth: 30, fontWeight: 600, fontSize: 12, justifyContent: "center" }}
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarButton>

      <ToolbarDivider />

      {/* ── 无序/有序列表 ── */}
      <ToolbarButton active={a.bulletList}
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().focus().toggleBulletList().run()}>•</ToolbarButton>
      <ToolbarButton active={a.orderedList}
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</ToolbarButton>

      <ToolbarDivider />

      {/* ── 引用块 ── */}
      <ToolbarButton active={a.blockquote}
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}>"</ToolbarButton>
    </ToolbarContainer>
  );
}

export default DocxToolbar;
