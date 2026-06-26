import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { t, getLang } from "../i18n";
import { TITLE_BAR_HEIGHT, TITLE_BAR_PADDING_LEFT, TITLE_BAR_PADDING_RIGHT, TITLE_BAR_BUTTON_GAP, TITLE_BAR_TITLE_FONT_SIZE, TITLE_BAR_TITLE_PADDING_X, TITLE_BAR_MENU_MIN_WIDTH, TITLE_BAR_MENU_OFFSET, TITLE_BAR_ICON_SIZE, TITLE_BAR_CLOSE_ICON_SIZE } from "../config";
import { GearIcon, FolderIcon, SidebarIcon, SearchIcon, MinimizeIcon, MaximizeIcon, RestoreIcon, CloseIcon } from "./icons";

/**
 * TitleBar — 应用顶层标题栏（模仿 VS Code 风格的自定义窗口栏）
 *
 * 【角色】充当整个应用的窗口装饰（window chrome），替代原生 Electron 标题栏。
 *         同时汇总文件操作、侧边栏切换、全局搜索等核心入口。
 *
 * 【视觉布局】固定高度 30px 的 flex 水平行（flex-shrink: 0）。
 *           - 左侧：设置按钮 | 文件下拉菜单 | 侧边栏开关 | 搜索按钮（gap: 2px）
 *           - 中央：当前文件名（flex: 1，文本居中，超出省略）
 *           - 右侧：最小化 / 最大化 / 关闭 三颗窗口控制按钮
 *           整条 bar 设置 WebkitAppRegion: "drag" 使其可拖拽移动窗口，
 *           但内部按钮容器设置 WebkitAppRegion: "no-drag" 以确保按钮可点击。
 *
 * 【交互链】
 *   - onToggleSidebar → AppContent → 控制 Sidebar 显隐
 *   - onSearch → AppContent → 打开 GlobalSearchModal
 *   - 文件菜单通过 createPortal 渲染到 document.body，使用 click-away 透明遮罩关闭
 *   - 窗口控制按钮通过 Electron API (window.electronAPI) 操作原生窗口
 *
 * 【设计决策】
 *   - 自定义标题栏而非原生：统一 Obsidian 暗黑主题，完全控制拖拽区域和菜单
 *   - 文件下拉菜单使用 Portal + fixed 定位：避免被父容器 overflow/clip 裁剪
 *   - 菜单顶部偏移 buttonRect.bottom + 4px：4px 间距与原生菜单体验一致
 *   - click-away 遮罩 z-index: 999，略低于菜单本体，确保先捕获点击再关闭
 */
interface TitleBarProps {
  onToggleSidebar: () => void;
  onSearch: () => void;
  onOpenSettings: () => void;
  sidebarOpen?: boolean;
  activeFileName?: string;
}

function TitleBar({ onToggleSidebar, onSearch, onOpenSettings, sidebarOpen = true, activeFileName }: TitleBarProps) {
  const lang = getLang();
  const api = (window as any).electronAPI;
  const [isMaximized, setIsMaximized] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuBtnRef = useRef<HTMLButtonElement>(null);

  // 监听 Electron 主进程发来的最大化状态变化（Windows snap/maximize 事件）
  useEffect(() => {
    if (api?.onMaximizeChange) {
      api.onMaximizeChange((max: boolean) => setIsMaximized(max));
    }
    // 组件挂载时查询初始最大化状态，确保图标正确
    if (api?.send) {
      api.send("window-query-max");
    }
  }, [api]);

  const handleMinimize = () => api?.windowMinimize?.();
  const handleMaximize = () => api?.windowMaximize?.();
  const handleClose = () => api?.windowClose?.();

  return (
    <div
      style={{
        height: TITLE_BAR_HEIGHT,
        display: "flex",
        alignItems: "center",
        background: "var(--bg-panel)",
        borderBottom: "1px solid var(--border-subtle)",
        WebkitAppRegion: "drag",
        userSelect: "none",
        flexShrink: 0,
        paddingLeft: TITLE_BAR_PADDING_LEFT,
        paddingRight: TITLE_BAR_PADDING_RIGHT,
      }}
    >
      {/* Left: settings + sidebar toggle + search */}
      <div style={{ display: "flex", alignItems: "center", gap: TITLE_BAR_BUTTON_GAP, WebkitAppRegion: "no-drag" }}>
        <button
          onClick={onOpenSettings}
          title={t("settings", lang)}
          className="win-btn"
        >
          <GearIcon width={TITLE_BAR_ICON_SIZE} height={TITLE_BAR_ICON_SIZE} />
        </button>
        <button
          ref={fileMenuBtnRef}
          onClick={() => setFileMenuOpen((prev) => !prev)}
          title={t("fileMenu", lang)}
          className="win-btn"
        >
          <FolderIcon width={TITLE_BAR_ICON_SIZE} height={TITLE_BAR_ICON_SIZE} />
        </button>
        {/* 文件 dropdown menu: 通过 Portal 渲染到 document.body，避免被父容器裁剪 */}
        {fileMenuOpen && fileMenuBtnRef.current && createPortal(
          <div
            className="context-menu animate-in"
            style={{
              position: "fixed",
              top: fileMenuBtnRef.current.getBoundingClientRect().bottom + TITLE_BAR_MENU_OFFSET,
              left: fileMenuBtnRef.current.getBoundingClientRect().left,
              minWidth: TITLE_BAR_MENU_MIN_WIDTH,
            }}
          >
            <button className="context-menu-item" onClick={() => {
              setFileMenuOpen(false);
              const fn = (window as any).__saveFile;
              if (fn) fn();
            }}>
              {t("save", lang)}
            </button>
            <button className="context-menu-item" onClick={() => {
              setFileMenuOpen(false);
              const fn = (window as any).__saveAs;
              if (fn) fn();
            }}>
              {t("saveAs", lang)}
            </button>
            <div className="context-menu-divider" />
            <button className="context-menu-item" onClick={() => {
              setFileMenuOpen(false);
              const fn = (window as any).__moveWorkspace;
              if (fn) fn();
            }}>
              {t("moveWorkspace", lang)}
            </button>
          </div>,
          document.body, // Portal 目标：挂载到 body 以突破所有 overflow/z-index 限制
        )}
        {/* Click-away 透明遮罩：点击菜单外部任意位置关闭菜单 z-index 略低于菜单本身 */}
        {fileMenuOpen && (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
            onClick={() => setFileMenuOpen(false)}
          />
        )}
        <button
          onClick={onToggleSidebar}
          title={sidebarOpen ? t("toggleSidebar", lang) : t("expandSidebar", lang)}
          className="win-btn"
        >
          <SidebarIcon width={TITLE_BAR_ICON_SIZE} height={TITLE_BAR_ICON_SIZE} />
        </button>
        <button
          onClick={onSearch}
          title={t("search", lang)}
          className="win-btn"
        >
          <SearchIcon width={TITLE_BAR_ICON_SIZE} height={TITLE_BAR_ICON_SIZE} />
        </button>
      </div>

      {/* 中央：当前活动文件名显示区，同时也是窗口拖拽区（WebkitAppRegion: "drag" 继承自父容器） */}
      <div
        style={{
          flex: 1,
          textAlign: "center",
          fontSize: TITLE_BAR_TITLE_FONT_SIZE,
          color: "var(--text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          padding: `0 ${TITLE_BAR_TITLE_PADDING_X}px`,
        }}
      >
        {activeFileName || ""}
      </div>

      {/* Right: window controls */}
      <div style={{ display: "flex", alignItems: "center", WebkitAppRegion: "no-drag" }}>
        <button
          onClick={handleMinimize}
          className="win-btn win-ctrl"
          title={t("minimize", lang)}
        >
          <MinimizeIcon width={TITLE_BAR_ICON_SIZE} height={TITLE_BAR_ICON_SIZE} />
        </button>
        <button
          onClick={handleMaximize}
          className="win-btn win-ctrl"
          title={isMaximized ? t("restore", lang) : t("maximize", lang)}
        >
          {/* 根据最大化状态切换图标：最大化时显示还原图标（双矩形），否则显示最大化图标（单矩形） */}
          {isMaximized ? <RestoreIcon width={TITLE_BAR_ICON_SIZE} height={TITLE_BAR_ICON_SIZE} /> : <MaximizeIcon width={TITLE_BAR_ICON_SIZE} height={TITLE_BAR_ICON_SIZE} />}
        </button>
        <button
          onClick={handleClose}
          className="win-btn win-ctrl win-btn-close"
          title={t("close", lang)}
        >
          <CloseIcon width={TITLE_BAR_CLOSE_ICON_SIZE} height={TITLE_BAR_CLOSE_ICON_SIZE} />
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
