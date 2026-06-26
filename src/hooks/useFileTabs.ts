/**
 * useFileTabs.ts — 文件 Tab（标签页）管理系统
 *
 * 类似 VS Code 的 Tab 管理：维护打开的文件列表和当前激活的文件。
 *
 * 核心状态：
 * - openTabs:     当前已打开的文件 ID 列表（保持打开顺序）
 * - currentFileId: 当前激活（显示在编辑区）的文件 ID
 *
 * Tab 关闭导航策略：
 * - 关闭当前激活的 Tab 时，自动切换到前一个 Tab（左侧相邻）
 * - 若被关闭的是第一个 Tab，切换到新的第一个 Tab
 * - 若关闭后无 Tab，currentFileId 设为 null
 *
 * 拖拽排序：
 * - moveTab(fromIndex, toIndex) 将 from 位置的 Tab 移动到 to 位置
 *
 * 删除文件清理：
 * - cleanupDeletedFile() 在文件被删除后调用
 * - 移除对应 Tab 并将焦点转移到剩余的第一个文件
 *
 * 导出：
 * - openTabs, currentFileId, setCurrentFileId
 * - handleSelectTab(打开/切换到指定文件)
 * - handleCloseTab(关闭 Tab 并智能导航)
 * - moveTab(拖拽排序)
 * - cleanupDeletedFile(文件删除后清理 Tab 状态)
 */

import { useState, useCallback } from "react";
import type { Folder, FolderFile } from "../types";

/**
 * useFileTabs — 文件 Tab 切换、打开、关闭、拖拽逻辑
 *
 * @param initialTab 初始打开的 Tab ID（可选）
 */
export function useFileTabs(initialTab?: string) {
  const [openTabs, setOpenTabs] = useState<string[]>(initialTab ? [initialTab] : []);
  const [currentFileId, setCurrentFileId] = useState<string | null>(initialTab ?? null);

  /**
   * 选择（打开）一个文件：切换当前文件，并在 tab 列表中追加（若不存在）
   */
  const handleSelectTab = useCallback((fileId: string) => {
    setCurrentFileId(fileId);
    setOpenTabs((prev) => (prev.includes(fileId) ? prev : [...prev, fileId]));
  }, []);

  /**
   * 关闭一个文件 tab：根据位置智能导航到相邻 tab
   *
   * 导航算法：
   * 1. 从 openTabs 中移除被关闭的 fileId
   * 2. 若关闭后无 Tab → currentFileId = null
   * 3. 若被关闭的是当前 Tab → 优先切换到左侧相邻 Tab
   * 4. 若被关闭的是第一个 Tab（idx=0）→ 切换到新的第一个
   */
  const handleCloseTab = useCallback((fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenTabs((prev) => {
      const newTabs = prev.filter((id) => id !== fileId);
      if (newTabs.length === 0) {
        if (currentFileId === fileId) setCurrentFileId(null);
        return newTabs;
      }
      if (currentFileId === fileId) {
        const idx = prev.indexOf(fileId);
        const nextIdx = idx > 0 ? idx - 1 : 0;
        setCurrentFileId(newTabs[Math.min(nextIdx, newTabs.length - 1)]);
      }
      return newTabs;
    });
  }, [currentFileId]);

  /**
   * 拖拽排序：将 openTabs[fromIndex] 移动到 toIndex 位置
   */
  const moveTab = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setOpenTabs((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  /**
   * 删除文件后清理 tab 状态
   *
   * 外部删除文件（如通过 FileExplorer 右键菜单）后调用此函数，
   * 确保 Tab 栏和当前文件状态一致。
   */
  const cleanupDeletedFile = useCallback((fileId: string, remainingFiles: FolderFile[]) => {
    setOpenTabs((prev) => prev.filter((id) => id !== fileId));
    if (currentFileId === fileId) {
      const nextId = remainingFiles[0]?.id || null;
      setCurrentFileId(nextId);
      if (nextId) {
        setOpenTabs((prev) => prev.includes(nextId) ? prev : [...prev, nextId]);
      }
    }
  }, [currentFileId]);

  return {
    openTabs,
    currentFileId,
    setCurrentFileId,
    handleSelectTab,
    handleCloseTab,
    moveTab,
    cleanupDeletedFile,
  };
}
