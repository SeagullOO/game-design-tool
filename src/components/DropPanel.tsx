/**
 * @file DropPanel.tsx
 * @description 通用 Portal 弹出面板 — 根据触发按钮 viewport 位置动态计算 fixed 定位
 *
 * 使用 createPortal 挂载到 document.body，逃离 workspace zoom 容器（transform: scale()）的影响。
 * data-color-panel 属性供 click-away handler 识别，避免误关闭。
 */

import { type FC, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

interface DropPanelProps {
  /** 触发按钮的 ref，用于计算面板定位 */
  triggerRef: RefObject<HTMLElement | null>;
  /** 是否显示面板 */
  open: boolean;
  /** 面板内容 */
  children: ReactNode;
  /** 可选的面板容器 ref，供父组件访问面板 DOM 节点 */
  panelRef?: RefObject<HTMLDivElement | null>;
}

const DropPanel: FC<DropPanelProps> = ({ triggerRef, open, children, panelRef }) => {
  if (!open || !triggerRef.current) return null;

  const rect = triggerRef.current.getBoundingClientRect();
  const top = rect.bottom + 4;
  const left = rect.left;

  return createPortal(
    <div
      ref={panelRef}
      data-color-panel="true"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 99999,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        padding: "4px 0",
      }}
    >
      {children}
    </div>,
    document.body,
  );
};

export default DropPanel;
