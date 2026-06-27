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
import { createPortal } from "react-dom";
import { t, getLang, setLang } from "../i18n";
import type { Lang } from "../i18n";
import { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, ZOOM_DEFAULT, MD_FONT_DEFAULT } from "../config";
import PanelLayout from "../components/PanelLayout";
import { SettingsGearIcon, MonitorIcon, StorageCubeIcon, InfoCircleIcon } from "../components/icons";

const STORAGE_KEY = "gull_settings";

interface SettingsData {
  theme: "dark" | "light" | "system";
  zoom: number;
  mdFontFamily: string;
}

function loadSettings(): SettingsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        theme: ["dark", "light", "system"].includes(parsed.theme) ? parsed.theme : "dark",
        zoom: typeof parsed.zoom === "number" && parsed.zoom >= ZOOM_MIN && parsed.zoom <= ZOOM_MAX ? parsed.zoom : ZOOM_DEFAULT,
        mdFontFamily: typeof parsed.mdFontFamily === "string" && parsed.mdFontFamily ? parsed.mdFontFamily : MD_FONT_DEFAULT,
      };
    }
  } catch {}
  return { theme: "dark", zoom: ZOOM_DEFAULT, mdFontFamily: MD_FONT_DEFAULT };
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
  const [fontList, setFontList] = useState<string[]>([]);
  const [fontListLoading, setFontListLoading] = useState(false);
  const [fontDropdownOpen, setFontDropdownOpen] = useState(false);
  const fontBtnRef = useRef<HTMLButtonElement>(null);
  const [fontHistory, setFontHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("gull_font_history");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const isElectron = typeof window !== "undefined" && "electronAPI" in window;
  const api = (window as any).electronAPI;

  /** Save font to history and persist */
  const addToFontHistory = useCallback((font: string) => {
    setFontHistory(prev => {
      const next = [font, ...prev.filter(f => f !== font)].slice(0, 20);
      localStorage.setItem("gull_font_history", JSON.stringify(next));
      return next;
    });
  }, []);

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

  // 打开外观标签页时加载系统字体列表
  useEffect(() => {
    if (activeNav !== "stgAppearance") return;
    if (fontList.length > 0) return;
    setFontListLoading(true);
    const api = (window as any).electronAPI;
    if (api?.getSystemFonts) {
      api.getSystemFonts().then((fonts: string[]) => {
        const filtered = fonts.filter((f: string) => f !== MD_FONT_DEFAULT);
        setFontList(filtered);
        setFontListLoading(false);
      }).catch(() => {
        setFontListLoading(false);
      });
    } else {
      setFontListLoading(false);
    }
  }, [activeNav, fontList.length]);

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
      <div className="stg-sidebar-footer">v1.0.4</div>
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
              {/* 编辑器字体 */}
              <div className="stg-card">
                <div className="stg-card-header">{t("stgEditorFont", lang)}</div>
                <div className="stg-row">
                  <div className="stg-info">
                    <div className="stg-label">{t("stgFontFamily", lang)}</div>
                    <div className="stg-hint">{t("stgFontFamilyDesc", lang)}</div>
                  </div>
                  <div className="stg-control">
                    <button
                      ref={fontBtnRef}
                      className="stg-select-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFontDropdownOpen((prev) => !prev);
                      }}
                    >
                      <span className="stg-select-btn-label">{settings.mdFontFamily}</span>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{ flexShrink: 0, opacity: 0.5 }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {/* Font dropdown — Portal 到 body，使用统一的 ctx-menu 样式 */}
                    {fontDropdownOpen && fontBtnRef.current && createPortal(
                      <div className="ctx-menu animate-in" style={{
                        position: "fixed",
                        zIndex: 99999,
                        top: fontBtnRef.current.getBoundingClientRect().bottom + 4,
                        left: fontBtnRef.current.getBoundingClientRect().left,
                        minWidth: Math.max(fontBtnRef.current.getBoundingClientRect().width, 200),
                        maxHeight: 320,
                        overflowY: "auto",
                      }}>
                        {/* 内置默认字体 */}
                        <button
                          className={`ctx-item${settings.mdFontFamily === MD_FONT_DEFAULT ? " ctx-item-active" : ""}`}
                          onClick={() => {
                            setFontDropdownOpen(false);
                            const next = { ...settings, mdFontFamily: MD_FONT_DEFAULT };
                            setSettings(next);
                            saveSettings(next);
                            (window as any).__applyMdFont?.(MD_FONT_DEFAULT);
                            addToFontHistory(MD_FONT_DEFAULT);
                          }}
                        >
                          <span className="ctx-item-label">{MD_FONT_DEFAULT} ({t("stgDefault", lang)})</span>
                        </button>

                        {/* ── 系统字体列表 ── */}
                        {fontListLoading ? (
                          <div className="ctx-item" style={{ color: "var(--text-tertiary)", cursor: "default" }}>
                            <span className="ctx-item-label">{t("stgLoadingFonts", lang)}</span>
                          </div>
                        ) : (
                          fontList.map((f) => (
                            <button
                              key={f}
                              className={`ctx-item${settings.mdFontFamily === f ? " ctx-item-active" : ""}`}
                              onClick={() => {
                                setFontDropdownOpen(false);
                                const next = { ...settings, mdFontFamily: f };
                                setSettings(next);
                                saveSettings(next);
                                (window as any).__applyMdFont?.(f);
                                addToFontHistory(f);
                              }}
                            >
                              <span className="ctx-item-label">{f}</span>
                            </button>
                          ))
                        )}

                        {/* ── 选择其他字体按钮 ── */}
                        <div className="ctx-separator" />
                        <button
                          className="ctx-item"
                          onClick={async () => {
                            if (!api?.selectFont) return;
                            // 不先关闭下拉，等文件对话框返回后再关闭
                            const result = await api.selectFont();
                            setFontDropdownOpen(false);
                            if (!result || result.error) return;
                            // 注入 @font-face
                            const fontUrl = `app://./fonts/${encodeURIComponent(result.filename)}`;
                            const styleId = `_gull_font_${result.filename.replace(/[^a-zA-Z0-9]/g, "_")}`;
                            const existing = document.getElementById(styleId);
                            if (!existing) {
                              const style = document.createElement("style");
                              style.id = styleId;
                              const fmt = result.filename.endsWith(".woff2") ? "woff2" : result.filename.endsWith(".woff") ? "woff" : result.filename.endsWith(".otf") ? "opentype" : "truetype";
                              style.textContent = `@font-face{font-family:"${result.displayName}";src:url("${fontUrl}") format("${fmt}");}`;
                              document.head.appendChild(style);
                            }
                            const fontKey = result.displayName;
                            // 立即应用
                            const next = { ...settings, mdFontFamily: fontKey };
                            setSettings(next);
                            saveSettings(next);
                            (window as any).__applyMdFont?.(fontKey);
                            addToFontHistory(fontKey);
                          }}
                        >
                          <span className="ctx-item-label">{t("stgSelectOtherFont", lang)}</span>
                        </button>
                      </div>,
                      document.body,
                    )}
                    {/* Click-away 透明遮罩 */}
                    {fontDropdownOpen && (
                      <div
                        style={{ position: "fixed", inset: 0, zIndex: 99998 }}
                        onClick={() => setFontDropdownOpen(false)}
                        onContextMenu={(e) => { e.preventDefault(); setFontDropdownOpen(false); }}
                      />
                    )}
                  </div>
                </div>
                {/* 字体预览 */}
                <div className="stg-row">
                  <div
                    style={{
                      fontFamily: `"${settings.mdFontFamily}", monospace`,
                      fontSize: 14,
                      color: "var(--text-primary)",
                      padding: "8px 0",
                      lineHeight: 0.8,
                    }}
                  >
                    {t("stgFontPreview", lang)}
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
                      <div className="stg-app-name">GullDoc</div>
                      <div className="stg-meta">
                        版本 1.0.4 (build 2406.28)<br />
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
