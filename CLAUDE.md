# Gull

## 技术栈
- React 18 + Vite 5 + TypeScript
- Tailwind CSS 3 + Obsidian 暗黑主题 CSS 变量
- Dexie.js (IndexedDB) / Electron fs
- Monaco Editor 0.55 用于 Markdown 编辑 + TipTap 3.x 用于 DOCX WYSIWYG 编辑
- Electron 42 + electron-builder

## 关键命令
- `npm run dev` — Vite 开发服务器
- `npm run build` — 生产构建到 dist/
- `npm run electron:build` — Electron 打包（注意国内镜像）

## CSS 变量体系（Obsidian 暗色）
- 底色: --bg-root (#1e1e1e)、--bg-panel (#262626)、--bg-surface (#2a2a2a)
- 文字: --text-primary (#dadada)、--text-secondary (#999)
- 强调: --accent (#a882ff 紫)
- 亮色: :root.light 切换

## 代码规范
- 文件夹: src/pages/ src/components/ src/hooks/ src/extensions/ src/styles/
- 样式模块: src/styles/ 下的 CSS 模块按组件/功能拆分
- TypeScript strict 模式
- 组件优先 CSS 变量，不用 Tailwind 硬编码色值
- 新功能必须通过浏览器实测，不只看代码

## 已知陷阱
- Handsontable 样式覆盖位于 src/styles/handsontable.css → 覆盖 CDN CSS
- CC 会在 td/th 加 !important → 审查时 git diff 检查并移除
- FolderWorkspace 878 行 → 新功能不要继续往里塞
- 亮色模式切换: document.documentElement.classList.toggle("light")
