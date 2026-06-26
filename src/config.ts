/**
 * config.ts — 集中配置文件
 *
 * 所有你经常调整的数值都放在这里，改一处全局生效。
 * CSS 文件 (index.css) 和 Electron 主进程 (main.js) 无法直接导入 TS，
 * 相关值在注释中标注，修改时需同步。
 */

// ═══════════════════════════════════════════════════════════════════════════
// Zoom — UI 缩放（Ctrl+滚轮）
// ═══════════════════════════════════════════════════════════════════════════

export const ZOOM_DEFAULT = 110;
export const ZOOM_MIN = 110;
export const ZOOM_MAX = 150;
export const ZOOM_STEP = 10;
/** CSS zoom 的基准值：此值表示 1:1 无缩放 */
export const ZOOM_REFERENCE = 100;

/** 内容缩放（编辑器区域）默认/最小/最大/步长 */
export const CONTENT_ZOOM_DEFAULT = 100;
export const CONTENT_ZOOM_MIN = 50;
export const CONTENT_ZOOM_MAX = 200;
export const CONTENT_ZOOM_STEP = 10;

// ═══════════════════════════════════════════════════════════════════════════
// Colors — 统一颜色变量（映射到 CSS 变量，放在最前面以便其他常量引用）
// ═══════════════════════════════════════════════════════════════════════════

export const COLOR_BORDER = "var(--border-subtle)";
export const COLOR_TEXT_SECONDARY = "var(--text-secondary)";
export const COLOR_ACCENT = "var(--accent)";
export const COLOR_BG_PANEL = "var(--bg-panel)";
export const COLOR_BG_SELECTED = "var(--bg-selected)";

// ═══════════════════════════════════════════════════════════════════════════
// Layout — 面板 / 栏位尺寸
// ═══════════════════════════════════════════════════════════════════════════

/** 侧边面板宽度（Sidebar / FileExplorer） */
export const PANEL_WIDTH = 240;
export const PANEL_MIN_WIDTH = 220;
export const PANEL_MAX_WIDTH = 480;

/** 分隔线：视觉宽度 + 拖拽判定范围 */
export const SPLITTER_WIDTH = 1;
export const SPLITTER_HIT = 20;

/** Markdown 编辑/预览分隔线：视觉宽度 + 拖拽判定范围 */
export const MD_SPLITTER_WIDTH = 2;
export const MD_SPLITTER_HIT = 20;

/** ActivityBar 宽度 */
export const ACTIVITY_BAR_WIDTH = 48;

/** TitleBar 高度 */
export const TITLE_BAR_HEIGHT = 38;

/** TitleBar 左内边距 */
export const TITLE_BAR_PADDING_LEFT = 10;
/** TitleBar 右内边距 */
export const TITLE_BAR_PADDING_RIGHT = 6;
/** TitleBar 左侧按钮间距 */
export const TITLE_BAR_BUTTON_GAP = 8;
/** TitleBar 中部标题字号 */
export const TITLE_BAR_TITLE_FONT_SIZE = 12;
/** TitleBar 中部标题水平内边距 */
export const TITLE_BAR_TITLE_PADDING_X = 12;
/** TitleBar 菜单最小宽度 */
export const TITLE_BAR_MENU_MIN_WIDTH = 130;
/** TitleBar 菜单距按钮偏移量 */
export const TITLE_BAR_MENU_OFFSET = 4;
/** TitleBar 工具栏按钮图标尺寸 */
export const TITLE_BAR_ICON_SIZE = 18;
/** TitleBar 关闭按钮图标尺寸 */
export const TITLE_BAR_CLOSE_ICON_SIZE = 20;

// 以下值需与 index.css 中的 .win-btn / .win-ctrl 保持同步
/** TitleBar 工具栏按钮宽度 | 同步 index.css .win-btn */
export const TITLE_BAR_BTN_WIDTH = 28;
/** TitleBar 工具栏按钮高度 | 同步 index.css .win-btn */
export const TITLE_BAR_BTN_HEIGHT = 28;
/** TitleBar 工具栏按钮圆角 | 同步 index.css .win-btn */
export const TITLE_BAR_BTN_RADIUS = 4;
/** TitleBar 窗口控制按钮宽度 | 同步 index.css .win-ctrl */
export const TITLE_BAR_CTRL_WIDTH = 36;
/** TitleBar 窗口控制按钮高度 | 同步 index.css .win-ctrl */
export const TITLE_BAR_CTRL_HEIGHT = 30;

// ═══════════════════════════════════════════════════════════════════════════
// PanelLayout — Settings / TemplateManager 共享面板尺寸
// ═══════════════════════════════════════════════════════════════════════════

/** 面板宽度 (CSS 值) */
export const PANEL_LAYOUT_WIDTH = "80vw";
/** 面板高度 (CSS 值) */
export const PANEL_LAYOUT_HEIGHT = "90vh";
/** 面板最大宽度 (px) */
export const PANEL_LAYOUT_MAX_WIDTH = 1200;
/** 面板最小宽度 (px) */
export const PANEL_LAYOUT_MIN_WIDTH = 560;
/** 面板最小高度 (px) */
export const PANEL_LAYOUT_MIN_HEIGHT = 400;
/** 面板遮罩背景色 */
export const PANEL_BACKDROP = "rgba(0, 0, 0, 0.5)";

/** FileExplorer 顶部栏高度 */
export const EXPLORER_HEADER_HEIGHT = 36;

/** 文件树缩进：基础偏移 */
export const TREE_INDENT_BASE = 8;

/** 文件树缩进：每层深度增量 */
export const TREE_INDENT_PER_DEPTH = 10;

/** 文件树：图标宽度（文件夹和文件统一） */
export const TREE_ICON_SIZE = 14;

/** 文件树：图标高度（文件夹和文件统一） */
export const TREE_ICON_HEIGHT = 12;

/** 文件树：图标到文字的间距（文件夹和文件统一） */
export const TREE_ICON_TEXT_GAP = 6;

/** 文件树：图标左偏移（相对缩进基准点，= 箭头偏移(-8) + 箭头占位(16) + 间距(3)） */
export const TREE_ICON_LEFT_OFFSET = 11;

/**
 * 文件树：图标区域总宽度（从缩进点到文字起始）
 * = TREE_ICON_LEFT_OFFSET + TREE_ICON_SIZE + TREE_ICON_TEXT_GAP = 11 + 14 + 6 = 31
 */
export const TREE_ICON_GAP = 31;

/** 文件树：折叠箭头在图标组内的左偏移 */
export const TREE_CHEVRON_OFFSET = -8;

/** 文件树：箭头占位宽度（= padding(3) + 图标(10) + padding(3) = 16） */
export const TREE_CHEVRON_WIDTH = 16;

/** 文件树：引导竖线相对箭头组的 X 偏移（箭头中心 = padding(3) + 图标(10)/2 = 8） */
export const TREE_GUIDE_OFFSET = 8;

/** 文件树：选中文件夹的引导线高亮宽度 */
export const TREE_GUIDE_HIGHLIGHT_WIDTH = 1;

/** 文件树：选中文件夹的引导线高亮颜色（与文件夹箭头同色） */
export const TREE_GUIDE_HIGHLIGHT_COLOR = "var(--accent)";

// ═══════════════════════════════════════════════════════════════════════════
// Window — Electron 窗口默认值 | 同步自 electron/main.js
// ═══════════════════════════════════════════════════════════════════════════

export const WINDOW_WIDTH = 1400;
export const WINDOW_HEIGHT = 900;
export const WINDOW_MIN_WIDTH = 600;
export const WINDOW_MIN_HEIGHT = 400;

/** 文件读取最大字节数 (10MB) | 同步自 electron/main.js */
export const MAX_FILE_READ_SIZE = 10 * 1024 * 1024;

// ═══════════════════════════════════════════════════════════════════════════
// Keyboard Shortcuts — 所有快捷键集中定义
// 后期可由此扩展为用户自定义键位配置
// ═══════════════════════════════════════════════════════════════════════════

export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/** 检查键盘事件是否匹配快捷键定义 */
export function matchesKey(e: KeyboardEvent | React.KeyboardEvent, binding: KeyBinding): boolean {
  if (e.key !== binding.key) return false;
  const ctrl = binding.ctrl ?? false;
  const shift = binding.shift ?? false;
  const alt = binding.alt ?? false;
  const eCtrl = e.ctrlKey || e.metaKey;
  return eCtrl === ctrl && e.shiftKey === shift && e.altKey === alt;
}

export const KEYBINDINGS = {
  // ── 全局操作 ──
  /** Ctrl+S — 保存当前 Markdown 文件 */
  saveFile:          { key: "s", ctrl: true } as KeyBinding,
  /** Ctrl+Z — Excel 单元格样式撤销 */
  excelUndo:         { key: "z", ctrl: true } as KeyBinding,
  /** Delete — 删除当前选中文件 */
  deleteFile:        { key: "Delete" } as KeyBinding,
  /** Delete — 删除文件树中选中的文件夹 */
  deleteFolder:      { key: "Delete" } as KeyBinding,
  /** F2 — 重命名选中的文件/文件夹 */
  rename:            { key: "F2" } as KeyBinding,

  // ── 面板 / 弹窗 ──
  /** Escape — 关闭面板/弹窗/菜单 */
  closePanel:        { key: "Escape" } as KeyBinding,

  // ── 搜索 ──
  /** ArrowDown — 搜索结果下一个 */
  searchNext:        { key: "ArrowDown" } as KeyBinding,
  /** ArrowUp — 搜索结果上一个 */
  searchPrev:        { key: "ArrowUp" } as KeyBinding,
  /** Enter — 打开搜索结果 */
  searchOpen:        { key: "Enter" } as KeyBinding,

  // ── 内联编辑（通用） ──
  /** Enter — 确认（重命名/公式提交/颜色输入） */
  confirm:           { key: "Enter" } as KeyBinding,
  /** Escape — 取消（重命名/公式取消/搜索关闭） */
  cancel:            { key: "Escape" } as KeyBinding,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Toolbar — 所有编辑器工具栏的排版参数
// ═══════════════════════════════════════════════════════════════════════════

/** 工具栏：容器内边距 */
export const TOOLBAR_PADDING = "px-3 py-1.5";
/** 工具栏：按钮间距 */
export const TOOLBAR_GAP = "gap-0.5";
/** 工具栏：按钮内边距 | 同步 index.css .tool-btn */
export const TOOLBAR_BTN_PADDING = "2px 6px";
/** 工具栏：按钮最小宽度 | 同步 index.css .tool-btn */
export const TOOLBAR_BTN_MIN_WIDTH = 26;
/** 工具栏：按钮高度 | 同步 index.css .tool-btn */
export const TOOLBAR_BTN_HEIGHT = 26;
/** 工具栏：按钮字号 | 同步 index.css .tool-btn */
export const TOOLBAR_BTN_FONT_SIZE = 12;
/** 工具栏：按钮圆角 | 同步 index.css .tool-btn */
export const TOOLBAR_BTN_RADIUS = 3;
/** 工具栏：分隔线尺寸 | 同步 index.css .divider */
export const TOOLBAR_DIVIDER_WIDTH = 1;
export const TOOLBAR_DIVIDER_HEIGHT = 20;
export const TOOLBAR_DIVIDER_MARGIN = "0 2px";

// ═══════════════════════════════════════════════════════════════════════════
// Misc
// ═══════════════════════════════════════════════════════════════════════════

/** 工作区右键菜单显示最近工作区数量 */
export const RECENT_WORKSPACES_COUNT = 7;

/** Markdown 编辑器默认字体 */
export const MD_FONT_DEFAULT = "Maple Mono NF CN";

