/**
 * @file CustomColorPicker.tsx
 * @description HSV 自定义颜色选择器 — 色谱条 + SV 面板 + HEX 输入 + 预设颜色
 *
 * 通过 Portal 挂载到 document.body。拖拽使用 ref 绕过闭包陷阱，document 级事件绑定
 * 确保鼠标移动流畅。面板关闭使用透明遮罩层捕获外部点击。
 */

import { useState, useRef, useEffect, type FC } from "react";
import { createPortal } from "react-dom";
import type { Lang } from "../i18n";
import { hexToHsv, hsvToHex } from "../utils/colorUtils";
import { t } from "../i18n";
import { KEYBINDINGS } from "../config";

interface CustomColorPickerProps {
  /** 面板是否显示 */
  open: boolean;
  /** 初始颜色值（hex），如 "#3370FF" */
  initialHex: string;
  /** 触发面板的位置信息，用于计算 portals 定位 */
  panelRect: DOMRect | null;
  /** 回调：用户确认选择颜色 */
  onApply: (hex: string) => void;
  /** 回调：关闭面板 */
  onClose: () => void;
  /** 语言标识 */
  lang: Lang;
}

const CustomColorPicker: FC<CustomColorPickerProps> = ({
  open,
  initialHex,
  panelRect,
  onApply,
  onClose,
  lang,
}) => {
  // 当前 HSV 和 HEX 状态
  const [customHue, setCustomHue] = useState(220);
  const [customSat, setCustomSat] = useState(0.85);
  const [customBri, setCustomBri] = useState(0.85);
  const [customHex, setCustomHex] = useState("#3370FF");

  // 拖拽模式标记：null = 不在拖拽, "hue" = 拖拽色谱条, "sv" = 拖拽 SV 面板
  const draggingRef = useRef<"hue" | "sv" | null>(null);
  const spectrumRef = useRef<HTMLDivElement>(null);
  const svPanelRef = useRef<HTMLDivElement>(null);

  // 拖拽期间的真实 HSV 值用 ref 存储，绕过 setState 的闭包陷阱
  const hsvRef = useRef({ h: 220, s: 0.85, v: 0.85 });

  // 同步初始颜色：面板首次打开或 initialHex 变化时初始化 HSV 值
  useEffect(() => {
    if (!open) return;
    if (initialHex && initialHex !== "transparent" && initialHex !== "#dadada") {
      setCustomHex(initialHex);
      const { h, s, v } = hexToHsv(initialHex);
      setCustomHue(h);
      setCustomSat(s);
      setCustomBri(v);
      hsvRef.current = { h, s, v };
    }
  }, [open, initialHex]);

  // 自定义颜色面板的拖拽事件绑定在 document 上（而非面板元素本身）
  useEffect(() => {
    if (!open) return;

    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      if (draggingRef.current === "hue" && spectrumRef.current) {
        const rect = spectrumRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        hsvRef.current.h = Math.round(x * 360);
        setCustomHue(hsvRef.current.h);
        setCustomHex(hsvToHex(hsvRef.current.h, hsvRef.current.s, hsvRef.current.v));
      } else if (draggingRef.current === "sv" && svPanelRef.current) {
        const rect = svPanelRef.current.getBoundingClientRect();
        const sx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const sy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        hsvRef.current.s = sx;
        hsvRef.current.v = 1 - sy;
        setCustomSat(sx);
        setCustomBri(1 - sy);
        setCustomHex(hsvToHex(hsvRef.current.h, sx, 1 - sy));
      }
    };

    const onUp = () => {
      draggingRef.current = null;
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [open]);

  // Simulate hue from hex for spectrum updates
  const updateCustomFromHsv = (h: number, s: number, v: number) => {
    setCustomHue(h);
    setCustomSat(s);
    setCustomBri(v);
    setCustomHex(hsvToHex(h, s, v));
  };

  if (!open) return null;

  return createPortal(
    <>
      {/* 面板主体 */}
      <div
        data-color-panel="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          zIndex: 100000,
          width: 190,
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          padding: "10px 10px 8px",
        }}
        ref={(el) => {
          if (el && panelRect) {
            el.style.top = panelRect.top + "px";
            el.style.left = (panelRect.right + 8) + "px";
          }
        }}
      >
        {/* Spectrum bar (Hue) */}
        <div
          ref={spectrumRef}
          style={{
            width: "100%",
            height: 22,
            borderRadius: 3,
            cursor: "crosshair",
            position: "relative",
            border: "1px solid var(--border-subtle)",
            marginBottom: 6,
            marginTop: 2,
            background:
              "linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))",
          }}
          onMouseDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            updateCustomFromHsv(Math.round(x * 360), customSat, customBri);
            hsvRef.current = { h: Math.round(x * 360), s: customSat, v: customBri };
            draggingRef.current = "hue";
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              width: 14,
              height: 14,
              left: `${(customHue / 360) * 100}%`,
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              border: "2px solid var(--bg-surface)",
              boxShadow: "0 0 0 1.5px var(--text-primary), 0 1px 3px rgba(0,0,0,0.3)",
              zIndex: 2,
              pointerEvents: "none",
            }}
          />
        </div>

        {/* SV panel (Saturation/Value) */}
        <div
          ref={svPanelRef}
          style={{
            width: "100%",
            height: 80,
            borderRadius: 3,
            cursor: "crosshair",
            position: "relative",
            marginBottom: 6,
            overflow: "hidden",
            background: `
              linear-gradient(to top, #000 0%, transparent 100%),
              linear-gradient(to right, #fff 0%, hsl(${customHue}, 100%, 50%) 100%)
            `,
          }}
          onMouseDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            updateCustomFromHsv(customHue, x, 1 - y);
            hsvRef.current = { h: customHue, s: x, v: 1 - y };
            draggingRef.current = "sv";
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 10,
              height: 10,
              border: "2px solid #fff",
              borderRadius: "50%",
              left: `${customSat * 100}%`,
              top: `${(1 - customBri) * 100}%`,
              transform: "translate(-50%, -50%)",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.2), 0 1px 4px rgba(0,0,0,0.3)",
              pointerEvents: "none",
              zIndex: 2,
            }}
          />
        </div>

        {/* Bottom row: hex input + color preview + apply button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 6,
            gap: 6,
          }}
        >
          <input
            value={customHex}
            onChange={(e) => {
              const v = e.target.value;
              setCustomHex(v);
              if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                const { h, s, v: bri } = hexToHsv(v.toUpperCase());
                setCustomHue(h);
                setCustomSat(s);
                setCustomBri(bri);
                hsvRef.current = { h, s, v: bri };
              }
            }}
            onKeyDown={(e) => {
              if (e.key === KEYBINDINGS.confirm.key) {
                const v = customHex;
                if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                  onApply(v.toUpperCase());
                }
              }
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder="#000000"
            maxLength={7}
            style={{
              width: 72,
              fontSize: 11,
              fontFamily: "'Inter', -apple-system, sans-serif",
              fontWeight: 500,
              color: "var(--text-primary)",
              background: "var(--bg-root)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 3,
              padding: "2px 6px",
              outline: "none",
              letterSpacing: "0.03em",
            }}
          />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 3,
                border: "1px solid var(--border-subtle)",
                background: customHex,
              }}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onApply(customHex);
              }}
              style={{
                padding: "3px 10px",
                fontSize: 11,
                borderRadius: 3,
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-hover)",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              {t("apply", lang)}
            </button>
          </div>
        </div>
      </div>

      {/* Click-away overlay — 透明遮罩层，点击外部关闭面板 */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 99999 }}
        onMouseDown={(e) => {
          if (!(e.target as HTMLElement).closest("[data-color-panel]")) {
            onClose();
          }
        }}
      />
    </>,
    document.body,
  );
};

export default CustomColorPicker;
