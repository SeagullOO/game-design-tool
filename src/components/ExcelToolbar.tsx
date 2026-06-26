import { useState, useEffect, useCallback, useRef } from "react";
import { t, getLang } from "../i18n";
import { ToolbarContainer, ToolbarButton, ToolbarDivider } from "./Toolbar";
import { pushMetaUndo, type MetaCellSnapshot } from "../hooks/useMetaUndo";
import DropPanel from "./DropPanel";
import CustomColorPicker from "./CustomColorPicker";

/**
 * ExcelToolbar — Handsontable 电子表格格式工具栏
 *
 * 【角色】为 Handsontable 实例提供类 Excel 的格式编辑工具栏。
 *         支持：撤销/重做、字号下拉、加粗/斜体/下划线、字体颜色/背景色选择（含 HSV 自定义取色器）。
 *         通过 Handsontable API (setCellMeta + render) 批量应用格式到多单元格选区。
 *
 * 【视觉布局】flex 水平行（flex-wrap，gap: 0.5），px-3 py-1.5（约 36px 高度）。
 *           按钮分组：撤销重做 | 分隔 | 字号下拉 | 分隔 | B I U | 分隔 | 字体颜色 | 背景颜色。
 *           所有弹出面板通过 DropPanel (Portal 组件) 渲染到 document.body，
 *           确保不受 workspace zoom 容器（transform: scale）的影响。
 *
 * 【架构 - DropPanel（通用 Portal 弹出面板）】
 *   - 独立组件 src/components/DropPanel.tsx
 *   - 根据 triggerRef 的 getBoundingClientRect() 动态计算 fixed 定位
 *   - 偏移: top = rect.bottom + 4px, left = rect.left
 *   - z-index: 99999，确保在所有 UI 层之上
 *   - data-color-panel 属性标记，供 click-away handler 排除判断
 *
 * 【架构 - renderColorGrid（颜色选择网格）】
 *   - 主题色 THEME_COLORS: 2 行 x 7 列
 *   - 标准色 STANDARD_COLORS: 2 行 x 7 列
 *   - 最近使用 recentColors: 1 行 x 7 列（不含选中标记）
 *   - 底部"更多颜色"按钮 → 打开 CustomColorPicker 组件
 *   - 每个色块 18x18px，hover 放大 scale(1.12)，选中状态蓝色边框 + 白色勾号
 *   - 白色色块 (#FFFFFF) 特殊处理：灰色边框避免在白色背景上"隐形"
 *
 * 【架构 - CustomColorPicker（HSV 自定义取色器）】
 *   - 独立组件 src/components/CustomColorPicker.tsx
 *   - 色谱条 (Hue): 水平渐变（hsl 0→360），可拖拽选择色相
 *   - SV 面板 (Saturation/Value): 双渐变，可拖拽选择饱和度和亮度
 *   - HEX 输入框 + 颜色预览 + 应用按钮
 *   - 拖拽通过 ref 绕过闭包陷阱，document 级事件绑定
 *   - 面板关闭：透明遮罩层捕获外部点击
 *
 * 【架构 - applyToSelection（格式应用）】
 *   - 先通过 pushMetaUndo 保存当前选区所有单元格的 meta 快照（支持撤销）
 *   - 批量 setCellMeta(row, col, key, valueOrFn) 应用格式
 *   - 最后 hot.render() 刷新显示
 *
 * 【交互链】
 *   - 格式按钮 → applyToSelection(key, valueOrFn) → 批量修改 Handsontable meta
 *   - onUndo/onRedo → 父组件 (FolderWorkspace) → useMetaUndo hook
 *   - 颜色选择 → handleFontColor/handleBgColor → pushRecent(hex) 更新最近使用
 *   - DropPanel click-away → mousedown document handler 关闭（排除自定义颜色子面板）
 *   - CustomColorPicker: 独立 click-away 遮罩 + data-color-panel 标记排除
 */
interface ExcelToolbarProps {
  hot: any;
  onUndo?: () => void;
  onRedo?: () => void;
}

// 可选的字体大小列表（像素值），参考 Excel 标准字号
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36];

// ── 颜色预设：主题色 2 行 × 7 列 ──────────────────────────────────────
const THEME_COLORS = [
  "#E1EAFF", "#4E83FD", "#3370FF", "#D5F6F2", "#00D6B9", "#04B49C", "#ECE2FE",
  "#7F3BF5", "#6425D0", "#FDE1E1", "#F76964", "#F54A45", "#E8F7E0", "#34C724",
];

const STANDARD_COLORS = [
  "#C00000", "#FF0000", "#FFC000", "#FFFF00", "#92D050", "#00B050", "#00B0F0",
  "#0070C0", "#002060", "#7030A0", "#FFFFFF", "#D6D6D6", "#ADADAD", "#808080",
];

const MAX_RECENT = 7;

// ── 组件主体 ──────────────────────────────────────────────────────────────

function ExcelToolbar({ hot, onUndo, onRedo }: ExcelToolbarProps) {
  const lang = getLang();
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  const [fontColorOpen, setFontColorOpen] = useState(false);
  const [bgColorOpen, setBgColorOpen] = useState(false);
  const [currentFontColor, setCurrentFontColor] = useState("#dadada");
  const [currentBgColor, setCurrentBgColor] = useState("transparent");
  const [currentBold, setCurrentBold] = useState(false);
  const [currentItalic, setCurrentItalic] = useState(false);
  const [recentColors, setRecentColors] = useState<string[]>([
    "#3370FF", "#F54A45", "#34C724", "#FAD355", "#7F3BF5", "#00D6B9", "#4E83FD",
  ]);
  // CustomColorPicker control state
  const [customPanelOpen, setCustomPanelOpen] = useState(false);
  const [customColorType, setCustomColorType] = useState<"font" | "bg" | null>(null);
  const [customColorPanelRect, setCustomColorPanelRect] = useState<DOMRect | null>(null);
  const [customInitialHex, setCustomInitialHex] = useState("#3370FF");

  // Close all dropdowns on outside click
  useEffect(() => {
    if (!fontSizeOpen && !fontColorOpen && !bgColorOpen) return;
    const handler = (e: MouseEvent) => {
      // Don't close if clicking inside a portal dropdown or sub-panel
      const target = e.target as HTMLElement;
      if (target.closest("[data-color-panel]")) return;
      setFontSizeOpen(false);
      setFontColorOpen(false);
      setBgColorOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [fontSizeOpen, fontColorOpen, bgColorOpen]);

  // Track selection to update format indicators
  const updateFromSelection = useCallback(() => {
    if (!hot || hot.isDestroyed) return;
    const selected = hot.getSelected();
    if (!selected || selected.length === 0) return;
    const [r1, c1] = selected[0];
    if (r1 < 0 || c1 < 0) return; // skip row/col headers
    const meta = hot.getCellMeta(r1, c1);
    setCurrentFontColor(meta._color || "#dadada");
    setCurrentBgColor(meta._bgColor || "transparent");
    setCurrentBold(!!meta._bold);
    setCurrentItalic(!!meta._italic);
  }, [hot]);

  useEffect(() => {
    if (!hot || hot.isDestroyed) return;
    updateFromSelection();
    hot.addHook("afterSelection", updateFromSelection);
    hot.addHook("afterSelectionEnd", updateFromSelection);
    // 监听元数据撤销事件，刷新工具栏按钮状态
    const onMetaUndo = () => updateFromSelection();
    window.addEventListener("gull:meta-undo", onMetaUndo);
    return () => {
      if (hot && !hot.isDestroyed) {
        hot.removeHook("afterSelection", updateFromSelection);
        hot.removeHook("afterSelectionEnd", updateFromSelection);
      }
      window.removeEventListener("gull:meta-undo", onMetaUndo);
    };
  }, [hot, updateFromSelection]);

  // ── 批量应用格式到选区 ──
  // 1. 保存所有选中单元格的 meta 快照到撤销栈（pushMetaUndo）
  // 2. 遍历选区所有单元格，setCellMeta(row, col, key, newVal)
  // 3. valueOrFn 可以是固定值或函数（如 toggle bold/italic）
  // 4. 最后 hot.render() 刷新显示
  const applyToSelection = (key: string, valueOrFn: any | ((current: any) => any)) => {
    if (!hot || hot.isDestroyed) return;
    const selected = hot.getSelected();
    if (!selected || selected.length === 0) return;

    // Save snapshot of all selected cells' metas BEFORE change
    const snapCells: MetaCellSnapshot[] = [];
    for (const range of selected) {
      const [r1, c1, r2, c2] = range;
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          if (r < 0 || c < 0) continue; // skip row/col headers
          const meta = hot.getCellMeta(r, c);
          snapCells.push({
            row: r,
            col: c,
            _color: meta._color,
            _bgColor: meta._bgColor,
            _bold: meta._bold,
            _italic: meta._italic,
            _fontSize: meta._fontSize,
          });
        }
      }
    }
    pushMetaUndo({ cells: snapCells });

    // Apply new values
    for (const range of selected) {
      const [r1, c1, r2, c2] = range;
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          if (r < 0 || c < 0) continue; // skip row/col headers
          const newVal =
            typeof valueOrFn === "function"
              ? valueOrFn(hot.getCellMeta(r, c)[key])
              : valueOrFn;
          hot.setCellMeta(r, c, key, newVal);
          (window as any).__recordFmt?.(r, c, key, newVal);
        }
      }
    }
    hot.render();
    // 格式修改不触发 afterChange，手动触发自动保存
    (window as any).__triggerExcelSave?.();
  };

  const handleBold = () => {
    if (hot && !hot.isDestroyed) {
      const sel = hot.getSelected();
      if (sel && sel.length > 0) {
        applyToSelection("_bold", (cur: boolean) => !cur);
        setCurrentBold((prev) => !prev);
      }
    }
  };

  const handleItalic = () => {
    if (hot && !hot.isDestroyed) {
      const sel = hot.getSelected();
      if (sel && sel.length > 0) {
        applyToSelection("_italic", (cur: boolean) => !cur);
        setCurrentItalic((prev) => !prev);
      }
    }
  };

  const handleUnderline = () => {
    if (hot && !hot.isDestroyed) {
      const sel = hot.getSelected();
      if (sel && sel.length > 0) {
        applyToSelection("_underline", (cur: boolean) => !cur);
        // Append "text-decoration: underline" as inline style via the cell renderer path:
        // Handsontable cell meta alone does not apply decoration; the renderer
        // reads _underline and sets td.style.textDecoration.
        for (const range of sel) {
          const [r1, c1, r2, c2] = range;
          for (let r = r1; r <= r2; r++) {
            for (let c = c1; c <= c2; c++) {
              if (r < 0 || c < 0) continue;
              const meta = hot.getCellMeta(r, c);
              const next = !meta._underline;
              hot.setCellMeta(r, c, "_underline", next);
              (window as any).__recordFmt?.(r, c, "_underline", next);
            }
          }
        }
        hot.render();
        (window as any).__triggerExcelSave?.();
      }
    }
  };

  const handleFontSize = (size: number) => {
    setFontSizeOpen(false);
    applyToSelection("_fontSize", size);
  };

  const handleFontColor = (color: string) => {
    setFontColorOpen(false);
    setCurrentFontColor(color);
    applyToSelection("_color", color);
  };

  const handleClearFontColor = () => {
    setFontColorOpen(false);
    setCurrentFontColor("#dadada");
    applyToSelection("_color", undefined);
  };

  const handleBgColor = (color: string) => {
    setBgColorOpen(false);
    setCurrentBgColor(color);
    applyToSelection("_bgColor", color);
  };

  const handleClearBgColor = () => {
    setBgColorOpen(false);
    setCurrentBgColor("transparent");
    applyToSelection("_bgColor", undefined);
  };

  // ── 自定义颜色取色器 —— 打开 CustomColorPicker ──
  const openCustomColor = (type: "font" | "bg", panelEl: HTMLElement) => {
    const initHex = type === "font" ? currentFontColor : currentBgColor;
    setCustomColorType(type);
    setCustomColorPanelRect(panelEl.getBoundingClientRect());
    setCustomInitialHex(
      initHex && initHex !== "transparent" && initHex !== "#dadada" ? initHex : "#3370FF",
    );
    setCustomPanelOpen(true);
  };

  const applyCustomColor = (hex: string) => {
    pushRecent(hex);
    if (customColorType === "font") {
      setFontColorOpen(false);
      setCurrentFontColor(hex);
      applyToSelection("_color", hex);
    } else if (customColorType === "bg") {
      setBgColorOpen(false);
      setCurrentBgColor(hex);
      applyToSelection("_bgColor", hex);
    }
    setCustomPanelOpen(false);
    setCustomColorType(null);
    setCustomColorPanelRect(null);
  };

  const closeCustomColorPanel = () => {
    setCustomPanelOpen(false);
    setCustomColorType(null);
    setCustomColorPanelRect(null);
  };

  const closeOthers = (which: "fontSize" | "fontColor" | "bgColor") => {
    if (which !== "fontSize") setFontSizeOpen(false);
    if (which !== "fontColor") setFontColorOpen(false);
    if (which !== "bgColor") setBgColorOpen(false);
  };

  // ── Dropdown trigger button refs ──
  const fontSizeBtnRef = useRef<HTMLButtonElement>(null);
  const fontColorBtnRef = useRef<HTMLButtonElement>(null);
  const bgColorBtnRef = useRef<HTMLButtonElement>(null);
  const fontColorPanelRef = useRef<HTMLDivElement>(null);
  const bgColorPanelRef = useRef<HTMLDivElement>(null);

  // ── 添加到最近使用颜色（去重 + 限制最大 7 个） ──
  const pushRecent = (hex: string) => {
    setRecentColors((prev) => [hex, ...prev.filter((c) => c !== hex)].slice(0, MAX_RECENT));
  };

  // ── Color swatch (18px, selected: blue outline ring + checkmark) ──
  const renderColorSwatch = (
    color: string,
    onPick: (c: string) => void,
    selected?: boolean,
  ) => {
    const isWhite = color.toUpperCase() === "#FFFFFF";
    return (
      <div
        key={color}
        onClick={(e) => { e.stopPropagation(); onPick(color); pushRecent(color); }}
        title={color}
        style={{
          width: 18, height: 18,
          background: color,
          borderRadius: 2,
          cursor: "pointer",
          border: selected ? "2px solid #1456F0" : isWhite ? "1px solid var(--border-medium)" : "2px solid transparent",
          outline: selected ? "1px solid #1456F0" : "none",
          outlineOffset: 1,
          transition: "transform 0.1s",
          flexShrink: 0,
          position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.12)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      >
        {selected && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
    );
  };

  // ── Color grid with sections (design spec layout) ──
  const renderColorGrid = (
    currentColor: string,
    onPick: (color: string) => void,
    _onClear: () => void,
    onOpenCustom: () => void,
  ) => (
    <div>
      {/* Theme Colors — 2 rows × 7 */}
      <div style={{ fontSize: 9, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 10px 2px" }}>{t("themeColors", lang)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5, padding: "0 10px 4px", justifyItems: "center" }}>
        {THEME_COLORS.map((c) => renderColorSwatch(c, onPick, currentColor === c))}
      </div>
      <div style={{ height: 1, background: "var(--border-subtle)", margin: "2px 10px" }} />
      {/* Standard Colors — 2 rows × 7 */}
      <div style={{ fontSize: 9, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "4px 10px 2px" }}>{t("standardColors", lang)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5, padding: "0 10px 4px", justifyItems: "center" }}>
        {STANDARD_COLORS.map((c) => renderColorSwatch(c, onPick, currentColor === c))}
      </div>
      <div style={{ height: 1, background: "var(--border-subtle)", margin: "2px 10px" }} />
      {/* Recent Colors — 1 row × 7, no selection highlight */}
      <div style={{ fontSize: 9, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "4px 10px 2px" }}>{t("recentColors", lang)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5, padding: "0 10px 4px", justifyItems: "center" }}>
        {recentColors.map((c) => renderColorSwatch(c, onPick))}
      </div>
      <div style={{ height: 1, background: "var(--border-subtle)", margin: "2px 10px" }} />
      {/* Bottom bar — "更多颜色" link, equal all sides */}
      <div style={{ padding: "4px 6px" }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenCustom(); }}
          style={{
            width: "100%", padding: "4px 0", borderRadius: 3, cursor: "pointer",
            background: "transparent", border: "none",
            color: "var(--text-secondary)", fontSize: 11,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.1s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          {t("moreColors", lang)}
        </button>
      </div>
    </div>
  );

  // ── Undo / Redo SVG icons ──
  const UndoIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );

  const RedoIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );

  return (
    <ToolbarContainer>
      {/* ── Undo ── */}
      <ToolbarButton onClick={onUndo} title={t("undo", lang) + " Ctrl+Z"}>
        {UndoIcon}
      </ToolbarButton>

      {/* ── Redo ── */}
      <ToolbarButton onClick={onRedo} title={t("redo", lang) + " Ctrl+Y"}>
        {RedoIcon}
      </ToolbarButton>

      <ToolbarDivider />

      {/* ── Font size dropdown ── */}
      <div>
        <ToolbarButton
          ref={fontSizeBtnRef}
          onClick={(e) => {
            e.stopPropagation();
            closeOthers("fontSize");
            setFontSizeOpen((prev) => !prev);
          }}
          title={t("fontSize", lang)}
        >
          <span style={{ fontSize: 11, minWidth: 28, textAlign: "center" }}>
            {t("fontSize", lang)}
          </span>
          <svg
            width="8" height="8" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </ToolbarButton>
        <DropPanel triggerRef={fontSizeBtnRef} open={fontSizeOpen}>
          <div style={{ minWidth: 56, maxHeight: 220, overflowY: "auto" }}>
            {FONT_SIZES.map((size) => (
              <div
                key={size}
                onClick={() => handleFontSize(size)}
                className="color-opt"
                style={{
                  padding: "4px 12px",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                {size}px
              </div>
            ))}
          </div>
        </DropPanel>
      </div>

      <ToolbarDivider />

      {/* ── Bold ── */}
      <ToolbarButton
        onClick={handleBold}
        active={currentBold}
        title={t("bold", lang) + " Ctrl+B"}
        style={{ minWidth: 30, fontWeight: 700, fontSize: 13, justifyContent: "center" }}
      >
        B
      </ToolbarButton>

      {/* ── Italic ── */}
      <ToolbarButton
        onClick={handleItalic}
        active={currentItalic}
        title={t("italic", lang) + " Ctrl+I"}
        style={{ minWidth: 30, fontStyle: "italic", fontSize: 13, justifyContent: "center" }}
      >
        I
      </ToolbarButton>

      {/* ── Underline ── */}
      <ToolbarButton
        onClick={handleUnderline}
        title={t("underline", lang) + " Ctrl+U"}
        style={{ minWidth: 30, textDecoration: "underline", fontSize: 13, justifyContent: "center" }}
      >
        U
      </ToolbarButton>

      <ToolbarDivider />

      {/* ── Font color ── */}
      <div>
        <ToolbarButton
          ref={fontColorBtnRef}
          onClick={(e) => {
            e.stopPropagation();
            closeOthers("fontColor");
            setFontColorOpen((prev) => !prev);
          }}
          title={t("fontColor", lang)}
          style={{ flexDirection: "column", gap: 0, padding: "3px 7px", minWidth: 26 }}
        >
          {/* "A" letter in current font color */}
          <span
            style={{
              fontWeight: 700,
              fontSize: 14,
              lineHeight: 1.1,
              color: currentFontColor,
            }}
          >
            A
          </span>
          {/* Color indicator bar */}
          <span
            style={{
              display: "block",
              width: 18,
              height: 3,
              borderRadius: 1,
              background: currentFontColor,
              marginTop: 2,
            }}
          />
        </ToolbarButton>
        <DropPanel triggerRef={fontColorBtnRef} open={fontColorOpen} panelRef={fontColorPanelRef}>
          {renderColorGrid(
            currentFontColor,
            handleFontColor,
            handleClearFontColor,
            () => { if (fontColorPanelRef.current) openCustomColor("font", fontColorPanelRef.current); },
          )}
        </DropPanel>
      </div>

      {/* ── Background color ── */}
      <div>
        <ToolbarButton
          ref={bgColorBtnRef}
          onClick={(e) => {
            e.stopPropagation();
            closeOthers("bgColor");
            setBgColorOpen((prev) => !prev);
          }}
          title={t("bgColor", lang)}
          style={{ flexDirection: "column", gap: 0, padding: "3px 7px", minWidth: 26 }}
        >
          {/* Paint bucket icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z" />
            <path d="m5 2 5 5" />
            <path d="M2 13h15" />
            <path d="M22 20a2 2 0 1 1-4 0c0-1.6 2-3.8 2-3.8s2 2.2 2 3.8Z" />
          </svg>
          {/* Color indicator bar */}
          <span
            style={{
              display: "block",
              width: 18,
              height: 3,
              borderRadius: 1,
              background:
                currentBgColor === "transparent"
                  ? "transparent"
                  : currentBgColor,
              marginTop: 2,
              border:
                currentBgColor === "transparent"
                  ? "1px dashed var(--text-tertiary)"
                  : "none",
            }}
          />
        </ToolbarButton>
        <DropPanel triggerRef={bgColorBtnRef} open={bgColorOpen} panelRef={bgColorPanelRef}>
          {renderColorGrid(
            currentBgColor,
            handleBgColor,
            handleClearBgColor,
            () => { if (bgColorPanelRef.current) openCustomColor("bg", bgColorPanelRef.current); },
          )}
        </DropPanel>
      </div>

      {/* ── CustomColorPicker 子面板 ── */}
      <CustomColorPicker
        open={customPanelOpen && customColorType !== null}
        initialHex={customInitialHex}
        panelRect={customColorPanelRect}
        onApply={applyCustomColor}
        onClose={closeCustomColorPanel}
        lang={lang}
      />
    </ToolbarContainer>
  );
}

export default ExcelToolbar;
