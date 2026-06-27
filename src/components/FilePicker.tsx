import { useState } from "react";
import type { FolderFile } from "../types";
import { t, getLang } from "../i18n";
import { MdFileIcon, DocxFileIcon, ExcelFileIcon } from "./icons";
import { useModalAnimation } from "../hooks/useModalAnimation";

/**
 * FilePicker — 文件选择弹窗（用于 Markdown 编辑器中插入文件链接）
 *
 * 【角色】模态弹窗，列出当前文件夹内所有文件供用户选择。
 *         自动按类型分组（Markdown 文件 / Excel 表格），支持搜索过滤。
 *         选中文件后调用 onSelect 回调（通常插入文件链接到 Markdown 编辑器）。
 *
 * 【视觉布局】固定全屏遮罩（fixed inset-0，rgba 半透明背景）+ 居中卡片。
 *           - 外层：flex items-center justify-center 垂直居中
 *           - 卡片：max-w-md mx-4，overflow-hidden，圆角边框 + 阴影
 *           - 头部：标题 + 副标题，底部 border 分割
 *           - 搜索：SVG 图标 + input-ide
 *           - 列表：max-h-72 overflow-y-auto，分组显示 MD 和 Excel 文件
 *           - 底部：取消按钮，borderTop 分割
 *
 * 【交互链】
 *   - 点击遮罩背景 → onClose → 关闭弹窗
 *   - 点击卡片区域 → e.stopPropagation() 阻止冒泡
 *   - 点击文件条目 → onSelect(file) → 由调用方处理（通常插入链接并关闭）
 *
 * 【设计决策】
 *   - open 为 false 时返回 null（完全不渲染），避免不必要的 DOM 开销
 *   - 鼠标悬停直接操作 style（onMouseEnter/onMouseLeave），不使用 CSS :hover
 *     因为 Tailwind + CSS 变量混用时 :hover 优先级可能不足
 *   - 文件按 MD/XLS 类型分组展示，每组有小标题，空组不渲染
 *   - 文件类型图标 SVG 与 FileExplorer 保持一致
 */
interface FilePickerProps {
  open: boolean;
  files: FolderFile[];
  onClose: () => void;
  onSelect: (file: FolderFile) => void;
}

function FilePicker({ open, files, onClose, onSelect }: FilePickerProps) {
  const lang = getLang();
  const { visible, closing, close } = useModalAnimation(open, onClose);
  const [search, setSearch] = useState("");

  if (!visible && !open) return null;

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  // 按类型分组：Markdown 文件和 Excel 文件分别展示
  const mdFiles = filtered.filter((f) => f.type === "md");
  const docxFiles = filtered.filter((f) => f.type === "docx");
  const excelFiles = filtered.filter((f) => f.type === "excel");

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${closing ? "modal-overlay-out" : "modal-overlay-in"}`}
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
      onClick={close}
    >
      <div
        className={`w-full max-w-md mx-4 overflow-hidden ${closing ? "animate-out" : "animate-in"}`}
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <h2
            className="text-[15px] font-semibold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {t("insertFileLink", lang)}
          </h2>
          <p className="text-[12px] mt-1" style={{ color: "var(--text-tertiary)" }}>
            {t("selectFileHint", lang)}
          </p>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: "var(--text-tertiary)" }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder={t("searchFile", lang)}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-ide pl-7 pr-3 py-1.5 text-[12px]"
            />
          </div>
        </div>

        {/* File list */}
        <div className="px-4 pb-4 max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-[13px] text-center py-6" style={{ color: "var(--text-tertiary)" }}>
              {files.length === 0 ? t("noFilesFolder", lang) : t("noMatchingFile", lang)}
            </p>
          ) : (
            <div className="space-y-0.5">
              {mdFiles.length > 0 && (
                <>
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {t("mdFiles", lang)}
                  </p>
                  {mdFiles.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => onSelect(f)}
                      className="w-full text-left px-3 py-2.5 transition-colors flex items-center gap-2 text-[13px]"
                      style={{
                        borderRadius: "var(--radius)",
                        color: "var(--text-primary)",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--bg-hover)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <MdFileIcon width={12} height={12} style={{ opacity: 0.5, flexShrink: 0 }} />
                      <span className="truncate">{f.name}</span>
                    </button>
                  ))}
                </>
              )}
              {docxFiles.length > 0 && (
                <>
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 mt-1"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {t("docxFiles", lang)}
                  </p>
                  {docxFiles.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => onSelect(f)}
                      className="w-full text-left px-3 py-2.5 transition-colors flex items-center gap-2 text-[13px]"
                      style={{ borderRadius: "var(--radius)", color: "var(--text-primary)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <DocxFileIcon width={12} height={12} style={{ opacity: 0.5, flexShrink: 0 }} />
                      <span className="truncate">{f.name}</span>
                    </button>
                  ))}
                </>
              )}
              {excelFiles.length > 0 && (
                <>
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 mt-1"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {t("excelFiles", lang)}
                  </p>
                  {excelFiles.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => onSelect(f)}
                      className="w-full text-left px-3 py-2.5 transition-colors flex items-center gap-2 text-[13px]"
                      style={{
                        borderRadius: "var(--radius)",
                        color: "var(--text-primary)",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--bg-hover)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <ExcelFileIcon width={12} height={12} style={{ opacity: 0.5, flexShrink: 0 }} />
                      <span className="truncate">{f.name}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 flex justify-end"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <button onClick={close} className="btn-secondary py-2 text-[13px]">
            {t("cancel", lang)}
          </button>
        </div>
      </div>
    </div>
  );
}

export default FilePicker;
