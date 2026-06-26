# 右键菜单样式统一 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目中所有右键菜单统一为 `.ctx-menu` 类系统（Excel 右键菜单 CSS 模板），删除旧的 `.context-menu` 系列类，为 MD 编辑器添加自定义右键菜单。

**Architecture:** 6 个文件的 CSS/JSX 改动 + 一个内联 Portal。CSS 进行合并（删除旧类 + 扩充 ctx- 类），HTML 进行类名替换，Markdown 编辑器通过 Portal 挂载 ctx-menu 组件到 body 并调用 Monaco actions。

**Tech Stack:** React 18, TypeScript, Monaco Editor, Tailwind CSS, CSS Variables

## Global Constraints

- 所有颜色使用 CSS 变量，不硬编码色值
- 组件 < 200 行目标
- 不创建新 CSS 文件
- 修改后必须浏览器实测验证

---

### Task 1: CSS 统一 — 合并并删除旧类

**Files:**
- Modify: `src/styles/components.css:292-345, 481-584`

**Interfaces:**
- Consumes: 现有 `.context-menu` / `.context-menu-item` / `.context-menu-divider` 类
- Produces: 统一样式系统（`.ctx-menu`、`.ctx-item`、`.ctx-separator`、`.ctx-item.ctx-danger`）

- [ ] **Step 1: 删除旧类 `.context-menu` / `.context-menu-item` / `.context-menu-divider`**

找到 `components.css` 第 292-345 行的 "Unified dropdown / context menu" 区域：

```css
/* ---- Unified dropdown / context menu ---- */
.context-menu {
  background: var(--bg-panel);
  border: 0px solid var(--border-medium);
  border-radius: var(--radius-m);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px) saturate(1.1);
  -webkit-backdrop-filter: blur(10px) saturate(1.1);
  padding: 4px;
  min-width: 130px;
  max-width: 240px;
  z-index: 1000;
  user-select: none;
  overflow: hidden;
  font-size: 13px;
}
.context-menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.08s ease;
  white-space: nowrap;
}
.context-menu-item:hover {
  background: var(--bg-hover);
}
.context-menu-item.danger {
  color: var(--danger);
}
.context-menu-item.danger:hover {
  background: var(--danger-bg);
}
.context-menu-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 4px 0;
}
```

替换为（将 `.ctx-item` 扩产为通用组件展示）：

```css
/* ---- Unified dropdown / context menu ---- */
/* `.context-menu` / `.context-menu-item` / `.context-menu-divider` removed.
   Use `.ctx-menu` / `.ctx-item` / `.ctx-separator` / `.ctx-item.ctx-danger` instead. */
```

- [ ] **Step 2: 扩增 `.ctx-item` 为通用按钮组件**

当前 `.ctx-item`（components.css:497-509）：

```css
.ctx-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  font-size: 11px;
  color: var(--text-primary);
  transition: background-color 0.08s ease;
  position: relative;
}
```

替换为 `button` 兼容版（添加 `border:none; background:transparent; text-align:left`）：

```css
.ctx-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  white-space: nowrap;
  font-size: 11px;
  color: var(--text-primary);
  text-align: left;
  transition: background-color 0.08s ease;
  position: relative;
}
```

- [ ] **Step 3: 添加 `.ctx-item.ctx-danger` danger 变体**

在 `.ctx-item:hover` 之后，`.ctx-item-label` 之前插入：

```css
.ctx-item.ctx-danger {
  color: var(--danger);
}
.ctx-item.ctx-danger:hover {
  background: var(--danger-bg);
}
```

- [ ] **Step 4: 在 CSS 注释块中保留 migrate 标记**

在 `.ctx-menu` 注释块上方添加注释，确认 `.ctx-menu` 是项目唯一右键菜单容器样式：

确保 `.ctx-menu` 区域（481-495 行）注释不变：

```css
/* ----------------------------------------------------------
   Custom React Context Menu (唯一右键菜单容器样式)
   ---------------------------------------------------------- */

.ctx-menu {
  position: fixed;
  z-index: 99999;
  min-width: 150px;
  max-width: 240px;
  background: var(--bg-panel);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-m);
  padding: 4px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4), 0 1px 6px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px) saturate(1.1);
  -webkit-backdrop-filter: blur(10px) saturate(1.1);
  user-select: none;
  overflow: hidden;
}
```

- [ ] **Step 5: 运行 TypeScript 检查，确保无编译错误**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/styles/components.css
git commit -m "style: merge context-menu CSS into ctx-menu system, remove duplicate classes"
```

---

### Task 2: FileExplorer.tsx — 类名迁移

**Files:**
- Modify: `src/components/FileExplorer.tsx:768-797, 666-695`

**Interfaces:**
- Consumes: `.ctx-menu` / `.ctx-item` / `.ctx-separator` / `.ctx-item.ctx-danger` (Task 1)
- Produces: 一致的右键菜单 HTML 结构

- [ ] **Step 1: 迁移主右键菜单（第 768-797 行）**

将所有 `.context-menu` / `.context-menu-item` / `.context-menu-divider` 替换：

```tsx
{/* 右键上下文菜单 */}
{contextMenu && createPortal(
  <div className="fixed z-50 ctx-menu animate-in" style={{ left: contextMenu.x, top: contextMenu.y }}
    onClick={(e) => e.stopPropagation()}>
    {contextMenu.fileId ? (
      <>
        <button onClick={() => { const file = files.find((f) => f.id === contextMenu.fileId); if (file) handleRenameStart(file); }}
          className="ctx-item">{t("rename", lang)}</button>
        <div className="ctx-separator" />
        <button onClick={() => { onDeleteFile(contextMenu.fileId!); setContextMenu(null); }}
          className="ctx-item ctx-danger">{t("delete", lang)}</button>
      </>
    ) : contextMenu.folderPath ? (
      <>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => { setRenamingFolder(contextMenu.folderPath!); setFolderRenameValue(contextMenu.folderPath!); setContextMenu(null); }}
          className="ctx-item">{t("rename", lang)}</button>
        <div className="ctx-separator" />
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => { handleNewFolder(); setContextMenu(null); }}
          className="ctx-item">{t("newFolder", lang)}</button>
        <div className="ctx-separator" />
        <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => { if (confirm(t("confirmDeleteFolderContent", lang))) { onDeleteFolder(contextMenu.folderPath!); } setContextMenu(null); }}
          className="ctx-item ctx-danger">{t("delete", lang)}</button>
      </>
    ) : (
      <button onClick={() => { handleNewFolder(); setContextMenu(null); }}
        className="ctx-item">{t("newFolder", lang)}</button>
    )}
  </div>,
  document.body
)}
```

- [ ] **Step 2: 迁移 workspace 切换菜单（第 666-695 行）**

```tsx
{workspaceMenu && workspaceMenu.length > 0 && createPortal(
  <div className="fixed" style={{ zIndex: 1000 }}
    ref={(el) => {
      if (!el) return;
      const btn = document.querySelector(".fe-workspace-btn");
      if (btn) {
        const r = btn.getBoundingClientRect();
        el.style.left = r.left - 20 + "px";
        el.style.bottom = (window.innerHeight - r.top + 8) + "px";
      }
    }}
    onClick={(e) => e.stopPropagation()}>
    <div className="ctx-menu" style={{ position: "absolute", bottom: 0 }}>
      {workspaceMenu.map((w) => (
        <button key={w.id}
          onClick={() => { navigate(`/folder/${w.id}`); setWorkspaceMenu(null); }}
          className="ctx-item">{w.name}</button>
      ))}
      <div className="ctx-separator" />
      <button
        onClick={() => {
          setWorkspaceMenu(null);
          const fn = (window as any).__openWorkspace;
          if (fn) fn(); else alert("此功能仅在桌面应用中可用");
        }}
        className="ctx-item">{t("openOtherWorkspace", lang)}</button>
    </div>
  </div>,
  document.body
)}
```

注意：`workspaceMenu` 外层的 `<div className="fixed">` 保留 `style={{ zIndex: 1000 }}`（`.ctx-menu` 的 z-index 99999 在内层生效）。

- [ ] **Step 3: 运行 TypeScript 检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/FileExplorer.tsx
git commit -m "style: migrate FileExplorer context menus to ctx-menu CSS classes"
```

---

### Task 3: Sidebar.tsx — 类名迁移

**Files:**
- Modify: `src/components/Sidebar.tsx:290-318`

**Interfaces:**
- Consumes: `.ctx-menu` / `.ctx-item` / `.ctx-separator` / `.ctx-item.ctx-danger` (Task 1)
- Produces: 一致的右键菜单 HTML 结构

- [ ] **Step 1: 迁移右键菜单**

将第 290-318 行替换为：

```tsx
{/* 右键上下文菜单 */}
{contextMenu && createPortal(
  <div
    className="ctx-menu animate-in"
    style={{ left: contextMenu.x, top: contextMenu.y }}
    onClick={(e) => e.stopPropagation()}
  >
    <button
      onClick={() => {
        const folder = folders.find((f) => f.id === contextMenu.folderId);
        if (folder) handleRenameStart(folder);
      }}
      className="ctx-item"
    >
      {t("rename", lang)}
    </button>
    <button
      onClick={() => { onCopy(contextMenu.folderId); setContextMenu(null); }}
      className="ctx-item"
    >
      {t("copy", lang)}
    </button>
    <div className="ctx-separator" />
    <button
      onClick={() => { onDelete(contextMenu.folderId); setContextMenu(null); }}
      className="ctx-item ctx-danger"
    >
      {t("delete", lang)}
    </button>
  </div>,
  document.body
)}
```

- [ ] **Step 2: 运行 TypeScript 检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "style: migrate Sidebar context menu to ctx-menu CSS classes"
```

---

### Task 4: TitleBar.tsx — 类名迁移 + 去除内联 position

**Files:**
- Modify: `src/components/TitleBar.tsx:94-129`

**Interfaces:**
- Consumes: `.ctx-menu` / `.ctx-item` / `.ctx-separator` (Task 1)
- Produces: 一致的右键菜单 HTML 结构

- [ ] **Step 1: 迁移文件下拉菜单**

将第 94-129 行替换为：

```tsx
{/* 文件 dropdown menu: 通过 Portal 渲染到 document.body */}
{fileMenuOpen && fileMenuBtnRef.current && createPortal(
  <div
    className="ctx-menu animate-in"
    style={{
      top: fileMenuBtnRef.current.getBoundingClientRect().bottom + TITLE_BAR_MENU_OFFSET,
      left: fileMenuBtnRef.current.getBoundingClientRect().left,
      minWidth: TITLE_BAR_MENU_MIN_WIDTH,
    }}
  >
    <button className="ctx-item" onClick={() => {
      setFileMenuOpen(false);
      const fn = (window as any).__saveFile;
      if (fn) fn();
    }}>
      {t("save", lang)}
    </button>
    <button className="ctx-item" onClick={() => {
      setFileMenuOpen(false);
      const fn = (window as any).__saveAs;
      if (fn) fn();
    }}>
      {t("saveAs", lang)}
    </button>
    <div className="ctx-separator" />
    <button className="ctx-item" onClick={() => {
      setFileMenuOpen(false);
      const fn = (window as any).__moveWorkspace;
      if (fn) fn();
    }}>
      {t("moveWorkspace", lang)}
    </button>
  </div>,
  document.body,
)}
```

关键变化：
- `className="context-menu animate-in"` → `className="ctx-menu animate-in"`
- `style={{ position: "fixed", top: ..., left: ..., minWidth: ... }}` → `style={{ top: ..., left: ..., minWidth: ... }}`（去除 `position: "fixed"`，`.ctx-menu` 已自带）
- `className="context-menu-item"` → `className="ctx-item"`
- `className="context-menu-divider"` → `className="ctx-separator"`

- [ ] **Step 2: 运行 TypeScript 检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/TitleBar.tsx
git commit -m "style: migrate TitleBar dropdown menu to ctx-menu CSS classes"
```

---

### Task 5: MarkdownEditor.tsx — 禁用内置右键菜单 + 添加自定义右键菜单

**Files:**
- Modify: `src/components/MarkdownEditor.tsx`

**Interfaces:**
- Consumes: `.ctx-menu` / `.ctx-item` / `.ctx-separator` (Task 1)
- Produces: Monaco 编辑器右键菜单（复制/剪切/粘贴/全选 + 撤销/重做）
- Produces: `ctxMenuState` state（通过 `useState` 管理 visible/position）

- [ ] **Step 1: 添加 state 和右键菜单 Portal**

在 `MarkdownEditor.tsx` 文件顶部 `editorRef` 定义之后，添加右键菜单 state：

```tsx
// 在 const containerRef = useRef<HTMLDivElement>(null); 之后添加：
const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
const ctxMenuVisible = ctxMenu !== null;
```

- [ ] **Step 2: 点击外部关闭（click-outside 和 ESC）**

在 `handleEditorMount` 之后的 useEffect 中（已有的 observer return 之后），添加：

```tsx
// Close context menu on click outside or Escape
useEffect(() => {
  if (!ctxMenuVisible) return;
  const handleClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".ctx-menu")) setCtxMenu(null);
  };
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") setCtxMenu(null);
  };
  // Use capture phase so we can stop propagation from the original contextmenu event
  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKey);
  return () => {
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("keydown", handleKey);
  };
}, [ctxMenuVisible]);
```

- [ ] **Step 3: 禁用 Monaco 内置右键菜单**

在 `MarkdownEditor.tsx` 的 `<Editor options={...}>` 中添加：

```tsx
options={{
  // ... existing options ...
  contextmenu: false, // 禁用 Monaco 内置右键菜单
  // ... rest of options ...
}}
```

放在 `fontSize: 13,` 之后即可。

- [ ] **Step 4: 在 Editor 外包裹层上添加 onContextMenu handler**

将现有 `<div className="overflow-hidden" style={{ ... }}>` 扩展，添加 `onContextMenu`：

```tsx
<div
  className="overflow-hidden"
  style={{
    flex: isPreviewMode ? undefined : 1,
    width: isPreviewMode ? `${splitRatio * 100}%` : "100%",
    minWidth: isPreviewMode ? "120px" : undefined,
  }}
  onContextMenu={(e) => {
    e.preventDefault();
    editorRef.current?.focus();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }}
>
  <Editor ... />
</div>
```

- [ ] **Step 5: 在 return 语句末尾（Monaco 预览面板之后、最外层 div 之前）添加 Portal**

```tsx
{/* 自定义右键菜单: 使用统一的 ctx-menu 样式 */}
{ctxMenu && createPortal(
  <div
    className="ctx-menu animate-in"
    style={{ left: ctxMenu.x, top: ctxMenu.y }}
    onClick={(e) => e.stopPropagation()}
  >
    <button className="ctx-item" onClick={() => {
      editorRef.current?.getAction("editor.action.clipboardCutAction")?.run();
      setCtxMenu(null);
    }}>
      剪切
    </button>
    <button className="ctx-item" onClick={() => {
      editorRef.current?.getAction("editor.action.clipboardCopyAction")?.run();
      setCtxMenu(null);
    }}>
      复制
    </button>
    <button className="ctx-item" onClick={() => {
      editorRef.current?.focus();
      editorRef.current?.trigger("keyboard", "type", { text: "\n" });
      navigator.clipboard?.readText().then((text: string) => {
        if (text) editorRef.current?.trigger("keyboard", "type", { text });
      }).catch(() => {});
      setCtxMenu(null);
    }}>
      粘贴
    </button>
    <button className="ctx-item" onClick={() => {
      editorRef.current?.getAction("editor.action.selectAll")?.run();
      setCtxMenu(null);
    }}>
      全选
    </button>
    <div className="ctx-separator" />
    <button className="ctx-item" onClick={() => {
      editorRef.current?.getAction("editor.action.undo")?.run();
      setCtxMenu(null);
    }}>
      撤销
    </button>
    <button className="ctx-item" onClick={() => {
      editorRef.current?.getAction("editor.action.redo")?.run();
      setCtxMenu(null);
    }}>
      重做
    </button>
  </div>,
  document.body
)}
```

注意：粘贴功能使用了 `navigator.clipboard.readText()`，这是标准方式。菜单项文本（剪切/复制/粘贴/全选/撤销/重做）是硬编码的中文 — 需要确认是否需要国际化。当前设计保持简单，后续可接 i18n。

- [ ] **Step 6: 添加 useState import**

确保 `MarkdownEditor.tsx` 顶部有 `useState` import。当前文件：

```tsx
import { useRef, useCallback, useEffect, useMemo } from "react";
```

修改为：

```tsx
import { useRef, useCallback, useEffect, useMemo, useState } from "react";
```

- [ ] **Step 7: 添加 createPortal import**

确认文件顶部有：

```tsx
import { createPortal } from "react-dom";
```

当前没有 — 需要添加这个 import。

如果你还没有全局 import `createPortal`，在 `MarkdownEditor.tsx` 顶部添加：

```tsx
import { createPortal } from "react-dom";
```

- [ ] **Step 8: 运行 TypeScript 检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add src/components/MarkdownEditor.tsx
git commit -m "feat: add custom context menu to MD editor with unified ctx-menu styles"
```

---

### Task 6: 浏览器实测验证

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 2: 逐项验证所有右键菜单**

在浏览器中打开开发服务器 URL，执行以下测试：

1. **Excel 右键菜单** — 打开一个 .xlsx 文件，右键点击单元格。验证：菜单正常弹出，选项可点，子菜单正常工作
2. **文件树文件右键** — 右键点击一个 .md 文件节点。验证：菜单正常弹出，显示"重命名"+"删除"
3. **文件树文件夹右键** — 右键点击一个文件夹节点。验证：菜单正常弹出，显示"重命名"+"新建文件夹"+"删除"
4. **文件树空白区右键** — 右键点击文件树空白区域。验证：菜单正常弹出，显示"新建文件夹"
5. **侧边栏工作区右键** — 右键点击侧边栏的工作区项目。验证：菜单正常弹出，显示"重命名"+"复制"+"删除"
6. **标题栏文件菜单** — 点击标题栏文件夹图标。验证：dropdown 菜单正常弹出，显示"保存"+"另存为"+"移动工作区"
7. **工作区切换菜单** — 点击文件树底部工作区名称。验证：切换菜单正常弹出
8. **MD 编辑器右键** — 右键点击 Markdown 编辑区域。验证：自定义菜单弹出，显示"剪切/复制/粘贴/全选/撤销/重做"，功能正常
9. **亮色模式** — 点击主题切换按钮，进入亮色模式。验证：所有上述菜单在亮色模式下正常显示（颜色符合亮色主题变量）

- [ ] **Step 3: 检查 devtools console 无红色错误**

打开浏览器 DevTools → Console，执行所有右键菜单操作后确认无红色错误。

- [ ] **Step 4: 完成**

验证通过后无需额外 commit。
