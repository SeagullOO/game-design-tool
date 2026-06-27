import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { t, getLang } from "../i18n";
import { KEYBINDINGS } from "../config";
import type { Lang } from "../i18n";

/**
 * ContextMenu — Handsontable 电子表格右键上下文菜单
 *
 * 【角色】为 Handsontable 实例提供完整的右键上下文菜单系统，
 *         包括剪贴板操作、行/列/单元格增删、排序、冻结、隐藏、
 *         格式设置（加粗/斜体/字号/字体颜色/背景色）等功能。
 *         支持嵌套子菜单（> 箭头展开右侧二级菜单）和子菜单递归渲染。
 *
 * 【架构概览】
 *   1. MENU_ITEMS — 静态菜单项定义（MenuItem[]），支持 children 嵌套
 *   2. dispatchAction(key) — 命令分发中心，根据 key 执行实际的 Handsontable 操作
 *   3. ContextMenu（主组件）— 渲染一级菜单，管理 activeSubKey 状态
 *   4. SubmenuOverlay（子菜单组件）— 递归渲染次级菜单，自管理定位和关闭
 *
 * 【视觉布局 - 菜单】
 *   - 主菜单：绝对定位（position+left+top），通过 createPortal 挂载到 document.body
 *   - 菜单项：flex 行，左侧标签 + 右侧快捷键/箭头，hover 高亮
 *   - 分隔线：ctx-separator 类（1px 高，左右 margin）
 *   - 子菜单：绝对定位在父菜单项右侧（anchorRect.right + 2px），通过另一层 Portal 的 SubmenuOverlay 渲染
 *
 * 【视觉布局 - 子菜单定位算法】
 *   - 默认：x = anchorRect.right + 2，y = anchorRect.top
 *   - 水平溢出：如果 right + 180 > viewport - 8，翻转到左侧（anchorRect.left - 180 - 2）
 *   - 垂直溢出：如果 bottom > viewport - 8，向上钳制到 viewport - height - 8
 *   - 最小边距：8px 所有方向
 *
 * 【交互链】
 *   - 调用方传入 hot (Handsontable 实例)、visible、position、selection、onClose
 *   - 点击叶子菜单项 → dispatchAction(key, hot, selection) → 操作 Handsontable
 *   - 点击父菜单项 → 无操作（仅展开子菜单）
 *   - Click-outside → onClose → 关闭整个菜单树
 *   - Escape 键 → onClose
 *
 * 【设计决策 - 子菜单递归】
 *   - SubmenuOverlay 内部可以递归渲染更深层的 SubmenuOverlay（当前最多二级）
 *   - 子菜单打开/关闭使用 setTimeout 延迟：
 *     * open: 100ms（快速打开）
 *     * close: 600ms（慢速关闭，给予用户足够的鼠标移动时间）
 *   - 子菜单锚点基于 data-key 属性在 DOM 中查找对应元素，获取 getBoundingClientRect()
 *   - parentTimeoutRef 机制：鼠标进入子菜单时清除父级关闭计时器
 *
 * 【设计决策 - Portal 与 fixed 定位】
 *   - 所有菜单通过 createPortal 挂载到 document.body
 *     原因：菜单必须逃逸所有父容器的 overflow/z-index/transform 限制
 *   - 使用 fixed 定位而非 absolute：相对于 viewport 定位，确保在滚动/嵌套容器中位置正确
 *   - position 由调用方传入（鼠标坐标），组件内部再做 viewport 边界修正
 *
 * 【设计决策 - 选择范围全局存储】
 *   - (window as any).__ctxSelection 存储当前选区
 *   - 子菜单需要访问 selection 进行格式应用
 *   - 使用全局变量而非层层传递 props，简化子菜单 API
 */

// ─── Types ───────────────────────────────────────────────────────────────────

// 存储复制/剪切时选区单元格的格式信息，粘贴时恢复
interface ClipFmt {
  rows: number;
  cols: number;
  cells: Array<{ _color?: string; _bgColor?: string; _bold?: boolean; _italic?: boolean; _fontSize?: number }>;
}

function captureClipFmt(hot: any, r1: number, c1: number, r2: number, c2: number): ClipFmt {
  const cells: ClipFmt["cells"] = [];
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const m = hot.getCellMeta(r, c);
      cells.push({
        _color: m._color, _bgColor: m._bgColor,
        _bold: m._bold, _italic: m._italic, _fontSize: m._fontSize,
      });
    }
  }
  return { rows: r2 - r1 + 1, cols: c2 - c1 + 1, cells };
}

function applyClipFmt(hot: any, r1: number, c1: number, fmt: ClipFmt) {
  for (let ri = 0; ri < fmt.rows; ri++) {
    for (let ci = 0; ci < fmt.cols; ci++) {
      const cell = fmt.cells[ri * fmt.cols + ci];
      if (!cell) continue;
      const r = r1 + ri, c = c1 + ci;
      hot.setCellMeta(r, c, "_color", cell._color);
      hot.setCellMeta(r, c, "_bgColor", cell._bgColor);
      hot.setCellMeta(r, c, "_bold", cell._bold);
      hot.setCellMeta(r, c, "_italic", cell._italic);
      hot.setCellMeta(r, c, "_fontSize", cell._fontSize);
    }
  }
  hot.render();
}

export interface MenuItem {
  key: string;
  name: string;
  shortcut?: string;
  children?: MenuItem[];
}

interface ContextMenuProps {
  hot: any;
  visible: boolean;
  position: { x: number; y: number };
  selection: [number, number, number, number][] | null;
  onClose: () => void;
}

// ─── 命令分发中心 ────────────────────────────────────────────────────────
// 根据菜单项 key 执行对应的 Handsontable 操作
// key 命名约定：
//   ctx_xxx → 上下文菜单独有操作（如 ctx_bold, ctx_fs_14）
//   cut/copy/paste → 标准剪贴板（通过 Handsontable copyPaste 插件或 navigator.clipboard）
//   ctx_fc_#XXXXXX / ctx_bg_#XXXXXX → 颜色操作（key 中嵌入颜色值）
//   ctx_fs_N → 字号操作（key 中嵌入像素值）
// selection 参数：[r1, c1, r2, c2] 四元组，-1 表示行/列头（跳过处理）
function dispatchAction(key: string, hot: any, selection: [number, number, number, number][] | null) {
  if (!hot || hot.isDestroyed || !selection || selection.length === 0) return;
  const sel = selection[0];
  if (!sel) return;
  const [r1, c1, r2, c2] = sel;
  if (r1 < 0 || c1 < 0) return;

  // 保存当前选区所有单元格的 meta 快照，用于撤销操作
  // 在执行格式修改前调用，pushMetaUndo 将快照推入撤销栈
  const saveMetaUndo = () => {
    const snapCells: Array<{ row: number; col: number; _color?: string; _bgColor?: string; _bold?: boolean; _italic?: boolean; _fontSize?: number }> = [];
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const m = hot.getCellMeta(r, c);
        snapCells.push({
          row: r, col: c,
          _color: m._color, _bgColor: m._bgColor,
          _bold: m._bold, _italic: m._italic, _fontSize: m._fontSize,
        });
      }
    }
    try {
      (window as any).__pushMetaUndo?.({ cells: snapCells });
    } catch { /* ignore */ }
  };

  switch (key) {
    case "cut": {
      const cp = hot.getPlugin("copyPaste");
      if (cp) cp.copy();
      (window as any).__gullClipFmt = captureClipFmt(hot, r1, c1, r2, c2);
      hot.emptySelectedCells();
      break;
    }
    case "copy": {
      const cp = hot.getPlugin("copyPaste");
      if (cp) cp.copy();
      (window as any).__gullClipFmt = captureClipFmt(hot, r1, c1, r2, c2);
      break;
    }
    case "paste": {
      // 粘贴已在 onClick 中异步处理（含格式恢复），此处不再处理
      break;
    }
    case "ctx_row_above": hot.alter("insert_row_above", r1, 1); break;
    case "ctx_row_below": hot.alter("insert_row_above", r2 + 1, 1); break;
    case "ctx_col_left": hot.alter("insert_col_start", c1, 1); break;
    case "ctx_col_right": hot.alter("insert_col_start", c2 + 1, 1); break;
    case "remove_row": hot.alter("remove_row", r1, r2 - r1 + 1); break;
    case "remove_col": hot.alter("remove_col", c1, c2 - c1 + 1); break;
    case "ctx_remove_cell_left": saveMetaUndo(); hot.alter("remove_col", c1, c2 - c1 + 1); break;
    case "ctx_remove_cell_up": saveMetaUndo(); hot.alter("remove_row", r1, r2 - r1 + 1); break;
    case "clear_column":
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) hot.setDataAtCell(r, c, "");
      break;
    case "ctx_clear_format":
      saveMetaUndo();
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
        hot.setCellMeta(r, c, "_bold", undefined);
        hot.setCellMeta(r, c, "_italic", undefined);
        hot.setCellMeta(r, c, "_fontSize", undefined);
        hot.setCellMeta(r, c, "_color", undefined);
        hot.setCellMeta(r, c, "_bgColor", undefined);
      }
      hot.render();
      break;
    case "ctx_clear_all":
      saveMetaUndo();
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
        hot.setDataAtCell(r, c, "");
        hot.setCellMeta(r, c, "_bold", undefined);
        hot.setCellMeta(r, c, "_italic", undefined);
        hot.setCellMeta(r, c, "_fontSize", undefined);
        hot.setCellMeta(r, c, "_color", undefined);
        hot.setCellMeta(r, c, "_bgColor", undefined);
      }
      hot.render();
      break;
    case "ctx_sort_asc": {
      const cs = hot.getPlugin("columnSorting");
      if (cs) cs.sort({ column: c1, sortOrder: "asc" });
      break;
    }
    case "ctx_sort_desc": {
      const cs = hot.getPlugin("columnSorting");
      if (cs) cs.sort({ column: c1, sortOrder: "desc" });
      break;
    }
    case "ctx_bold":
      saveMetaUndo();
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
        const cur = hot.getCellMeta(r, c)._bold;
        hot.setCellMeta(r, c, "_bold", !cur);
      }
      hot.render();
      break;
    case "ctx_italic":
      saveMetaUndo();
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
        const cur = hot.getCellMeta(r, c)._italic;
        hot.setCellMeta(r, c, "_italic", !cur);
      }
      hot.render();
      break;
    case "ctx_freeze_row": hot.updateSettings({ fixedRowsTop: r2 + 1 } as any); break;
    case "ctx_freeze_col": hot.updateSettings({ fixedColumnsLeft: c2 + 1 } as any); break;
    case "ctx_unfreeze": hot.updateSettings({ fixedRowsTop: 0, fixedColumnsLeft: 0 } as any); break;
    case "ctx_hide_row": {
      const hr = hot.getPlugin("hiddenRows");
      if (hr) { for (let r = r1; r <= r2; r++) hr.hideRow(r); }
      break;
    }
    case "ctx_hide_col": {
      const hc = hot.getPlugin("hiddenColumns");
      if (hc) { for (let c = c1; c <= c2; c++) hc.hideColumn(c); }
      break;
    }
    case "ctx_show_all": {
      const hr = hot.getPlugin("hiddenRows");
      const hc = hot.getPlugin("hiddenColumns");
      if (hr) hr.showAllRows();
      if (hc) hc.showAllColumns();
      hot.render();
      break;
    }
    default: {
      // 动态命令：通过 key 前缀 + 嵌入值的方式处理可变参数操作（颜色/字号）
      if (key.startsWith("ctx_fs_")) {
        saveMetaUndo();
        const sz = parseInt(key.replace("ctx_fs_", ""), 10);
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) hot.setCellMeta(r, c, "_fontSize", sz);
        hot.render();
      } else if (key.startsWith("ctx_fc_#")) {
        saveMetaUndo();
        const color = key.replace("ctx_fc_", "");
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) hot.setCellMeta(r, c, "_color", color);
        hot.render();
      } else if (key.startsWith("ctx_fc_no")) {
        saveMetaUndo();
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) hot.setCellMeta(r, c, "_color", undefined);
        hot.render();
      } else if (key.startsWith("ctx_bg_#")) {
        saveMetaUndo();
        const color = key.replace("ctx_bg_", "");
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) hot.setCellMeta(r, c, "_bgColor", color);
        hot.render();
      } else if (key.startsWith("ctx_bg_no")) {
        saveMetaUndo();
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) hot.setCellMeta(r, c, "_bgColor", undefined);
      }
    }
  }
}

// ─── Menu item definitions ───────────────────────────────────────────────────

function getMenuItems(lang: Lang): MenuItem[] {
  return [
    { key: "cut", name: t("ctxCut", lang), shortcut: "Ctrl+X" },
    { key: "copy", name: t("ctxCopy", lang), shortcut: "Ctrl+C" },
    { key: "paste", name: t("ctxPaste", lang), shortcut: "Ctrl+V" },
    { key: "sep1", name: "─────────" },
    {
      key: "insert",
      name: t("ctxInsert", lang),
      children: [
        { key: "ctx_row_above", name: t("ctxInsertRowAbove", lang) },
        { key: "ctx_row_below", name: t("ctxInsertRowBelow", lang) },
        { key: "ctx_col_left", name: t("ctxInsertColLeft", lang) },
        { key: "ctx_col_right", name: t("ctxInsertColRight", lang) },
      ],
    },
    {
      key: "delete",
      name: t("ctxDelete", lang),
      children: [
        { key: "remove_row", name: t("ctxDeleteRow", lang) },
        { key: "remove_col", name: t("ctxDeleteCol", lang) },
        { key: "ctx_remove_cell_left", name: t("ctxDeleteCellLeft", lang) },
        { key: "ctx_remove_cell_up", name: t("ctxDeleteCellUp", lang) },
      ],
    },
    {
      key: "clear",
      name: t("ctxClear", lang),
      children: [
        { key: "clear_column", name: t("ctxClearContent", lang), shortcut: "Delete" },
        { key: "ctx_clear_format", name: t("ctxClearFormat", lang) },
        { key: "ctx_clear_all", name: t("ctxClearAll", lang) },
      ],
    },
    { key: "sep2", name: "─────────" },
    { key: "ctx_sort_asc", name: t("ctxSortAsc", lang) },
    { key: "ctx_sort_desc", name: t("ctxSortDesc", lang) },
    { key: "sep3", name: "─────────" },
    {
      key: "freeze",
      name: t("ctxFreeze", lang),
      children: [
        { key: "ctx_freeze_row", name: t("ctxFreezeRow", lang) },
        { key: "ctx_freeze_col", name: t("ctxFreezeCol", lang) },
        { key: "ctx_unfreeze", name: t("ctxUnfreeze", lang) },
      ],
    },
    {
      key: "hide",
      name: t("ctxHide", lang),
      children: [
        { key: "ctx_hide_row", name: t("ctxHideRow", lang) },
        { key: "ctx_hide_col", name: t("ctxHideCol", lang) },
        { key: "ctx_show_all", name: t("ctxShowAll", lang) },
      ],
    },
  ];
}

// ─── 子菜单覆盖层组件（递归渲染）──────────────────────────────────────────
// SubmenuOverlay 渲染一级子菜单，如果子菜单项还有 children，继续递归渲染
// 关键机制：
// 1. anchorRect: 父菜单项在 viewport 中的位置，用于计算子菜单放置位置
// 2. 定位: 默认在父菜单项右侧 + 2px 间隙，超视口时翻转到左侧
// 3. 打开延迟: 100ms（快速），关闭延迟: 600ms（慢速）
// 4. parentTimeoutRef: 鼠标进入子菜单时清除父级的关闭定时器，防止层级切换
// 5. activeSubKey: 追踪当前 hover 的父菜单项，通过 DOM data-key 查找子菜单锚点元素
function SubmenuOverlay({
  items,
  anchorRect,
  onClose,
  onCloseAll,
  hot,
  selection,
  parentTimeoutRef,
  lang,
}: {
  items: MenuItem[];
  anchorRect: DOMRect;
  onClose: () => void;
  onCloseAll: () => void;
  hot: any;
  selection: [number, number, number, number][] | null;
  parentTimeoutRef?: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  lang: Lang;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [subSub, setSubSub] = useState<{
    items: MenuItem[];
    anchorRect: DOMRect;
  } | null>(null);
  const subTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeSubKey, setActiveSubKey] = useState<string | null>(null);

  // 子菜单定位：默认在锚点项右侧 +2px，超出 viewport 时翻转到左侧，同时钳制垂直位置
  useEffect(() => {
    if (!menuRef.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuH = menuRef.current.offsetHeight || 200;

    let x = anchorRect.right + 2; // 2px gap to the right
    let y = anchorRect.top;

    // Flip horizontally if off-screen
    if (x + 180 > vw - 8) {
      x = anchorRect.left - 180 - 2;
    }
    // Clamp vertically
    if (y + menuH > vh - 8) {
      y = vh - menuH - 8;
    }
    if (y < 8) y = 8;

    menuRef.current.style.left = `${x}px`;
    menuRef.current.style.top = `${y}px`;
  }, [anchorRect]);

  const handleItemEnter = useCallback((item: MenuItem) => {
    if (!item.children) {
      if (subTimeoutRef.current) clearTimeout(subTimeoutRef.current);
      setActiveSubKey(null);
      setSubSub(null);
      return;
    }
    if (subTimeoutRef.current) clearTimeout(subTimeoutRef.current);
    subTimeoutRef.current = setTimeout(() => {
      setActiveSubKey(item.key);
    }, 100); // faster submenu open
  }, []);

  const handleItemLeave = useCallback(() => {
    if (subTimeoutRef.current) clearTimeout(subTimeoutRef.current);
    subTimeoutRef.current = setTimeout(() => {
      setActiveSubKey(null);
      setSubSub(null);
    }, 600); // slower submenu close
  }, []);

  // When activeSubKey changes, compute new anchor rect from the DOM element
  useEffect(() => {
    if (!activeSubKey || !menuRef.current) {
      setSubSub(null);
      return;
    }
    const el = menuRef.current.querySelector(`[data-key="${activeSubKey}"]`) as HTMLElement | null;
    if (!el) return;
    setSubSub({
      items: getMenuItems(lang).find((m) => m.key === activeSubKey)?.children || [],
      anchorRect: el.getBoundingClientRect(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubKey, lang]);

  // Handle sub-sub-sub menus recursively — but at this depth we just do one level
  // The sub-sub is rendered as another submenu overlay if needed

  return (
    <div
      ref={menuRef}
      className="ctx-submenu"
      onMouseEnter={() => {
        if (subTimeoutRef.current) clearTimeout(subTimeoutRef.current);
        if (parentTimeoutRef?.current) clearTimeout(parentTimeoutRef.current);
      }}
      onMouseLeave={() => {
        subTimeoutRef.current = setTimeout(() => {
          setActiveSubKey(null);
          setSubSub(null);
        }, 600); // slower close
      }}
    >
      {items.map((item) => {
        if (item.key.startsWith("sep")) {
          return <div key={item.key} className="ctx-separator" />;
        }
        const hasChildren = item.children && item.children.length > 0;
        return (
          <div
            key={item.key}
            data-key={item.key}
            className={`ctx-item ${hasChildren ? "ctx-item-parent" : ""}`}
            onMouseEnter={() => handleItemEnter(item)}
            onMouseLeave={handleItemLeave}
            onClick={async (e) => {
              e.stopPropagation();
              if (!hasChildren) {
                onCloseAll();
                if (item.key === "paste") {
                  if (!hot || hot.isDestroyed || !selection || selection.length === 0) return;
                  if (selection[0]) {
                    const [r1, c1] = selection[0];
                    if (r1 >= 0 && c1 >= 0) {
                      let text = "";
                      try { text = await navigator.clipboard.readText(); } catch {}
                      if (!text) {
                        const api = (window as any).electronAPI;
                        text = typeof api?.clipboardRead === "function" ? api.clipboardRead() : "";
                      }
                      if (text) {
                        const rows = text.split("\n");
                        for (let ri = 0; ri < rows.length; ri++) {
                          const cols = rows[ri].split("\t");
                          for (let ci = 0; ci < cols.length; ci++) {
                            hot.setDataAtCell(r1 + ri, c1 + ci, cols[ci]);
                          }
                        }
                        const fmt: ClipFmt | undefined = (window as any).__gullClipFmt;
                        if (fmt) setTimeout(() => applyClipFmt(hot, r1, c1, fmt), 0);
                      }
                    }
                  }
                  return;
                }
                dispatchAction(item.key, hot, selection);
              }
            }}
          >
            <span className="ctx-item-label">{item.name}</span>
            {item.shortcut && <span className="ctx-item-shortcut">{item.shortcut}</span>}
            {hasChildren && <span className="ctx-item-arrow">›</span>}
          </div>
        );
      })}
      {subSub && (
        <SubmenuOverlay
          items={subSub.items}
          anchorRect={subSub.anchorRect}
          onClose={onClose}
          onCloseAll={onCloseAll}
          hot={hot}
          selection={selection}
          parentTimeoutRef={subTimeoutRef as any}
          lang={lang}
        />
      )}
    </div>
  );
}

// ─── Main ContextMenu ────────────────────────────────────────────────────────

export default function ContextMenu({
  hot,
  visible,
  position,
  selection,
  onClose,
}: ContextMenuProps) {
  const lang = getLang();
  const menuRef = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<{
    items: MenuItem[];
    anchorRect: DOMRect;
  } | null>(null);
  const subTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeSubKey, setActiveSubKey] = useState<string | null>(null);

  // Store selection globally so submenus can access it
  useEffect(() => {
    if (visible) {
      (window as any).__ctxSelection = selection;
    }
  }, [visible, selection]);

  // 点击外部关闭：检查点击目标是否在主菜单或任何子菜单（.ctx-submenu）内
  // 如果都不在，则调用 onClose 关闭整个菜单树
  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // 还需检查是否在任意子菜单内（子菜单也是 Portal 渲染，不在 menuRef 内）
        const submenus = document.querySelectorAll(".ctx-submenu");
        let insideSub = false;
        submenus.forEach((el) => {
          if (el.contains(e.target as Node)) insideSub = true;
        });
        if (!insideSub) onClose();
      }
    };
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, [visible, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!visible) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === KEYBINDINGS.closePanel.key) onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [visible, onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!visible || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = position.x;
    let y = position.y;
    if (x + rect.width > vw - 8) x = vw - rect.width - 8;
    if (y + rect.height > vh - 8) y = vh - rect.height - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    menuRef.current.style.left = `${x}px`;
    menuRef.current.style.top = `${y}px`;
  }, [visible, position]);

  const handleItemEnter = useCallback((item: MenuItem) => {
    if (!item.children) {
      if (subTimeoutRef.current) clearTimeout(subTimeoutRef.current);
      setActiveSubKey(null);
      setSubmenu(null);
      return;
    }
    if (subTimeoutRef.current) clearTimeout(subTimeoutRef.current);
    subTimeoutRef.current = setTimeout(() => {
      setActiveSubKey(item.key);
    }, 100); // faster open
  }, []);

  const handleItemLeave = useCallback(() => {
    if (subTimeoutRef.current) clearTimeout(subTimeoutRef.current);
    // Don't close if submenu is already open
    if (activeSubKey) return;
    subTimeoutRef.current = setTimeout(() => {
      setActiveSubKey(null);
      setSubmenu(null);
    }, 600);
  }, [activeSubKey]);

  // When activeSubKey changes, compute anchor rect
  useEffect(() => {
    if (!activeSubKey || !menuRef.current) {
      setSubmenu(null);
      return;
    }
    const el = menuRef.current.querySelector(`[data-key="${activeSubKey}"]`) as HTMLElement | null;
    if (!el) return;
    const item = getMenuItems(lang).find((m) => m.key === activeSubKey);
    if (!item?.children) return;
    setSubmenu({
      items: item.children,
      anchorRect: el.getBoundingClientRect(),
    });
  }, [activeSubKey]);

  if (!visible) return null;

  const menu = (
    <>
      <div
        ref={menuRef}
        className="ctx-menu"
        style={{ left: position.x, top: position.y }}
        onContextMenu={(e) => e.preventDefault()}
        onMouseEnter={() => {
          if (subTimeoutRef.current) clearTimeout(subTimeoutRef.current);
        }}
        onMouseLeave={() => {
          if (activeSubKey) return;
          subTimeoutRef.current = setTimeout(() => {
            setActiveSubKey(null);
            setSubmenu(null);
          }, 600);
        }}
      >
        {getMenuItems(lang).map((item) => {
          if (item.key.startsWith("sep")) {
            return <div key={item.key} className="ctx-separator" />;
          }
          const hasChildren = item.children && item.children.length > 0;
          return (
            <div
              key={item.key}
              data-key={item.key}
              className={`ctx-item ${hasChildren ? "ctx-item-parent" : ""}`}
              onMouseEnter={() => handleItemEnter(item)}
              onMouseLeave={handleItemLeave}
              onClick={async (e) => {
                e.stopPropagation();
                if (!hasChildren) {
                  if (item.key === "paste") {
                    // 粘贴在此异步处理（与 MD 编辑器相同模式）
                    onClose();
                    const h = hot || (window as any).__ctxHot;
                    if (!h || h.isDestroyed || !selection || selection.length === 0) return;
                    const [r1, c1] = selection[0];
                    if (r1 < 0 || c1 < 0) return;
                    let text = "";
                    try { text = await navigator.clipboard.readText(); } catch {}
                    if (!text) {
                      const api = (window as any).electronAPI;
                      text = typeof api?.clipboardRead === "function" ? api.clipboardRead() : "";
                    }
                    if (text) {
                      const rows = text.split("\n");
                      for (let ri = 0; ri < rows.length; ri++) {
                        const cols = rows[ri].split("\t");
                        for (let ci = 0; ci < cols.length; ci++) {
                          h.setDataAtCell(r1 + ri, c1 + ci, cols[ci]);
                        }
                      }
                      // 恢复格式
                      const fmt: ClipFmt | undefined = (window as any).__gullClipFmt;
                      if (fmt) setTimeout(() => applyClipFmt(h, r1, c1, fmt), 0);
                    }
                    return;
                  }
                  onClose();
                  const h = hot || (window as any).__ctxHot;
                  dispatchAction(item.key, h, selection);
                }
              }}
            >
              <span className="ctx-item-label">{item.name}</span>
              {item.shortcut && <span className="ctx-item-shortcut">{item.shortcut}</span>}
              {hasChildren && <span className="ctx-item-arrow">›</span>}
            </div>
          );
        })}
      </div>
      {submenu && (
        <SubmenuOverlay
          items={submenu.items}
          anchorRect={submenu.anchorRect}
          onClose={onClose}
          onCloseAll={onClose}
          hot={hot}
          selection={selection}
          parentTimeoutRef={subTimeoutRef as any}
          lang={lang}
        />
      )}
    </>
  );

  // 通过 Portal 挂载到 document.body：逃逸所有父容器的 overflow/z-index/transform 限制
  return createPortal(menu, document.body);
}
