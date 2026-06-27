/**
 * App.tsx — 应用根组件
 *
 * 职责：
 * 1. 提供 React Router 路由（BrowserRouter）
 * 2. 管理全局状态（侧边栏开关、缩放值、全局搜索模态框开关）
 * 3. 初始化主题和缩放设置（从 localStorage 读取）
 * 4. 提供 ErrorBoundary 错误捕获层
 * 5. 暴露 window.__applyZoom 供 Settings 页面修改 UI 缩放
 *
 * 组件树结构：
 * ```
 * App
 * └── BrowserRouter
 *     └── AppContent  ← 使用 useLocation 的位置感知组件
 *         └── ErrorBoundary
 *             ├── TitleBar
 *             ├── GlobalSearchModal
 *             ├── Routes
 *             │   ├── "/"            → FolderWorkspace
 *             │   └── "/folder/:id"  → FolderWorkspace
 *             └── Settings / TemplateManager（根级别条件渲染，同一套父逻辑）
 * ```
 *
 * 缩放系统初始化流程：
 * - App 启动时从 localStorage (gull_settings) 读取 zoom 和 contentZoom
 * - setZoom/setContentZoom 通过 props 传递给 FolderWorkspace
 * - Settings 页面通过 window.__applyZoom 回调修改 UI 缩放
 *
 * 导出：默认导出 App 组件
 */

import { useState, useEffect, Component } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import FolderWorkspace from "./pages/FolderWorkspace";
import TemplateManager from "./components/TemplateManager";
import { ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT, ZOOM_REFERENCE, CONTENT_ZOOM_MIN, CONTENT_ZOOM_MAX, CONTENT_ZOOM_DEFAULT, MD_FONT_DEFAULT } from "./config";
import Settings from "./pages/Settings";
import TitleBar from "./components/TitleBar";
import GlobalSearchModal from "./components/GlobalSearchModal";
import { t, getLang, setLang } from "./i18n";

// ─── 错误边界 ───────────────────────────────────────────────────────────────
// 捕获 React 渲染树中的未处理异常，防止整个应用白屏。
// 使用 Class 组件是因为 React 目前只支持 Class 组件实现 Error Boundary
// （getDerivedStateFromError / componentDidCatch 没有 Hooks 等价方式）。
class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-darkest)",
            color: "var(--text-primary)",
            padding: 32,
            gap: 16,
          }}
        >
          <div style={{ fontSize: 48, opacity: 0.3 }}>⚠</div>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>应用发生错误</h1>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", maxWidth: 400, textAlign: "center" }}>
            {this.state.error?.message || "未知错误"}
          </p>
          <button
            className="btn-primary"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

type Theme = "dark" | "light" | "system";

/**
 * 应用主题 class 到 document.documentElement
 *
 * - "dark":   移除 .light 类（使用暗色 CSS 变量）
 * - "light":  添加 .light 类（切换为亮色 CSS 变量）
 * - "system": 根据系统 prefers-color-scheme 媒体查询自动切换
 */
function applyThemeClass(theme: Theme): void {
  if (theme === "light") document.documentElement.classList.add("light");
  else if (theme === "dark") document.documentElement.classList.remove("light");
  else document.documentElement.classList.toggle("light", !window.matchMedia("(prefers-color-scheme: dark)").matches);
}

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  /** UI 缩放（影响侧边栏和工具栏），默认 ZOOM_DEFAULT */
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  /** 内容缩放（仅影响编辑区域），默认 100% */
  const [contentZoom, setContentZoom] = useState(100);
  /** Markdown 编辑器字体，从 localStorage 读取，默认 MD_FONT_DEFAULT */
  const [mdFontFamily, setMdFontFamily] = useState<string>(() => {
    try {
      const raw = localStorage.getItem("gull_settings");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.mdFontFamily === "string" && parsed.mdFontFamily) return parsed.mdFontFamily;
      }
    } catch {}
    return MD_FONT_DEFAULT;
  });
  /** 当前界面语言，切换时通过 key 强制重渲染整个应用 */
  const [lang, setLangState] = useState(getLang);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [statusState, setStatusState] = useState<{ fileType?: string; line: number; column: number; selectionCount: number; cellRange?: string }>({ line: 1, column: 1, selectionCount: 0 });

  // ─── 初始化主题和缩放 ────────────────────────────────────────────────
  // 从 localStorage (gull_settings) 读取持久化的设置，应用到状态和 DOM。
  // 同时监听系统主题变化（仅在 theme === "system" 时响应）。
  useEffect(() => {
    let theme: Theme = "dark";
    let z = ZOOM_DEFAULT;
    let cz = CONTENT_ZOOM_DEFAULT;
    try {
      const raw = localStorage.getItem("gull_settings");
      if (raw) {
        const p = JSON.parse(raw);
        if (["dark", "light", "system"].includes(p.theme)) theme = p.theme;
        if (typeof p.zoom === "number" && p.zoom >= ZOOM_MIN && p.zoom <= ZOOM_MAX) z = p.zoom;
        if (typeof p.contentZoom === "number" && p.contentZoom >= CONTENT_ZOOM_MIN && p.contentZoom <= CONTENT_ZOOM_MAX) cz = p.contentZoom;
      }
    } catch {}
    applyThemeClass(theme);
    setZoom(z);
    setContentZoom(cz);
    // 将内容缩放值暴露到全局，供非 React 代码读取
    (window as any).__contentZoom = cz;
    // 在下一帧应用内容缩放，确保 DOM 已渲染
    if (cz !== CONTENT_ZOOM_DEFAULT) {
      requestAnimationFrame(() => {
        const el = document.querySelector("[data-workspace-zoom]") as HTMLElement | null;
        // 补偿父级 UI 缩放，确保编辑器有效缩放 = contentZoom / CONTENT_ZOOM_DEFAULT
        const uiZoomCss = z !== ZOOM_REFERENCE ? z / ZOOM_REFERENCE : 1;
        if (el) (el.style as any).zoom = String((cz / CONTENT_ZOOM_DEFAULT) / uiZoomCss);
      });
    }
    // 缩放由 CSS zoom 统一管理，不通过 Electron setZoomFactor，避免异步时序导致窗口大小不一致
    // 监听系统主题变化（仅 theme === "system" 时触发更新）
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => {
      try {
        const raw = localStorage.getItem("gull_settings");
        if (raw && JSON.parse(raw).theme === "system") applyThemeClass("system");
      } catch {}
    };
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // ─── 暴露缩放设置器供 Settings 页面使用 ──────────────────────────────
  // Settings 页面通过 window.__applyZoom(z) 来修改 UI 缩放，
  // 此 hook 在挂载时注册、卸载时清理。
  useEffect(() => {
    (window as any).__applyZoom = (z: number) => {
      setZoom(z);
      const el = document.querySelector("[data-ui-zoom]") as HTMLElement | null;
      if (el) (el.style as any).zoom = z !== ZOOM_REFERENCE ? String(z / ZOOM_REFERENCE) : "";
    };
    (window as any).__applyLang = (l: string) => { setLang(l as "zh" | "en"); setLangState(l as "zh" | "en"); };
    (window as any).__openTemplateManager = () => setTemplateManagerOpen(true);
    (window as any).__applyMdFont = (f: string) => setMdFontFamily(f);
    return () => {
      (window as any).__applyZoom = undefined;
      (window as any).__applyLang = undefined;
      (window as any).__openTemplateManager = undefined;
      (window as any).__applyMdFont = undefined;
    };
  }, []);

  // 状态栏更新回调：workspace 直接调用
  useEffect(() => {
    (window as any).__updateStatus = (st: any) => setStatusState({ ...st });
    return () => { (window as any).__updateStatus = undefined; };
  }, []);

  const handleOpenSettings = () => setSettingsOpen(true);
  const handleCloseSettings = () => setSettingsOpen(false);

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} key={lang}>
      <AppContent
        sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
        globalSearchOpen={globalSearchOpen} setGlobalSearchOpen={setGlobalSearchOpen}
        zoom={zoom} contentZoom={contentZoom} setZoom={setZoom} setContentZoom={setContentZoom}
        mdFontFamily={mdFontFamily}
        settingsOpen={settingsOpen}
        onOpenSettings={handleOpenSettings}
        onCloseSettings={handleCloseSettings}
        templateManagerOpen={templateManagerOpen}
        onCloseTemplateManager={() => setTemplateManagerOpen(false)}
      />
    </BrowserRouter>
  );
}

/**
 * AppContent — 内容布局组件
 *
 * Settings 通过 state 控制（不改变 URL），以浮层形式覆盖在当前页面之上。
 * 移除 useLocation 依赖 — 不再需要读取路由来判断 Settings 是否打开。
 */
function AppContent({
  sidebarOpen, setSidebarOpen,
  globalSearchOpen, setGlobalSearchOpen,
  zoom, contentZoom, setZoom, setContentZoom,
  mdFontFamily,
  settingsOpen, onOpenSettings, onCloseSettings,
  templateManagerOpen, onCloseTemplateManager,
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  globalSearchOpen: boolean;
  setGlobalSearchOpen: (v: boolean) => void;
  zoom: number;
  contentZoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  setContentZoom: React.Dispatch<React.SetStateAction<number>>;
  mdFontFamily: string;
  settingsOpen: boolean;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  templateManagerOpen: boolean;
  onCloseTemplateManager: () => void;
}) {
  return (
    <ErrorBoundary>
      <div style={{ height: "100%", position: "relative" }}>
        <div className="flex flex-col" style={{ height: "100%", background: "var(--bg-darkest)" }}>
          <TitleBar
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            onSearch={() => setGlobalSearchOpen(true)}
            onOpenSettings={onOpenSettings}
          />
          <GlobalSearchModal open={globalSearchOpen} onClose={() => setGlobalSearchOpen(false)} />
          <div className="flex-1 relative" style={{ overflow: "hidden" }}>
            <Routes>
              <Route path="/" element={<FolderWorkspace sidebarOpen={sidebarOpen} zoom={zoom} contentZoom={contentZoom} setZoom={setZoom} setContentZoom={setContentZoom} mdFontFamily={mdFontFamily} />} />
              <Route path="/folder/:id" element={<FolderWorkspace sidebarOpen={sidebarOpen} zoom={zoom} contentZoom={contentZoom} setZoom={setZoom} setContentZoom={setContentZoom} mdFontFamily={mdFontFamily} />} />

            </Routes>
          </div>
          <div id="global-statusbar" style={{
            height: 22, display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "var(--bg-panel)", borderTop: "1px solid var(--border-subtle)",
            padding: "0 10px", flexShrink: 0, userSelect: "none",
            fontSize: 11, color: "var(--text-tertiary)",
          }} />
        </div>
        {settingsOpen && <Settings onClose={onCloseSettings} />}
        {templateManagerOpen && <TemplateManager onClose={onCloseTemplateManager} />}
      </div>
    </ErrorBoundary>
  );
}

export default App;
