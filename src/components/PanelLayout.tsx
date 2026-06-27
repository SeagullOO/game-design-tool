/**
 * PanelLayout.tsx — 通用面板布局母版
 *
 * Settings 和 TemplateManager 的共享布局框架：
 * - 全屏半透明遮罩（点击关闭）
 * - 居中面板卡片（sidebar + main 双栏）
 * - ✕ 关闭按钮
 * - Escape 键关闭
 *
 * 子组件只需提供 sidebar 和 children，布局和关闭逻辑由此组件统一管理。
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { KEYBINDINGS, PANEL_LAYOUT_WIDTH, PANEL_LAYOUT_HEIGHT, PANEL_LAYOUT_MAX_WIDTH, PANEL_LAYOUT_MIN_WIDTH, PANEL_LAYOUT_MIN_HEIGHT, PANEL_BACKDROP } from "../config";
import { t } from "../i18n";

const ANIM_DURATION = 150; // ms

export interface PanelLayoutProps {
  onClose: () => void;
  /** 侧边栏内容（可选：不传则无侧边栏） */
  sidebar?: React.ReactNode;
  /** 主内容区 */
  children: React.ReactNode;
  /** 面板宽度 (CSS 值) */
  width?: string;
  /** 面板高度 (CSS 值) */
  height?: string;
  /** 面板最大宽度 */
  maxWidth?: number;
  /** 面板最小宽度 */
  minWidth?: number;
  /** 面板最小高度 */
  minHeight?: number;
  /** 遮罩背景色，默认 rgba(0,0,0,0.5) */
  backdrop?: string;
  /** 背景模糊强度 (px)，默认 4 */
  blur?: number;
}

function PanelLayout({
  onClose,
  sidebar,
  children,
  width = PANEL_LAYOUT_WIDTH,
  height = PANEL_LAYOUT_HEIGHT,
  maxWidth = PANEL_LAYOUT_MAX_WIDTH,
  minWidth = PANEL_LAYOUT_MIN_WIDTH,
  minHeight = PANEL_LAYOUT_MIN_HEIGHT,
  backdrop = PANEL_BACKDROP,
  blur = 4,
}: PanelLayoutProps) {
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const close = useCallback(() => {
    setClosing(true);
    timerRef.current = setTimeout(() => {
      onClose();
    }, ANIM_DURATION);
  }, [onClose]);

  // 清理定时器
  useEffect(() => { return () => { if (timerRef.current) clearTimeout(timerRef.current); }; }, []);

  // Escape 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === KEYBINDINGS.closePanel.key) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div
      className={closing ? "modal-overlay-out" : "modal-overlay-in"}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: backdrop,
        ...(blur > 0 ? {
          backdropFilter: `blur(${blur}px)`,
          WebkitBackdropFilter: `blur(${blur}px)`,
        } : {}),
      }}
      onClick={close}
    >
      <div
        className={closing ? "animate-out" : "animate-in"}
        style={{
          display: "flex", width, height,
          maxWidth, minWidth, minHeight,
          borderRadius: "12px", overflow: "hidden",
          background: "var(--stg-bg)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 8px 48px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.03), 0 2px 8px rgba(0, 0, 0, 0.15)",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={close}
          style={{
            position: "absolute", top: 10, right: 10,
            width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
            border: "none", borderRadius: "var(--radius-s)",
            background: "transparent", color: "var(--stg-muted)", cursor: "pointer",
            zIndex: 10, fontSize: 16, lineHeight: 1,
          }}
          title={t("close")}
        >
          ✕
        </button>

        {sidebar}

        <main className="stg-main" style={{ overflow: "auto", height: "100%" }}>
          {children}
        </main>
      </div>
    </div>
  );
}

export default PanelLayout;
