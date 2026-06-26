/**
 * FolderWorkspace.tsx — 工作区主页面（最核心的页面组件）
 *
 * 双模式设计：
 * 1. Home 模式（/）：展示文件夹列表，与 FolderList 功能等价
 * 2. Workspace 模式（/folder/:id）：三栏布局 — 活动栏 | 文件浏览器 | 编辑区
 *
 * 核心职责：
 * - 文件夹 CRUD（创建、重命名、删除、复制、从模版创建、从磁盘导入）
 * - 文件 CRUD（新建、重命名、删除、移动）
 * - 编辑区域切换（Markdown 编辑器 / Excel 表格编辑器）
 * - Tab 管理（通过 useFileTabs hook）
 * - 自定义上下文菜单
 * - 文件夹名称自动保存（2.5 秒防抖）
 *
 * 缩放系统：
 * - UI 缩放（zoom / setZoom）：控制侧边栏和工具栏的整体缩放，影响 ActivityBar + Sidebar/FileExplorer
 * - 内容缩放（contentZoom / setContentZoom）：仅影响编辑区域（Markdown 预览 / Excel 表格），
 *   独立于 UI 缩放，允许用户放大文档内容而不改变界面控件大小
 * - 两个缩放均通过 Ctrl+滚轮 在不同区域触发，并持久化到 localStorage
 *
 * 状态管理要点：
 * - 文件夹完整状态存储在 folder state 中，通过 reloadFolder() 从存储重新加载
 * - 文件名编辑使用 IME 组合状态（isComposing ref）防止中文输入过程中的误触发
 * - saveStatus 由 useMarkdownEditor 驱动，通过 StatusBadge 显示
 *
 * 已知：此文件约 660 行，新功能请提取到独立 hook 或组件中（CLAUDE.md 要求 < 200 行/组件）。
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { t, getLang } from "../i18n";

import ActivityBar from "../components/ActivityBar";
import FileExplorer from "../components/FileExplorer";
import Sidebar from "../components/Sidebar";
import TemplateModal from "../components/TemplateModal";
import ExcelToolbar from "../components/ExcelToolbar";
import EditorToolbar from "../components/EditorToolbar";
import ContextMenu from "../components/ContextMenu";
import FormulaBar from "../components/FormulaBar";
import {
  storageLoadFolders, storageGetFolder, storageUpdateFolder, storageSaveFolder, storageDeleteFolder, storageAddTemplate,
  storageListWorkspaceFiles, storageWriteWorkspaceFile, storageDeleteWorkspaceFile, storageRenameWorkspaceEntry,
  storageCreateWorkspaceDir, storageDeleteWorkspaceDir, storageReadWorkspaceFile,
} from "../storage";
import { generateId } from "../types";
import type { Folder, FolderFile, Template } from "../types";
import { useExcelEditor } from "../hooks/useExcelEditor";
import { useMarkdownEditor } from "../hooks/useMarkdownEditor";
import MarkdownEditor from "../components/MarkdownEditor";
import StatusBadge from "../components/StatusBadge";
import { useFileTabs } from "../hooks/useFileTabs";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { exportFolder } from "../utils/exportUtils";
import { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, ZOOM_REFERENCE, CONTENT_ZOOM_MIN, CONTENT_ZOOM_MAX, CONTENT_ZOOM_STEP, CONTENT_ZOOM_DEFAULT, PANEL_WIDTH, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH, SPLITTER_WIDTH, SPLITTER_HIT } from "../config";
import { dataToCsv, csvToData, storageReadWorkspaceFileBinary, storageWriteWorkspaceFileBinary } from "../storage";
import { dataToXlsxBase64, xlsxBase64ToData, createEmptyXlsxBase64 } from "../utils/xlsxUtils";

/** 新建 Markdown 文件的默认内容（TipTap 文档结构） */
const defaultMdContent = { type: "doc", content: [{ type: "paragraph" }] };

/** 新建 Docx 文件的默认内容（Tiptap HTML） */
const defaultDocxContent = "<p></p>";

/** 新建 Excel 文件的默认内容（26 列 x 100 行空表格） */
function makeDefaultExcelContent() {
  const cols = 26;
  const rows = 100;
  const colHeaders: string[] = [];
  for (let i = 0; i < cols; i++) colHeaders.push(String.fromCharCode(65 + i));
  const data = Array.from({ length: rows }, () => Array(cols).fill(""));
  return { data, colHeaders };
}
const defaultExcelContent = makeDefaultExcelContent();

// ─── 主组件 ─────────────────────────────────────────────────────────────────

function FolderWorkspace({ sidebarOpen = true, zoom = 110, contentZoom = 100, setZoom, setContentZoom }: { sidebarOpen?: boolean; zoom?: number; contentZoom?: number; setZoom?: React.Dispatch<React.SetStateAction<number>>; setContentZoom?: React.Dispatch<React.SetStateAction<number>> }) {
  const lang = getLang();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const folderId = id ? Number(id) : null;
  /** viewMode：有 folderId 时为 "workspace"，否则为 "home" */
  const viewMode = folderId ? "workspace" as const : "home" as const;

  // ─── Home mode state ────────────────────────────────────────────────────
  const [folders, setFolders] = useState<Folder[]>([]);
  const [homeLoaded, setHomeLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  // ─── Workspace mode state ───────────────────────────────────────────────
  const [folder, setFolder] = useState<Folder | null>(null);
  const [loading, setLoading] = useState(!!folderId);
  const [error, setError] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const isComposing = useRef(false);
  const [searchActive, setSearchActive] = useState(false);
  const [newFileId, setNewFileId] = useState<string | null>(null);
  const [targetFolderPath, setTargetFolderPath] = useState<string | null>(null);
  // Splitter: 可拖拽分隔线（侧边栏 / 内容区）
  const [panelWidth, setPanelWidth] = useState(PANEL_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const splitterRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startW: number } | null>(null);

  // ─── Custom context menu state ──────────────────────────────────────────
  const [ctxMenuVisible, setCtxMenuVisible] = useState(false);
  const [ctxMenuPos, setCtxMenuPos] = useState({ x: 0, y: 0 });
  const [ctxMenuSelection, setCtxMenuSelection] = useState<[number, number, number, number][] | null>(null);

  // ─── Folder menu ───────────────────────────────────────────────────────
  const uiZoomRef = useRef<HTMLDivElement>(null);
  const wsZoomRef = useRef<HTMLDivElement>(null);
  // 保持 zoom/contentZoom 的最新值在 ref 中，避免 useEffect 闭包过期
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const contentZoomRef = useRef(contentZoom);
  contentZoomRef.current = contentZoom;
  const isElectron = typeof window !== "undefined" && "electronAPI" in window;

  // ─── File tabs ─────────────────────────────────────────────────────────
  const { openTabs, currentFileId, setCurrentFileId, handleSelectTab, handleCloseTab, moveTab } = useFileTabs();
  const currentFile = folder?.files.find((f) => f.id === currentFileId) ?? null;

  // ─── Tab 拖拽：window 级鼠标事件 ──────────────────────────────────
  const dragRef = useRef({ idx: -1, x: 0, dragging: false, fileId: null as string | null });
  const tabBarRef = useRef<HTMLDivElement>(null);
  const dropIndicatorRef = useRef<HTMLDivElement>(null);
  const moveTabRef = useRef(moveTab);
  moveTabRef.current = moveTab;
  const setCurrentFileIdRef = useRef(setCurrentFileId);
  setCurrentFileIdRef.current = setCurrentFileId;
  const openTabsRef = useRef(openTabs);
  openTabsRef.current = openTabs;

  // 获取仅包含实际 tab 元素的数组（排除指示器等非 tab 子元素）
  const getTabs = () => {
    const bar = tabBarRef.current;
    if (!bar) return [];
    return Array.from(bar.querySelectorAll(":scope > .tab")) as HTMLElement[];
  };

  /**
   * 中点法计算拖拽插入位置。
   *
   * VS Code tabsTitleControl 的算法本质：
   * 1. 对每个非拖拽标签取水平中点作为分界线
   * 2. 鼠标在中点左侧 → 插入到该标签前面（gap = postIdx）
   * 3. 鼠标在中点右侧 → 插入到该标签后面（gap = postIdx + 1）
   * 4. 鼠标在间隙中 → 最近距离原则确定插入位置
   *
   * 这样向左和向右拖拽的感觉完全对称。
   *
   * @returns toIndex — post-removal 数组中的插入索引（0..openTabs.length-1）
   */
  const computeInsertIndex = (
    mouseX: number,
    fromIdx: number,
    tabs: HTMLElement[]
  ): number => {
    if (tabs.length <= 1) return 0;

    let bestGap = 0;
    let bestDist = Infinity;
    // postIdx 遍历的是 "排除被拖拽标签后的 post-removal 索引"
    let postIdx = 0;

    for (let i = 0; i < tabs.length; i++) {
      if (i === fromIdx) continue;

      const rect = tabs[i].getBoundingClientRect();
      const mid = (rect.left + rect.right) / 2;

      // 鼠标在标签中点左侧 → 插入该标签前面 (gap = postIdx)
      // 鼠标在标签中点右侧 → 插入该标签后面 (gap = postIdx + 1)
      const gap = mouseX < mid ? postIdx : postIdx + 1;

      // 使用该标签对应的边缘来计算距离
      const targetX = mouseX < mid ? rect.left : rect.right;
      const dist = Math.abs(mouseX - targetX);

      if (dist < bestDist) {
        bestDist = dist;
        bestGap = gap;
      }
      postIdx++;
    }

    // clamp to valid post-removal range
    const maxIdx = tabs.length - 1; // post-removal 数组最大索引
    return Math.max(0, Math.min(bestGap, maxIdx));
  };

  // 全局 mousemove / mouseup：统一处理拖拽视觉反馈和释放
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (d.idx < 0 || !d.fileId) return;
      if (!d.dragging && Math.abs(e.clientX - d.x) > 4) {
        d.dragging = true;
      }
      if (!d.dragging) return;

      const tabs = getTabs();
      if (tabs.length === 0) return;
      const indicator = dropIndicatorRef.current;

      // 从 DOM 中定位被拖拽的 tab（通过已设置的 tab-dragging class）
      let dragIdx = -1;
      for (let i = 0; i < tabs.length; i++) {
        if (tabs[i].classList.contains("tab-dragging")) { dragIdx = i; break; }
      }
      if (dragIdx < 0) {
        // 首次进入：通过 fileId 在 openTabs 中找到真实索引，设置 dragging class
        const idx = openTabsRef.current.indexOf(d.fileId);
        if (idx >= 0 && idx < tabs.length) {
          tabs[idx].classList.add("tab-dragging");
        }
      }

      // 找到被拖拽标签的 DOM 索引（用于在后续逻辑中排除它）
      const fromIdxMove = openTabsRef.current.indexOf(d.fileId);
      if (fromIdxMove < 0) return;

      const toIndex = computeInsertIndex(e.clientX, fromIdxMove, tabs);

      // 将 post-removal toIndex 映射回原始 DOM 索引来定位指示线
      // toIndex 是插入到 post-removal 数组中的位置
      // 在原始 DOM 中，拖拽标签从位置 fromIdx 移除，所以：
      //   toIndex < fromIdx  → DOM 位置不变 (at toIndex)
      //   toIndex >= fromIdx → DOM 位置 +1 (因为移除的标签占了 fromIdx)
      const indicatorOrigIdx = toIndex >= fromIdxMove ? toIndex + 1 : toIndex;

      if (indicator) {
        if (indicatorOrigIdx < tabs.length) {
          indicator.style.left = tabs[indicatorOrigIdx].offsetLeft + "px";
        } else {
          const lastTab = tabs[tabs.length - 1];
          indicator.style.left = (lastTab.offsetLeft + lastTab.offsetWidth) + "px";
        }
        indicator.style.display = "block";
      }
    };

    const onUp = (e: MouseEvent) => {
      const d = dragRef.current;

      // 始终清理视觉状态 — 即使提前退出也要清除高亮残留
      const tabs = getTabs();
      for (let i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove("tab-dragging");
      }
      const indicator = dropIndicatorRef.current;
      if (indicator) indicator.style.display = "none";

      if (d.idx < 0 || !d.fileId) { d.idx = -1; d.dragging = false; d.fileId = null; return; }

      if (d.dragging) {
        if (tabs.length > 0) {
          const fromIdx = openTabsRef.current.indexOf(d.fileId);
          if (fromIdx < 0) { d.idx = -1; d.dragging = false; d.fileId = null; return; }

          const toIndex = computeInsertIndex(e.clientX, fromIdx, tabs);

          if (toIndex !== fromIdx) moveTabRef.current(fromIdx, toIndex);
        }
      } else {
        if (d.fileId) setCurrentFileIdRef.current(d.fileId);
      }

      d.idx = -1; d.x = 0; d.dragging = false; d.fileId = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Electron: 当选中的文件内容为空时，从磁盘加载内容
  useEffect(() => {
    if (!isDisk || !folder || !currentFile || !folderId) return;
    const rawContent = currentFile.content;
    let isEmpty = false;
    if (currentFile.type === "md") {
      isEmpty = !rawContent || (typeof rawContent === "string" && rawContent === "");
    } else {
      // Excel: 空字符串、空对象或占位数据（storageListWorkspaceFiles 创建的 {data:[[]]}）视为未加载
      isEmpty = !rawContent || (typeof rawContent === "string") || (typeof rawContent === "object" && (
        !rawContent.data || !rawContent.data.length ||
        // 占位数据：只有 1 行且该行只有 ≤1 个空单元格
        (rawContent.data.length === 1 && (!rawContent.data[0] || rawContent.data[0].length <= 1) &&
         rawContent.data.every((row: string[]) => !row || row.every((cell: string) => cell === "" || cell == null)))
      ));
    }
    if (!isEmpty) return;

    (async () => {
      const fileName = currentFile.name;
      const isXlsx = fileName.toLowerCase().endsWith(".xlsx");
      const isCsv = fileName.toLowerCase().endsWith(".csv");

      if (currentFile.type === "excel" && isXlsx) {
        // 新格式：读取 .xlsx 二进制文件
        const xlsxBase64 = await storageReadWorkspaceFileBinary(folder.name, fileName);
        if (!xlsxBase64) return;
        try {
          const parsed = await xlsxBase64ToData(xlsxBase64);
          setFolder((prev) => prev ? { ...prev, files: prev.files?.map((f) =>
            f.id === currentFile.id ? { ...f, content: parsed } : f
          )} : null);
          return;
        } catch { /* fall through to error handling */ }
      }

      if (currentFile.type === "excel" && isCsv) {
        // Legacy 格式：读取 .csv + .meta，自动迁移到 .xlsx
        const csvRaw = await storageReadWorkspaceFile(folder.name, fileName);
        if (!csvRaw) return;
        const data = csvToData(csvRaw);
        const colHeaders = data[0] ? Array.from({ length: data[0].length }, (_, i) => String.fromCharCode(65 + i)) : [];
        let cellMeta: any[][] | undefined = undefined;
        try {
          const metaRaw = await storageReadWorkspaceFile(folder.name, fileName + ".meta");
          if (metaRaw) { const m = JSON.parse(metaRaw); cellMeta = m.cellMeta; }
        } catch {}
        const content = { data, colHeaders, cellMeta };

        // 自动迁移：写为 .xlsx 并清理旧文件
        try {
          const xlsxBase64 = await dataToXlsxBase64(data, colHeaders, cellMeta);
          const newName = fileName.replace(/\.csv$/i, ".xlsx");
          await storageWriteWorkspaceFileBinary(folder.name, newName, xlsxBase64);
          await storageDeleteWorkspaceFile(folder.name, fileName);
          await storageDeleteWorkspaceFile(folder.name, fileName + ".meta");
          setFolder((prev) => prev ? { ...prev, files: prev.files?.map((f) =>
            f.id === currentFile.id ? { ...f, name: newName, content } : f
          )} : null);
          return;
        } catch {
          // 迁移失败，仍然设置内容让用户能编辑
          setFolder((prev) => prev ? { ...prev, files: prev.files?.map((f) =>
            f.id === currentFile.id ? { ...f, content } : f
          )} : null);
          return;
        }
      }

      // Markdown 或其他：读取文本内容
      const raw = await storageReadWorkspaceFile(folder.name, fileName);
      if (!raw) return;
      try {
        if (currentFile.type === "excel") {
          // 未知扩展名的 Excel 文件，尝试作为 CSV 读取
          const data = csvToData(raw);
          const colHeaders = data[0] ? Array.from({ length: data[0].length }, (_, i) => String.fromCharCode(65 + i)) : [];
          setFolder((prev) => prev ? { ...prev, files: prev.files?.map((f) =>
            f.id === currentFile.id ? { ...f, content: { data, colHeaders } } : f
          )} : null);
        } else {
          try {
            const parsed = JSON.parse(raw);
            setFolder((prev) => prev ? { ...prev, files: prev.files?.map((f) =>
              f.id === currentFile.id ? { ...f, content: parsed } : f
            )} : null);
          } catch {
            setFolder((prev) => prev ? { ...prev, files: prev.files?.map((f) =>
              f.id === currentFile.id ? { ...f, content: raw } : f
            )} : null);
          }
        }
      } catch {
        setFolder((prev) => prev ? { ...prev, files: prev.files?.map((f) =>
          f.id === currentFile.id ? { ...f, content: raw } : f
        )} : null);
      }
    })();
  }, [currentFileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 缩放滚轮监听（原生事件，按容器独立处理，非全局级）──────────
  // 设计原理：
  // - UI 缩放：监听 ActivityBar + Sidebar 区域的 Ctrl+滚轮
  // - 内容缩放：监听编辑区域的 Ctrl+滚轮
  // - 缩放值保存到 localStorage (gull_settings)，跨会话持久化
  // - 使用 capture: true 确保在子元素之前拦截事件
  // - 依赖 currentFile?.id 确保切换文件时重新绑定（解决 TDZ 错误）
  useEffect(() => {
    const uiEl = uiZoomRef.current;
    const wsEl = wsZoomRef.current;

    const saveSetting = (key: string, val: number) => {
      try {
        const raw = localStorage.getItem("gull_settings");
        const s = raw ? JSON.parse(raw) : {};
        s[key] = val;
        localStorage.setItem("gull_settings", JSON.stringify(s));
      } catch {}
    };

    /** Ctrl+滚轮 → UI 缩放 */
    const onUiWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      if ((e.target as HTMLElement).closest("[data-workspace-zoom]")) return;
      e.preventDefault();
      e.stopPropagation();
      setZoom?.((prev) => {
        const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP)));
        saveSetting("zoom", next);
        (uiEl as any).style.zoom = next !== ZOOM_REFERENCE ? String(next / ZOOM_REFERENCE) : "";
        return next;
      });
    };

    /** Ctrl+滚轮 → 内容缩放 */
    const onWsWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      setContentZoom?.((prev) => {
        const next = Math.min(CONTENT_ZOOM_MAX, Math.max(CONTENT_ZOOM_MIN, prev + (e.deltaY > 0 ? -CONTENT_ZOOM_STEP : CONTENT_ZOOM_STEP)));
        saveSetting("contentZoom", next);
        (window as any).__contentZoom = next;
        // 补偿父级 UI 缩放：编辑器实际缩放 = (contentZoom / 100) / (uiZoom / 110)
        const uiZoomCss = zoomRef.current !== ZOOM_REFERENCE ? zoomRef.current / ZOOM_REFERENCE : 1;
        (wsEl as any).style.zoom = next !== CONTENT_ZOOM_DEFAULT ? String((next / CONTENT_ZOOM_DEFAULT) / uiZoomCss) : "";
        return next;
      });
    };

    uiEl?.addEventListener("wheel", onUiWheel, { passive: false, capture: true });
    wsEl?.addEventListener("wheel", onWsWheel, { passive: false, capture: true });
    return () => {
      uiEl?.removeEventListener("wheel", onUiWheel, { capture: true });
      wsEl?.removeEventListener("wheel", onWsWheel, { capture: true });
    };
    // currentFile?.id 作为依赖项：确保切换文件时重新绑定缩放监听器
  }, [setZoom, setContentZoom, currentFile?.id]);

  // ─── 编辑器 hooks ────────────────────────────────────────────────────
  // useMarkdownEditor: 管理 raw markdown 源文本、自动保存、强制保存
  // useExcelEditor:    管理 Handsontable 实例生命周期、编辑栏同步、撤销/重做
  // 两者通过 currentFile 判断是否激活（null 时不初始化编辑器）
  const { source, setSource, handleForceSave, editorRef } = useMarkdownEditor(currentFile, folderId, folder?.name || null, saveStatus, setSaveStatus);

  // 切换标签页前保存当前文件
  const prevFileRef = useRef(currentFileId);
  useEffect(() => {
    if (prevFileRef.current && prevFileRef.current !== currentFileId) {
      if (currentFile?.type === "md") handleForceSave();
      prevFileRef.current = currentFileId;
    }
    if (!prevFileRef.current) prevFileRef.current = currentFileId;
  }, [currentFileId]);

  // 状态栏：直接操作 DOM，避免 React 重渲染
  const updateStatusBar = (html: string) => {
    const el = document.getElementById("global-statusbar");
    if (el) el.innerHTML = html;
  };
  useEffect(() => {
    if (!currentFile) { updateStatusBar(""); return; }
    const type = currentFile.type === "md" ? "Markdown" : "Excel";
    updateStatusBar(`<span>${type}</span>`);
  }, [currentFile]);
  const { hotRef, hotInstance, hotKey, cellRef, formulaValue, setFormulaValue, isFormulaBarFocused, handleUndo, handleRedo } =
    useExcelEditor(currentFile, folderId, folder?.name || null, reloadFolder);

  // ─── 键盘快捷键 ──────────────────────────────────────────────────────
  // Ctrl+S / Cmd+S: 仅在 Markdown 文件激活时触发强制保存
  // Excel 使用 Handsontable 内置的 Ctrl+Z/Y 撤销/重做 + afterChange 自动保存
  const [isMdPreview, setIsMdPreview] = useState(false);
  const isMdFile = !!currentFile && currentFile.type === "md";
  useKeyboardShortcuts(isMdFile ? handleForceSave : null, isMdFile && !!folderId);
  // ─── Tab 点击：切换当前文件 ────────────────────────────────────────────
  const handleTabClick = (fileId: string) => {
    if (currentFile?.type === "md") handleForceSave();
    setCurrentFileId(fileId);
  };

  // ─── Home mode: load folders ────────────────────────────────────────────
  const loadFolders = useCallback(async () => { setFolders(await storageLoadFolders()); setHomeLoaded(true); }, []);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  // ─── Home mode: 点击非工作区条目区域取消选中 ─────────────────────────
  useEffect(() => {
    if (viewMode !== "home") return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.side-item')) setSelectedFolderId(null);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [viewMode]);

  // ─── 工作区模式：加载文件夹 ──────────────────────────────────────────
  // 从存储获取完整文件夹数据，包括文件列表和子文件夹路径。
  // 成功加载后：
  // 1. 将当前工作区加入最近访问列表（localStorage: gull_recent_workspaces，最多 10 个）
  // 2. 若 URL 中有 ?file=xxx 参数，则打开对应文件
  // 3. 否则打开第一个文件
  // eslint-disable-next-line react-hooks/exhaustive-deps：仅依赖 folderId 避免重复加载
  useEffect(() => {
    if (!folderId) { setFolder(null); setLoading(false); setError(null); return; }
    setFolder(null); setLoading(true); setError(null);
    (async () => {
      const f = await storageGetFolder(folderId);
      if (!f) { setError(t("folderNotFound", lang)); setLoading(false); return; }
      // Electron: 从磁盘加载文件列表
      if (isDisk) {
        const { files, folders } = await storageListWorkspaceFiles(f.name);
        f.files = files; f.folders = folders;
      }
      setFolder(f); setFolderName(f.name);
      try {
        const raw = localStorage.getItem("gull_recent_workspaces");
        const recent: { id: number; name: string }[] = raw ? JSON.parse(raw) : [];
        const filtered = recent.filter((w) => w.id !== folderId);
        filtered.unshift({ id: folderId, name: f.name });
        localStorage.setItem("gull_recent_workspaces", JSON.stringify(filtered.slice(0, 10)));
      } catch {}
      const filesArr = f.files || [];
      const fileParam = searchParams.get("file");
      if (fileParam && filesArr.some((ff: FolderFile) => ff.id === fileParam)) { handleSelectTab(fileParam); }
      else if (filesArr.length > 0) { handleSelectTab(filesArr[0].id); }
      setLoading(false);
    })().catch(() => { setError(t("loadFailed", lang)); setLoading(false); });
  }, [folderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 工作区模式：辅助函数 ──────────────────────────────────────────
  async function reloadFolder() {
    if (!folderId) return;
    // 记住当前打开的文件名，刷新后按名称重新匹配（因为 storageListWorkspaceFiles 会生成新 ID）
    const currentFileName = folder?.files.find((f) => f.id === currentFileId)?.name;
    const f = await storageGetFolder(folderId);
    if (!f) return;
    if (isDisk) {
      const { files, folders } = await storageListWorkspaceFiles(f.name);
      f.files = files; f.folders = folders;
    }
    setFolder(f);
    // 刷新后重新匹配当前文件
    if (currentFileName) {
      const matched = f.files?.find((ff) => ff.name === currentFileName);
      if (matched) setCurrentFileId(matched.id);
    }
  }

  // ─── 文件夹名称自动保存（2.5 秒防抖）────────────────────────────────
  // 当用户编辑文件夹名称时，延迟 2.5 秒后自动保存到存储。
  // 使用 useEffect 返回的 cleanup 函数清除前一个定时器，实现防抖。
  // eslint-disable-next-line react-hooks/exhaustive-deps：仅依赖 folderName
  useEffect(() => {
    if (!folderName.trim() || !folderId) return;
    const timer = setTimeout(() => storageUpdateFolder(folderId, { name: folderName, updatedAt: Date.now() }), 2500);
    return () => clearTimeout(timer);
  }, [folderName]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 首页模式：文件夹操作 ──────────────────────────────────────────
  const handleCreateNew = async () => {
    const f: Folder = { name: t("untitledFolder", lang), files: [], createdAt: Date.now(), updatedAt: Date.now() };
    f.id = await storageSaveFolder(f);
    setFolders((prev) => [f, ...prev]);
    navigate(`/folder/${f.id}`);
  };

  const handleCreateFromTemplate = async (template: Template) => {
    setTemplateModalOpen(false);
    const f: Folder = { name: template.name, files: template.files.map((x) => ({ ...x })), createdAt: Date.now(), updatedAt: Date.now() };
    const id = await storageSaveFolder(f);
    f.id = id;
    // Electron: 把模版中的文件写入磁盘
    if (isDisk) {
      for (const file of f.files) {
        if (file.type === "md") {
          const content = typeof file.content === "string" ? file.content : "";
          await storageWriteWorkspaceFile(f.name, file.name, content);
        } else {
          // Excel: 序列化为 .xlsx
          const content = file.content;
          if (content?.data) {
            const xlsxBase64 = await dataToXlsxBase64(content.data, content.colHeaders || [], content.cellMeta);
            const xlsxName = file.name.replace(/\.(csv)$/i, ".xlsx");
            if (xlsxName !== file.name) file.name = xlsxName;
            await storageWriteWorkspaceFileBinary(f.name, xlsxName, xlsxBase64);
          } else {
            // 空 Excel 模版文件
            const emptyXlsx = await createEmptyXlsxBase64();
            await storageWriteWorkspaceFileBinary(f.name, file.name, emptyXlsx);
          }
        }
      }
    }
    setFolders((prev) => [f, ...prev]);
    setSelectedFolderId(id);
  };

  /** 从本地磁盘文件夹导入工作区（仅 Electron 桌面端可用）
   *  流程：选择文件夹 → 读取目录 → 识别 .md 和 .json 文件 → 创建新工作区 */
  const handleOpenWorkspace = async () => {
    const api = (window as any).electronAPI;
    if (!api?.selectFolder) { alert(t("electronOnly", lang)); return; }
    const folderPath: string | null = await api.selectFolder();
    if (!folderPath) return;
    const entries: { name: string; isDirectory: boolean; isFile: boolean }[] = await api.readDir(folderPath);
    const files: FolderFile[] = [];
    for (const entry of entries) {
      if (!entry.isFile) continue;
      const ext = entry.name.split(".").pop()?.toLowerCase();
      if (ext === "md") {
        const content = await api.readFileAt(folderPath + "/" + entry.name);
        files.push({ id: generateId(), name: entry.name, type: "md", content: content || "", createdAt: Date.now(), updatedAt: Date.now() });
      } else if (ext === "xlsx") {
        // 读取 .xlsx 二进制文件（通过 base64）
        const xlsxBase64 = await api.readFileAtBinary(folderPath + "/" + entry.name);
        if (!xlsxBase64) continue;
        try {
          const parsed = await xlsxBase64ToData(xlsxBase64);
          files.push({ id: generateId(), name: entry.name, type: "excel", content: parsed, createdAt: Date.now(), updatedAt: Date.now() });
        } catch { continue; }
      } else if (ext === "csv") {
        const raw = await api.readFileAt(folderPath + "/" + entry.name);
        if (!raw) continue;
        const data = csvToData(raw);
        // Try loading metadata
        let cellMeta = undefined;
        try {
          const metaRaw = await api.readFileAt(folderPath + "/" + entry.name + ".meta");
          if (metaRaw) cellMeta = JSON.parse(metaRaw).cellMeta;
        } catch {}
        const colHeaders = data[0] ? Array.from({ length: data[0].length }, (_, i) => String.fromCharCode(65 + i)) : [];
        files.push({ id: generateId(), name: entry.name, type: "excel", content: { data, colHeaders, cellMeta }, createdAt: Date.now(), updatedAt: Date.now() });
      }
    }
    if (files.length === 0) { alert(t("noImportableFiles", lang)); return; }
    const folderName = folderPath.split(/[/\\]/).pop() || t("importedWorkspace", lang);
    const f: Folder = { name: folderName, files, createdAt: Date.now(), updatedAt: Date.now() };
    f.id = await storageSaveFolder(f);
    setFolders((prev) => [f, ...prev]);
    navigate(`/folder/${f.id}`);
  };

  const handleSelectFolder = (id: number) => { setSelectedFolderId(id); };
  const handleEnterFolder = (id: number) => { setSelectedFolderId(id); navigate(`/folder/${id}`); };

  const handleRenameFolder = async (id: number, newName: string) => {
    await storageUpdateFolder(id, { name: newName, updatedAt: Date.now() });
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: newName, updatedAt: Date.now() } : f)));
  };

  const handleDeleteFolder = async (id: number) => {
    if (!window.confirm(t("confirmDeleteFolder", lang))) return;
    const target = folders.find((f) => f.id === id);
    await storageDeleteFolder(id, target?.name);
    setFolders((prev) => prev.filter((f) => f.id !== id));
    if (selectedFolderId === id) setSelectedFolderId(null);
  };

  const handleCopyFolder = async (id: number) => {
    const orig = await storageGetFolder(id);
    if (!orig) return;
    const copy: Folder = { name: orig.name + t("folderCopySuffix", lang), files: orig.files.map((x) => ({ ...x })), createdAt: Date.now(), updatedAt: Date.now() };
    copy.id = await storageSaveFolder(copy);
    // Electron: 把源工作区的文件复制到新工作区目录
    if (isDisk && orig.files) {
      for (const file of orig.files) {
        const content = typeof file.content === "string" ? file.content : JSON.stringify(file.content);
        await storageWriteWorkspaceFile(copy.name, file.name, content);
      }
      // Also create subdirectories
      if (orig.folders) {
        for (const fp of orig.folders) {
          await storageCreateWorkspaceDir(copy.name, fp);
        }
      }
    }
    setFolders((prev) => [copy, ...prev]);
  };

  // ─── Splitter drag ───────────────────────────────────────────────────
  const sidebarElRef = useRef<HTMLDivElement>(null);
  // 鼠标靠近分隔线时自动变 col-resize 光标（纯 JS 判定区，不影响布局）
  const onSplitterMouseMove = (e: MouseEvent) => {
    if (dragState.current) return;
    const el = splitterRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    document.body.style.cursor = Math.abs(e.clientX - (rect.left + rect.width / 2)) <= SPLITTER_HIT / 2
      ? "col-resize" : "";
  };
  useEffect(() => {
    window.addEventListener("mousemove", onSplitterMouseMove);
    return () => {
      window.removeEventListener("mousemove", onSplitterMouseMove);
      document.body.style.cursor = "";
    };
  }, []);

  const onSplitterDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragState.current = { startX: e.clientX, startW: panelWidth };
    setIsDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragState.current) return;
      const sidebarEl = sidebarElRef.current;
      const zoomFactor = zoom !== ZOOM_REFERENCE ? zoom / ZOOM_REFERENCE : 1;
      const delta = (e.clientX - dragState.current.startX) / zoomFactor;
      const w = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, dragState.current.startW + delta));
      if (sidebarEl) sidebarEl.style.width = w + "px";
      // 不在拖拽期间调 setPanelWidth，避免 React 重渲染覆盖 DOM 样式
      dragState.current.startW = w;
      dragState.current.startX = e.clientX;
    };
    const onUp = () => {
      if (!dragState.current) return;
      const finalW = dragState.current.startW;
      dragState.current = null;
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setPanelWidth(finalW);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);
  // Delete 键删除选中文件
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!currentFileId || !folder) return;
      const target = document.activeElement as HTMLElement | null;

      if (e.key !== "Delete") return;
      if (target) {
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
        if (target.closest(".hot-container") || target.closest(".handsontable")) return;
        if (target.classList.contains("handsontableInput")) return;
      }
      e.preventDefault();
      handleDeleteFile(currentFileId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentFileId, folder]);

  // ─── 工作区模式：文件操作 ──────────────────────────────────────────
  const eapi = (window as any).electronAPI;
  const isDisk = !!eapi;

  /** 添加新文件 */
  const handleAddFile = async (type: "md" | "excel" | "docx") => {
    if (!folderId || !folder) return;
    const base = type === "md" ? t("untitledDocument", lang) : type === "docx" ? t("untitledDocx", lang) : t("untitledSheet", lang);
    const ext = type === "md" ? ".md" : type === "docx" ? ".docx" : ".xlsx";
    // 若选中了文件夹，新文件创建在选中的文件夹内
    const prefix = targetFolderPath ? `${targetFolderPath}/` : "";
    let basename = prefix + base + ext;
    let counter = 1;
    const existingNames = new Set((folder.files || []).map(f => f.name.split("/").pop()!));
    while (existingNames.has(basename)) {
      counter++;
      basename = `${base} ${counter}${ext}`;
    }
    const fileId = generateId();
    if (isDisk) {
      if (type === "excel") {
        const emptyXlsx = await createEmptyXlsxBase64();
        await storageWriteWorkspaceFileBinary(folder.name, basename, emptyXlsx);
      } else {
        await storageWriteWorkspaceFile(folder.name, basename, type === "docx" ? defaultDocxContent : "");
      }
      const file: FolderFile = { id: fileId, name: basename, type, content: type === "md" ? defaultMdContent : type === "docx" ? defaultDocxContent : defaultExcelContent, createdAt: Date.now(), updatedAt: Date.now() };
      const files = [...(folder?.files || []), file];
      setFolder((prev) => prev ? { ...prev, files, updatedAt: Date.now() } : null);
      handleSelectTab(file.id);
      setNewFileId(file.id);
    } else {
      const file: FolderFile = { id: fileId, name: basename, type, content: type === "md" ? defaultMdContent : type === "docx" ? defaultDocxContent : defaultExcelContent, createdAt: Date.now(), updatedAt: Date.now() };
      const files = [...(folder?.files || []), file];
      await storageUpdateFolder(folderId, { files, updatedAt: Date.now() });
      setFolder((prev) => prev ? { ...prev, files, updatedAt: Date.now() } : null);
      handleSelectTab(file.id);
      setNewFileId(file.id);
    }
  };

  const handleRenameFile = async (fileId: string, newName: string) => {
    if (!folderId || !folder) return;
    const oldFile = folder.files?.find(f => f.id === fileId);
    if (isDisk && oldFile) {
      await storageRenameWorkspaceEntry(folder.name, oldFile.name, newName);
    }
    const files = (folder?.files || []).map((f) => f.id === fileId ? { ...f, name: newName, updatedAt: Date.now() } : f);
    if (!isDisk) await storageUpdateFolder(folderId, { files, updatedAt: Date.now() });
    setFolder((prev) => prev ? { ...prev, files, updatedAt: Date.now() } : null);
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!folderId || !folder) return;
    const target = folder.files?.find((f) => f.id === fileId);
    if (!target) return;
    if (isDisk) await storageDeleteWorkspaceFile(folder.name, target.name);
    const filtered = (folder.files || []).filter((f) => f.id !== fileId);
    if (!isDisk) await storageUpdateFolder(folderId, { files: filtered, updatedAt: Date.now() });
    setFolder((prev) => prev ? { ...prev, files: filtered, updatedAt: Date.now() } : null);
    if (currentFileId === fileId) setCurrentFileId(filtered[0]?.id || null);
  };

  const handleCreateFolder = async (name: string) => {
    if (!folderId || !folder) return;
    const fullName = targetFolderPath ? `${targetFolderPath}/${name}` : name;
    if (isDisk) await storageCreateWorkspaceDir(folder.name, fullName);
    const folders = [...(folder?.folders || []), fullName];
    if (!isDisk) await storageUpdateFolder(folderId, { folders, updatedAt: Date.now() });
    setFolder((prev) => prev ? { ...prev, folders, updatedAt: Date.now() } : null);
  };

  const handleRenameFolderPath = async (oldPath: string, newName: string) => {
    if (!folderId || !folder) return;
    const parentPath = oldPath.includes("/") ? oldPath.split("/").slice(0, -1).join("/") + "/" : "";
    const newPath = parentPath + newName;
    if (isDisk) await storageRenameWorkspaceEntry(folder.name, oldPath, newPath);
    const newFolders = (folder?.folders || []).map((f) => f === oldPath ? newPath : f);
    const newFiles = (folder?.files || []).map((f) => {
      if (f.name.startsWith(oldPath + "/")) {
        return { ...f, name: newPath + f.name.slice(oldPath.length), updatedAt: Date.now() };
      }
      return f;
    });
    if (!isDisk) await storageUpdateFolder(folderId, { folders: newFolders, files: newFiles, updatedAt: Date.now() });
    setFolder((prev) => prev ? { ...prev, folders: newFolders, files: newFiles, updatedAt: Date.now() } : null);
  };

  const handleDeleteFolderPath = async (path: string) => {
    if (!folderId || !folder) return;
    if (isDisk) await storageDeleteWorkspaceDir(folder.name, path);
    const newFolders = (folder?.folders || []).filter((f) => f !== path);
    const newFiles = (folder?.files || []).filter((f) => !f.name.startsWith(path + "/"));
    if (!isDisk) await storageUpdateFolder(folderId, { folders: newFolders, files: newFiles, updatedAt: Date.now() });
    setFolder((prev) => prev ? { ...prev, folders: newFolders, files: newFiles, updatedAt: Date.now() } : null);
  };

  const handleMoveFolder = async (oldPath: string, targetPath: string) => {
    if (!folderId || !folder || !oldPath) return;
    if (targetPath === oldPath || targetPath.startsWith(oldPath + "/")) return;
    const basename = oldPath.split("/").pop() || oldPath;
    const newFolderPath = targetPath ? `${targetPath}/${basename}` : basename;
    if (isDisk) await storageRenameWorkspaceEntry(folder.name, oldPath, newFolderPath);
    let newFolders = (folder?.folders || []).filter((f) => f !== oldPath);
    if (!newFolders.includes(newFolderPath)) newFolders = [...newFolders, newFolderPath];
    const newFiles = (folder?.files || []).map((f) => {
      if (f.name.startsWith(oldPath + "/")) {
        return { ...f, name: newFolderPath + f.name.slice(oldPath.length), updatedAt: Date.now() };
      }
      return f;
    });
    if (!isDisk) await storageUpdateFolder(folderId, { folders: newFolders, files: newFiles, updatedAt: Date.now() });
    setFolder((prev) => prev ? { ...prev, folders: newFolders, files: newFiles, updatedAt: Date.now() } : null);
  };

  const handleMoveFile = async (fileId: string, targetPath: string) => {
    if (!folderId || !folder) return;
    const file = folder?.files.find((f) => f.id === fileId);
    if (!file) return;
    const basename = file.name.split("/").pop() || file.name;
    const newName = targetPath ? `${targetPath}/${basename}` : basename;
    await handleRenameFile(fileId, newName);
  };

  const handleSelectFile = handleSelectTab;

  const openTabFiles = openTabs.map((tid) => folder?.files.find((f) => f.id === tid)).filter(Boolean) as FolderFile[];

  const handleSaveAsTemplate = async () => {
    const name = prompt(t("templateName", lang), folderName);
    if (!name?.trim() || !folder) return;
    // Electron: 从磁盘加载所有文件内容后再保存模版
    let templateFiles = folder?.files || [];
    if (isDisk && templateFiles.length > 0) {
      templateFiles = await Promise.all(templateFiles.map(async (f) => {
        const raw = await storageReadWorkspaceFile(folder.name, f.name);
        if (raw) {
          try { return { ...f, content: JSON.parse(raw) }; }
          catch { return { ...f, content: raw }; }
        }
        return f;
      }));
    }
    await storageAddTemplate({ name: name.trim(), files: templateFiles, createdAt: Date.now() });
    alert(t("templateSaved", lang));
  };

  /** 将工作区导出到本地磁盘（Electron：原生对话框；浏览器：Blob 下载） */
  const handleExportWorkspace = async () => {
    if (!folder) return;
    const msg = await exportFolder(folder);
    alert(msg);
  };

  const handleGoHome = () => { navigate("/"); };
  const handleGoWorkspace = () => { if (viewMode === "home" && selectedFolderId) navigate(`/folder/${selectedFolderId}`); };

  // 将处理函数暴露到 window 对象，供 TitleBar 的 "文件" 下拉菜单调用
  useEffect(() => {
    (window as any).__openWorkspace = handleOpenWorkspace;
    (window as any).__saveFile = () => {
      if (currentFile?.type === "md") handleForceSave();
    };
    (window as any).__saveAs = handleExportWorkspace;
    (window as any).__moveWorkspace = async () => {
      if (!folder || !isDisk) { alert(t("noWorkspaceToMove", lang)); return; }
      const api = (window as any).electronAPI;
      if (!api?.copyWorkspace) { alert(t("electronOnly", lang)); return; }
      const result = await api.copyWorkspace(folder.name);
      if (result) alert(t("workspaceMoved", lang) + "\n" + result);
    };
    return () => {
      (window as any).__openWorkspace = undefined;
      (window as any).__saveFile = undefined;
      (window as any).__saveAs = undefined;
      (window as any).__moveWorkspace = undefined;
    };
  }, [handleOpenWorkspace, handleForceSave, handleExportWorkspace, currentFile, folder, isDisk, lang]);


  // ─── Loading / Error states ─────────────────────────────────────────────

  if (folderId && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-darkest)" }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: "var(--border-medium)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  if (folderId && error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "var(--bg-darkest)" }}>
        <p className="text-sm mb-4" style={{ color: "var(--danger)" }}>{error}</p>
        <button onClick={handleGoHome} className="text-sm transition-colors"
          style={{ color: "var(--accent-text)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--accent-text)")}>
          {t("returnToFolderList", lang)}
        </button>
      </div>
    );
  }

  if (folderId && !folder) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-darkest)" }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: "var(--border-medium)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  // ─── Render: Unified three-column layout ────────────────────────────────

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "var(--bg-darkest)" }}>
      <div className="flex-1 flex overflow-hidden">
      <ActivityBar
        activeView={viewMode}
        showActions={viewMode === "workspace"}
        onAddFile={(type) => { if (viewMode === "workspace") handleAddFile(type); }}
        onSaveAsTemplate={handleSaveAsTemplate}
        onGoHome={handleGoHome}
        onGoWorkspace={handleGoWorkspace}
      />
      <div ref={uiZoomRef} data-ui-zoom className="flex-1 flex overflow-hidden"
        onClick={(e) => {
          if (viewMode !== "home") return;
          const target = e.target as HTMLElement;
          if (!target.closest('.side-item')) setSelectedFolderId(null);
        }}
        onMouseDown={(e) => {
          const sp = splitterRef.current;
          if (!sp || !sidebarOpen) return;
          const rect = sp.getBoundingClientRect();
          if (Math.abs(e.clientX - (rect.left + rect.width / 2)) <= SPLITTER_HIT / 2) {
            onSplitterDown(e);
          }
        }}
        style={{ zoom: zoom !== ZOOM_REFERENCE ? String(zoom / ZOOM_REFERENCE) : undefined as any }}>
      {sidebarOpen && (
      <div ref={sidebarElRef} className="h-full flex-shrink-0" style={{ width: panelWidth }}>
        {viewMode === "home" ? (
          homeLoaded ? (
            <Sidebar folders={folders} selectedId={selectedFolderId} searchQuery={searchQuery}
              onSearchChange={setSearchQuery} onSelectFolder={handleSelectFolder} onDoubleClick={handleEnterFolder}
              onCreateNew={handleCreateNew} onCreateFromTemplate={() => setTemplateModalOpen(true)}
              onRename={handleRenameFolder} onDelete={handleDeleteFolder} onCopy={handleCopyFolder}
              onDeselectAll={() => setSelectedFolderId(null)} />
          ) : null
        ) : (
          <FileExplorer folderName={folder!.name} files={folder!.files} folderPaths={folder?.folders || []}
            currentFileId={currentFileId}
            onSelectFile={handleSelectFile} onRenameFile={handleRenameFile} onDeleteFile={handleDeleteFile}
            onAddFile={handleAddFile} onCreateFolder={handleCreateFolder} onRenameFolder={handleRenameFolderPath} onDeleteFolder={handleDeleteFolderPath} onMoveFile={handleMoveFile} onMoveFolder={handleMoveFolder} onDeselectAll={() => setCurrentFileId(null)} onSelectFolderPath={setTargetFolderPath}
            onRefresh={reloadFolder}
            searchActive={searchActive}
            onSearchClose={() => setSearchActive(false)} newFileId={newFileId}
            onNewFileRenamed={() => setNewFileId(null)} />
        )}
      </div>
      )}
      {sidebarOpen && (
        <div
          ref={splitterRef}
          onMouseDown={onSplitterDown}
          style={{
            width: SPLITTER_WIDTH, flexShrink: 0,
            background: isDragging ? "var(--accent)" : "var(--border-subtle)",
          }}
        />
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        {viewMode === "home" ? (
          <>
            <TemplateModal open={templateModalOpen} onClose={() => setTemplateModalOpen(false)} onSelect={handleCreateFromTemplate} />
            <div className="flex-1 flex flex-col items-center justify-center" onClick={() => setSelectedFolderId(null)}>
              <div className="text-5xl mb-4 opacity-20">+</div>
              <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>{t("selectFolderToStart", lang)}</p>
              <div className="flex gap-3 mt-6">
                <button onClick={handleOpenWorkspace} className="btn-secondary py-1.5 px-4 text-[13px]">{t("openWorkspaceBtn", lang)}</button>
                <button onClick={handleCreateNew} className="btn-secondary py-1.5 px-4 text-[13px]">{t("newWorkspaceBtn", lang)}</button>
                <button onClick={() => setTemplateModalOpen(true)} className="btn-secondary py-1.5 px-4 text-[13px]">{t("fromTemplateBtn", lang)}</button>
              </div>
              <button
                onClick={() => (window as any).__openTemplateManager?.()}
                className="mt-4 text-[11px]"
                style={{ color: "var(--text-tertiary)", background: "transparent", border: "none", cursor: "pointer" }}
              >
                {t("manageTemplates", lang)}
              </button>
            </div>
          </>
        ) : (
          <>
            <header className="px-4 py-2 flex items-center gap-3 shrink-0"
              style={{ background: "var(--bg-panel)", borderBottom: "1px solid var(--border-subtle)" }}>
              <input
                id="workspace-title-input"
                value={currentFile ? (currentFile.name.split("/").pop() || "").replace(/\.(md|csv|xlsx)$/, "") : folderName}
                onCompositionStart={() => { isComposing.current = true; }}
                onCompositionEnd={(e) => {
                  isComposing.current = false;
                  const target = e.target as HTMLInputElement;
                  if (currentFile) {
                    const ext = currentFile.name.match(/\.(md|csv|xlsx)$/)?.[0] || "";
                    const dir = currentFile.name.split("/").slice(0, -1).join("/");
                    const newName = dir ? `${dir}/${target.value}${ext}` : `${target.value}${ext}`;
                    handleRenameFile(currentFile.id, newName);
                  } else {
                    setFolderName(target.value);
                  }
                }}
                onChange={(e) => {
                  if (isComposing.current) return;
                  if (currentFile) {
                    const ext = currentFile.name.match(/\.(md|csv|xlsx)$/)?.[0] || "";
                    const dir = currentFile.name.split("/").slice(0, -1).join("/");
                    const newName = dir ? `${dir}/${e.target.value}${ext}` : `${e.target.value}${ext}`;
                    handleRenameFile(currentFile.id, newName);
                  } else {
                    setFolderName(e.target.value);
                  }
                }}
                className="max-w-md px-2 py-1 text-sm font-semibold border rounded outline-none bg-transparent transition-colors"
                style={{ color: "var(--text-primary)", borderColor: "transparent" }}
                placeholder={currentFile ? t("fileName", lang) : t("folderName", lang)}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                onBlur={(e) => {
                  (e.currentTarget.style.borderColor = "transparent");
                  // 清空后失焦 → 自动恢复默认文件名
                  if (currentFile) {
                    const trimmed = (e.target as HTMLInputElement).value.trim();
                    if (!trimmed) {
                      const isMd = currentFile.type === "md";
                      const defaultBase = isMd
                        ? t("untitledDocument", lang).replace(/\.md$/, "")
                        : t("untitledSheet", lang);
                      const ext = currentFile.name.match(/\.(md|csv|xlsx)$/)?.[0] || "";
                      const dir = currentFile.name.split("/").slice(0, -1).join("/");
                      const fallbackName = dir
                        ? `${dir}/${defaultBase}${ext}`
                        : `${defaultBase}${ext}`;
                      handleRenameFile(currentFile.id, fallbackName);
                    }
                  }
                }}
                onMouseEnter={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = "var(--border-subtle)"; }}
                onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = "transparent"; }} />
              <div className="flex-1" />
              <StatusBadge status={saveStatus} />
            </header>

            {openTabFiles.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl mb-4 opacity-20">+</div>
                  <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("selectFileToStart", lang)}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="tab-bar" id="tab-bar" ref={tabBarRef}>
                  <div ref={dropIndicatorRef} className="tab-drop-indicator" />
                  {openTabFiles.map((file, idx) => (
                    <div key={file.id}
                      className={`tab ${currentFileId === file.id ? "active" : ""}`}
                      onMouseDown={(e) => {
                        // 中键关闭
                        if (e.button === 1) {
                          e.preventDefault();
                          handleCloseTab(file.id, e as any);
                          return;
                        }
                        // 右键不处理
                        if (e.button !== 0) return;
                        // 关闭按钮上不启动拖拽
                        if ((e.target as HTMLElement).closest(".tab-close")) return;
                        // 启动潜在拖拽（由 window mousemove/mouseup 处理拖拽和点击）
                        e.preventDefault();
                        dragRef.current = { idx, x: e.clientX, dragging: false, fileId: file.id };
                      }}>
                      <span style={{ fontSize: 11, opacity: 0.4 }}>{file.type === "md" ? "M" : file.type === "docx" ? "W" : "E"}</span>
                      <span>{file.name.split("/").pop() || ""}</span>
                      {currentFileId === file.id && <span className="tab-dirty" />}
                      <button className="tab-close" onClick={(e) => { e.stopPropagation(); const wrapped = handleCloseTab; return wrapped(file.id, e as any); }}>×</button>
                    </div>
                  ))}
                </div>

                {/* Breadcrumb: file path (VS Code-style) */}
                {currentFile && (() => {
                  const parts = currentFile.name.split("/");
                  return (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        height: 22,
                        padding: "0 12px",
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                        background: "var(--bg-root)",
                        borderBottom: "1px solid var(--border-subtle)",
                        flexShrink: 0,
                        gap: 2,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {parts.map((part, i) => (
                        <span key={i} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                          {i > 0 && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.4, flexShrink: 0 }}>
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          )}
                          <span style={i === parts.length - 1 ? { color: "var(--accent-text)" } : undefined}>
                            {part}
                          </span>
                        </span>
                      ))}
                    </div>
                  );
                })()}

                {currentFile?.type === "md" && (
                  <EditorToolbar
                    editorRef={editorRef}
                    isPreviewMode={isMdPreview}
                    onTogglePreview={() => setIsMdPreview((p) => !p)}
                  />
                )}
                {currentFile?.type === "excel" && (
                  <>
                    <ExcelToolbar hot={hotInstance.current} key={hotKey} onUndo={handleUndo} onRedo={handleRedo} />
                    <FormulaBar cellRef={cellRef} formulaValue={formulaValue} hotInstance={hotInstance}
                      isFormulaBarFocused={isFormulaBarFocused} onFormulaValueChange={setFormulaValue} />
                  </>
                )}
                <div ref={wsZoomRef} data-workspace-zoom style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {currentFile?.type === "md" ? (
                  <MarkdownEditor
                    source={source}
                    onSourceChange={setSource}
                    editorRef={editorRef}
                    isPreviewMode={isMdPreview}
                    onTogglePreview={() => setIsMdPreview((p) => !p)}
                  />
                ) : (
                  <div className="hot-container" style={{ position: "relative", flex: 1, minHeight: 0 }}>
                    <div ref={hotRef} style={{ width: "100%", height: "100%" }}
                      onContextMenu={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        const hot = (window as any).__ctxHot;
                        if (!hot || hot.isDestroyed) return;
                        const sel = hot.getSelected();
                        if (sel && sel.length > 0) setCtxMenuSelection(sel);
                        setCtxMenuPos({ x: e.clientX, y: e.clientY });
                        setCtxMenuVisible(true);
                      }} />
                  </div>
                )}
                </div>
                <ContextMenu hot={hotInstance.current} visible={ctxMenuVisible} position={ctxMenuPos}
                  selection={ctxMenuSelection} onClose={() => setCtxMenuVisible(false)} />
              </>
            )}
          </>
        )}
      </div>
      </div>
      </div>
    </div>
  );
}

export default FolderWorkspace;
