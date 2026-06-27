import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { createPortal } from "react-dom";
import { applyMonacoTheme, getMonacoTheme } from "../monaco-theme";
import { useScrollSync } from "../hooks/useScrollSync";
import { useSplitterDrag } from "../hooks/useSplitterDrag";

/**
 * MarkdownEditor — Monaco 编辑器 + 可选的 HTML 分屏预览
 *
 * 【角色】核心文档编辑组件，提供 Monaco (VS Code) 级别的 Markdown 编辑体验。
 *         支持两种模式：
 *         - 纯编辑模式（isPreviewMode = false）：Monaco 编辑器占 100% 宽度
 *         - 分屏预览模式（isPreviewMode = true）：左侧 Monaco + 右侧 HTML 预览，
 *           中间由可拖拽分隔线调整比例
 *
 * 【视觉布局】flex-1 垂直 flex 容器（minHeight: 0 允许正确收缩）。
 *           - 外层：flex-1 flex flex-col overflow-hidden
 *           - 内层：flex-1 flex overflow-hidden（水平布局）
 *             * 左侧面板：Monaco Editor（flex: 1 或在分屏模式下按 splitRatio 分配宽度）
 *             * 分隔线（仅分屏模式）：2px 宽，cursor: col-resize，可拖拽
 *             * 右侧预览（仅分屏模式）：flex: 1，minWidth: 120px，滚动同步
 *
 * 【交互链】
 *   - onChange → onSourceChange → FolderWorkspace → useAutoSave
 *   - onTogglePreview → 父组件 → 切换 isPreviewMode 状态
 *   - 分隔线拖拽 → useSplitterDrag hook → 调整 splitRatio 重分左右面板
 *   - 滚动同步 → useScrollSync hook → 编辑器滚动时同步预览面板位置
 *
 * 【设计决策 - 主题同步】
 *   - handleBeforeMount: 在 Monaco 加载前应用暗色主题
 *   - MutationObserver: 监听 document.documentElement 的 class 变化（.light 切换）
 *     当用户切换亮色/暗色模式时，自动更新 Monaco 和预览面板的主题
 *   - applyMonacoTheme + getMonacoTheme 来自 ../monaco-theme.ts
 *
 * 【设计决策 - 预览渲染】
 *   - marked.parse() 将 Markdown 转为 HTML
 *   - DOMPurify.sanitize() 防止 XSS 攻击（即使内容来自本地也做净化）
 *   - dangerouslySetInnerHTML: 预览区直接渲染 HTML（已净化）
 *   - 预览区 contentEditable: false + CSS 只读样式
 *
 * 【设计决策 - 工具栏位置】
 *   - EditorToolbar 由父组件 FolderWorkspace 渲染在 workspace zoom 容器外部
 *   - 确保工具栏不受 Ctrl+滚轮缩放影响，始终 100% 原始大小
 */

interface MarkdownEditorProps {
  source: string;
  onSourceChange: (value: string) => void;
  editorRef: React.MutableRefObject<Monaco.editor.IStandaloneCodeEditor | null>;
  isPreviewMode: boolean;
  onTogglePreview: () => void;
  fontFamily: string;
}

/**
 * MarkdownEditor — Monaco 编辑器 + 可选分屏 HTML 预览
 *
 * EditorToolbar 由父组件 FolderWorkspace 渲染在 workspace zoom 容器外部，
 * 因此工具栏始终保持 100% 比例，不受 Ctrl+滚轮缩放影响。
 */
function MarkdownEditor({ source, onSourceChange, editorRef, isPreviewMode, onTogglePreview, fontFamily }: MarkdownEditorProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const themeObserverRef = useRef<MutationObserver | null>(null);

  const { splitRatio, handleSplitterMouseDown } = useSplitterDrag({
    containerRef,
    editorRef,
  });

  const { handlePreviewScroll, syncEditorToPreview } = useScrollSync({
    editorRef,
    previewRef,
    isPreviewMode,
  });

  // 判断当前主题：亮色模式由 .light 类在 document.documentElement 上控制
  const isDark = !document.documentElement.classList.contains("light");

  const fontStack = `"${fontFamily}", monospace`;

  // ── Monaco 主题管理 ──────────────────────────────────────────────────
  // handleBeforeMount: 在 Monaco 编辑器初始化前应用主题
  // MutationObserver: 监听 .light 类切换，自动更新 Monaco 编辑器主题
  const handleBeforeMount = useCallback(
    (monaco: typeof Monaco) => {
      applyMonacoTheme(monaco, isDark);
      const observer = new MutationObserver(() => {
        const dark = !document.documentElement.classList.contains("light");
        applyMonacoTheme(monaco, dark);
        monaco.editor.setTheme(getMonacoTheme(dark));
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
      themeObserverRef.current = observer;
    },
    [isDark],
  );

  useEffect(() => {
    return () => {
      themeObserverRef.current?.disconnect();
    };
  }, []);

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!ctxMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".ctx-menu")) setCtxMenu(null);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtxMenu(null);
    };
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKey);
    };
  }, [ctxMenu]);

  // ── Editor mount ──────────────────────────────────────────────────────

  const handleEditorMount: OnMount = useCallback(
    (editor) => {
      editorRef.current = editor;
      // Force font via updateOptions (post-mount, most reliable)
      editor.updateOptions({ fontFamily: fontStack });
      // Also inject a style element inside the editor DOM as fallback
      const style = document.createElement("style");
      style.setAttribute("data-gull-mfont", "");
      style.textContent =
        `.monaco-editor .view-lines,` +
        `.monaco-editor .view-lines * {` +
        `  font-family: ${fontStack} !important;` +
        `}`;
      editor.getDomNode()?.querySelector(".monaco-editor")?.appendChild(style);
      requestAnimationFrame(() => {
        syncEditorToPreview();
      });
      // 状态栏：光标位置
      const updateSb = () => {
        const el = document.getElementById("global-statusbar");
        if (!el) return;
        const isZh = (() => { try { return localStorage.getItem("gull_lang") !== "en"; } catch { return true; } })();
        const Ln = isZh ? "行" : "Ln", Col = isZh ? "列" : "Col", Sel = isZh ? "已选择" : "Selected";
        const pos = editor.getPosition();
        const sel = editor.getSelection();
        const selLen = sel && !sel.isEmpty() ? editor.getModel()?.getValueInRange(sel).length || 0 : 0;
        const ln = pos ? `${Ln} ${pos.lineNumber}, ${Col} ${pos.column}` : "";
        const selStr = selLen > 0 ? `<span style="color:var(--text-secondary)">${Sel}: ${selLen}</span>` : "";
        el.innerHTML = `<span>Markdown</span><span style="display:flex;gap:10px"><span>${ln}</span>${selStr}</span>`;
      };
      editor.onDidChangeCursorPosition(updateSb);
      editor.onDidChangeCursorSelection(updateSb);
    },
    [editorRef, syncEditorToPreview, fontStack],
  );

  // 字体变更时动态更新 Monaco 编辑器（无需重新挂载）
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({ fontFamily: fontStack });
    // 更新之前注入的 <style> 标签，否则 !important 会覆盖 updateOptions
    const existing = editor.getDomNode()?.querySelector("style[data-gull-mfont]") as HTMLStyleElement | null;
    if (existing) {
      existing.textContent =
        `.monaco-editor .view-lines,` +
        `.monaco-editor .view-lines * {` +
        `  font-family: ${fontStack} !important;` +
        `}`;
    } else {
      const style = document.createElement("style");
      style.setAttribute("data-gull-mfont", "");
      style.textContent =
        `.monaco-editor .view-lines,` +
        `.monaco-editor .view-lines * {` +
        `  font-family: ${fontStack} !important;` +
        `}`;
      editor.getDomNode()?.querySelector(".monaco-editor")?.appendChild(style);
    }
  }, [fontStack, editorRef]);

  // ── Marked config ─────────────────────────────────────────────────────

  useEffect(() => {
    marked.setOptions({ breaks: true });
  }, []);

  // ── 预览 HTML 生成 ────────────────────────────────────────────────────
  // marked.parse() 将 Markdown 编译为 HTML
  // DOMPurify.sanitize() 净化 HTML 防止 XSS（即使内容来自本地也做安全处理）
  // useMemo 确保仅在 source 变化时重新计算
  const previewHtml = useMemo(
    () => DOMPurify.sanitize(marked.parse(source) as string),
    [source],
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
      <div ref={containerRef} className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
        {/* Monaco Editor panel */}
        <div
          className="overflow-hidden"
          style={{
            flex: isPreviewMode ? undefined : 1,
            width: isPreviewMode ? `${splitRatio * 100}%` : "100%",
            minWidth: isPreviewMode ? "120px" : undefined,
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            editorRef.current?.focus();
            setCtxMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          <Editor
            height="100%"
            language="markdown"
            theme={getMonacoTheme(isDark)}
            value={source}
            onChange={(value) => onSourceChange(value ?? "")}
            onMount={handleEditorMount}
            beforeMount={handleBeforeMount}
            options={{
              fontSize: 13,
              contextmenu: false,
              fontFamily: fontStack,
              lineHeight: 22,
              padding: { top: 8, bottom: 8 },
              minimap: { enabled: false },
              lineNumbers: "on",
              renderLineHighlight: "line",
              occurrencesHighlight: "off",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              automaticLayout: true,
              tabSize: 2,
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              overviewRulerBorder: false,
              scrollbar: {
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
              },
            }}
          />
        </div>

        {/* Preview panel */}
        {isPreviewMode && (
          <>
            <div
              className="flex-shrink-0 cursor-col-resize md-splitter"
              style={{ width: 2 }}
              onMouseDown={handleSplitterMouseDown}
            />

            <div
              ref={previewRef}
              className="overflow-y-auto"
              onScroll={handlePreviewScroll}
              style={{
                flex: 1,
                minWidth: "120px",
                background: "var(--bg-root)",
              }}
            >
              <div
                className="markdown-preview"
                style={{
                  padding: "8px 2rem",
                  maxWidth: 800,
                  lineHeight: "22px",
                  fontSize: 13,
                  color: "var(--text-primary)",
                }}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </>
        )}
      </div>

      {/* 自定义右键菜单: 使用统一的 ctx-menu 样式 */}
      {ctxMenu && createPortal(
        <div
          className="ctx-menu animate-in"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="ctx-item" onClick={() => {
            const ed = editorRef.current;
            if (!ed) return;
            ed.focus();
            ed.trigger("keyboard", "editor.action.clipboardCutAction");
            setCtxMenu(null);
          }}>
            <span className="ctx-item-label">剪切</span>
            <span className="ctx-item-shortcut">Ctrl+X</span>
          </button>
          <button className="ctx-item" onClick={() => {
            const ed = editorRef.current;
            if (!ed) return;
            ed.focus();
            ed.trigger("keyboard", "editor.action.clipboardCopyAction");
            setCtxMenu(null);
          }}>
            <span className="ctx-item-label">复制</span>
            <span className="ctx-item-shortcut">Ctrl+C</span>
          </button>
          <button className="ctx-item" onClick={async (e) => {
            e.stopPropagation();
            const ed = editorRef.current;
            setCtxMenu(null);
            if (!ed) return;
            ed.focus();
            let text = "";
            try { text = await navigator.clipboard.readText(); } catch {}
            if (!text) {
              const api = (window as any).electronAPI;
              text = typeof api?.clipboardRead === "function" ? api.clipboardRead() : "";
            }
            if (text) {
              const sel = ed.getSelection();
              if (sel) {
                ed.executeEdits("clipboard-paste", [
                  { range: sel, text, forceMoveMarkers: true },
                ], () => [{ groupId: undefined }]);
                // 把光标挪到粘贴文本末尾
                const endPos = ed.getModel()!.modifyPosition(
                  sel.getStartPosition(), text.length,
                );
                ed.setPosition(endPos);
              }
            }
          }}>
            <span className="ctx-item-label">粘贴</span>
            <span className="ctx-item-shortcut">Ctrl+V</span>
          </button>
          <button className="ctx-item" onClick={() => {
            const ed = editorRef.current;
            if (!ed) return;
            ed.focus();
            ed.trigger("keyboard", "editor.action.selectAll");
            setCtxMenu(null);
          }}>
            <span className="ctx-item-label">全选</span>
            <span className="ctx-item-shortcut">Ctrl+A</span>
          </button>
          <div className="ctx-separator" />
          <button className="ctx-item" onClick={() => {
            const ed = editorRef.current;
            if (!ed) return;
            ed.focus();
            ed.trigger("keyboard", "undo");
            setCtxMenu(null);
          }}>
            <span className="ctx-item-label">撤销</span>
            <span className="ctx-item-shortcut">Ctrl+Z</span>
          </button>
          <button className="ctx-item" onClick={() => {
            const ed = editorRef.current;
            if (!ed) return;
            ed.focus();
            ed.trigger("keyboard", "redo");
            setCtxMenu(null);
          }}>
            <span className="ctx-item-label">重做</span>
            <span className="ctx-item-shortcut">Ctrl+Shift+Z</span>
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

export default MarkdownEditor;
