import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { Folder } from "../types";
import { t, getLang } from "../i18n";
import Panel from "./Panel";

/**
 * Sidebar — 首页侧边栏：文件夹列表与搜索筛选
 *
 * 【角色】在首页视图 (/ 路由) 显示所有工作区文件夹的列表。
 *         支持搜索筛选、选择/双击进入、右键菜单（重命名/复制/删除）、行内重命名。
 *
 * 【视觉布局】基于 Panel 通用面板骨架（240px flex 列）。
 *           - 标题区：px-4 pt-5 pb-3，显示"Gull"和"文件夹工作区"副标题
 *           - 搜索框：px-3 pb-2，带 SVG 搜索图标的 input-ide
 *           - 文件夹列表：Panel body 内，每个条目为 side-item（hover 显文件数）
 *           - 底部操作：Panel footer 内 "管理模版 →" 链接
 *           列表内没有选中项时显示空状态（搜索匹配无结果 / 暂无文件夹）
 *
 * 【交互链】
 *   - onSelectFolder → AppContent → 设置 selectedId
 *   - onDoubleClick → AppContent → navigate(/folder/:id) 进入工作区
 *   - onRename/onDelete/onCopy → AppContent → storage 层操作
 *   - 右键菜单通过 createPortal 渲染到 document.body
 *
 * 【设计决策】
 *   - 上下文菜单使用 Portal + fixed 定位：避免被 overflow-y: auto 的列表容器裁剪
 *   - 重命名使用内联 <input> 取代内容：避免弹窗打断交互流
 *   - menuJustOpened ref 技巧：防止右键菜单在同一个 click 事件中被关闭
 *     流程：右键时设 menuJustOpened=true → 菜单出现 → setTimeout(0) 重置为 false
 *     此期间 document click handler 看到标记为 true 则跳过关闭，避免"右键打开又被立即关闭"
 *   - 时间格式化 formatTime：相对于当前时间的"X 分钟前/X 小时前/X 天前"中文格式
 */
interface SidebarProps {
  folders: Folder[];
  selectedId: number | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectFolder: (id: number) => void;
  onDoubleClick: (id: number) => void;
  onCreateNew: () => void;
  onCreateFromTemplate: () => void;
  onRename: (id: number, newName: string) => void;
  onDelete: (id: number) => void;
  onCopy: (id: number) => void;
  onDeselectAll?: () => void;
}

function Sidebar({
  folders,
  selectedId,
  searchQuery,
  onSearchChange,
  onSelectFolder,
  onDoubleClick,
  onCreateNew,
  onCreateFromTemplate,
  onRename,
  onDelete,
  onCopy,
  onDeselectAll,
}: SidebarProps) {
  const lang = getLang();
  const navigate = useNavigate();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    folderId: number;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  // 标记右键菜单"刚刚打开"：阻止同一次 click 事件中菜单被 document handler 关闭
  // 工作流程：右键 → menuJustOpened=true → 菜单打开 → setTimeout(0) 重置 → 后续 click 正常关闭
  const menuJustOpened = useRef(false);

  // 重命名模式下自动聚焦输入框并全选文本
  useEffect(() => {
    if (renamingId !== null && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuJustOpened.current) return;
      if ((e.target as HTMLElement).closest('.ctx-menu')) return;
      setContextMenu(null);
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleContextMenu = (e: React.MouseEvent, folderId: number) => {
    e.preventDefault();
    e.stopPropagation();
    menuJustOpened.current = true;
    setContextMenu({ x: e.clientX, y: e.clientY, folderId });
    setTimeout(() => { menuJustOpened.current = false; }, 0);
  };

  const handleRenameStart = (folder: Folder) => {
    setRenamingId(folder.id!);
    setRenameValue(folder.name);
    setContextMenu(null);
  };

  const handleRenameSubmit = (id: number) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      onRename(id, trimmed);
    }
    setRenamingId(null);
  };

  const formatTime = (timestamp: number): string => {
    const d = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);

    if (diffMin < 1) return t("justNow", lang);
    if (diffMin < 60) return diffMin + t("minutesAgo", lang);
    if (diffHour < 24) return diffHour + t("hoursAgo", lang);
    if (diffHour < 168) return Math.floor(diffHour / 24) + t("daysAgo", lang);
    return d.toLocaleDateString("zh-CN", {
      month: "short",
      day: "numeric",
    });
  };

  const header = (
    <>
      {/* Title area */}
      <div className="px-4 pt-5 pb-3">
        <div>
          <h1
            className="text-[15px] font-semibold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {t("appTitle", lang)}
          </h1>
          <p
            className="text-[10px] mt-0.5"
            style={{ color: "var(--text-tertiary)" }}
          >
            {t("folderWorkspace", lang)}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
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
            type="text"
            placeholder={t("searchFolders", lang)}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input-ide pl-8 pr-3 py-1.5 text-[12px]"
          />
        </div>
      </div>
    </>
  );

  return (
    <Panel header={header}>
      {/* Folder list wrapper: h-full ensures clicks on empty space below list are captured */}
      <div className="h-full"
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest('.side-item')) onDeselectAll?.();
        }}>
        <div className="px-2 py-1 space-y-0.5">
        {filteredFolders.length === 0 ? (
          <div className="text-center py-12 px-4">
            {searchQuery ? (
              <>
                <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                  {t("noMatches", lang)}「{searchQuery}」
                </p>
                <button
                  onClick={() => onSearchChange("")}
                  className="side-link mt-2 text-xs"
                  style={{ color: "var(--accent-text)" }}
                >
                  {t("clearSearch", lang)}
                </button>
              </>
            ) : (
              <>
                <div className="text-3xl mb-3 opacity-20">+</div>
                <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                  {t("noFolders", lang)}
                </p>
                <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                  {t("createFirstFolder", lang)}
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            {filteredFolders.map((folder) => (
              <div
                key={folder.id}
                onClick={(e) => { e.stopPropagation(); if (folder.id != null) onSelectFolder(folder.id); }}
                onDoubleClick={(e) => { e.stopPropagation(); if (folder.id != null) onDoubleClick(folder.id); }}
                onContextMenu={(e) => { e.stopPropagation(); if (folder.id != null) handleContextMenu(e, folder.id); }}
                className={`side-item group px-3 py-2 mx-0.5 cursor-pointer transition-colors duration-100 relative${selectedId != null && selectedId === folder.id ? " active" : ""}`}
                style={{
                  borderRadius: "var(--radius)",
                  color: selectedId != null && selectedId === folder.id ? "var(--accent-text)" : "var(--text-secondary)",
                }}
              >
                {selectedId != null && selectedId === folder.id && (
                  <span
                    style={{
                      position: "absolute", left: 0, top: 2, bottom: 2,
                      width: 2, background: "var(--accent)", borderRadius: 1,
                    }}
                  />
                )}
                {/* 行内重命名模式：用 input 替换文件夹名，Enter 提交 / Escape 取消 / onBlur 提交 */}
                {renamingId === folder.id ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRenameSubmit(folder.id!)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSubmit(folder.id!);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-2 py-0.5 text-[13px] border rounded outline-none"
                    style={{
                      borderColor: "var(--accent)", background: "var(--bg-surface)",
                      color: "var(--text-primary)",
                    }}
                  />
                ) : (
                  <>
                    <div className="flex items-center gap-2.5">
                      <span className="font-medium text-[13px] truncate flex-1">{folder.name}</span>
                      <span
                        className="text-[10px]"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {folder.files.length}{t("filesCount", lang)}
                      </span>
                    </div>
                    <div className="text-[10px] mt-1 ml-0" style={{ color: "var(--text-tertiary)" }}>
                      {formatTime(folder.updatedAt)}
                    </div>
                  </>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {/* 右键上下文菜单: 通过 Portal 渲染到 document.body，避免被 overflow 裁剪 */}
      {contextMenu && createPortal(
        <div
          className="ctx-menu animate-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const folder = folders.find((f) => f.id === contextMenu.folderId);
              if (folder) handleRenameStart(folder);
            }}
            className="ctx-item"
          >
            <span className="ctx-item-label">{t("rename", lang)}</span>
            <span className="ctx-item-shortcut">F2</span>
          </button>
          <button
            onClick={() => { onCopy(contextMenu.folderId); setContextMenu(null); }}
            className="ctx-item"
          >
            <span className="ctx-item-label">{t("copy", lang)}</span>
          </button>
          <div className="ctx-separator" />
          <button
            onClick={() => { onDelete(contextMenu.folderId); setContextMenu(null); }}
            className="ctx-item ctx-danger"
          >
            <span className="ctx-item-label">{t("delete", lang)}</span>
            <span className="ctx-item-shortcut">Del</span>
          </button>
        </div>,
        document.body
      )}
      </div>
    </Panel>
  );
}

export default Sidebar;
