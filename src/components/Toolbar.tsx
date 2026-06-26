/**
 * Toolbar.tsx — 所有编辑器工具栏的共享基类组件
 *
 * 面向对象思想：三个工具栏（Markdown / Word / Excel）都"继承"此基类的
 * 同一属性——不可缩放容器、按钮大小、间距、分隔线。
 *
 * 使用方式：
 *   import { ToolbarContainer, ToolbarButton, ToolbarDivider } from "./Toolbar";
 *
 * 职责：
 *   - ToolbarContainer:  统一外部容器（flex 布局、背景、底边线），
 *                         始终渲染在 zoom 容器外部
 *   - ToolbarButton:     统一按钮大小、hover/active/颜色过渡，
 *                         支持 active 态高亮和 forwardRef
 *   - ToolbarDivider:    统一 1px 竖线分隔符
 *
 * 视觉规范（与 config.ts TOOLBAR_* 常量 + index.css .tool-btn/.divider 同步）：
 *   - 容器: flex-wrap, gap: 2px, 内边距: px-3 py-1.5, 高度: ~36px
 *   - 按钮: min-width: 26px, height: 26px, padding: 2px 6px, font-size: 12px, border-radius: 3px
 *   - hover: background var(--bg-hover), color var(--text-primary)
 *   - active: color var(--accent)
 *   - 分隔线: 1px × 20px, margin: 0 2px, background var(--border-subtle)
 */

import React from "react";
import {
  TOOLBAR_PADDING, TOOLBAR_GAP,
  COLOR_BORDER, COLOR_BG_PANEL,
} from "../config";

// ═══════════════════════════════════════════════════════════════════════════
// ToolbarContainer — 统一的外部容器
// ═══════════════════════════════════════════════════════════════════════════

interface ToolbarContainerProps {
  children: React.ReactNode;
  /** 额外的 className（如需要 sticky top-0 等） */
  className?: string;
}

export function ToolbarContainer({ children, className = "" }: ToolbarContainerProps) {
  return (
    <div
      className={`flex items-center ${TOOLBAR_GAP} ${TOOLBAR_PADDING} flex-shrink-0 flex-wrap ${className}`}
      style={{ background: COLOR_BG_PANEL, borderBottom: `1px solid ${COLOR_BORDER}` }}
    >
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ToolbarButton — 统一的工具栏按钮
// ═══════════════════════════════════════════════════════════════════════════

interface ToolbarButtonProps {
  children: React.ReactNode;
  /** 是否为激活/按下状态（添加 .active class，文字变强调色） */
  active?: boolean;
  title?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** 阻止 focus 转移（Tiptap 编辑器需用 onMouseDown preventDefault 保持焦点） */
  onMouseDown?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** 额外的内联样式（如 fontStyle: "italic"） */
  style?: React.CSSProperties;
  /** 额外的 class */
  className?: string;
  type?: "button" | "submit";
}

export const ToolbarButton = React.forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  function ToolbarButton(
    { children, active = false, title, onClick, onMouseDown, style, className = "", type = "button" },
    ref,
  ) {
    const activeClass = active ? " active" : "";
    return (
      <button
        ref={ref}
        type={type}
        className={`tool-btn${activeClass} ${className}`.trim()}
        title={title}
        onClick={onClick}
        onMouseDown={onMouseDown}
        style={style}
      >
        {children}
      </button>
    );
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// ToolbarDivider — 统一的分隔竖线
// ═══════════════════════════════════════════════════════════════════════════

export function ToolbarDivider() {
  return <div className="divider" />;
}
