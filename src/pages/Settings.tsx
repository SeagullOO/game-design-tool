/**
 * Settings.tsx — 设置页面（模态浮层）
 *
 * 以悬浮模态窗口形式覆盖在当前页面上，通过 onClose 回调关闭。
 *
 * 设置项分四个标签页：通用 / 外观 / 存储 / 关于
 * 所有设置保存在 localStorage (key: gull_settings)，语言偏好保存在 gull_lang。
 *
 * 性能优化：
 * - 移除了 backdrop-filter: blur() — 大尺寸毛玻璃导致 GPU 持续重绘
 * - React.memo 防止父组件 re-render 触发无意义渲染
 * - useMemo 缓存 navItems 避免每帧重建 SVG
 */

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { t, getLang, setLang } from "../i18n";
import type { Lang } from "../i18n";
import { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, ZOOM_DEFAULT } from "../config";
import PanelLayout from "../components/PanelLayout";
import { SettingsGearIcon, MonitorIcon, StorageCubeIcon, InfoCircleIcon } from "../components/icons";

const STORAGE_KEY = "gull_settings";

interface SettingsData {
  theme: "dark" | "light" | "system";
  zoom: number;
}

function loadSettings(): SettingsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        theme: ["dark", "light", "system"].includes(parsed.theme) ? parsed.theme : "dark",
        zoom: typeof parsed.zoom === "number" && parsed.zoom >= ZOOM_MIN && parsed.zoom <= ZOOM_MAX ? parsed.zoom : ZOOM_DEFAULT,
      };
    }
  } catch {}
  return { theme: "dark", zoom: ZOOM_DEFAULT };
}

function saveSettings(s: SettingsData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function applyThemeClass(theme: string): void {
  if (theme === "light") document.documentElement.classList.add("light");
  else if (theme === "dark") document.documentElement.classList.remove("light");
  else document.documentElement.classList.toggle("light", !window.matchMedia("(prefers-color-scheme: dark)").matches);
}

function getStoragePath(): string {
  return typeof window !== "undefined" && "electronAPI" in window
    ? ""
    : "浏览器 IndexedDB";
}

// ── ZoomInput ─────────────────────────────────────────────────────────────────

const ZoomInput = memo(function ZoomInput({ value, onChange, lang }: { value: number; onChange: (v: number) => void; lang: Lang }) {
  const [editing, setEditing] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; v: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const clamp = (v: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v / ZOOM_STEP) * ZOOM_STEP));

  useEffect(() => {
    if (!dragStart) return;
    const mm = (e: MouseEvent) => onChange(clamp(dragStart.v + (e.clientX - dragStart.x)));
    const mu = () => setDragStart(null);
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    return () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
    };
  }, [dragStart, onChange]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number" min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditing(false); }}
        className="stg-zoom-input"
      />
    );
  }

  return (
    <span
      className="stg-zoom-value"
      onMouseDown={(e) => setDragStart({ x: e.clientX, v: value })}
      onClick={() => {
        if (!dragStart || Math.abs(value - (dragStart.v || 0)) < 5) setEditing(true);
        setDragStart(null);
      }}
      title={t("stgDragTip", lang)}
    >
      {value}%
    </span>
  );
});

// ── Settings 主组件 ───────────────────────────────────────────────────────────

const Settings = memo(function Settings({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<SettingsData>(loadSettings);
  const [storagePath, setStoragePath] = useState<string>(getStoragePath);
  const [activeNav, setActiveNav] = useState<string>("stgGeneral");
  // 异步获取 Electron 真实存储路径
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.getDataPath) {
      api.getDataPath().then((p: string) => setStoragePath(p));
    }
  }, []);
  const [lang, setLangState] = useState<Lang>(getLang);
  const isElectron = typeof window !== "undefined" && "electronAPI" in window;
  const api = (window as any).electronAPI;

  // ── 自动更新状态 ──────────────────────────────────────────────────────
  type UpdateStatus =
    | "idle"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateVersion, setUpdateVersion] = useState("");
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateError, setUpdateError] = useState("");

  useEffect(() => {
    if (!api?.onUpdateStatus) return;
    const cleanup = api.onUpdateStatus((status: string, data?: any) => {
      switch (status) {
        case "checking": setUpdateStatus("checking"); break;
        case "available": setUpdateStatus("available"); setUpdateVersion(data || ""); break;
        case "not-available": setUpdateStatus("not-available"); break;
        case "progress": setUpdateStatus("downloading"); setUpdateProgress(data || 0); break;
        case "downloaded": setUpdateStatus("downloaded"); break;
        case "error": setUpdateStatus("error"); setUpdateError(data || ""); break;
      }
    });
    return cleanup;
  }, [api]);

  const handleCheckUpdate = useCallback(async () => {
    if (!api?.checkForUpdates) return;
    setUpdateStatus("checking");
    setUpdateError("");
    const result = await api.checkForUpdates();
    if (result?.dev) { setUpdateStatus("not-available"); }
    else if (result?.error) { setUpdateStatus("error"); setUpdateError(result.error); }
  }, [api]);

  const handleDownloadUpdate = useCallback(async () => {
    if (!api?.downloadUpdate) return;
    setUpdateStatus("downloading");
    const result = await api.downloadUpdate();
    if (result?.error) { setUpdateStatus("error"); setUpdateError(result.error); }
  }, [api]);

  const handleInstallUpdate = useCallback(() => {
    api?.installUpdate?.();
  }, [api]);

  const persistAndApply = useCallback((next: SettingsData) => {
    setSettings(next);
    saveSettings(next);
    applyThemeClass(next.theme);
    (window as any).__applyZoom?.(next.zoom);
  }, []);

  useEffect(() => { applyThemeClass(settings.theme); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** 切换语言：更新模块级状态 + 强制整个应用重渲染 */
  const switchLang = useCallback((l: Lang) => {
    setLang(l);
    setLangState(l);
    (window as any).__applyLang?.(l);
  }, []);

  const navItems = useMemo(() => [
    { key: "stgGeneral",     icon: <SettingsGearIcon /> },
    { key: "stgAppearance",  icon: <MonitorIcon /> },
    { key: "stgStorage",     icon: <StorageCubeIcon /> },
    { key: "stgAbout",       icon: <InfoCircleIcon /> },
  ], []);

  const sidebar = (
    <aside className="stg-sidebar" style={{ height: "100%", borderRadius: 0 }}>
      <div className="stg-sidebar-header">{t("stgSettings", lang)}</div>
      <nav className="stg-sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.key}
            className={`stg-nav-btn${activeNav === item.key ? " active" : ""}`}
            onClick={() => setActiveNav(item.key)}
          >
            {item.icon}
            {t(item.key, lang)}
          </button>
        ))}
      </nav>
      <div className="stg-sidebar-footer">v1.0.0</div>
    </aside>
  );

  return (
    <PanelLayout onClose={onClose} sidebar={sidebar}>
          {activeNav === "stgGeneral" && (
            <>
              <div>
                <h1 className="stg-section-title">{t("stgGeneral", lang)}</h1>
                <p className="stg-section-desc">{t("stgGeneralDesc", lang)}</p>
              </div>
              <div className="stg-card">
                <div className="stg-card-header">{t("stgLanguageRegion", lang)}</div>
                <div className="stg-row">
                  <div className="stg-info">
                    <div className="stg-label">{t("stgUiLanguage", lang)}</div>
                    <div className="stg-hint">{t("stgUiLanguageDesc", lang)}</div>
                  </div>
                  <div className="stg-control">
                    <div className="stg-btn-group">
                      {(["zh", "en"] as Lang[]).map((v) => (
                        <button
                          key={v}
                          className={`stg-btn-group-btn${lang === v ? " active" : ""}`}
                          onClick={() => switchLang(v)}
                        >
                          {t(v, lang)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeNav === "stgAppearance" && (
            <>
              <div>
                <h1 className="stg-section-title">{t("stgAppearance", lang)}</h1>
                <p className="stg-section-desc">{t("stgAppearanceDesc", lang)}</p>
              </div>
              <div className="stg-card">
                <div className="stg-card-header">{t("stgTheme", lang)}</div>
                <div className="stg-row">
                  <div className="stg-info">
                    <div className="stg-label">{t("stgColorTheme", lang)}</div>
                    <div className="stg-hint">{t("stgColorThemeDesc", lang)}</div>
                  </div>
                  <div className="stg-control">
                    <div className="stg-btn-group">
                      {(["dark", "light", "system"] as const).map((v) => (
                        <button
                          key={v}
                          className={`stg-btn-group-btn${settings.theme === v ? " active" : ""}`}
                          onClick={() => persistAndApply({ ...settings, theme: v })}
                        >
                          {t(`stg${v.charAt(0).toUpperCase() + v.slice(1)}` as any, lang)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeNav === "stgStorage" && (
            <>
              <div>
                <h1 className="stg-section-title">{t("stgStorage", lang)}</h1>
                <p className="stg-section-desc">{t("stgStorageDesc", lang)}</p>
              </div>
              <div className="stg-card">
                <div className="stg-card-header">{t("stgStorageLocation", lang)}</div>
                <div className="stg-row">
                  <div className="stg-info">
                    <div className="stg-label">{t("stgStoragePathLabel", lang)}</div>
                    <div className="stg-hint" style={{
                      maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }} title={storagePath || undefined}>
                      {storagePath || (isElectron ? "加载中..." : "浏览器 IndexedDB")}
                    </div>
                  </div>
                  <div className="stg-control" style={{ display: "flex", gap: 6 }}>
                    {isElectron && (
                      <button className="stg-btn" onClick={async () => {
                        const api = (window as any).electronAPI;
                        if (api?.selectStoragePath) {
                          const p = await api.selectStoragePath();
                          if (p) { setStoragePath(p); alert(lang === "zh" ? `已更改为: ${p}` : `Changed to: ${p}`); }
                        }
                      }}>
                        {lang === "zh" ? "更改" : "Change"}
                      </button>
                    )}
                    {!isElectron && (
                      <span style={{ fontSize: 12, color: "var(--stg-muted)" }}>{storagePath}</span>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeNav === "stgAbout" && (
            <>
              <div>
                <h1 className="stg-section-title">{t("stgAbout", lang)}</h1>
                <p className="stg-section-desc">{t("stgAboutDesc", lang)}</p>
              </div>
              <div className="stg-card">
                <div className="stg-version-block" style={{ flexDirection: "column", gap: 12, alignItems: "stretch" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div className="stg-app-name">Gull</div>
                      <div className="stg-meta">
                        版本 1.0.0 (build 2406.22)<br />
                        React 18 · Vite 5 · Electron 42<br />
                        © 2026
                      </div>
                    </div>
                    {updateStatus === "idle" && (
                      <button className="stg-btn primary" onClick={handleCheckUpdate}>
                        {t("stgCheckUpdate", lang)}
                      </button>
                    )}
                    {updateStatus === "checking" && (
                      <button className="stg-btn primary" disabled style={{ opacity: 0.7 }}>
                        {lang === "zh" ? "检查中..." : "Checking..."}
                      </button>
                    )}
                    {updateStatus === "available" && (
                      <button className="stg-btn primary" onClick={handleDownloadUpdate}>
                        {lang === "zh" ? `下载 v${updateVersion}` : `Download v${updateVersion}`}
                      </button>
                    )}
                    {updateStatus === "downloading" && (
                      <button className="stg-btn primary" disabled style={{ opacity: 0.7 }}>
                        {updateProgress}%
                      </button>
                    )}
                    {updateStatus === "downloaded" && (
                      <button className="stg-btn primary" onClick={handleInstallUpdate}>
                        {lang === "zh" ? "重启安装" : "Restart to Install"}
                      </button>
                    )}
                    {updateStatus === "not-available" && (
                      <button className="stg-btn" disabled style={{ opacity: 0.6 }}>
                        {lang === "zh" ? "已是最新" : "Up to date"}
                      </button>
                    )}
                    {updateStatus === "error" && (
                      <div style={{ textAlign: "right" }}>
                        <button className="stg-btn" onClick={handleCheckUpdate}
                          style={{ color: "var(--danger)", borderColor: "var(--danger)" }}>
                          {lang === "zh" ? "重试" : "Retry"}
                        </button>
                        <div className="stg-meta" style={{ marginTop: 4, maxWidth: 180 }}>
                          {updateError}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* 下载进度条 */}
                  {updateStatus === "downloading" && (
                    <div style={{ height: 4, background: "var(--stg-border)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${updateProgress}%`, background: "var(--stg-accent)", borderRadius: 2, transition: "width 0.3s ease" }} />
                    </div>
                  )}
                </div>
              </div>
              <div className="stg-card">
                <div className="stg-card-header">{t("stgLicenses", lang)}</div>
                <div className="stg-row">
                  <div className="stg-info">
                    <div className="stg-label">{t("stgOpenSourceLicenses", lang)}</div>
                    <div className="stg-hint">{t("stgOpenSourceLicensesDesc", lang)}</div>
                  </div>
                  <div className="stg-control">
                    <button className="stg-btn">{t("view", lang)}</button>
                  </div>
                </div>
              </div>
            </>
          )}
    </PanelLayout>
  );
});

export default Settings;
