import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { storageLoadFolders } from "../storage";
import type { Folder, FolderFile } from "../types";
import { t, getLang } from "../i18n";
import { KEYBINDINGS } from "../config";
import { useModalAnimation } from "../hooks/useModalAnimation";

/**
 * GlobalSearchModal — 全局文件搜索弹窗（模仿 VS Code Ctrl+P 文件搜索）
 *
 * 【角色】在任意页面通过快捷方式打开的全屏半透明模态弹窗。
 *         搜索所有文件夹内的所有文件（名称匹配），支持键盘导航（上下箭头 + Enter + Escape）。
 *         选中文件后直接 navigate 到对应文件夹并打开文件。
 *
 * 【视觉布局】fixed inset-0 全屏遮罩（45% 不透明黑色背景），flex 居中。
 *           - 遮罩层：flex alignItems: flex-start justifyContent: center, paddingTop: 15vh
 *             （弹窗偏上而非垂直居中，模仿 VS Code 的 Command Palette 视觉位置）
 *           - 弹窗卡片：width 560px, maxHeight 60vh, flex flex-col overflow-hidden
 *             * 搜索框：padding + 搜索图标 SVG + input-ide（autoFocus）
 *             * 搜索结果列表：flex-1 overflow-y-auto, padding: 4px 0
 *             * 每个结果：flex 行（类型标签 MD/XLS + 文件名 + 文件夹名）
 *
 * 【交互链】
 *   - 输入搜索词 → setQuery → useEffect 过滤所有文件夹的所有文件
 *   - 键盘 ArrowDown/ArrowUp → selectedIdx 上下移动 → 视觉高亮（bg-hover）
 *   - 键盘 Enter → 选中当前高亮结果 → navigate(/folder/:id?file=:fileId) + onClose
 *   - 键盘 Escape → onClose
 *   - 点击遮罩背景 → onClose
 *   - 点击弹窗内部 → e.stopPropagation() 阻止冒泡关闭
 *
 * 【设计决策】
 *   - 弹窗偏上而非居中：15vh 的 paddingTop 使弹窗位于视口上方 15% 处
 *     模拟 VS Code / macOS Spotlight 的搜索体验
 *   - 宽度 560px：足够显示"文件名 + 文件夹名"而不过宽
 *   - 搜索结果不分组（全局扁平列表），通过类型标签区分 MD/XLS
 *   - 每次打开时重新加载文件夹数据（storageLoadFolders），确保数据最新
 *   - selectedIdx 同时被键盘和鼠标 hover 管理（onMouseEnter/Leave 同步高亮）
 */

interface GlobalSearchModalProps {
  open: boolean;
  onClose: () => void;
}

interface SearchResult {
  folder: Folder;
  file: FolderFile;
}

function GlobalSearchModal({ open, onClose }: GlobalSearchModalProps) {
  const lang = getLang();
  const { visible, closing, close } = useModalAnimation(open, onClose);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // 弹窗打开时：加载所有文件夹数据，重置搜索词和选中索引
  useEffect(() => {
    if (open) {
      storageLoadFolders().then(setAllFolders);
      setQuery("");
      setSelectedIdx(0);
    }
  }, [open]);

  // 搜索过滤：遍历所有文件夹的所有文件，按名称大小写不敏感匹配
  // 每次查询变化都重置 selectedIdx 到 0
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSelectedIdx(0);
      return;
    }
    const q = query.toLowerCase();
    const found: SearchResult[] = [];
    for (const folder of allFolders) {
      for (const file of folder.files) {
        if (file.name.toLowerCase().includes(q)) {
          found.push({ folder, file });
        }
      }
    }
    setResults(found);
    setSelectedIdx(0);
  }, [query, allFolders]);

  const handleSelect = (result: SearchResult) => {
    navigate(`/folder/${result.folder.id}?file=${result.file.id}`);
    close();
  };

  // 键盘导航：ArrowUp/ArrowDown 移动高亮索引，Enter 选中，Escape 关闭
  // preventDefault 阻止 ArrowUp/Down 导致输入框光标移动
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === KEYBINDINGS.closePanel.key) {
      close();
    } else if (e.key === KEYBINDINGS.searchNext.key) {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === KEYBINDINGS.searchPrev.key) {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === KEYBINDINGS.searchOpen.key && results[selectedIdx]) {
      handleSelect(results[selectedIdx]);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === KEYBINDINGS.closePanel.key) close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close]);

  if (!visible && !open) return null;

  return (
    <div
      className={closing ? "modal-overlay-out" : "modal-overlay-in"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
      }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={closing ? "animate-out" : "animate-in"}
        style={{
          width: 560,
          maxHeight: "60vh",
          background: "var(--bg-panel)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-m)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Search input */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: "var(--text-tertiary)" }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              autoFocus
              type="text"
              placeholder={t("searchAllFiles", lang)}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="input-ide pl-9 pr-3 py-2"
              style={{ fontSize: 14 }}
            />
          </div>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {!query.trim() && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              {t("typeToSearch", lang)}
            </div>
          )}
          {query.trim() && results.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              {t("noMatchingFile", lang)}
            </div>
          )}
          {results.map((r, i) => (
            <div
              key={`${r.folder.id}-${r.file.id}`}
              onClick={() => handleSelect(r)}
              style={{
                padding: "8px 16px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: i === selectedIdx ? "var(--bg-hover)" : "transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (i !== selectedIdx) e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: r.file.type === "md" ? "var(--accent-text)" : r.file.type === "docx" ? "var(--text-secondary)" : "var(--success)",
                  background: "var(--bg-active)",
                  borderRadius: 3,
                  padding: "1px 4px",
                  flexShrink: 0,
                }}
              >
                {r.file.type === "md" ? "MD" : r.file.type === "docx" ? "DOCX" : "XLSX"}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-primary)",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {r.file.name}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", flexShrink: 0 }}>
                {r.folder.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default GlobalSearchModal;
