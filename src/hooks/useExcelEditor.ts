/**
 * useExcelEditor.ts — Handsontable 电子表格编辑器 hook
 *
 * 完整的 Handsontable 生命周期管理：
 *   init（初始化） → save（自动保存） → destroy（销毁）
 *
 * 生命周期流程：
 * 1. currentFile 变化时，检查是否为 Excel 类型 + DOM 容器是否就绪
 * 2. 初始化 Handsontable 实例，加载保存的数据和样式元数据（cellMeta）
 * 3. 注册 afterChange/afterCreateRow/afterRemoveRow 等 hooks → 触发自动保存
 * 4. 注册 afterSelection hook → 同步编辑栏（FormulaBar）显示
 * 5. ResizeObserver 监听容器尺寸变化 → 动态调整表格最小行数
 * 6. 组件卸载或文件切换时 → 执行最后一次保存 + 销毁 Handsontable 实例
 *
 * 关键设计决策：
 * - 使用 currentFile?.id 作为 useEffect 唯一依赖项，避免 currentFile 对象
 *   引用变化导致不必要的重新初始化
 * - cellMeta 独立存储（作为 content 对象的一个字段），因为 Handsontable
 *   内置 undo 不追踪 setCellMeta 的样式变更
 * - 自动保存延迟 500ms：Handsontable 编辑单元格时会高频触发 afterChange，
 *   使用返回 cleanup 函数的模式实现 debounced save
 * - 元数据撤销栈（useMetaUndo）与 Handsontable 内置撤销独立工作：
 *   Ctrl+Z 时先检查是否有元数据可恢复，否则回退到 hot.undo()
 *
 * 导出：
 * - hotRef:        DOM 容器 ref（挂载到 div 上由 Handsontable 接管）
 * - hotInstance:   Handsontable 实例 ref
 * - hotKey:        强制重渲染 ExcelToolbar 的 key（每次初始化递增）
 * - cellRef:       当前选中单元格引用（如 "A1"）
 * - formulaValue:  编辑栏输入值
 * - setFormulaValue: 设置编辑栏值
 * - isFormulaBarFocused: 编辑栏是否获得焦点（防止覆盖输入中的值）
 * - handleUndo:    撤销（优先元数据栈，回退到 hot.undo()）
 * - handleRedo:    重做
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { storageGetFolder, storageUpdateFolder, storageWriteWorkspaceFileBinary, storageDeleteWorkspaceFile } from "../storage";
import { restoreMetaUndo, pushMetaUndo } from "../hooks/useMetaUndo";
import { dataToXlsxBase64, xlsxBase64ToData } from "../utils/xlsxUtils";
import { KEYBINDINGS, matchesKey } from "../config";
import type { FolderFile } from "../types";

/** 默认空 Excel 内容（26 列 x 100 行） */
const defaultExcelContent = (() => {
  const cols = 26, rows = 100;
  const colHeaders = Array.from({ length: cols }, (_, i) => String.fromCharCode(65 + i));
  const data = Array.from({ length: rows }, () => Array(cols).fill(""));
  return { data, colHeaders };
})();

/**
 * 创建延迟自动保存函数
 *
 * 返回一个调用后启动定时器的函数，多次调用会自动清除前一个定时器（防抖）。
 * 保存时收集所有单元格的样式元数据（颜色、粗体、斜体、字号）到 cellMeta。
 *
 * @param hot      Handsontable 实例
 * @param folderId 文件夹 ID
 * @param fileId   当前文件 ID
 * @param onReload 保存后重新加载文件夹的回调
 * @param delay    防抖延迟（毫秒），默认 500ms
 * @returns 触发定时保存的函数（可多次调用）
 */
function saveExcelContent(hot: any, folderId: number, folderName: string | null, fileId: string, fileName: string, currentFile: FolderFile | null, fmtMapRef: React.MutableRefObject<Record<string, Record<string, any>>>, delay = 500) {
  let timer: ReturnType<typeof setTimeout>;
  /** 用于跟踪上一次成功保存的数据，避免重复写入相同内容 */
  let lastSavedContent = "";

  const save = async () => {
    if (!hot || hot.isDestroyed) return;
    const rowCount = hot.countRows();
    const colCount = hot.countCols();
    const data = hot.getData();
    const colHeaders = hot.getColHeader();

    /** 从 fmtMap 构建 cellMeta 二维数组 */
    const buildCellMeta = (): any[][] => {
      const meta: any[][] = [];
      for (let r = 0; r < rowCount; r++) {
        const row: any[] = [];
        for (let c = 0; c < colCount; c++) {
          row.push(fmtMapRef.current[`${r},${c}`] || {});
        }
        meta.push(row);
      }
      return meta;
    };

    const cellMetaArr = buildCellMeta();
    const newContent = { data, colHeaders, cellMeta: cellMetaArr };

    // 快速检查：如果内容与上次保存的完全相同则跳过
    const contentFingerprint = JSON.stringify({ data, colHeaders, cellMeta: cellMetaArr });
    if (contentFingerprint === lastSavedContent) return;

    if (folderName && (window as any).electronAPI) {
      // Electron: 序列化为 base64 xlsx 并写入二进制文件
      const xlsxBase64 = await dataToXlsxBase64(data, colHeaders, cellMetaArr);
      // 将文件名中的旧扩展名替换为 .xlsx
      const xlsxFileName = fileName.replace(/\.(csv|xlsx)$/i, ".xlsx");
      if (!xlsxFileName.endsWith(".xlsx")) {
        // 文件名没有已知扩展名，添加 .xlsx
      }
      const finalName = xlsxFileName.endsWith(".xlsx") ? xlsxFileName : xlsxFileName + ".xlsx";
      await storageWriteWorkspaceFileBinary(folderName, finalName, xlsxBase64);

      // 如果是 legacy .csv 文件，迁移到 .xlsx 并清理旧文件
      if (finalName !== fileName) {
        await storageDeleteWorkspaceFile(folderName, fileName);
        await storageDeleteWorkspaceFile(folderName, fileName + ".meta");
        if (currentFile) { currentFile.name = finalName; }
      }

      if (currentFile) { currentFile.content = newContent; currentFile.updatedAt = Date.now(); }
      lastSavedContent = contentFingerprint;
    } else {
      // Browser/IndexedDB: 存储为 base64 xlsx 字符串
      const xlsxBase64 = await dataToXlsxBase64(data, colHeaders, cellMetaArr);
      const folder = await storageGetFolder(folderId);
      if (!folder) return;
      const files = folder.files.map((f) =>
        f.id === fileId ? { ...f, content: xlsxBase64, updatedAt: Date.now() } : f
      );
      await storageUpdateFolder(folderId, { files, updatedAt: Date.now() });
      lastSavedContent = contentFingerprint;
    }
  };
  return () => { clearTimeout(timer); timer = setTimeout(save, delay); };
}

/**
 * useExcelEditor — Handsontable 初始化和生命周期管理
 *
 * @param currentFile  当前激活的文件（null 表示无 Excel 文件激活）
 * @param folderId     当前工作区文件夹 ID
 * @param reloadFolder 重新加载文件夹的回调
 */
export function useExcelEditor(currentFile: FolderFile | null, folderId: number | null, folderName: string | null, reloadFolder: () => void) {
  /** DOM 容器 ref，Handsontable 将渲染到此 div 内 */
  const hotRef = useRef<HTMLDivElement>(null);
  /** Handsontable 实例 ref（通过 new Handsontable() 创建） */
  const hotInstance = useRef<any>(null);
  /** hotKey 每次初始化递增，强制 ExcelToolbar 重渲染以绑定新的 hot 实例 */
  const [hotKey, setHotKey] = useState(0);
  /** 当前选中单元格引用（如 "A1"、"B12"），显示在编辑栏左侧 */
  const [cellRef, setCellRef] = useState("");
/** 编辑栏的当前值（与当前选中单元格内容同步） */
  const [formulaValue, setFormulaValue] = useState("");
  /** 编辑栏是否获得焦点：聚焦时不覆盖用户正在编辑的值 */
  const isFormulaBarFocused = useRef(false);
  // 单元格格式表：key = "行,列"，value = { _color, _bgColor, ... }
  // 独立维护，不依赖 Handsontable 的 cellMeta 兼容性
  const fmtMap = useRef<Record<string, Record<string, any>>>({});
  /** 暴露给 ExcelToolbar 调用：记录格式变更 */
  const recordFmt = (r: number, c: number, key: string, val: any) => {
    const k = `${r},${c}`;
    if (!fmtMap.current[k]) fmtMap.current[k] = {};
    if (val === undefined || val === null || val === "") {
      delete fmtMap.current[k][key];
      if (Object.keys(fmtMap.current[k]).length === 0) delete fmtMap.current[k];
    } else {
      fmtMap.current[k][key] = val;
    }
  };
  (window as any).__recordFmt = recordFmt;

  // ─── Excel/Handsontable 初始化 ──────────────────────────────────────────
  // 仅在 currentFile.id 变化时触发（不依赖 content 对象引用）
  useEffect(() => {
    if (!currentFile || currentFile.type !== "excel" || !hotRef.current) return;
    const H = (window as any).Handsontable;
    if (!H) return;
    const content = currentFile.content || defaultExcelContent;
    const isEmptyData = !content.data || !content.data.length || !content.data[0]?.length;

    // Handsontable 配置对象
    const config: any = {
      data: isEmptyData ? defaultExcelContent.data : content.data,
      colHeaders: true, rowHeaders: true, colWidths: 100,
      height: "100%", width: "100%",
      licenseKey: "non-commercial-and-evaluation",
      contextMenu: false, // 禁用右键菜单（使用自定义 ContextMenu 组件）
      manualColumnResize: true, manualRowResize: true,
      outsideClickDeselects: false, undo: true, stretchH: "all", minCols: 3,
      viewportRowRenderingOffset: 20,
      /**
       * 自定义渲染器：在 TextRenderer 基础上应用单元格元数据样式
       *
       * 注意：颜色通过 inline style 设置（不以 !important 覆盖），
       * 遵循 CLAUDE.md 的 Handsontable 禁区规则。
       */
      renderer: function (instance: any, td: any, row: number, col: number, prop: any, value: any, cellProperties: any) {
        H.renderers.TextRenderer(instance, td, row, col, prop, value, cellProperties);
        const meta = instance.getCellMeta(row, col);
        if (meta._bold !== undefined) td.style.fontWeight = meta._bold ? "bold" : "";
        if (meta._italic !== undefined) td.style.fontStyle = meta._italic ? "italic" : "";
        if (meta._underline !== undefined) {
          td.style.textDecoration = meta._underline ? "underline" : "none";
        }
        if (meta._fontSize !== undefined) td.style.fontSize = meta._fontSize ? meta._fontSize + "px" : "";
        if (meta._color) td.style.color = meta._color; else td.style.color = "";
        if (meta._bgColor) { td.style.backgroundColor = meta._bgColor; } else { td.style.backgroundColor = ""; }
      },
      /**
       * 拦截 Ctrl+Z（Undo）快捷键：
       * 优先从元数据撤销栈恢复（样式变更），若栈为空则回退到 Handsontable 内置 undo
       */
      beforeKeyDown: function (this: any, event: KeyboardEvent) {
        if (matchesKey(event, KEYBINDINGS.excelUndo) && !event.shiftKey) {
          if (restoreMetaUndo(this)) { event.preventDefault(); event.stopImmediatePropagation(); }
        }
        // Ctrl+V: 粘贴后恢复格式
        if ((event.ctrlKey || event.metaKey) && event.key === "v") {
          const fmt: any = (window as any).__gullClipFmt;
          if (fmt) {
            const sel = this.getSelected();
            if (sel && sel[0]) {
              const [r1, c1] = sel[0];
              if (r1 >= 0 && c1 >= 0) {
                setTimeout(() => {
                  const f: any = (window as any).__gullClipFmt;
                  if (f) {
                    for (let ri = 0; ri < f.rows; ri++) {
                      for (let ci = 0; ci < f.cols; ci++) {
                        const cell = f.cells[ri * f.cols + ci];
                        if (!cell) continue;
                        this.setCellMeta(r1 + ri, c1 + ci, "_color", cell._color);
                        this.setCellMeta(r1 + ri, c1 + ci, "_bgColor", cell._bgColor);
                        this.setCellMeta(r1 + ri, c1 + ci, "_bold", cell._bold);
                        this.setCellMeta(r1 + ri, c1 + ci, "_italic", cell._italic);
                        this.setCellMeta(r1 + ri, c1 + ci, "_fontSize", cell._fontSize);
                      }
                    }
                    this.render();
                  }
                }, 50);
              }
            }
          }
        }
      },
    };
    // HyperFormula 支持公式计算引擎（若已加载 CDN 脚本）
    if ((window as any).HyperFormula) {
      config.formulas = { engine: (window as any).HyperFormula, sheetName: "Sheet1" };
    }

    // 创建 Handsontable 实例
    const hot = new H(hotRef.current, config);
    hotInstance.current = hot;
    // 暴露到全局供 ContextMenu 访问
    (window as any).__ctxHot = hot;
    (window as any).__pushMetaUndo = pushMetaUndo;

    // 恢复保存的单元格样式元数据（同时填充 fmtMap 和 Handsontable meta）
    fmtMap.current = {};
    const savedMeta = content.cellMeta;
    if (savedMeta) {
      for (let r = 0; r < savedMeta.length; r++) {
        const metaRow = savedMeta[r];
        if (!metaRow) continue;
        for (let c = 0; c < metaRow.length; c++) {
          const meta = metaRow[c];
          if (!meta || Object.keys(meta).length === 0) continue;
          fmtMap.current[`${r},${c}`] = { ...meta };
          for (const [key, value] of Object.entries(meta)) {
            if (value !== undefined) hot.setCellMeta(r, c, key, value);
          }
        }
      }
      hot.render();
    }

    setHotKey((k) => k + 1);
    // 注册自动保存 hook：监听所有数据/行列变化，500ms 防抖后保存
    const saveFn = saveExcelContent(hot, folderId!, folderName, currentFile.id, currentFile.name, currentFile, fmtMap);
    (window as any).__triggerExcelSave = saveFn;
    hot.addHook("afterChange", saveFn);
    hot.addHook("afterCreateRow", saveFn);
    hot.addHook("afterCreateCol", saveFn);
    hot.addHook("afterRemoveRow", saveFn);
    hot.addHook("afterRemoveCol", saveFn);

    // ── 编辑栏同步 + 选区边界样式 ──
    // afterSelection: 更新编辑栏显示（单元格引用 + 值），同时为选区边缘添加边界 class
    hot.addHook("afterSelection", (r: number, c: number, r2: number, c2: number) => {
      if (r < 0 || c < 0) return;
      // 清除上一次选区的边界 class
      document.querySelectorAll(".hot-container [class*='ht-boundary-']")
        .forEach((el: Element) => { el.classList.remove("ht-boundary-t","ht-boundary-b","ht-boundary-l","ht-boundary-r"); });
      // 为选区边缘单元格添加方向边界 class（用于 CSS 边框高亮）
      const rMin = Math.min(r, r2), rMax = Math.max(r, r2);
      const cMin = Math.min(c, c2), cMax = Math.max(c, c2);
      for (let rr = rMin; rr <= rMax; rr++) {
        for (let cc = cMin; cc <= cMax; cc++) {
          const td = hot.getCell(rr, cc, true) as HTMLElement | null;
          if (!td) continue;
          if (rr === rMin) td.classList.add("ht-boundary-t");
          if (rr === rMax) td.classList.add("ht-boundary-b");
          if (cc === cMin) td.classList.add("ht-boundary-l");
          if (cc === cMax) td.classList.add("ht-boundary-r");
        }
      }
      const colHeaders = hot.getColHeader();
      const colLetter = typeof colHeaders[c] === 'string' ? colHeaders[c] : String.fromCharCode(65 + c);
      setCellRef(`${colLetter}${r + 1}`);
      // 状态栏：单元格范围
      const el = document.getElementById("global-statusbar");
      if (el) {
        const isZh = (() => { try { return localStorage.getItem("gull_lang") !== "en"; } catch { return true; } })();
        const Ln = isZh ? "行" : "Ln", Col = isZh ? "列" : "Col", Sel = isZh ? "已选择" : "Selected";
        const range = r !== r2 || c !== c2
          ? `<span style="color:var(--text-secondary)">${Sel}: ${colLetter}${r + 1}:${typeof colHeaders[c2] === 'string' ? colHeaders[c2] : String.fromCharCode(65 + c2)}${r2 + 1}</span>`
          : "";
        const ln = `${Ln} ${r + 1}, ${Col} ${c + 1}`;
        el.innerHTML = `<span>Excel</span><span style="display:flex;gap:10px"><span>${ln}</span>${range}</span>`;
      }
      if (!isFormulaBarFocused.current) {
        const val = hot.getDataAtCell(r, c);
        setFormulaValue(val != null ? String(val) : "");
      }
    });
    // afterChange: 当编辑栏未聚焦时，同步当前单元格值到编辑栏
    hot.addHook("afterChange", (changes: any[] | null, source: string) => {
      if (source === 'loadData' || !changes || isFormulaBarFocused.current) return;
      const sel = hot.getSelected();
      if (sel && sel[0]) {
        const [r, c] = sel[0];
        const val = hot.getDataAtCell(r, c);
        setFormulaValue(val != null ? String(val) : "");
      }
    });

    // afterDeselect: 清除选区边界样式
    hot.addHook("afterDeselect", () => {
      document.querySelectorAll(".hot-container [class*='ht-boundary-']")
        .forEach((el: Element) => { el.classList.remove("ht-boundary-t","ht-boundary-b","ht-boundary-l","ht-boundary-r"); });
    });
    // 根据容器高度动态计算最小行数（行高约 24px），ResizeObserver 响应容器尺寸变化
    const calcRows = () => Math.max(3, Math.floor((hotRef.current!.clientHeight - 30) / 24));
    const ro = new ResizeObserver(() => {
      if (hot && !hot.isDestroyed) {
        hot.updateSettings({ minRows: calcRows() } as any);
        hot.refreshDimensions();
        hot.render();
      }
    });
    if (hotRef.current) {
      hot.updateSettings({ minRows: calcRows() } as any);
      ro.observe(hotRef.current);
    }

    return () => {
      // 清理：断开 ResizeObserver → 执行最后一次保存 → 销毁 Handsontable 实例
      ro.disconnect();
      saveFn();
      if (hot && !hot.isDestroyed) hot.destroy();
    };
    // currentFile?.id 是唯一依赖项：仅当切换到不同文件时才重建编辑器
  }, [currentFile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 内容更新（磁盘加载后 / IndexedDB 加载后）──────────────────────
  // 场景：编辑器已用占位数据初始化，但内容异步加载后发生了变化。
  // Electron: FolderWorkspace 磁盘加载 → setFolder → currentFile.content 更新
  // Browser: IndexedDB 返回 base64 xlsx 字符串 → 需要解析
  useEffect(() => {
    const hot = hotInstance.current;
    if (!hot || hot.isDestroyed || !currentFile) return;
    const content = currentFile.content;
    if (!content) return;

    // Browser/IndexedDB 模式：content 是 base64 xlsx 字符串，需要解析
    if (typeof content === "string") {
      if (content.length === 0) return;
      xlsxBase64ToData(content).then((parsed) => {
        if (!hot || hot.isDestroyed) return;
        if (parsed.data && parsed.data.length > 0 && parsed.data[0]?.length > 0) {
          hot.loadData(parsed.data);
        }
        if (parsed.cellMeta && parsed.cellMeta.length > 0) {
          fmtMap.current = {};
          for (let r = 0; r < parsed.cellMeta.length; r++) {
            const metaRow = parsed.cellMeta[r];
            if (!metaRow) continue;
            for (let c = 0; c < metaRow.length; c++) {
              const meta = metaRow[c];
              if (!meta || Object.keys(meta).length === 0) continue;
              fmtMap.current[`${r},${c}`] = { ...meta };
              for (const [key, value] of Object.entries(meta)) {
                if (value !== undefined) hot.setCellMeta(r, c, key, value);
              }
            }
          }
          hot.render();
        }
        // 缓存解析后的内容，避免重复解析
        if (currentFile) { currentFile.content = parsed; }
      }).catch(() => { /* parse failed, keep placeholder */ });
      return;
    }

    // Electron/内部模型：content 是 {data, colHeaders, cellMeta} 对象
    const savedMeta = (content as any).cellMeta as any[][] | undefined;
    const contentData = (content as any).data as string[][] | undefined;

    // 如果数据维度与当前不同（从占位变为实际数据），加载数据
    if (contentData && contentData.length > 0 && contentData[0]?.length > 0) {
      const currentRows = hot.countRows();
      const currentCols = hot.countCols();
      const isPlaceholder = currentRows <= 1 && currentCols <= 1;
      if (isPlaceholder || contentData.length !== currentRows || contentData[0].length !== currentCols) {
        hot.loadData(contentData);
      }
    }

    // 恢复 cellMeta
    if (savedMeta && savedMeta.length > 0) {
      fmtMap.current = {};
      for (let r = 0; r < savedMeta.length; r++) {
        const metaRow = savedMeta[r];
        if (!metaRow) continue;
        for (let c = 0; c < metaRow.length; c++) {
          const meta = metaRow[c];
          if (!meta || Object.keys(meta).length === 0) continue;
          fmtMap.current[`${r},${c}`] = { ...meta };
          for (const [key, value] of Object.entries(meta)) {
            if (value !== undefined) hot.setCellMeta(r, c, key, value);
          }
        }
      }
      hot.render();
    }
  }, [currentFile?.content]);

  const handleUndo = useCallback(() => {
    const hot = hotInstance.current;
    if (!hot || hot.isDestroyed) return;
    if (!restoreMetaUndo(hot)) hot.undo();
  }, []);

  const handleRedo = useCallback(() => {
    const hot = hotInstance.current;
    if (!hot || hot.isDestroyed) return;
    hot.redo();
  }, []);

  return { hotRef, hotInstance, hotKey, cellRef, formulaValue, setFormulaValue, isFormulaBarFocused, handleUndo, handleRedo };
}
