/**
 * SaveAsTemplateModal.tsx — 保存为模版弹窗
 *
 * 点击 ActivityBar 的「保存为模版」按钮后弹出，
 * 提供名称输入 + 文件列表预览 + 保存确认。
 */

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { FolderFile } from "../types";
import { t, getLang } from "../i18n";
import { ChevronIcon } from "./icons";
import { useModalAnimation } from "../hooks/useModalAnimation";

interface SaveAsTemplateModalProps {
  open: boolean;
  defaultName: string;
  files: FolderFile[];
  folderPaths: string[];
  onSave: (name: string) => void;
  onClose: () => void;
}

/** 树节点数据结构（与 FileExplorer 保持一致） */
interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
  file?: FolderFile;
}

/** 从扁平文件列表构建树形结构（与 FileExplorer buildTree 逻辑一致） */
function buildTree(files: FolderFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const file of files) {
    const parts = file.name.split("/");
    let parent = root;
    let currentPath = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = i === parts.length - 1;
      if (isLast) {
        parent.push({ name: part, path: currentPath, isFolder: false, children: [], file });
      } else {
        let folder = parent.find((n) => n.isFolder && n.name === part);
        if (!folder) {
          folder = { name: part, path: currentPath, isFolder: true, children: [] };
          parent.push(folder);
        }
        parent = folder.children;
      }
    }
  }
  return sortTree(root);
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  const folders = nodes.filter((n) => n.isFolder).sort((a, b) => a.name.localeCompare(b.name));
  const fileNodes = nodes.filter((n) => !n.isFolder).sort((a, b) => a.name.localeCompare(b.name));
  return [...folders.map((f) => ({ ...f, children: sortTree(f.children) })), ...fileNodes];
}

function SaveAsTemplateModal({ open, defaultName, files, folderPaths, onSave, onClose }: SaveAsTemplateModalProps) {
  const lang = getLang();
  const { visible, closing, close } = useModalAnimation(open, onClose);
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 文件夹展开/折叠状态：初始全部展开（与 FileExplorer 一致）
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setSaving(false);
      setTimeout(() => inputRef.current?.focus(), 50);

      // 收集所有文件夹路径，初始全部展开
      const allPaths = new Set<string>();
      const collectPaths = (nodes: TreeNode[]) => {
        for (const node of nodes) {
          if (node.isFolder) {
            allPaths.add(node.path);
            collectPaths(node.children);
          }
        }
      };
      // 用 tree（已包含 folderPaths 空文件夹）
      const t = (() => {
        const bt = buildTree(files);
        for (const fp of folderPaths) {
          const parts = fp.split("/");
          let parent = bt;
          let cp = "";
          for (let i = 0; i < parts.length; i++) {
            cp = cp ? `${cp}/${parts[i]}` : parts[i];
            let node = parent.find((n) => n.isFolder && n.name === parts[i]);
            if (!node) {
              node = { name: parts[i], path: cp, isFolder: true, children: [] };
              parent.push(node);
            }
            parent = node.children;
          }
        }
        return bt;
      })();
      collectPaths(t);
      setExpandedPaths(allPaths);
    }
  }, [open, defaultName, files, folderPaths]);

  const toggleFolder = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (!visible && !open) return null;

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") close();
  };

  /** 文件夹类型（MD/XLSX/DOCX）→ 短标签 */
  const typeLabel = (type: FolderFile["type"]) => {
    switch (type) {
      case "md": return "MD";
      case "excel": return "XLSX";
      case "docx": return "DOCX";
    }
  };

  /** 类型 → 文件图标小 SVG */
  const typeIcon = (type: FolderFile["type"]) => {
    switch (type) {
      case "md":
        return (
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        );
      case "excel":
        return (
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width={18} height={18} rx={2} />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        );
      case "docx":
        return (
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width={20} height={14} rx={2} />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        );
    }
  };

  /** 递归渲染树节点（缩进深度 6 + depth * 12），文件夹可折叠/展开 */
  function TreeView({ nodes, depth = 0 }: { nodes: TreeNode[]; depth?: number }) {
    return (
      <>
        {nodes.map((node, idx) => {
          const indent = 6 + depth * 12;
          if (node.isFolder) {
            const isExpanded = expandedPaths.has(node.path);
            const hasChildren = node.children.length > 0;
            return (
              <div key={node.name + String(depth) + String(idx)}>
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "4px 10px",
                    paddingLeft: indent,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                  onClick={() => toggleFolder(node.path)}
                >
                  {/* 折叠/展开 chevron */}
                  <span
                    style={{
                      flexShrink: 0,
                      opacity: hasChildren ? 0.5 : 0.2,
                      transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                      transition: "transform 0.12s ease",
                      display: "inline-flex",
                      pointerEvents: "none",
                    }}
                  >
                    <ChevronIcon width={10} height={10} />
                  </span>
                  {/* 文件夹图标 */}
                  <span style={{ position: "relative", width: 12, height: 12, flexShrink: 0, opacity: 0.5, pointerEvents: "none" }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", bottom: 0, left: 0 }}>
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                    </svg>
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {node.name}
                  </span>
                </div>
                {isExpanded && node.children.length > 0 && <TreeView nodes={node.children} depth={depth + 1} />}
              </div>
            );
          }
          // 文件节点
          const f = node.file!;
          return (
            <div
              key={f.id || f.name + String(depth) + String(idx)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 10px",
                paddingLeft: indent + 18,  // 对齐文件夹文字（chevron 14px + gap 4px）
              }}
            >
              <span style={{ flexShrink: 0, color: "var(--text-secondary)" }}>{typeIcon(f.type)}</span>
              <span
                style={{
                  fontSize: 11, fontWeight: 600, color: "var(--accent)",
                  background: "var(--accent-bg)", padding: "0px 4px", borderRadius: 2,
                  flexShrink: 0, minWidth: 32, textAlign: "center",
                }}
              >
                {typeLabel(f.type)}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {node.name}
              </span>
            </div>
          );
        })}
      </>
    );
  }

  // 合并 folderPaths 中的空文件夹 + files 构建完整树
  const tree = (() => {
    const t = buildTree(files);
    for (const fp of folderPaths) {
      const parts = fp.split("/");
      let parent = t;
      let currentPath = "";
      for (let i = 0; i < parts.length; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        let node = parent.find((n) => n.isFolder && n.name === parts[i]);
        if (!node) {
          node = { name: parts[i], path: currentPath, isFolder: true, children: [] };
          parent.push(node);
        }
        parent = node.children;
      }
    }
    return sortTree(t);
  })();
  const hasAnyContent = files.length > 0 || folderPaths.length > 0;

  return createPortal(
    <div className={`fixed inset-0 flex items-center justify-center ${closing ? "modal-overlay-out" : "modal-overlay-in"}`} style={{ zIndex: 99997, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={close}>
      <div className={`w-full max-w-md mx-4 overflow-hidden ${closing ? "animate-out" : "animate-in"}`}
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}
        onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{t("saveTemplate", lang)}</h2>
          <p className="text-[12px] mt-1" style={{ color: "var(--text-tertiary)" }}>{t("saveTemplateDesc", lang)}</p>
        </div>

        {/* 内容 */}
        <div className="px-5 py-4">
          {/* 名称输入 */}
          <div className="mb-4">
            <label
              style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}
            >
              {t("templateName", lang)}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("templateNamePlaceholder", lang)}
              style={{
                width: "100%",
                padding: "6px 10px",
                fontSize: 13,
                color: "var(--text-primary)",
                background: "var(--bg-panel)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 4,
                outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border-subtle)")}
            />
          </div>

          {/* 文件/目录树预览 */}
          {hasAnyContent ? (
            <div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
                {t("templateFilesPreview", lang)}
              </div>
              <div
                className="max-h-56 overflow-y-auto"
                style={{
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 4,
                  background: "var(--bg-panel)",
                }}
              >
                <TreeView nodes={tree} />
              </div>
            </div>
          ) : (
            <p className="text-center py-8 text-sm" style={{ color: "var(--text-tertiary)" }}>
              {t("noFilesFolder", lang)}
            </p>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <button onClick={close} className="btn-secondary py-2 text-[13px]">{t("cancel", lang)}</button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="btn-primary py-2 text-[13px]"
            style={{ opacity: (!name.trim() || saving) ? 0.5 : 1 }}
          >
            {saving ? t("statusSaving", lang) : t("save", lang)}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default SaveAsTemplateModal;
