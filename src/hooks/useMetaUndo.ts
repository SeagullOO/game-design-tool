/**
 * useMetaUndo — Handsontable 单元格元数据（颜色/样式）撤销栈
 *
 * 由于 Handsontable 内置的 undo 插件只追踪数据变更，不追踪
 * setCellMeta 的样式变更，因此需要一个独立的元数据撤销栈。
 *
 * 使用方式：
 * 1. 在修改样式前调用 pushMetaUndo(snapshot) 保存快照
 * 2. Ctrl+Z 时调用 restoreMetaUndo(hot) 恢复最近快照
 * 3. 栈深度最大 100，超出时移除最旧记录
 */

export interface MetaCellSnapshot {
  row: number;
  col: number;
  _color?: string;
  _bgColor?: string;
  _bold?: boolean;
  _italic?: boolean;
  _fontSize?: number;
}

interface MetaSnapshot {
  cells: MetaCellSnapshot[];
}

const MAX_STACK = 100;
let metaUndoStack: MetaSnapshot[] = [];

/** 将元数据快照推入撤销栈 */
export function pushMetaUndo(snapshot: MetaSnapshot): void {
  metaUndoStack.push(snapshot);
  if (metaUndoStack.length > MAX_STACK) metaUndoStack.shift();
}

/** 弹出最近一个元数据快照（不自动应用） */
export function popMetaUndo(): MetaSnapshot | undefined {
  return metaUndoStack.pop();
}

/** 恢复最近一个元数据快照到 Handsontable 实例。返回 true 表示已恢复 */
export function restoreMetaUndo(hot: any): boolean {
  const snapshot = popMetaUndo();
  if (!snapshot || !hot || hot.isDestroyed) return false;
  const recordFmt = (window as any).__recordFmt;
  for (const cell of snapshot.cells) {
    const { row, col, ...metas } = cell;
    if (row < 0 || col < 0) continue;
    for (const [key, value] of Object.entries(metas)) {
      hot.setCellMeta(row, col, key, value);
      // 同步 fmtMap 以确保下次保存时写入撤销后的值
      recordFmt?.(row, col, key, value);
    }
  }
  hot.render();
  // 撤销后触发自动保存，将恢复的元数据持久化
  (window as any).__triggerExcelSave?.();
  // 通知工具栏刷新按钮状态
  window.dispatchEvent(new CustomEvent("gull:meta-undo"));
  return true;
}

/** 清空元数据撤销栈（切换文件时调用） */
export function clearMetaUndo(): void {
  metaUndoStack = [];
}
