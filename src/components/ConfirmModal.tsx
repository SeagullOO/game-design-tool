/**
 * ConfirmModal.tsx — 统一确认弹窗
 *
 * 继承软件 ctx-menu 风格（ctx-item / ctx-menu 样式类），
 * 用于替换浏览器原生 confirm() 弹窗。
 *
 * 用法：
 *   <ConfirmModal
 *     open={deleteConfirmOpen}
 *     message="确定删除？"
 *     confirmLabel="删除"
 *     danger
 *     onConfirm={() => { ... }}
 *     onClose={() => setDeleteConfirmOpen(false)}
 *   />
 */

import { createPortal } from "react-dom";
import { useModalAnimation } from "../hooks/useModalAnimation";
import { t, getLang } from "../i18n";

interface ConfirmModalProps {
  open: boolean;
  /** 确认消息文字 */
  message: string;
  /** 确认按钮文字（默认"确定"） */
  confirmLabel?: string;
  /** 取消按钮文字（默认"取消"） */
  cancelLabel?: string;
  /** 是否为危险操作（确认按钮变红） */
  danger?: boolean;
  /** 用户点击确认 */
  onConfirm: () => void;
  /** 关闭弹窗 */
  onClose: () => void;
}

function ConfirmModal({
  open,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const lang = getLang();
  const { visible, closing, close } = useModalAnimation(open, onClose);

  if (!visible && !open) return null;

  const handleConfirm = () => {
    onConfirm();
    close();
  };

  const confirmText = confirmLabel ?? t("confirm", lang);
  const cancelText = cancelLabel ?? t("cancel", lang);

  return createPortal(
    <div
      className={`fixed inset-0 flex items-center justify-center ${closing ? "modal-overlay-out" : "modal-overlay-in"}`}
      style={{
        zIndex: 99998,
        background: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
      }}
      onClick={close}
    >
      <div
        className={`overflow-hidden ${closing ? "animate-out" : "animate-in"}`}
        style={{
          width: 320,
          background: "var(--bg-panel)",
          border: "1px solid var(--border-medium)",
          borderRadius: "var(--radius-m)",
          boxShadow: "0 6px 18px rgba(0, 0, 0, 0.4), 0 1px 6px rgba(0, 0, 0, 0.3)",
          backdropFilter: "blur(10px) saturate(1.1)",
          WebkitBackdropFilter: "blur(10px) saturate(1.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 消息区 */}
        <div className="px-5 py-4">
          <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6 }}>
            {message}
          </p>
        </div>

        {/* 按钮区 — ctx-item 风格 */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 6,
            padding: "8px 12px",
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          <button
            onClick={close}
            className="ctx-item"
            style={{ width: "auto", padding: "4px 14px", fontSize: 12 }}
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`ctx-item${danger ? " ctx-danger" : ""}`}
            style={{ width: "auto", padding: "4px 14px", fontSize: 12 }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ConfirmModal;
