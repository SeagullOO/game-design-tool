import { useState, useEffect, useCallback, useRef } from "react";

const ANIM_DURATION = 150; // ms — 与 animate-in/out 的 animation-duration 一致

/**
 * useModalAnimation — 模态弹窗打开/关闭动画 hook
 *
 * 用法：
 *   const { visible, closing, close } = useModalAnimation(open, onClose);
 *
 *   if (!visible && !open) return null;  // 完全关闭后卸载
 *
 *   const cardClass = closing ? "animate-out" : "animate-in";
 *   const overlayClass = closing ? "modal-overlay-out" : "modal-overlay-in";
 *
 *   return createPortal(
 *     <div className={overlayClass} onClick={close}>
 *       <div className={cardClass} onClick={e => e.stopPropagation()}>
 *         ...
 *         <button onClick={close}>Cancel</button>
 *       </div>
 *     </div>,
 *     document.body
 *   );
 */
export function useModalAnimation(open: boolean, onClose: () => void) {
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // open → true 时重置 closing，设为 visible
  // open → false 时触发关闭动画（父组件直接关闭，不经由 close()）
  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
    } else if (visible) {
      setClosing(true);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setClosing(false);
      }, ANIM_DURATION);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => {
    setClosing(true);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setClosing(false);
      onClose();
    }, ANIM_DURATION);
  }, [onClose]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { visible, closing, close };
}
