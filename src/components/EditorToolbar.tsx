/**
 * EditorToolbar — Markdown 编辑器的格式工具栏
 *
 * 【角色】为 Monaco Editor 提供 Markdown 语法快速插入按钮。
 *         支持撤销/重做、标题（H1-H3）、加粗/斜体、无序/有序列表、引用、预览切换。
 *         每个按钮通过 Monaco 的 executeEdits() API 操作编辑器内容。
 *
 * 【继承】ToolbarContainer + ToolbarButton + ToolbarDivider
 *         从 Toolbar.tsx 继承统一的容器样式、按钮尺寸和分隔线规范。
 *         工具栏位于 FolderWorkspace zoom 容器外部，不受 Ctrl+滚轮缩放影响。
 *
 * 【交互链】
 *   - 每个按钮 → Monaco editor.executeEdits() / editor.trigger() / editor.focus()
 *   - onTogglePreview → 父组件 (FolderWorkspace) → 切换 isPreviewMode 状态
 *   - 编辑器 undo 栈由 Monaco 自身维护，工具栏不管理状态
 *
 * 【设计决策】
 *   - wrapSelection(prefix, suffix): 通用文本包裹函数
 *     * 无选区：插入 prefix+suffix 并将光标置于中间
 *     * 有选区：用 prefix + selectedText + suffix 包裹选区
 *   - prefixLine(prefix): 行首插入函数，在当前行开始插入指定前缀
 *   - 工具栏是纯命令发送者，不持有编辑器状态
 */

import type * as Monaco from "monaco-editor";
import { t, getLang } from "../i18n";
import { ToolbarContainer, ToolbarButton, ToolbarDivider } from "./Toolbar";

interface EditorToolbarProps {
  editorRef: React.MutableRefObject<Monaco.editor.IStandaloneCodeEditor | null>;
  isPreviewMode: boolean;
  onTogglePreview: () => void;
}

function EditorToolbar({ editorRef, isPreviewMode, onTogglePreview }: EditorToolbarProps) {
  const lang = getLang();
  // 获取 Monaco editor 实例的便捷函数
  const getEditor = () => editorRef.current;
  const getSelection = () => {
    const ed = getEditor();
    return ed?.getSelection() ?? null;
  };

  // 通用文本包裹函数：有选区则包裹，无选区则在光标处插入并置光标于中间
  const wrapSelection = (prefix: string, suffix: string) => {
    const ed = getEditor();
    if (!ed) return;
    const sel = getSelection();
    if (!sel || sel.isEmpty()) {
      const pos = ed.getPosition();
      if (!pos) return;
      ed.executeEdits("toolbar", [
        {
          range: {
            startLineNumber: pos.lineNumber,
            startColumn: pos.column,
            endLineNumber: pos.lineNumber,
            endColumn: pos.column,
          },
          text: prefix + suffix,
        },
      ]);
      ed.setPosition({ lineNumber: pos.lineNumber, column: pos.column + prefix.length });
    } else {
      const selectedText = ed.getModel()?.getValueInRange(sel) ?? "";
      ed.executeEdits("toolbar", [
        { range: sel, text: prefix + selectedText + suffix },
      ]);
    }
    ed.focus();
  };

  // 行首插入函数：在当前选区起始行首插入指定前缀（用于标题/列表/引用）
  const prefixLine = (prefix: string) => {
    const ed = getEditor();
    if (!ed) return;
    const sel = getSelection();
    if (!sel) return;
    const lineStart = sel.startLineNumber;
    ed.executeEdits("toolbar", [
      {
        range: {
          startLineNumber: lineStart,
          startColumn: 1,
          endLineNumber: lineStart,
          endColumn: 1,
        },
        text: prefix,
      },
    ]);
    ed.focus();
  };

  const handleUndo = () => getEditor()?.trigger("keyboard", "undo", null);
  const handleRedo = () => getEditor()?.trigger("keyboard", "redo", null);
  const handleBold = () => wrapSelection("**", "**");
  const handleItalic = () => wrapSelection("*", "*");
  const handleH1 = () => prefixLine("# ");
  const handleH2 = () => prefixLine("## ");
  const handleH3 = () => prefixLine("### ");
  const handleUl = () => prefixLine("- ");
  const handleOl = () => prefixLine("1. ");
  const handleQuote = () => prefixLine("> ");

  return (
    <ToolbarContainer>
      {/* ── 撤销 / 重做 ── */}
      <ToolbarButton onClick={handleUndo} title={t("undo", lang) + " (Ctrl+Z)"}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </ToolbarButton>
      <ToolbarButton onClick={handleRedo} title={t("redo", lang) + " (Ctrl+Y)"}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </ToolbarButton>

      <ToolbarDivider />

      {/* ── 标题 H1-H3 ── */}
      <ToolbarButton onClick={handleH1} title={t("heading1", lang)}
        style={{ minWidth: 30, fontWeight: 700, fontSize: 12, justifyContent: "center" }}>
        H1
      </ToolbarButton>
      <ToolbarButton onClick={handleH2} title={t("heading2", lang)}
        style={{ minWidth: 30, fontWeight: 600, fontSize: 12, justifyContent: "center" }}>
        H2
      </ToolbarButton>
      <ToolbarButton onClick={handleH3} title={t("heading3", lang)}
        style={{ minWidth: 30, fontWeight: 600, fontSize: 12, justifyContent: "center" }}>
        H3
      </ToolbarButton>

      <ToolbarDivider />

      {/* ── 加粗 / 斜体 ── */}
      <ToolbarButton onClick={handleBold} title={t("bold", lang) + " (Ctrl+B)"}
        style={{ minWidth: 30, fontWeight: 700, fontSize: 13, justifyContent: "center" }}>
        B
      </ToolbarButton>
      <ToolbarButton onClick={handleItalic} title={t("italic", lang) + " (Ctrl+I)"}
        style={{ minWidth: 30, fontStyle: "italic", fontSize: 13, justifyContent: "center" }}>
        I
      </ToolbarButton>

      <ToolbarDivider />

      {/* ── 无序/有序列表 ── */}
      <ToolbarButton onClick={handleUl} title={t("ulList", lang)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="5" cy="6" r="1.2" fill="currentColor" stroke="none" />
          <line x1="9" y1="6" x2="19" y2="6" />
          <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
          <line x1="9" y1="12" x2="19" y2="12" />
          <circle cx="5" cy="18" r="1.2" fill="currentColor" stroke="none" />
          <line x1="9" y1="18" x2="19" y2="18" />
        </svg>
      </ToolbarButton>
      <ToolbarButton onClick={handleOl} title={t("olList", lang)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <text x="2" y="7.5" fontSize="7" fontWeight="bold" fill="currentColor" stroke="none">1</text>
          <line x1="9" y1="6" x2="19" y2="6" />
          <text x="2" y="14" fontSize="7" fontWeight="bold" fill="currentColor" stroke="none">2</text>
          <line x1="9" y1="12.5" x2="19" y2="12.5" />
        </svg>
      </ToolbarButton>

      <ToolbarDivider />

      {/* ── 引用块 ── */}
      <ToolbarButton onClick={handleQuote} title={t("blockquote", lang)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M6 17h3l2-4V7H5v6h3l-2 4zm8 0h3l2-4V7h-6v6h3l-2 4z" />
        </svg>
      </ToolbarButton>

      {/* Spacer + Preview toggle */}
      <div className="flex-1" />
      <ToolbarDivider />
      <ToolbarButton onClick={onTogglePreview} title={t("togglePreview", lang)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span className="ml-1 text-[11px]">{t("preview", lang)}</span>
      </ToolbarButton>
    </ToolbarContainer>
  );
}

export default EditorToolbar;
