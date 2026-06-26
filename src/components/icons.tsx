/**
 * icons.tsx — 集中图标库
 *
 * 所有 SVG 图标统一管理，以 named export 函数组件形式导出。
 * 每个组件接收 className 和 style prop，方便外部控制尺寸和颜色。
 *
 * 使用方式：
 *   import { GearIcon, HomeIcon } from "../components/icons";
 *   <GearIcon className="w-4 h-4" />
 */

interface IconProps {
  className?: string;
  style?: React.CSSProperties;
  width?: number | string;
  height?: number | string;
}

const defaultProps = {
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// ═══════════════════════════════════════════════════════════════════════════
// 导航 / 操作图标
// ═══════════════════════════════════════════════════════════════════════════

export function GearIcon({ className, style, width = 16, height = 16 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function HomeIcon({ className, style, width = 16, height = 16 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

export function FolderIcon({ className, style, width = 16, height = 16 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function SearchIcon({ className, style, width = 16, height = 16 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps} strokeWidth={2.5}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function SidebarIcon({ className, style, width = 16, height = 16 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 窗口控制图标
// ═══════════════════════════════════════════════════════════════════════════

export function MinimizeIcon({ className, style, width = 16, height = 16 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps} {...{ strokeLinecap: undefined, strokeLinejoin: undefined }}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function MaximizeIcon({ className, style, width = 16, height = 16 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps} {...{ strokeLinecap: undefined, strokeLinejoin: undefined }}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

export function RestoreIcon({ className, style, width = 16, height = 16 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps} {...{ strokeLinecap: undefined, strokeLinejoin: undefined }}>
      <path d="M4 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" />
      <path d="M8 4h12a2 2 0 0 1 2 2v10" />
    </svg>
  );
}

export function CloseIcon({ className, style, width = 16, height = 16 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 文件类型图标（树节点用小尺寸 / 活动栏操作用大尺寸）
// ═══════════════════════════════════════════════════════════════════════════

export function MdFileIcon({ className, style, width = 12, height = 12 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps} {...{ strokeLinecap: undefined, strokeLinejoin: undefined }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 17L9 12L12 15L15 12L15 17" />
    </svg>
  );
}

export function ExcelFileIcon({ className, style, width = 12, height = 12 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps} {...{ strokeLinecap: undefined, strokeLinejoin: undefined }}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

export function DocxFileIcon({ className, style, width = 12, height = 12 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps} {...{ strokeLinecap: undefined, strokeLinejoin: undefined }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 12v5M9 12h3a2.5 2.5 0 0 1 0 5h-3" />
    </svg>
  );
}

export function NewMdIcon({ className, style, width = 16, height = 16 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps} {...{ strokeLinecap: undefined, strokeLinejoin: undefined }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 17L9 12L12 15L15 12L15 17" />
    </svg>
  );
}

export function NewExcelIcon({ className, style, width = 16, height = 16 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps} {...{ strokeLinecap: undefined, strokeLinejoin: undefined }}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="12" y1="9" x2="12" y2="15" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}

export function NewDocxIcon({ className, style, width = 16, height = 16 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps} {...{ strokeLinecap: undefined, strokeLinejoin: undefined }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 12v5M9 12h3a2.5 2.5 0 0 1 0 5h-3" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 文件树 / 导航图标
// ═══════════════════════════════════════════════════════════════════════════

export function ChevronIcon({ className, style, width = 16, height = 16 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps} strokeWidth={2.5}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function BackIcon({ className, style, width = 12, height = 12 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps} {...{ strokeLinecap: undefined }}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

export function SaveIcon({ className, style, width = 16, height = 16 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function NewFolderIcon({ className, style, width = 14, height = 14 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 主题 / 外观图标
// ═══════════════════════════════════════════════════════════════════════════

export function SunIcon({ className, style, width = 14, height = 14 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps} {...{ strokeLinecap: undefined, strokeLinejoin: undefined }}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

export function MoonIcon({ className, style, width = 14, height = 14 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" {...defaultProps} {...{ strokeLinecap: undefined, strokeLinejoin: undefined }}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function MonitorIcon({ className, style, width = 16, height = 16 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 16 16" {...defaultProps} {...{ strokeWidth: 1.4 }}>
      <rect x="1" y="2" width="14" height="12" rx="1.5" />
      <path d="M5 14V2M1 6h4M1 10h4" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Settings 页面专用
// ═══════════════════════════════════════════════════════════════════════════

export function SettingsGearIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} width={16} height={16} viewBox="0 0 16 16" {...defaultProps} {...{ strokeWidth: 1.4 }}>
      <circle cx="8" cy="8" r="2.8" />
      <path d="M8 1.2v1.8M8 13v1.8M13.2 8h-1.8M4.6 8H2.8M11.7 4.3l-1.3 1.3M5.6 10.4l-1.3 1.3M11.7 11.7l-1.3-1.3M5.6 5.6L4.3 4.3" />
    </svg>
  );
}

export function StorageCubeIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} width={16} height={16} viewBox="0 0 16 16" {...defaultProps} {...{ strokeWidth: 1.4 }}>
      <path d="M2 5l6-3 6 3v6l-6 3-6-3v-6z" />
      <path d="M2 5l6 3v6" />
      <path d="M8 8l6-3" />
      <path d="M8 8v6" />
    </svg>
  );
}

export function RefreshIcon({ className, style, width = 16, height = 16 }: IconProps) {
  return (
    <svg className={className} style={style} width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export function InfoCircleIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} width={16} height={16} viewBox="0 0 16 16" {...defaultProps} {...{ strokeWidth: 1.4 }}>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 5v0M8 8v3" />
    </svg>
  );
}
