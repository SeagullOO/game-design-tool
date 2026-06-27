/**
 * i18n.ts — 国际化系统
 *
 * 模块级别的轻量 i18n 方案：所有组件共享同一个翻译字典和语言状态。
 * 语言偏好存储在 localStorage("gull_lang")，切换后通过 App 的 key prop 强制重渲染。
 *
 * 用法：
 *   import { t, getLang, setLang } from "../i18n";
 *   const lang = getLang();
 *   <button title={t("save", lang)}>{t("save", lang)}</button>
 *
 * 翻译覆盖范围：所有用户可见的 UI 文本（按钮、标签、提示、占位符、菜单项）。
 */

// ─── 类型 ──────────────────────────────────────────────────────────────────────

type Lang = "zh" | "en";

// ─── 翻译字典 ──────────────────────────────────────────────────────────────────

const DICT: Record<string, { zh: string; en: string }> = {
  // ── 通用 ──
  save: { zh: "保存", en: "Save" },
  saveAs: { zh: "另存为", en: "Save As" },
  cancel: { zh: "取消", en: "Cancel" },
  confirm: { zh: "确定", en: "OK" },
  delete: { zh: "删除", en: "Delete" },
  rename: { zh: "重命名", en: "Rename" },
  copy: { zh: "复制", en: "Copy" },
  cut: { zh: "剪切", en: "Cut" },
  paste: { zh: "粘贴", en: "Paste" },
  close: { zh: "关闭", en: "Close" },
  search: { zh: "搜索", en: "Search" },
  loading: { zh: "加载中...", en: "Loading..." },
  back: { zh: "返回", en: "Back" },
  apply: { zh: "应用", en: "Apply" },
  view: { zh: "查看", en: "View" },
  change: { zh: "更改…", en: "Change…" },
  insert: { zh: "插入", en: "Insert" },
  clear: { zh: "清除", en: "Clear" },
  clearSearch: { zh: "清除搜索", en: "Clear search" },
  create: { zh: "新建", en: "New" },
  import_: { zh: "导入", en: "Import" },
  export_: { zh: "导出", en: "Export" },

  // ── TitleBar ──
  settings: { zh: "设置", en: "Settings" },
  fileMenu: { zh: "文件", en: "File" },
  openWorkspace: { zh: "打开工作区", en: "Open Workspace" },
  moveWorkspace: { zh: "更改工作区位置", en: "Move Workspace" },
  workspaceMoved: { zh: "工作区已复制到新位置", en: "Workspace copied to new location" },
  noWorkspaceToMove: { zh: "没有打开的工作区", en: "No workspace open" },
  undoDeleteHint: { zh: "已删除，Ctrl+Z 撤销", en: "Deleted. Ctrl+Z to undo" },
  statusLn: { zh: "行", en: "Ln" },
  statusCol: { zh: "列", en: "Col" },
  statusSelected: { zh: "已选择", en: "Selected" },
  minimize: { zh: "最小化", en: "Minimize" },
  maximize: { zh: "最大化", en: "Maximize" },
  restore: { zh: "还原", en: "Restore" },
  toggleSidebar: { zh: "收起侧边栏", en: "Collapse Sidebar" },
  expandSidebar: { zh: "展开侧边栏", en: "Expand Sidebar" },

  // ── ActivityBar ──
  home: { zh: "主页", en: "Home" },
  workspace: { zh: "工作区", en: "Workspace" },
  newMarkdown: { zh: "新建 Markdown", en: "New Markdown" },
  newExcel: { zh: "新建 Excel 表格", en: "New Excel Sheet" },
  newDocx: { zh: "新建 Word 文档", en: "New Word Document" },
  saveAsTemplate: { zh: "保存为模版", en: "Save as Template" },

  // ── Sidebar ──
  appTitle: { zh: "GullDoc", en: "GullDoc" },
  folderWorkspace: { zh: "文件夹工作区", en: "Folder Workspace" },
  searchFolders: { zh: "搜索文件夹...", en: "Search folders..." },
  noFolders: { zh: "暂无文件夹", en: "No folders" },
  createFirstFolder: { zh: "点击下方按钮创建第一个文件夹", en: "Click below to create your first folder" },
  noMatches: { zh: "没有匹配", en: "No matches" },
  filesCount: { zh: "个文件", en: " files" },
  justNow: { zh: "刚刚", en: "Just now" },
  minutesAgo: { zh: "分钟前", en: " min ago" },
  hoursAgo: { zh: "小时前", en: " hr ago" },
  daysAgo: { zh: "天前", en: " days ago" },
  manageTemplates: { zh: "管理模版 →", en: "Manage Templates →" },
  untitledFolder: { zh: "未命名工作区", en: "Untitled Workspace" },
  folderCopySuffix: { zh: " (副本)", en: " (Copy)" },

  // ── FileExplorer / FileTree ──
  newFolder: { zh: "新建文件夹", en: "New Folder" },
  refresh: { zh: "刷新", en: "Refresh" },
  backToHome: { zh: "返回主页", en: "Back to Home" },
  searchFiles: { zh: "搜索文件...", en: "Search files..." },
  noFiles: { zh: "暂无文件", en: "No files" },
  addFilesHint: { zh: "用左侧按钮添加文件", en: "Use the toolbar to add files" },
  noMatchingFiles: { zh: "无匹配文件", en: "No matching files" },
  switchWorkspace: { zh: "切换工作区", en: "Switch Workspace" },
  openOtherWorkspace: { zh: "打开其他工作区", en: "Open Other Workspace" },
  switchToDark: { zh: "切换暗色模式", en: "Switch to Dark Mode" },
  switchToLight: { zh: "切换亮色模式", en: "Switch to Light Mode" },
  untitledDocument: { zh: "未命名文档", en: "Untitled Document" },
  untitledSheet: { zh: "未命名表格", en: "Untitled Sheet" },
  untitledDocx: { zh: "未命名文档", en: "Untitled Document" },
  newFolderDefault: { zh: "新建文件夹", en: "New Folder" },
  fileList: { zh: "文件列表", en: "File List" },
  newMdButton: { zh: "新建 Markdown", en: "New Markdown" },
  newExcelButton: { zh: "新建 Excel 表格", en: "New Excel Sheet" },

  // ── Context Menu (Excel) ──
  ctxCut: { zh: "剪切", en: "Cut" },
  ctxCopy: { zh: "复制", en: "Copy" },
  ctxPaste: { zh: "粘贴", en: "Paste" },
  ctxInsert: { zh: "插入", en: "Insert" },
  ctxInsertRowAbove: { zh: "在上方插入行", en: "Insert Row Above" },
  ctxInsertRowBelow: { zh: "在下方插入行", en: "Insert Row Below" },
  ctxInsertColLeft: { zh: "在左侧插入列", en: "Insert Column Left" },
  ctxInsertColRight: { zh: "在右侧插入列", en: "Insert Column Right" },
  ctxDelete: { zh: "删除", en: "Delete" },
  ctxDeleteRow: { zh: "删除行", en: "Delete Row" },
  ctxDeleteCol: { zh: "删除列", en: "Delete Column" },
  ctxDeleteCellLeft: { zh: "删除单元格左移", en: "Delete Cells (Shift Left)" },
  ctxDeleteCellUp: { zh: "删除单元格上移", en: "Delete Cells (Shift Up)" },
  ctxClear: { zh: "清除", en: "Clear" },
  ctxClearContent: { zh: "清除内容", en: "Clear Content" },
  ctxClearFormat: { zh: "清除格式", en: "Clear Formatting" },
  ctxClearAll: { zh: "全部清除", en: "Clear All" },
  ctxSortAsc: { zh: "升序排列 A→Z", en: "Sort A→Z" },
  ctxSortDesc: { zh: "降序排列 Z→A", en: "Sort Z→A" },
  ctxFreeze: { zh: "冻结", en: "Freeze" },
  ctxFreezeRow: { zh: "冻结当前行", en: "Freeze Row" },
  ctxFreezeCol: { zh: "冻结当前列", en: "Freeze Column" },
  ctxUnfreeze: { zh: "取消冻结", en: "Unfreeze" },
  ctxHide: { zh: "隐藏", en: "Hide" },
  ctxHideRow: { zh: "隐藏当前行", en: "Hide Row" },
  ctxHideCol: { zh: "隐藏当前列", en: "Hide Column" },
  ctxShowAll: { zh: "全部取消隐藏", en: "Show All" },

  // ── Editor Toolbar ──
  undo: { zh: "撤销", en: "Undo" },
  redo: { zh: "重做", en: "Redo" },
  heading1: { zh: "标题 1", en: "Heading 1" },
  heading2: { zh: "标题 2", en: "Heading 2" },
  heading3: { zh: "标题 3", en: "Heading 3" },
  bold: { zh: "加粗", en: "Bold" },
  italic: { zh: "斜体", en: "Italic" },
  ulList: { zh: "无序列表", en: "Bullet List" },
  olList: { zh: "有序列表", en: "Numbered List" },
  blockquote: { zh: "引用", en: "Blockquote" },
  togglePreview: { zh: "切换预览", en: "Toggle Preview" },
  preview: { zh: "预览", en: "Preview" },

  // ── Excel Toolbar ──
  fontSize: { zh: "字号", en: "Font Size" },
  fontColor: { zh: "字体颜色", en: "Font Color" },
  bgColor: { zh: "背景颜色", en: "Background Color" },
  underline: { zh: "下划线", en: "Underline" },
  themeColors: { zh: "主题色", en: "Theme Colors" },
  standardColors: { zh: "标准色", en: "Standard Colors" },
  recentColors: { zh: "最近使用", en: "Recent" },
  moreColors: { zh: "更多颜色", en: "More Colors" },
  resetToDefault: { zh: "重置为默认色", en: "Reset to Default" },

  // ── Folder Workspace ──
  folderOptions: { zh: "文件夹选项", en: "Folder Options" },
  fileName: { zh: "文件名称", en: "File Name" },
  folderName: { zh: "文件夹名称", en: "Folder Name" },
  selectFileToStart: { zh: "选择或创建一个文件开始编辑", en: "Select or create a file to start editing" },
  selectFolderToStart: { zh: "选择一个文件夹开始工作", en: "Select a folder to start working" },
  openWorkspaceBtn: { zh: "打开工作区", en: "Open Workspace" },
  newWorkspaceBtn: { zh: "新建工作区", en: "New Workspace" },
  fromTemplateBtn: { zh: "从模版新建", en: "New from Template" },
  saving: { zh: "保存中", en: "Saving" },
  saved: { zh: "已保存", en: "Saved" },
  unsaved: { zh: "未保存", en: "Unsaved" },
  changeFolderLocation: { zh: "更改文件夹位置", en: "Change Folder Location" },
  selected: { zh: "已选择: ", en: "Selected: " },

  // ── Folder List / Workspace ──
  folderNotFound: { zh: "文件夹不存在", en: "Folder not found" },
  loadFailed: { zh: "加载失败", en: "Failed to load" },
  returnToFolderList: { zh: "← 返回文件夹列表", en: "← Back to folder list" },
  importedWorkspace: { zh: "导入的工作区", en: "Imported Workspace" },
  noImportableFiles: { zh: "所选文件夹中没有可导入的文件（.md / .xlsx / .csv / .docx）", en: "No importable files found in the selected folder (.md / .xlsx / .csv / .docx)" },

  // ── Template Manager ──
  templateManagement: { zh: "模版管理", en: "Template Management" },
  manageTemplatesDesc: { zh: "管理已保存的文件夹模版", en: "Manage saved folder templates" },
  backToFolders: { zh: "返回文件夹列表", en: "Back to Folder List" },
  noTemplates: { zh: "暂无模版", en: "No templates" },
  noTemplatesHint: { zh: "在文件夹工作区中，点击「保存为模版」即可创建", en: 'Click "Save as Template" in the workspace to create one' },
  goToFolders: { zh: "前往文件夹列表", en: "Go to Folder List" },
  filesUnit: { zh: "个文件", en: " files" },

  // ── Template Modal ──
  createFromTemplate: { zh: "从模版新建文件夹", en: "New Folder from Template" },
  selectTemplateHint: { zh: "选择一个已保存的模版来创建新文件夹", en: "Select a saved template to create a new folder" },
  noTemplatesModal: { zh: "暂无模版", en: "No templates available" },
  noTemplatesModalHint: { zh: "请新建工作区以创建工作区模版", en: "Create a workspace first to save templates" },

  // ── Global Search ──
  searchAllFiles: { zh: "搜索所有文件...", en: "Search all files..." },
  typeToSearch: { zh: "输入关键词搜索文件", en: "Type to search files" },

  // ── File Picker ──
  insertFileLink: { zh: "插入文件链接", en: "Insert File Link" },
  selectFileHint: { zh: "选择当前文件夹内的一个文件", en: "Select a file from the current folder" },
  searchFile: { zh: "搜索文件...", en: "Search files..." },
  noFilesFolder: { zh: "当前文件夹暂无文件", en: "No files in current folder" },
  noMatchingFile: { zh: "没有匹配的文件", en: "No matching files" },
  mdFiles: { zh: "Markdown 文件", en: "Markdown Files" },
  excelFiles: { zh: "Excel 表格", en: "Excel Sheets" },
  docxFiles: { zh: "Word 文档", en: "Word Documents" },

  // ── Dialogs ──
  confirmDeleteFolder: { zh: "确定要删除这个文件夹吗？此操作不可撤销。", en: "Are you sure you want to delete this folder? This action cannot be undone." },
  confirmDeleteFile: { zh: "确定删除？", en: "Delete this file?" },
  confirmDeleteFolderContent: { zh: "确定删除此文件夹及其内容？", en: "Delete this folder and all its contents?" },
  confirmDeleteTemplate: { zh: "确定要删除这个模版吗？此操作不可撤销。", en: "Are you sure you want to delete this template? This action cannot be undone." },
  templateName: { zh: "模版名称:", en: "Template name:" },
  templateSaved: { zh: "模版保存成功！", en: "Template saved!" },
  saveTemplate: { zh: "保存为模版", en: "Save as Template" },
  saveTemplateDesc: { zh: "将当前工作区的文件结构保存为模版，供以后快速创建。", en: "Save the current workspace file structure as a template for quick reuse." },
  templateNamePlaceholder: { zh: "输入模版名称", en: "Enter template name" },
  templateFilesPreview: { zh: "将保存以下文件：", en: "Files to be saved:" },
  electronOnly: { zh: "此功能仅在桌面应用中可用", en: "This feature is only available in the desktop app" },
  exportSuccess: { zh: "已导出 ", en: "Exported " },
  filesUnitExport: { zh: "个文件", en: " files" },
  downloadedFiles: { zh: "已下载 ", en: "Downloaded " },

  // ── Status Badge ──
  statusSaving: { zh: "保存中", en: "Saving" },
  statusSaved: { zh: "已保存", en: "Saved" },
  statusUnsaved: { zh: "未保存", en: "Unsaved" },

  // ── Settings ──
  stgSettings: { zh: "设置", en: "Settings" },
  stgGeneral: { zh: "通用", en: "General" },
  stgAppearance: { zh: "外观", en: "Appearance" },
  stgStorage: { zh: "存储", en: "Storage" },
  stgAbout: { zh: "关于", en: "About" },
  stgGeneralDesc: { zh: "应用程序的基础行为和语言设置。", en: "Basic application behavior and language settings." },
  stgAppearanceDesc: { zh: "调整界面主题、字体和布局偏好。", en: "Adjust interface theme, fonts, and layout preferences." },
  stgStorageDesc: { zh: "管理文件数据的存储位置。", en: "Manage file data storage location." },
  stgAboutDesc: { zh: "版本信息、许可等。", en: "Version information, licenses, and more." },
  stgLanguageRegion: { zh: "语言与地区", en: "Language & Region" },
  stgUiLanguage: { zh: "界面语言", en: "UI Language" },
  stgUiLanguageDesc: { zh: "菜单、对话框和系统提示的显示语言", en: "Display language for menus, dialogs, and system prompts" },

  stgTheme: { zh: "主题", en: "Theme" },
  stgColorTheme: { zh: "颜色主题", en: "Color Theme" },
  stgColorThemeDesc: { zh: "选择暗色、亮色或跟随系统", en: "Choose dark, light, or follow system" },
  stgEditorFont: { zh: "编辑器字体", en: "Editor Font" },
  stgFontFamily: { zh: "字体", en: "Font Family" },
  stgFontFamilyDesc: { zh: "选择 Markdown 编辑区的显示字体。", en: "Choose the display font for the Markdown editor." },
  stgFontPreview: { zh: "AaBbCc 字体预览 The quick brown fox jumps over the lazy dog.", en: "AaBbCc Font Preview The quick brown fox jumps over the lazy dog." },
  stgDefault: { zh: "默认", en: "Default" },
  stgLoadingFonts: { zh: "正在加载字体列表...", en: "Loading font list..." },
  stgSelectOtherFont: { zh: "选择其他字体（.ttf）", en: "Select Other Fonts (.ttf)" },
  stgDark: { zh: "暗色", en: "Dark" },
  stgLight: { zh: "亮色", en: "Light" },
  stgSystem: { zh: "跟随系统", en: "System" },
  stgStorageLocation: { zh: "存储位置", en: "Storage Location" },
  stgStoragePathLabel: { zh: "默认工作区存储位置", en: "Default Workspace Storage Path" },
  openFolder: { zh: "打开文件夹", en: "Open Folder" },
  zh: { zh: "中文", en: "中文" },
  en: { zh: "English", en: "English" },
  stgVersion: { zh: "软件版本", en: "Version" },
  stgVersionInfo: { zh: "版本信息", en: "Version Info" },
  stgShortcuts: { zh: "快捷键参考", en: "Keyboard Shortcuts" },
  stgLicenses: { zh: "第三方许可", en: "Third-Party Licenses" },
  stgOpenSourceLicenses: { zh: "开源软件许可", en: "Open Source Licenses" },
  stgOpenSourceLicensesDesc: { zh: "Electron, Chromium, Node.js 及其他开源依赖", en: "Electron, Chromium, Node.js and other open-source dependencies" },
  stgCheckUpdate: { zh: "检查更新", en: "Check for Updates" },
  stgDragTip: { zh: "拖拽调整 / 点击输入", en: "Drag to adjust / Click to input" },
  stgElectronStorage: { zh: "Electron userData", en: "Electron userData" },
  stgBrowserStorage: { zh: "浏览器 IndexedDB", en: "Browser IndexedDB" },
};

// ─── 模块级语言状态 ──────────────────────────────────────────────────────────

const LANG_KEY = "gull_lang";

let _lang: Lang = "zh";

/** 初始化语言：从 localStorage 读取，或默认中文 */
function initLang(): Lang {
  try {
    const raw = localStorage.getItem(LANG_KEY);
    if (raw === "en" || raw === "zh") {
      _lang = raw;
      return raw;
    }
  } catch {}
  return "zh";
}

// 模块加载时立即初始化
_lang = initLang();

// ─── 公共 API ─────────────────────────────────────────────────────────────────

/** 获取当前语言 */
export function getLang(): Lang {
  return _lang;
}

/** 设置语言并持久化 */
export function setLang(lang: Lang): void {
  _lang = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {}
}

/** 翻译函数：根据 key 和语言返回对应文案。key 不存在时返回 key 本身 */
export function t(key: string, lang?: Lang): string {
  const l = lang ?? _lang;
  return DICT[key]?.[l] ?? DICT[key]?.zh ?? key;
}

// Re-export Lang type for consumers
export type { Lang };
