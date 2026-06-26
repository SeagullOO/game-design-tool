# 右键菜单样式统一 — 设计文档

**日期:** 2026-06-27
**状态:** 设计已确认
**目标:** 将项目中所有右键菜单（Excel、文件夹区、侧边栏、标题栏、MD 编辑器）统一为 Excel 右键菜单样式

---

## 1. 背景

当前项目存在三套不同的右键菜单样式：

| 位置 | CSS 类 | 字号 | 特点 |
|------|--------|------|------|
| Excel (ContextMenu.tsx) | `.ctx-menu` `.ctx-item` | 11px | 支持子菜单、快捷键 |
| 文件夹/侧边栏/标题栏 | `.context-menu` `.context-menu-item` | 13px | 简单按钮列表 |
| MD 编辑器 (Monaco) | Monaco 内置 | - | 无自定义 |

前两套视觉参数接近但类名不一致，Monaco 编辑器用的是引擎内置右键菜单，未被自定义。

## 2. 方案选择

采用 **方案 A**：`.ctx-menu` 类系统（Excel 模板）作为唯一标准，所有上下文菜单统一迁移。

- CSS 合并：删除 `.context-menu` / `.context-menu-item` / `.context-menu-divider`
- FileExplorer / Sidebar / TitleBar：className 替换
- Markdown 编辑器：禁用 Monaco 内置右键菜单，新建自定义右键菜单组件

## 3. 设计详情

### 3.1 CSS 统一（components.css）

**保留并扩增的类（模板 = `.ctx-menu` 系统）：**

```css
.ctx-menu          — 菜单容器（position:fixed, z-index:99999, 统一 padding/圆角/阴影）
.ctx-item          — 菜单项（font-size:11px, padding:4px 10px）
.ctx-item.ctx-danger — danger 变体（红色文字 + 红色 hover 背景）
.ctx-separator     — 分隔线（height:1px, margin:4px 0）
.ctx-item-shortcut — 快捷键标签
.ctx-item-arrow    — 子菜单箭头
.ctx-submenu       — 子菜单容器
```

**删除的旧类：** `.context-menu`、`.context-menu-item`、`.context-menu-divider`、`.context-menu-item.danger`

**需要额外注意的旧属性兼容：**
- 旧 `.context-menu-item` 有 `display:flex; align-items:center; width:100%`、`font-size:13px`、`text-align:left` — 全部合并进 `.ctx-item`
- 旧 `.context-menu-divider` 等价于 `.ctx-separator`

### 3.2 FileExplorer.tsx 迁类名

三处右键菜单（文件节点 / 文件夹节点 / 空白区域），纯替换：

```
className="context-menu"          → className="ctx-menu"
className="context-menu-item"     → className="ctx-item"
className="context-menu-divider"  → className="ctx-separator"
"context-menu-item danger"        → "ctx-item ctx-danger"
```

保留 `animate-in` 类（`.ctx-menu` 无内置动画）。

**工作区切换菜单（workspaceMenu）** 同样修改类名。

### 3.3 Sidebar.tsx 迁类名

工作区文件夹右键菜单，纯替换：

```
className="fixed z-50 context-menu animate-in" → className="ctx-menu animate-in"
className="context-menu-item"                   → className="ctx-item"
className="context-menu-divider"                → className="ctx-separator"
"context-menu-item danger"                      → "ctx-item ctx-danger"
```

### 3.4 TitleBar.tsx 迁类名

文件下拉菜单，纯替换 + 去除内联 `position:"fixed"`（`.ctx-menu` 已自带固定定位）。

### 3.5 Markdown 编辑器自定义右键菜单

**新建组件 / 内联 Portal：** 在 `Document.body` 上渲染 `.ctx-menu`，菜单项：

| 菜单项 | 实现 |
|--------|------|
| 复制 | `editor.getAction("editor.action.clipboardCopyAction")?.run()` |
| 剪切 | `editor.getAction("editor.action.clipboardCutAction")?.run()` |
| 粘贴 | `editor.trigger("keyboard", "type", {text: ...})` |
| 全选 | `editor.getAction("editor.action.selectAll")?.run()` |
| --- | `.ctx-separator` |
| 撤销 | `editor.getAction("editor.action.undo")?.run()` |
| 重做 | `editor.getAction("editor.action.redo")?.run()` |

**Monaco 配置：** 在 `options` 中添加 `"contextmenu": false`

**交互：** 
- `onContextMenu` handler 记录位置并调用 `editor.focus()`（确保 selectAll 选中正确编辑器）
- 点击菜单项 → 执行操作 → 关闭菜单
- ESC / click-outside → onClose

**位置：** 约 60 行代码，可直接写在 `MarkdownEditor.tsx` 内部的 Portal 渲染中。

## 4. 影响范围

| 文件 | 改动类型 | 改动量 |
|------|----------|--------|
| `src/styles/components.css` | 合并 CSS | ~40 行 |
| `src/components/FileExplorer.tsx` | 替换类名 | ~10 处 |
| `src/components/Sidebar.tsx` | 替换类名 | ~5 处 |
| `src/components/TitleBar.tsx` | 替换类名 + 去内联 style | ~5 处 |
| `src/components/MarkdownEditor.tsx` | 添加 onContextMenu + Portal | ~60 行（新增） |
| `src/components/ContextMenu.tsx` | 无改动（作为模板参考） | 0 |

## 5. 非目标

- 不修改 ContextMenu.tsx 的组件逻辑
- 不添加新的 CSS 文件
- 不改变 FileExplorer / Sidebar 的右键菜单项和功能
- 不重构组件之间共享 ContextMenu

## 6. 风险

- **低风险**：类名机械替换，编译期即可发现遗漏
- **Monaco `contextmenu: false`**：已验证 Monaco 支持此选项，禁用后 `<Editor>` 容器上可正常接收 React `onContextMenu`
