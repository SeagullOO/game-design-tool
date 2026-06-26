# 深度重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 深度重构 Gull 项目：删除死代码、CSS 模块化拆分、FolderWorkspace 拆分、ExcelToolbar 提取子组件、依赖清理、引入 Vitest、重组 docs、更新 CLAUDE.md

**Architecture:** 8 个阶段，按依赖顺序执行。先删死代码→CSS 拆分→组件拆分→依赖清理→测试→文档→验证。每个阶段产出独立可验证。

**Tech Stack:** React 18 + Vite 5 + TypeScript strict, Vitest + jsdom, Monaco 0.55, Tiptap 3.x, Handsontable 14.x

**Design Spec:** `docs/superpowers/specs/2026-06-26-deep-refactor-design.md`

## Global Constraints

- 每个新文件 < 200 行，每个函数 < 50 行
- 只用 CSS 变量（`var(--accent)`），不写硬编码色值
- 不可变模式（spread，不直接 mutate）
- Handsontable 样式不能加 `!important`
- `npm run dev` 和 `npm run build` 必须通过
- 所有 commit 遵循 `feat:` / `refactor:` / `chore:` / `docs:` 前缀

---

### Task 1: 删除死代码文件

**Files:**
- Delete: `src/components/FileTree.tsx`
- Delete: `src/pages/FolderList.tsx`
- Delete: `test-drag.ts`
- Delete: `test-final.js`
- Verify: `src/hooks/markdown-converter.ts` 有消费方 → **保留不删**

**Interfaces:**
- Consumes: 无
- Produces: 清理后的 src/ 目录

- [ ] **Step 1: 删除四个死代码文件**

```bash
cd "D:/AI Projects/Gull"
rm src/components/FileTree.tsx
rm src/pages/FolderList.tsx
rm test-drag.ts
rm test-final.js
```

- [ ] **Step 2: 验证 markdown-converter.ts 仍被引用，确认它不删**

```bash
grep -r "markdown-converter" src/ --files-with-matches
```

Expected output: `src/hooks/useMarkdownEditor.ts` 和 `src/hooks/markdown-converter.ts` — 确认有消费方，保留。

- [ ] **Step 3: 运行 dev build 验证无编译错误**

```bash
npm run build
```

Expected: Build succeeds (无引用 FileTree/FolderList 的 import 报错)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: 删除死代码 — FileTree, FolderList, test 临时文件"
```

---

### Task 2: CSS 模块化 — 创建 src/styles/ 目录和 tokens.css

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/utilities.css`
- Modify: `src/index.css` (提取后删除对应区块)

**Interfaces:**
- Consumes: `src/index.css` 中的 Design Tokens 区块（行80-195）和工具类
- Produces: `src/styles/tokens.css` 导出 CSS 变量，`src/styles/utilities.css` 导出工具类

- [ ] **Step 1: 创建 tokens.css — 设计令牌 + 亮色模式**

从 `src/index.css` 的行 80-230 区域提取：`:root` 变量、`:root.light` 变量、focus outlines、root container 样式。写入 `src/styles/tokens.css`。

```css
/**
 * @file tokens.css
 * @description Design tokens — CSS 变量体系（Nord Blue 暗色/亮色），根容器，focus outlines
 */

/* ============================================================
   Design Tokens — Nord Blue dark palette
   ============================================================ */
:root {
  --bg-darkest: #181818;
  --bg-root: #1e1e1e;
  --bg-panel: #262626;
  --bg-surface: #2a2a2a;
  --bg-hover: #2f2f2f;
  --bg-active: #363636;
  --bg-selected: #3a3a3a;
  --bg-input: #1e1e1e;

  --text-primary: #dadada;
  --text-secondary: #999;
  --text-tertiary: #666;
  --text-inverse: #1e1e1e;

  --accent: #a882ff;
  --accent-text: #c3adff;
  --accent-hover: #9b6fff;
  --accent-bg: rgba(168,130,255,0.12);
  --accent-bg-hover: rgba(168,130,255,0.18);

  --danger: #e06c75;
  --warning: #e5c07b;
  --success: #98c379;
  --info: #61afef;

  --border-subtle: #2e2e2e;
  --border-medium: #3e3e3e;
  --border-strong: #555;

  --scrollbar-thumb: #444;
  --scrollbar-thumb-hover: #555;
  --scrollbar-track: transparent;

  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.5);
}

/* ============================================================
   Design Tokens — Light Mode
   ============================================================ */
:root.light {
  --bg-darkest: #f5f5f5;
  --bg-root: #ffffff;
  --bg-panel: #fafafa;
  --bg-surface: #f5f5f5;
  --bg-hover: #efefef;
  --bg-active: #e8e8e8;
  --bg-selected: #e0e0e0;
  --bg-input: #ffffff;

  --text-primary: #1e1e1e;
  --text-secondary: #666;
  --text-tertiary: #999;
  --text-inverse: #ffffff;

  --accent: #7b5cff;
  --accent-text: #6a4bdf;
  --accent-hover: #6a3fff;
  --accent-bg: rgba(123,92,255,0.08);
  --accent-bg-hover: rgba(123,92,255,0.14);

  --danger: #c0392b;
  --warning: #b8860b;
  --success: #27ae60;
  --info: #2980b9;

  --border-subtle: #e0e0e0;
  --border-medium: #ccc;
  --border-strong: #999;

  --scrollbar-thumb: #bbb;
  --scrollbar-thumb-hover: #999;
  --scrollbar-track: transparent;

  --shadow-sm: 0 1px 2px rgba(0,0,0,0.08);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.12);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.16);
}

/* ---- Remove yellow focus outlines ---- */
*:focus { outline: none !important; }

/* ---- Root container ---- */
html, body, #root {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow: hidden;
  background: var(--bg-darkest);
  color: var(--text-primary);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 2: 创建 utilities.css — 滚动条 + 通用动画**

从 `src/index.css` 的行 250-271 提取滚动条样式，加上 `@keyframes spin`（行 2137-2141 的动画）。

```css
/**
 * @file utilities.css
 * @description 自定义滚动条（WebKit + Firefox），通用动画 keyframes
 */

/* ---- Scrollbar (WebKit + Firefox) ---- */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}
::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}
::-webkit-scrollbar-corner {
  background: transparent;
}
* {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

/* ---- Keyframes ---- */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

- [ ] **Step 3: 更新 index.css — 替换提取的区块为 @import**

编辑 `src/index.css`：删除行 80-271 的 token/focus/root/scrollbar 区块，在文件顶部 @tailwind 指令之后添加：

```css
@import './styles/tokens.css';
@import './styles/utilities.css';
```

注意：由于 Vite 处理 `@import`，路径相对于当前文件。

- [ ] **Step 4: 验证 tokens 和 utilities 生效**

```bash
npm run dev
```

目视检查：暗色模式 CSS 变量正常加载，滚动条样式不变，动画正常。

- [ ] **Step 5: Commit**

```bash
git add src/styles/tokens.css src/styles/utilities.css src/index.css
git commit -m "refactor: 提取 CSS tokens 和 utilities 到 src/styles/"
```

---

### Task 3: CSS 模块化 — 拆分组件样式

**Files:**
- Create: `src/styles/components.css`
- Create: `src/styles/handsontable.css`
- Create: `src/styles/markdown.css`
- Create: `src/styles/monaco.css`
- Create: `src/styles/tiptap.css`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `src/styles/tokens.css` 中的 CSS 变量
- Produces: 各模块 CSS 文件，index.css 通过 @import 引入

- [ ] **Step 1: 创建 components.css — 组件样式**

从 `src/index.css` 提取以下区块（保持所有规则不变）：
- ActivityBar（行 274-313）
- TitleBar（行 316-355）
- Sidebar（行 358-397）
- FileExplorer/FileTree（行 400-446）
- ExcelToolbar（行 449-481）
- Shared Components — card/button/tool-btn/divider/status-badge/input-ide（行 483-754）
- Tab bar（行 756-857）
- Formula Bar（行 860-925）
- Custom React Context Menu（行 1232-1369）
- Settings Page（行 1372-1886）

写入 `src/styles/components.css`，添加文件头注释。

- [ ] **Step 2: 创建 handsontable.css — Handsontable 覆盖**

从 `src/index.css` 提取行 928-1229（Handsontable custom overrides）。文件头标注 `/* !important 审查区 */`。

写入 `src/styles/handsontable.css`。

- [ ] **Step 3: 创建 markdown.css — Markdown 预览排版**

从 `src/index.css` 提取行 1938-2077（Markdown Preview Typography + splitter）。

写入 `src/styles/markdown.css`。

- [ ] **Step 4: 创建 monaco.css — Monaco Editor 主题集成**

从 `src/index.css` 提取行 1889-1935。

写入 `src/styles/monaco.css`。

- [ ] **Step 5: 创建 tiptap.css — Tiptap/ProseMirror 样式**

从 `src/index.css` 提取行 2084-2202。

写入 `src/styles/tiptap.css`。

- [ ] **Step 6: 更新 index.css — 删除已提取区块，添加 @import**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import './styles/tokens.css';
@import './styles/utilities.css';
@import './styles/components.css';
@import './styles/handsontable.css';
@import './styles/markdown.css';
@import './styles/monaco.css';
@import './styles/tiptap.css';
```

index.css 目标：~60 行（仅 @tailwind + @import）

- [ ] **Step 7: 验证构建通过**

```bash
npm run build
```

Expected: 构建成功，CSS 正确打包。目视检查暗色/亮色模式切换正常。

- [ ] **Step 8: Commit**

```bash
git add src/styles/ src/index.css
git commit -m "refactor: CSS 模块化拆分 — components/handsontable/markdown/monaco/tiptap"
```

---

### Task 4: 提取 useTabDrag hook

**Files:**
- Create: `src/hooks/useTabDrag.ts`
- Modify: `src/pages/FolderWorkspace.tsx` (删除行 145-286, 替换为 hook 调用)

**Interfaces:**
- Produces: `useTabDrag(opts): { onTabMouseDown, dropIndicatorRef, dragRef, tabBarRef }`
- Consumes: FolderWorkspace 传入 `openTabs`, `setOpenTabs`

- [ ] **Step 1: 创建 useTabDrag.ts**

```typescript
/**
 * @file useTabDrag.ts
 * @description 标签页中点法拖拽排序 — computeInsertIndex + mousemove/mouseup 事件管理
 *
 * 算法：中点法（midpoint method）
 * - 每个标签以其中点为分界线
 * - 鼠标在标签中点左侧 → 插入到该标签前面
 * - 鼠标在标签中点右侧 → 插入到该标签后面
 * - 鼠标与边缘的距离决定最近的间隙
 * - 向左和向右拖拽的感觉完全对称
 *
 * 导出：
 * - useTabDrag({ openTabs, setOpenTabs }): { onTabMouseDown, dropIndicatorRef, tabBarRef }
 */

import { useRef, useEffect, useCallback } from "react";
import type { FolderFile } from "../types";

interface DragState {
  idx: number;
  x: number;
  dragging: boolean;
  fileId: string;
}

function computeInsertIndex(
  mouseX: number,
  fromIdx: number,
  tabs: HTMLElement[]
): number {
  if (tabs.length <= 1) return 0;

  let bestGap = 0;
  let bestDist = Infinity;
  let postIdx = 0;

  for (let i = 0; i < tabs.length; i++) {
    if (i === fromIdx) continue;

    const rect = tabs[i].getBoundingClientRect();
    const mid = (rect.left + rect.right) / 2;
    const gap = mouseX < mid ? postIdx : postIdx + 1;
    const targetX = mouseX < mid ? rect.left : rect.right;
    const dist = Math.abs(mouseX - targetX);

    if (dist < bestDist) {
      bestDist = dist;
      bestGap = gap;
    }
    postIdx++;
  }

  const maxIdx = tabs.length - 1;
  return Math.max(0, Math.min(bestGap, maxIdx));
}

interface UseTabDragOptions {
  openTabs: FolderFile[];
  setOpenTabs: (tabs: FolderFile[]) => void;
}

export function useTabDrag({ openTabs, setOpenTabs }: UseTabDragOptions) {
  const dragRef = useRef<DragState>({ idx: -1, x: 0, dragging: false, fileId: "" });
  const dropIndicatorRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const openTabsRef = useRef<string[]>([]);

  // 同步 openTabs → openTabsRef
  useEffect(() => {
    openTabsRef.current = openTabs.map((f) => f.id);
  }, [openTabs]);

  const getTabs = useCallback((): HTMLElement[] => {
    const bar = tabBarRef.current;
    if (!bar) return [];
    const els = bar.querySelectorAll<HTMLElement>(".tab:not(.tab-drop-indicator)");
    return Array.from(els);
  }, []);

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

      // 从 DOM 中定位被拖拽的 tab（通过 tab-dragging class）
      let dragIdx = -1;
      for (let i = 0; i < tabs.length; i++) {
        if (tabs[i].classList.contains("tab-dragging")) { dragIdx = i; break; }
      }
      if (dragIdx < 0) {
        const idx = openTabsRef.current.indexOf(d.fileId);
        if (idx >= 0 && idx < tabs.length) {
          tabs[idx].classList.add("tab-dragging");
        }
      }

      const fromIdxMove = openTabsRef.current.indexOf(d.fileId);
      if (fromIdxMove < 0) return;

      const toIndex = computeInsertIndex(e.clientX, fromIdxMove, tabs);

      // 将 post-removal toIndex 映射回原始 DOM 索引定位指示线
      let domIdx = toIndex;
      for (let i = 0; i <= domIdx && i < tabs.length; i++) {
        if (tabs[i].classList.contains("tab-dragging")) { domIdx++; break; }
      }

      if (indicator && domIdx >= 0 && domIdx < tabs.length) {
        const targetRect = tabs[domIdx].getBoundingClientRect();
        indicator.style.left = targetRect.left - 2 + "px";
        indicator.style.display = "block";
      }
    };

    const onUp = (e: MouseEvent) => {
      const d = dragRef.current;
      if (d.idx < 0 || !d.fileId) {
        dragRef.current = { idx: -1, x: 0, dragging: false, fileId: "" };
        return;
      }

      // 清理视觉状态
      const tabs = getTabs();
      tabs.forEach((t) => t.classList.remove("tab-dragging"));
      const indicator = dropIndicatorRef.current;
      if (indicator) { indicator.style.display = "none"; }

      if (!d.dragging) {
        // 纯点击（无拖拽），在 FolderWorkspace 中处理
        dragRef.current = { idx: -1, x: 0, dragging: false, fileId: "" };
        return;
      }

      const fromIdx = openTabsRef.current.indexOf(d.fileId);
      if (fromIdx < 0) {
        dragRef.current = { idx: -1, x: 0, dragging: false, fileId: "" };
        return;
      }

      const toIndex = computeInsertIndex(e.clientX, fromIdx, tabs);
      const arr = [...openTabsRef.current];
      arr.splice(fromIdx, 1);
      arr.splice(toIndex, 0, d.fileId);

      // 重建完整 FolderFile 数组
      const fileMap = new Map<string, FolderFile>();
      const currentOpenTabs = openTabsRef.current.map(
        (id) => openTabs.find((f) => f.id === id)
      ).filter(Boolean) as FolderFile[];
      for (const f of currentOpenTabs) fileMap.set(f.id, f);

      const reordered: FolderFile[] = [];
      for (const id of arr) {
        const f = fileMap.get(id);
        if (f) reordered.push(f);
      }
      setOpenTabs(reordered);
      dragRef.current = { idx: -1, x: 0, dragging: false, fileId: "" };
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [openTabs, setOpenTabs, getTabs]);

  const onTabMouseDown = useCallback(
    (e: React.MouseEvent, fileId: string, idx: number) => {
      if (e.button === 1) return; // 中键
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest(".tab-close")) return;
      e.preventDefault();
      dragRef.current = { idx, x: e.clientX, dragging: false, fileId };
    },
    []
  );

  return { onTabMouseDown, dropIndicatorRef, tabBarRef } as const;
}
```

- [ ] **Step 2: 修改 FolderWorkspace.tsx — 导入并使用 useTabDrag**

在 `FolderWorkspace.tsx` 顶部添加 import：

```typescript
import { useTabDrag } from "../hooks/useTabDrag";
```

删除以下代码段：
- `DragState` interface（行 145-150 附近）
- `computeInsertIndex` 函数（行 162-198）
- 全局 mousemove/mouseup useEffect（行 200-286）
- `dragRef` 声明（所在行）
- `dropIndicatorRef` 声明（所在行）
- `tabBarRef` 声明（所在行）
- `openTabsRef` 声明（所在行）

在组件中添加 hook 调用（在 openTabs state 声明之后）：

```typescript
const { onTabMouseDown, dropIndicatorRef, tabBarRef } = useTabDrag({
  openTabs: openTabFiles,
  setOpenTabs,
});
```

在 tab 的 `onMouseDown` 中替换内联逻辑为 `onTabMouseDown`：

```tsx
// 原来: dragRef.current = { idx, x: e.clientX, dragging: false, fileId: file.id };
// 改为: onTabMouseDown(e, file.id, idx);
<div key={file.id}
  className={`tab ${currentFileId === file.id ? "active" : ""}`}
  onMouseDown={(e) => onTabMouseDown(e, file.id, idx)}>
```

- [ ] **Step 3: 验证构建**

```bash
npm run build
```

Expected: 构建成功。无类型错误。

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTabDrag.ts src/pages/FolderWorkspace.tsx
git commit -m "refactor: 提取 useTabDrag — 中点法拖拽排序算法独立 hook"
```

---

### Task 5: 提取 useWorkspaceZoom hook

**Files:**
- Create: `src/hooks/useWorkspaceZoom.ts`
- Modify: `src/pages/FolderWorkspace.tsx` (删除行 390-445, 替换为 hook 调用)

**Interfaces:**
- Produces: `useWorkspaceZoom(opts): { uiZoomRef, wsZoomRef }`
- Consumes: FolderWorkspace 传入 `zoom`, `setZoom`, `contentZoom`, `setContentZoom`, `currentFileId`

- [ ] **Step 1: 创建 useWorkspaceZoom.ts**

```typescript
/**
 * @file useWorkspaceZoom.ts
 * @description 工作区缩放系统 — UI 缩放 + 内容缩放，Ctrl+滚轮触发，localStorage 持久化
 *
 * UI 缩放：监听 ActivityBar + Sidebar 区域的 Ctrl+滚轮
 * 内容缩放：监听编辑区域的 Ctrl+滚轮
 * 缩放值保存到 localStorage (gull_settings)，跨会话持久化
 * 使用 capture: true 确保在子元素之前拦截事件
 *
 * 导出：
 * - useWorkspaceZoom({ zoom, setZoom, contentZoom, setContentZoom, currentFileId })
 *   => { uiZoomRef, wsZoomRef }
 */

import { useEffect, useRef } from "react";
import {
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  ZOOM_REFERENCE,
  CONTENT_ZOOM_MIN,
  CONTENT_ZOOM_MAX,
  CONTENT_ZOOM_STEP,
  CONTENT_ZOOM_DEFAULT,
} from "../config";

interface UseWorkspaceZoomOptions {
  zoom: number;
  setZoom: (fn: (prev: number) => number) => void;
  contentZoom: number;
  setContentZoom: (fn: (prev: number) => number) => void;
  currentFileId: string | null;
}

export function useWorkspaceZoom({
  zoom,
  setZoom,
  contentZoom,
  setContentZoom,
  currentFileId,
}: UseWorkspaceZoomOptions) {
  const uiZoomRef = useRef<HTMLDivElement>(null);
  const wsZoomRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  const contentZoomRef = useRef(contentZoom);

  // 同步最新值到 ref（避免闭包陈旧引用）
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { contentZoomRef.current = contentZoom; }, [contentZoom]);

  useEffect(() => {
    const uiEl = uiZoomRef.current;
    const wsEl = wsZoomRef.current;

    const saveSetting = (key: string, val: number) => {
      try {
        const raw = localStorage.getItem("gull_settings");
        const s = raw ? JSON.parse(raw) : {};
        s[key] = val;
        localStorage.setItem("gull_settings", JSON.stringify(s));
      } catch { /* localStorage 不可用则静默忽略 */ }
    };

    const onUiWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      if ((e.target as HTMLElement).closest("[data-workspace-zoom]")) return;
      e.preventDefault();
      e.stopPropagation();
      setZoom((prev) => {
        const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP)));
        saveSetting("zoom", next);
        (uiEl as HTMLElement | null)?.style.setProperty(
          "zoom",
          next !== ZOOM_REFERENCE ? String(next / ZOOM_REFERENCE) : ""
        );
        return next;
      });
    };

    const onWsWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      setContentZoom((prev) => {
        const next = Math.min(CONTENT_ZOOM_MAX, Math.max(CONTENT_ZOOM_MIN, prev + (e.deltaY > 0 ? -CONTENT_ZOOM_STEP : CONTENT_ZOOM_STEP)));
        saveSetting("contentZoom", next);
        (window as any).__contentZoom = next;
        const uiZoomCss = zoomRef.current !== ZOOM_REFERENCE ? zoomRef.current / ZOOM_REFERENCE : 1;
        (wsEl as HTMLElement | null)?.style.setProperty(
          "zoom",
          next !== CONTENT_ZOOM_DEFAULT ? String((next / CONTENT_ZOOM_DEFAULT) / uiZoomCss) : ""
        );
        return next;
      });
    };

    uiEl?.addEventListener("wheel", onUiWheel, { passive: false, capture: true });
    wsEl?.addEventListener("wheel", onWsWheel, { passive: false, capture: true });
    return () => {
      uiEl?.removeEventListener("wheel", onUiWheel, { capture: true });
      wsEl?.removeEventListener("wheel", onWsWheel, { capture: true });
    };
  }, [setZoom, setContentZoom, currentFileId]);

  return { uiZoomRef, wsZoomRef } as const;
}
```

- [ ] **Step 2: 修改 FolderWorkspace.tsx — 导入并使用 useWorkspaceZoom**

添加 import：

```typescript
import { useWorkspaceZoom } from "../hooks/useWorkspaceZoom";
```

删除原有的 zoom 相关 useEffect（行 390-445）和 `uiZoomRef`/`wsZoomRef` ref 声明（行 118-119），替换为：

```typescript
const { uiZoomRef, wsZoomRef } = useWorkspaceZoom({
  zoom,
  setZoom: setZoom!,
  contentZoom,
  setContentZoom: setContentZoom!,
  currentFileId: currentFile?.id ?? null,
});
```

- [ ] **Step 3: 验证构建**

```bash
npm run build
```

Expected: 构建成功。

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useWorkspaceZoom.ts src/pages/FolderWorkspace.tsx
git commit -m "refactor: 提取 useWorkspaceZoom — 工作区缩放独立 hook"
```

---

### Task 6: 提取 WorkspaceHeader 和 WorkspaceTabs 子组件

**Files:**
- Create: `src/components/WorkspaceHeader.tsx`
- Create: `src/components/WorkspaceTabs.tsx`
- Modify: `src/pages/FolderWorkspace.tsx`

**Interfaces:**
- Produces:
  - `WorkspaceHeader`: 标题输入 + 面包屑 + StatusBadge + EditorToolbar/ExcelToolbar + FormulaBar
  - `WorkspaceTabs`: 标签条渲染 + 拖拽启动
- Consumes: FolderWorkspace 的状态和回调

- [ ] **Step 1: 创建 WorkspaceHeader.tsx**

```typescript
/**
 * @file WorkspaceHeader.tsx
 * @description 工作区头部 — 文件标题输入、面包屑路径、保存状态、编辑器工具栏
 */

import { type FC } from "react";
import type { FolderFile } from "../types";
import StatusBadge from "./StatusBadge";
import EditorToolbar from "./EditorToolbar";
import ExcelToolbar from "./ExcelToolbar";
import FormulaBar from "./FormulaBar";
import type * as Monaco from "monaco-editor";

interface WorkspaceHeaderProps {
  folderName: string;
  currentFile: FolderFile | null;
  isComposing: React.MutableRefObject<boolean>;
  onRenameFile: (id: string, name: string) => void;
  onFolderNameChange: (name: string) => void;
  onRenameFileDirect: (id: string, name: string) => void;
  saveStatus: "saved" | "saving" | "unsaved";
  isMdPreview: boolean;
  onTogglePreview: () => void;
  editorRef: React.MutableRefObject<Monaco.editor.IStandaloneCodeEditor | null>;
  hotInstance: any;
  hotKey: number;
  onUndo: () => void;
  onRedo: () => void;
  cellRef: React.MutableRefObject<string>;
  formulaValue: string;
  isFormulaBarFocused: boolean;
  onFormulaValueChange: (v: string) => void;
  lang: string;
  t: (key: string, lang: string) => string;
}

export const WorkspaceHeader: FC<WorkspaceHeaderProps> = ({
  folderName,
  currentFile,
  isComposing,
  onRenameFile,
  onFolderNameChange,
  saveStatus,
  isMdPreview,
  onTogglePreview,
  editorRef,
  hotInstance,
  hotKey,
  onUndo,
  onRedo,
  cellRef,
  formulaValue,
  isFormulaBarFocused,
  onFormulaValueChange,
  lang,
  t,
}) => {
  // WorkspaceHeader 实现代码详见 src/components/WorkspaceHeader.tsx — 从 FolderWorkspace 行1056-1200 区域提取
  // (原来的行 1056-1200 区域)
};
```

- [ ] **Step 2: 创建 WorkspaceTabs.tsx**

```typescript
/**
 * @file WorkspaceTabs.tsx
 * @description 工作区标签页条 — 标签渲染、拖拽感知、关闭按钮、脏标记
 */

import { type FC, useRef } from "react";
import type { FolderFile } from "../types";

interface WorkspaceTabsProps {
  openTabFiles: FolderFile[];
  currentFileId: string | null;
  isComposing: React.MutableRefObject<boolean>;
  onTabMouseDown: (e: React.MouseEvent, fileId: string, idx: number) => void;
  onCloseTab: (fileId: string, e: React.MouseEvent) => void;
  onSelectTab: (fileId: string) => void;
  dropIndicatorRef: React.RefObject<HTMLDivElement>;
  tabBarRef: React.RefObject<HTMLDivElement>;
}

export const WorkspaceTabs: FC<WorkspaceTabsProps> = ({
  openTabFiles,
  currentFileId,
  onTabMouseDown,
  onCloseTab,
  onSelectTab,
  dropIndicatorRef,
  tabBarRef,
}) => {
  return (
    <div className="tab-bar" id="tab-bar" ref={tabBarRef}>
      <div ref={dropIndicatorRef} className="tab-drop-indicator" />
      {openTabFiles.map((file, idx) => (
        <div
          key={file.id}
          className={`tab ${currentFileId === file.id ? "active" : ""}`}
          onMouseDown={(e) => onTabMouseDown(e, file.id, idx)}
          onClick={() => onSelectTab(file.id)}
        >
          <span style={{ fontSize: 11, opacity: 0.4 }}>
            {file.type === "md" ? "M" : file.type === "docx" ? "W" : "E"}
          </span>
          <span>{file.name.split("/").pop() || ""}</span>
          {currentFileId === file.id && <span className="tab-dirty" />}
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(file.id, e as any);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
```

- [ ] **Step 3: 修改 FolderWorkspace.tsx — 使用新组件替换内联 JSX**

导入并使用 `WorkspaceHeader` 和 `WorkspaceTabs`。将原来的 1056-1228 行替换为组件调用。

- [ ] **Step 4: 验证构建**

```bash
npm run build
```

Expected: 构建成功。

- [ ] **Step 5: Commit**

```bash
git add src/components/WorkspaceHeader.tsx src/components/WorkspaceTabs.tsx src/pages/FolderWorkspace.tsx
git commit -m "refactor: 提取 WorkspaceHeader + WorkspaceTabs 子组件"
```

---

### Task 7: 提取 HomeView 子组件

**Files:**
- Create: `src/components/HomeView.tsx`
- Modify: `src/pages/FolderWorkspace.tsx`

**Interfaces:**
- Produces: `HomeView` — 主页模式的 Sidebar + 欢迎页 + TemplateModal
- Consumes: FolderWorkspace 的主页相关状态和回调

- [ ] **Step 1: 创建 HomeView.tsx**

```typescript
/**
 * @file HomeView.tsx
 * @description 主页视图 — 文件夹侧边栏 + 空状态引导 + 模板选择
 */

import { type FC } from "react";
import type { Folder } from "../types";
import Sidebar from "./Sidebar";
import TemplateModal from "./TemplateModal";
import { t } from "../i18n";

interface HomeViewProps {
  lang: string;
  folders: Folder[];
  selectedFolderId: string | null;
  searchQuery: string;
  homeLoaded: boolean;
  setSearchQuery: (q: string) => void;
  setSelectedFolderId: (id: string | null) => void;
  onSelectFolder: (id: string) => void;
  onEnterFolder: (id: string) => void;
  onCreateNew: () => void;
  onCreateFromTemplate: (templateId: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onCopy: (id: string) => void;
  templateModalOpen: boolean;
  setTemplateModalOpen: (open: boolean) => void;
  onOpenWorkspace: () => void;
}

export const HomeView: FC<HomeViewProps> = ({
  lang,
  folders,
  selectedFolderId,
  searchQuery,
  homeLoaded,
  setSearchQuery,
  setSelectedFolderId,
  onSelectFolder,
  onEnterFolder,
  onCreateNew,
  onCreateFromTemplate,
  onRename,
  onDelete,
  onCopy,
  templateModalOpen,
  setTemplateModalOpen,
  onOpenWorkspace,
}) => {
  return (
    <>
      {homeLoaded && (
        <Sidebar
          folders={folders}
          selectedId={selectedFolderId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectFolder={onSelectFolder}
          onDoubleClick={onEnterFolder}
          onCreateNew={onCreateNew}
          onCreateFromTemplate={() => setTemplateModalOpen(true)}
          onRename={onRename}
          onDelete={onDelete}
          onCopy={onCopy}
          onDeselectAll={() => setSelectedFolderId(null)}
        />
      )}
      <TemplateModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onSelect={onCreateFromTemplate}
      />
      <div
        className="flex-1 flex flex-col items-center justify-center"
        onClick={() => setSelectedFolderId(null)}
      >
        <div className="text-5xl mb-4 opacity-20">+</div>
        <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>
          {t("selectFolderToStart", lang)}
        </p>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onOpenWorkspace}
            className="btn-secondary py-1.5 px-4 text-[13px]"
          >
            {t("openWorkspaceBtn", lang)}
          </button>
          <button
            onClick={onCreateNew}
            className="btn-secondary py-1.5 px-4 text-[13px]"
          >
            {t("newWorkspaceBtn", lang)}
          </button>
          <button
            onClick={() => setTemplateModalOpen(true)}
            className="btn-secondary py-1.5 px-4 text-[13px]"
          >
            {t("fromTemplateBtn", lang)}
          </button>
        </div>
        <button
          onClick={() => (window as any).__openTemplateManager?.()}
          className="mt-4 text-[11px]"
          style={{
            color: "var(--text-tertiary)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          {t("manageTemplates", lang)}
        </button>
      </div>
    </>
  );
};
```

- [ ] **Step 2: 修改 FolderWorkspace.tsx — 使用 HomeView 替换内联 JSX**

将原来 home 模式的 JSX（Sidebar + TemplateModal + 欢迎页）替换为 `<HomeView .../>`。

- [ ] **Step 3: 验证构建**

```bash
npm run build
```

Expected: 构建成功。

- [ ] **Step 4: Commit**

```bash
git add src/components/HomeView.tsx src/pages/FolderWorkspace.tsx
git commit -m "refactor: 提取 HomeView — 主页模式独立子组件"
```

---

### Task 8: 提取 CustomColorPicker 和 DropPanel

**Files:**
- Create: `src/components/CustomColorPicker.tsx`
- Create: `src/components/DropPanel.tsx`
- Modify: `src/components/ExcelToolbar.tsx`

**Interfaces:**
- Produces:
  - `CustomColorPicker`: HSV 色相条 + SV 面板 + hex 输入 + 预设色
  - `DropPanel`: Portal 下拉面板通用组件
- Consumes: ExcelToolbar 的颜色选取状态

- [ ] **Step 1: 创建 DropPanel.tsx**

```typescript
/**
 * @file DropPanel.tsx
 * @description Portal 下拉面板 — 在 trigger 正下方展开，自动定位，用于工具栏弹出菜单
 */

import { type FC, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

interface DropPanelProps {
  triggerRef: RefObject<HTMLElement>;
  open: boolean;
  children: ReactNode;
  panelRef?: RefObject<HTMLDivElement>;
}

export const DropPanel: FC<DropPanelProps> = ({
  triggerRef,
  open,
  children,
  panelRef,
}) => {
  if (!open || !triggerRef.current) return null;
  const rect = triggerRef.current.getBoundingClientRect();
  const top = rect.bottom + 4;
  const left = rect.left;

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 9999,
        background: "var(--bg-panel)",
        border: "1px solid var(--border-medium)",
        borderRadius: 6,
        boxShadow: "var(--shadow-lg)",
        padding: 8,
      }}
    >
      {children}
    </div>,
    document.body
  );
};
```

- [ ] **Step 2: 创建 CustomColorPicker.tsx**

```typescript
/**
 * @file CustomColorPicker.tsx
 * @description 自定义颜色选择器 — HSV 色相条 + 饱和度/明度面板 + hex 输入 + 预设色盘
 */

import { type FC, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { hexToHsv, hsvToHex, hexToRgb } from "../utils/colorUtils";

interface CustomColorPickerProps {
  open: boolean;
  onClose: () => void;
  onApply: (hex: string) => void;
}

const PRESET_COLORS = [
  "#000000", "#ffffff", "#e06c75", "#e5c07b", "#98c379",
  "#61afef", "#a882ff", "#56b6c2", "#c678dd", "#abb2bf",
];

export const CustomColorPicker: FC<CustomColorPickerProps> = ({
  open,
  onClose,
  onApply,
}) => {
  const [hue, setHue] = useState(270);
  const [sat, setSat] = useState(60);
  const [bri, setBri] = useState(80);
  const [hex, setHex] = useState("#a882ff");
  const draggingRef = useRef<"hue" | "sv" | null>(null);
  const spectrumRef = useRef<HTMLDivElement>(null);
  const svPanelRef = useRef<HTMLDivElement>(null);

  const updateFromHex = useCallback((h: string) => {
    const hsv = hexToHsv(h);
    setHex(h);
    setHue(hsv.h);
    setSat(hsv.s);
    setBri(hsv.v);
  }, []);

  // 全局 mouse 事件处理拖拽
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingRef.current === "hue" && spectrumRef.current) {
        const rect = spectrumRef.current.getBoundingClientRect();
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        const h = Math.round(360 * (1 - y));
        setHue(h);
        setHex(hsvToHex({ h, s: sat, v: bri }));
      }
      if (draggingRef.current === "sv" && svPanelRef.current) {
        const rect = svPanelRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        setSat(Math.round(x * 100));
        setBri(Math.round((1 - y) * 100));
        setHex(hsvToHex({ h: hue, s: Math.round(x * 100), v: Math.round((1 - y) * 100) }));
      }
    };
    const onUp = () => { draggingRef.current = null; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [hue, sat, bri]);

  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 10000,
        background: "var(--bg-panel)",
        border: "1px solid var(--border-medium)",
        borderRadius: 8,
        padding: 12,
        width: 240,
        boxShadow: "var(--shadow-lg)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* SV 面板 */}
      <div
        ref={svPanelRef}
        onMouseDown={(e) => {
          draggingRef.current = "sv";
          const rect = svPanelRef.current!.getBoundingClientRect();
          const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
          setSat(Math.round(x * 100));
          setBri(Math.round((1 - y) * 100));
          setHex(hsvToHex({ h: hue, s: Math.round(x * 100), v: Math.round((1 - y) * 100) }));
        }}
        style={{
          width: "100%",
          height: 150,
          borderRadius: 4,
          cursor: "crosshair",
          background: `linear-gradient(to right, white, hsl(${hue}, 100%, 50%)), linear-gradient(to top, black, transparent)`,
          backgroundBlendMode: "multiply",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            position: "relative",
            left: `${sat}%`,
            top: `${100 - bri}%`,
            width: 10,
            height: 10,
            border: "2px solid white",
            borderRadius: "50%",
            transform: "translate(-50%, -50%)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* 色相条 */}
      <div
        ref={spectrumRef}
        onMouseDown={(e) => {
          draggingRef.current = "hue";
          const rect = spectrumRef.current!.getBoundingClientRect();
          const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
          const h = Math.round(360 * (1 - y));
          setHue(h);
          setHex(hsvToHex({ h, s: sat, v: bri }));
        }}
        style={{
          width: "100%",
          height: 14,
          borderRadius: 7,
          cursor: "pointer",
          background: "linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red)",
          marginBottom: 8,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -2,
            left: `${(hue / 360) * 100}%`,
            width: 18,
            height: 18,
            border: "2px solid white",
            borderRadius: "50%",
            transform: "translateX(-50%)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Hex 输入 + 预览 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 4,
            background: hex,
            border: "1px solid var(--border-medium)",
            flexShrink: 0,
          }}
        />
        <input
          value={hex}
          onChange={(e) => updateFromHex(e.target.value)}
          className="input-ide"
          style={{ flex: 1, fontSize: 12 }}
        />
        <button
          onClick={() => onApply(hex)}
          className="btn-primary text-[11px] px-3 py-1"
        >
          确定
        </button>
      </div>

      {/* 预设色 */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {PRESET_COLORS.map((c) => (
          <div
            key={c}
            onClick={() => { updateFromHex(c); onApply(c); }}
            style={{
              width: 20,
              height: 20,
              borderRadius: 3,
              background: c,
              cursor: "pointer",
              border: c === hex ? "2px solid var(--accent)" : "1px solid var(--border-subtle)",
            }}
          />
        ))}
      </div>
    </div>,
    document.body
  );
};
```

- [ ] **Step 3: 修改 ExcelToolbar.tsx — 使用新组件替换内联实现**

导入 `DropPanel` 和 `CustomColorPicker`，删除原有的 `DropPanel` 函数（行 349-375）和自定义颜色面板 JSX（行 671-774 区域），替换为组件调用。

- [ ] **Step 4: 验证构建**

```bash
npm run build
```

Expected: 构建成功。颜色选择器功能不变。

- [ ] **Step 5: Commit**

```bash
git add src/components/DropPanel.tsx src/components/CustomColorPicker.tsx src/components/ExcelToolbar.tsx
git commit -m "refactor: 提取 DropPanel + CustomColorPicker — Excel 工具栏子组件"
```

---

### Task 9: 清理 package.json 依赖 + 更新 CLAUDE.md

**Files:**
- Modify: `package.json`
- Modify: `CLAUDE.md`

- [ ] **Step 1: 移除 lodash 包**

```bash
cd "D:/AI Projects/Gull"
npm uninstall lodash @types/lodash
```

- [ ] **Step 2: 检查 @tiptap/extension-placeholder 是否使用**

```bash
grep -r "extension-placeholder" src/ --files-with-matches
```

Expected: 无匹配 → 移除：

```bash
npm uninstall @tiptap/extension-placeholder
```

- [ ] **Step 3: 更新 CLAUDE.md — 修正技术栈描述**

CLAUDE.md 当前内容有 "TipTap 2.x 富文本"（可能误导为全局富文本编辑器）。修改为准确描述：

在 "技术栈" 部分：
```
- Monaco Editor 0.55 用于 Markdown 编辑
- TipTap 3.x 用于 DOCX WYSIWYG 编辑
- Handsontable 14.6.2 用于 Excel 表格编辑
```

在 "代码规范" 部分补充新目录：
```
- src/styles/ CSS 模块：tokens / handsontable / markdown / monaco / tiptap / components / utilities
- 新组件 <200 行，新 hook <150 行
```

在 "已知陷阱" 部分更新：
```
- Handsontable CSS 覆盖在 src/styles/handsontable.css，标记 /* !important 审查区 */
```

- [ ] **Step 4: 验证 bundle 正常**

```bash
npm run build
```

Expected: 构建成功，无 lodash/placeholder 相关错误。

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json CLAUDE.md
git commit -m "chore: 清理无用依赖 (lodash, extension-placeholder), 更新 CLAUDE.md"
```

---

### Task 10: 引入 Vitest + 创建首批测试

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts + devDependencies)
- Create: `src/__tests__/utils/colorUtils.test.ts`
- Create: `src/__tests__/config.test.ts`

- [ ] **Step 1: 安装 Vitest**

```bash
cd "D:/AI Projects/Gull"
npm install -D vitest @vitest/coverage-v8 jsdom
```

- [ ] **Step 2: 创建 vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/__tests__/**", "src/vite-env.d.ts"],
    },
  },
});
```

- [ ] **Step 3: 更新 package.json scripts**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "electron:build": "...",
    "vendor:update": "...",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

- [ ] **Step 4: 创建 colorUtils.test.ts**

```typescript
/**
 * @file colorUtils.test.ts
 * @description HSV/Hex/RGB 颜色空间转换单元测试
 */

import { describe, it, expect } from "vitest";
import { hexToRgb, rgbToHex, hexToHsv, hsvToHex } from "../../utils/colorUtils";

describe("hexToRgb", () => {
  it("converts black hex to RGB", () => {
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("converts white hex to RGB", () => {
    expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("converts accent color to RGB", () => {
    expect(hexToRgb("#a882ff")).toEqual({ r: 168, g: 130, b: 255 });
  });

  it("handles shorthand hex", () => {
    expect(hexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
  });
});

describe("rgbToHex", () => {
  it("converts RGB to hex", () => {
    expect(rgbToHex(168, 130, 255)).toBe("#a882ff");
  });

  it("converts black", () => {
    expect(rgbToHex(0, 0, 0)).toBe("#000000");
  });
});

describe("hexToHsv", () => {
  it("converts accent color", () => {
    const result = hexToHsv("#a882ff");
    expect(result.h).toBeCloseTo(258, -1);
    expect(result.s).toBeCloseTo(49, -1);
    expect(result.v).toBeCloseTo(100, -1);
  });

  it("converts white", () => {
    const result = hexToHsv("#ffffff");
    expect(result.s).toBe(0);
    expect(result.v).toBe(100);
  });

  it("converts black", () => {
    const result = hexToHsv("#000000");
    expect(result.v).toBe(0);
  });
});

describe("hsvToHex", () => {
  it("roundtrips with hexToHsv", () => {
    const original = "#a882ff";
    const hsv = hexToHsv(original);
    const result = hsvToHex(hsv);
    // Allow small precision differences
    expect(result.toLowerCase()).toBe(original);
  });
});
```

- [ ] **Step 5: 创建 config.test.ts**

```typescript
/**
 * @file config.test.ts
 * @description 验证 config.ts 所有导出组完整性
 */

import { describe, it, expect } from "vitest";

describe("config exports", () => {
  it("exports ZOOM constants", async () => {
    const config = await import("../../config");
    expect(config.ZOOM_DEFAULT).toBeGreaterThan(0);
    expect(config.ZOOM_MIN).toBeLessThan(config.ZOOM_MAX);
    expect(config.ZOOM_REFERENCE).toBeGreaterThan(0);
  });

  it("exports COLOR constants", async () => {
    const config = await import("../../config");
    expect(config.COLOR_ACCENT).toMatch(/^#/);
    expect(config.COLOR_BORDER).toMatch(/^#/);
  });

  it("exports LAYOUT constants", async () => {
    const config = await import("../../config");
    expect(config.PANEL_WIDTH).toBeGreaterThan(0);
    expect(config.ACTIVITY_BAR_WIDTH).toBe(48);
  });

  it("exports KEYBINDINGS", async () => {
    const config = await import("../../config");
    expect(config.KEYBINDINGS).toBeDefined();
    expect(config.KEYBINDINGS.saveFile).toBeDefined();
  });
});
```

- [ ] **Step 6: 运行测试**

```bash
npx vitest run
```

Expected: 所有测试通过（至少 5 个 test case）。

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/__tests__/
git commit -m "test: 引入 Vitest + 首批单元测试 (colorUtils, config)"
```

---

### Task 11: Docs 目录重组 + 创建 PROJECT-MAP.md

**Files:**
- Create: `docs/PROJECT-MAP.md`
- Create: `docs/reference/` (move 3 files)
- Create: `docs/archive/` (move 2 files)
- Delete: `docs/code-modification-guide.md` (moved)
- Delete: `docs/settings-content-reference.md` (moved)
- Delete: `docs/ui-default-sizes.md` (moved)
- Delete: `docs/superpowers/plans/2026-06-23-monaco-editor-migration-plan.md` (moved)
- Delete: `docs/superpowers/specs/2026-06-23-monaco-editor-migration-design.md` (moved)

- [ ] **Step 1: 创建新目录结构**

```bash
cd "D:/AI Projects/Gull"
mkdir -p docs/reference
mkdir -p docs/archive
```

- [ ] **Step 2: 移动旧文档**

```bash
mv docs/code-modification-guide.md docs/reference/
mv docs/settings-content-reference.md docs/reference/
mv docs/ui-default-sizes.md docs/reference/
mv docs/superpowers/plans/2026-06-23-monaco-editor-migration-plan.md docs/archive/
mv docs/superpowers/specs/2026-06-23-monaco-editor-migration-design.md docs/archive/
```

- [ ] **Step 3: 创建 PROJECT-MAP.md**

**这是本次重构的核心交付物** — 一份完整的项目地图文档。内容包括：项目概述、目录树（完整文件列表 + 用途）、页面路由表、组件索引（名称 / 路径 / 行数 / 职责）、Hooks 索引、Utils 索引、样式文件索引（CSS 模块 + CSS 变量体系）、数据层说明（types → db → storage）、前后端通信（Electron IPC 通道表）、配置体系（config.ts 导出分组）、构建 & 部署、优化记录。

写入 `docs/PROJECT-MAP.md`（见下方完整内容）。

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs: 重组 docs 目录 + 创建 PROJECT-MAP 项目地图"
```

---

### Task 12: 全量验证 + 最终提交

- [ ] **Step 1: 完整构建验证**

```bash
npm run build
```

Expected: `tsc && vite build` 均通过，无类型错误、无构建警告。

- [ ] **Step 2: 运行全量测试**

```bash
npx vitest run
```

Expected: 所有测试通过。

- [ ] **Step 3: 检查残留引用**

```bash
grep -r "FileTree" src/ --files-with-matches
grep -r "FolderList" src/ --files-with-matches
grep -r "from 'lodash'" src/ --files-with-matches
```

Expected: 无匹配或仅在注释中。

- [ ] **Step 4: 检查 git status 无遗漏**

```bash
git status
```

Expected: 干净的工作区（或仅剩 docs 文件）。

- [ ] **Step 5: 最终 Commit**

```bash
git add -A
git commit -m "refactor: 深度重构完成 — CSS模块化、组件拆分、依赖清理、测试框架、文档重组"
```
