import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { FolderFile } from "../types";
import { t, getLang } from "../i18n";
import Panel from "./Panel";
import { EXPLORER_HEADER_HEIGHT, TREE_INDENT_BASE, TREE_INDENT_PER_DEPTH, TREE_ICON_GAP, TREE_ICON_SIZE, TREE_ICON_HEIGHT, TREE_ICON_TEXT_GAP, TREE_ICON_LEFT_OFFSET, TREE_CHEVRON_OFFSET, TREE_CHEVRON_WIDTH, TREE_GUIDE_OFFSET, TREE_GUIDE_HIGHLIGHT_WIDTH, TREE_GUIDE_HIGHLIGHT_COLOR, KEYBINDINGS } from "../config";
import { ChevronIcon, MdFileIcon, DocxFileIcon, ExcelFileIcon, NewFolderIcon, RefreshIcon, BackIcon, SearchIcon, SunIcon, MoonIcon } from "./icons";

/**
 * FileExplorer — 文件资源管理器（工作区视图的左侧面板）
 *
 * 【角色】类似 VS Code 的 Explorer 面板，以树形结构展示当前文件夹内的所有文件和子目录。
 *         支持：文件树展开/折叠、树节点拖拽移动（文件夹/文件）、行内重命名（文件/文件夹）、
 *         右键上下文菜单（文件操作/文件夹操作/空白区域新建文件夹）、文件搜索筛选、
 *         工作区切换、亮色/暗色主题一键切换。
 *
 * 【视觉布局】基于 Panel 通用面板骨架（240px flex 列）。
 *           布局从上到下分为四个区域：
 *           1. 顶部栏（36px 高，Panel header）：文件夹名称 + 新建文件夹按钮 + 返回按钮
 *           2. 搜索区域（条件显示，Panel header 内）：搜索图标 + input
 *           3. 文件树（Panel body，可滚）：
 *              - 文件夹节点：三角形展开/折叠图标 + 文件夹图标 + 名称
 *              - 文件节点：MD/Excel 类型图标 + 文件名
 *              - 每个节点支持拖拽（draggable）、选择高亮，间距由 depth 层级决定
 *              - 空状态：暂无文件 / 搜索无匹配
 *           4. 底部栏（Panel footer）：
 *              - 左侧：工作区切换按钮（带 Portal 弹出的工作区列表）
 *              - 右侧：亮色/暗色主题切换按钮
 *
 * 【交互链】
 *   - onSelectFile → FolderWorkspace → 切换活动编辑文件
 *   - onRenameFile/onDeleteFile → FolderWorkspace → storage 层操作
 *   - onMoveFile/onMoveFolder → FolderWorkspace → 更新文件/文件夹路径
 *   - 拖拽：onDragStart 记录源 → onDrop 调用 onMoveXxx 并重置 → onDragOver/Leave 显示视觉反馈
 *   - 搜索：setSearchQuery 过滤 files，Escape 键退出搜索，click-outside 关闭搜索
 *   - 工作区切换：Portal 渲染最近工作区列表，点击跳转 navigate()
 *
 * 【设计决策】
 *   - 树形结构用递归 renderNode(depth)：每个节点根据 8 + depth*14 计算 left padding 实现缩进
 *   - drag 状态用 useRef 而非 useState：避免拖拽期间触发重渲染导致 DOM 重置
 *   - 拖拽自检：防止将文件夹拖入自身或子文件夹（path.startsWith）
 *   - onDragOver 直接操作 backgroundColor style：避免 react 状态更新在高频 drag 事件中的性能问题
 *   - 底部栏用 absolute 定位 + paddingBottom 留空：确保底部栏固定在面板底部，不被文件树滚动影响
 *   - expandedPaths 默认全部展开（初始化时收集所有文件夹路径到 Set）
 *   - 右键菜单区分三种上下文：文件节点 / 文件夹节点 / 空白区域（通过 fileId 和 folderPath 区分）
 *   - 文件夹重命名用 click-away 提交（mousedown document handler），与文件重命名的 onBlur 一致
 *   - 新增文件后自动进入重命名模式（useEffect 监听 newFileId）
 */

interface FileExplorerProps {
  folderName: string;
  files: FolderFile[];
  folderPaths: string[];
  currentFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onRenameFile: (fileId: string, newName: string) => void;
  onDeselectAll?: () => void;
  onDeleteFile: (fileId: string) => void;
  onAddFile: (type: "md" | "excel") => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (oldPath: string, newName: string) => void;
  onDeleteFolder: (path: string) => void;
  onMoveFile: (fileId: string, targetPath: string) => void;
  onMoveFolder: (oldPath: string, targetPath: string) => void;
  onSelectFolderPath?: (path: string | null) => void;
  onRefresh?: () => void;
  searchActive: boolean;
  onSearchClose: () => void;
  newFileId?: string | null;
  onNewFileRenamed?: () => void;
}

/** 树节点数据结构：文件夹或文件，支持嵌套子节点 */
interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
  file?: FolderFile; // 仅文件节点有值
}

/**
 * 从扁平文件列表构建树形结构
 * 文件路径以 "/" 分隔表示层级（如 "章节/角色/主角.md"）
 * 自动创建中间目录节点并递归分组
 */
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

/** 对树节点排序：文件夹在前、文件在后，各自按名称字母升序，递归子节点 */
function sortTree(nodes: TreeNode[]): TreeNode[] {
  const folders = nodes.filter((n) => n.isFolder).sort((a, b) => a.name.localeCompare(b.name));
  const fileNodes = nodes.filter((n) => !n.isFolder).sort((a, b) => a.name.localeCompare(b.name));
  return [...folders.map((f) => ({ ...f, children: sortTree(f.children) })), ...fileNodes];
}

function FileExplorer({
  folderName,
  files,
  folderPaths,
  currentFileId,
  onSelectFile,
  onRenameFile,
  onDeselectAll,
  onDeleteFile,
  onAddFile,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFile,
  onMoveFolder,
  onSelectFolderPath,
  onRefresh,
  searchActive,
  onSearchClose,
  newFileId,
  onNewFileRenamed,
}: FileExplorerProps) {
  const lang = getLang();
  const navigate = useNavigate();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; fileId?: string; folderPath?: string } | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState("");
  const folderRenameInputRef = useRef<HTMLInputElement>(null);
  // 拖拽状态用 useRef 而非 useState：避免高频拖拽事件触发不必要的重渲染
  const dragFileId = useRef<string | null>(null);
  const dragFolderPath = useRef<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // 标记右键菜单"刚刚打开"：与 Sidebar 同样的机制，防止右键时菜单被立即关闭
  const menuJustOpened = useRef(false);
  const [workspaceMenu, setWorkspaceMenu] = useState<{ id: number; name: string }[] | null>(null);
  // 展开状态：初始全部展开，用户可手动折叠/展开
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  // 选中的文件夹路径：用于在树中高亮当前文件夹
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  // 树中高亮的文件（独立于编辑器打开的文件）
  const [highlightFileId, setHighlightFileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLight, setIsLight] = useState(() => {
    try {
      return document.documentElement.classList.contains("light");
    } catch { return false; }
  });
  useEffect(() => {
    const id = setTimeout(() => {
      if (renamingFolder && folderRenameInputRef.current) {
        folderRenameInputRef.current.focus();
        folderRenameInputRef.current.select();
      }
    }, 10);
    return () => clearTimeout(id);
  }, [renamingFolder]);

  // Click-away to finalize folder rename
  useEffect(() => {
    if (!renamingFolder) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (folderRenameInputRef.current && !folderRenameInputRef.current.contains(e.target as Node)) {
        const trimmed = folderRenameValue.trim();
        if (trimmed && trimmed !== renamingFolder) {
          onRenameFolder(renamingFolder, trimmed);
        }
        setRenamingFolder(null);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [renamingFolder, folderRenameValue, onRenameFolder]);

  // 文件重命名 click-outside: 鼠标点击输入框外部时自动提交
  useEffect(() => {
    if (!renamingId) return;
    const onDown = (e: MouseEvent) => {
      if (renameInputRef.current && !renameInputRef.current.contains(e.target as Node)) {
        handleRenameSubmit(renamingId);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [renamingId, renameValue]);

  useEffect(() => { setHighlightFileId(currentFileId); }, [currentFileId]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (!newFileId) return;
    const file = files.find((f) => f.id === newFileId);
    if (file) {
      setRenamingId(file.id);
      setRenameValue((file.name.split("/").pop() || file.name).replace(/\.\w+$/, ""));
    }
  }, [newFileId, files]);

  useEffect(() => {
    if (searchActive && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchActive]);

  useEffect(() => {
    const handleClick = () => {
      if (menuJustOpened.current) return;
      setContextMenu(null);
      setWorkspaceMenu(null);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  // Delete / F2: 删除或重命名选中的文件/文件夹
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = document.activeElement as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if (e.key === "F2") {
        // F2 重命名：文件夹优先（点击文件夹时 highlightFileId 仍保留旧值）
        e.preventDefault();
        if (selectedFolderPath) {
          setRenamingFolder(selectedFolderPath);
          setFolderRenameValue(selectedFolderPath);
          return;
        }
        if (highlightFileId) {
          const file = files.find((f) => f.id === highlightFileId);
          if (file) {
            setRenamingId(file.id);
            setRenameValue((file.name.split("/").pop() || file.name).replace(/\.\w+$/, ""));
            setContextMenu(null);
            return;
          }
        }
        return;
      }

      if (e.key === "Delete") {
        if (selectedFolderPath) {
          e.preventDefault();
          onDeleteFolder(selectedFolderPath);
          setSelectedFolderPath(null);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedFolderPath, onDeleteFolder, highlightFileId, files]);

  // Close search on click outside
  useEffect(() => {
    if (!searchActive) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-search-area]")) {
        setSearchQuery("");
        onSearchClose();
      }
    };
    setTimeout(() => document.addEventListener("click", handleClickOutside), 0);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [searchActive, onSearchClose]);

  // 文件列表变化时自动展开所有文件夹路径
  // 注意：必须同时考虑 folderPaths 中可能存在的空文件夹节点，
  // 否则拖出文件夹中最后一个文件后，空文件夹会因为 buildTree(files) 不包含它而自动收起。
  useEffect(() => {
    const t = buildTree(files);
    // 合并 folderPaths 中的空文件夹节点（与渲染时的 tree 构建逻辑一致）
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
    const allPaths = new Set<string>();
    const collectPaths = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.isFolder) { allPaths.add(node.path); collectPaths(node.children); }
      }
    };
    collectPaths(t);
    setExpandedPaths(allPaths);
  }, [files, folderPaths]);

  // Auto-trigger rename on newly created file
  useEffect(() => {
    if (newFileId) {
      const file = files.find((f) => f.id === newFileId);
      if (file) handleRenameStart(file);
    }
  }, [newFileId, files]);

  const handleNewFolder = () => {
    const name = t("newFolderDefault", lang);
    // Ensure unique name
    let uniqueName = name;
    let counter = 1;
    const allNames = new Set([...folderPaths, ...files.map((f) => f.name.split("/").pop()!)]);
    while (allNames.has(uniqueName)) {
      uniqueName = `${name}${counter}`;
      counter++;
    }
    onCreateFolder(uniqueName);
    setRenamingFolder(uniqueName);
    setFolderRenameValue(uniqueName);
  };

  const handleFolderRenameSubmit = (oldPath: string) => {
    const trimmed = folderRenameValue.trim();
    if (trimmed && trimmed !== oldPath) {
      onRenameFolder(oldPath, trimmed);
    }
    setRenamingFolder(null);
  };

  const handleContextMenu = (e: React.MouseEvent, fileId?: string, folderPath?: string) => {
    e.preventDefault(); e.stopPropagation();
    menuJustOpened.current = true;
    setContextMenu({ x: e.clientX, y: e.clientY, fileId, folderPath });
    setTimeout(() => { menuJustOpened.current = false; }, 0);
  };

  const handleRenameStart = (file: FolderFile) => {
    setRenamingId(file.id); setRenameValue((file.name.split("/").pop() || file.name).replace(/\.\w+$/, "")); setContextMenu(null);
  };

  const handleRenameSubmit = (fileId: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      const file = files.find(f => f.id === fileId);
      const ext = file ? (file.name.match(/\.\w+$/) || [""])[0] : "";
      const dir = file ? file.name.split("/").slice(0, -1).join("/") : "";
      onRenameFile(fileId, dir ? `${dir}/${trimmed}${ext}` : `${trimmed}${ext}`);
    }
    setRenamingId(null);
    if (newFileId === fileId && onNewFileRenamed) onNewFileRenamed();
  }

  const toggleFolder = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const filteredFiles = searchQuery
    ? files.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : files;

  // 构建树：搜索时基于过滤结果，否则基于全部文件
  // 同时合并 folderPaths 中的空文件夹（只有文件夹没有文件的目录节点）
  const tree = (() => {
    const t = searchQuery ? buildTree(filteredFiles) : buildTree(files);
    // 将 folderPaths 中已存在但没有文件的纯文件夹节点插入树中
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

  // 递归渲染树节点：缩进深度 = 8 + depth * 14（每层 14px）
  // 文件夹节点：可折叠、支持拖拽（作为拖拽目标接受文件和文件夹）、右键菜单
  // 文件节点：不可折叠、支持拖拽（作为拖拽源）、单击选择、右键菜单
  const renderNode = (node: TreeNode, depth: number): JSX.Element => {
    if (node.isFolder) {
      const isExpanded = expandedPaths.has(node.path);
      const hasChildren = node.children.length > 0;
      const isRenaming = renamingFolder === node.path;
      return (
        <div key={node.path}>
          <div
            className="tree-row group px-2 py-1 cursor-pointer transition-colors duration-100 flex items-center"
            style={{
              borderRadius: "var(--radius)", color: selectedFolderPath === node.path ? "var(--accent-text)" : "var(--text-secondary)",
              paddingLeft: `${TREE_INDENT_BASE + depth * TREE_INDENT_PER_DEPTH + TREE_ICON_GAP}px`, marginLeft: 4, marginRight: 4, position: "relative",
              background: selectedFolderPath === node.path ? "var(--bg-selected)" : "transparent",
            }}
            draggable={!isRenaming}
            onDragStart={() => { dragFolderPath.current = node.path; }}
            onDragEnd={() => { dragFolderPath.current = null; }}
            onClick={(e) => { e.stopPropagation(); setSelectedFolderPath(node.path); onSelectFolderPath?.(node.path); }}
            onContextMenu={(e) => handleContextMenu(e, undefined, node.path)}
            onDragOver={(e) => {
              e.preventDefault(); e.stopPropagation();
              const el = e.currentTarget as HTMLElement;
              // 防止将文件夹拖入自身或子文件夹（会造成无限嵌套）
              const targetPath = node.path;
              if (dragFolderPath.current && (dragFolderPath.current === targetPath || targetPath.startsWith(dragFolderPath.current + "/"))) {
                return; // 非法目标：不显示 hover 状态
              }
              el.style.backgroundColor = "var(--bg-hover)"; // 直接操作 style 避免高频 drag 事件触发 React 重渲染
            }}
            onDragLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
            onDrop={(e) => {
              e.preventDefault(); e.stopPropagation();
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; // 清除 hover 样式
              // 处理文件拖放：将文件移动到目标文件夹下
              if (dragFileId.current) {
                onMoveFile(dragFileId.current, node.path); dragFileId.current = null;
              } else if (dragFolderPath.current) {
                // 防止自拖放和后代拖放
                if (dragFolderPath.current !== node.path && !node.path.startsWith(dragFolderPath.current + "/")) {
                  onMoveFolder(dragFolderPath.current, node.path);
                }
                dragFolderPath.current = null;
              }
            }}
          >
            {selectedFolderPath === node.path && (
              <span style={{ position: "absolute", left: 0, top: 2, bottom: 2, width: 2, background: "var(--accent)", borderRadius: 1 }} />
            )}
            {/* 缩进引导线：文件夹展开时画自己层级+祖先层级 */}
            {Array.from({ length: node.isFolder && isExpanded && hasChildren ? depth + 1 : depth }, (_, i) => {
              const isSelf = node.isFolder && i === depth;
              // 计算该层级的祖先路径，若等于选中文件夹则高亮
              const parts = node.path.split("/");
              const ancestorPath = parts.slice(0, i + 1).join("/");
              const highlighted = !!selectedFolderPath && ancestorPath === selectedFolderPath;
              return (
                <span
                  key={`guide-${i}`}
                  style={{
                    position: "absolute",
                    left: `${TREE_INDENT_BASE + i * TREE_INDENT_PER_DEPTH + TREE_CHEVRON_OFFSET + TREE_GUIDE_OFFSET}px`,
                    top: isSelf ? 14 : 0, bottom: 0,
                    background: highlighted ? TREE_GUIDE_HIGHLIGHT_COLOR : "var(--border-subtle)",
                    width: highlighted ? TREE_GUIDE_HIGHLIGHT_WIDTH : 1,
                    opacity: highlighted ? 0.5 : undefined,
                  }}
                />
              );
            })}
            <span style={{ position: "absolute", left: `${TREE_INDENT_BASE + depth * TREE_INDENT_PER_DEPTH + TREE_CHEVRON_OFFSET}px`, top: 0, bottom: 0, display: "flex", alignItems: "center", gap: 3 }}>
              <span
                onClick={(e) => { e.stopPropagation(); toggleFolder(node.path); }}
                style={{ opacity: 0.5, flexShrink: 0, transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.12s ease", cursor: "pointer", padding: 3, pointerEvents: "auto", display: "inline-flex" }}>
                <ChevronIcon width={10} height={10} />
              </span>
              <span style={{ position: "relative", width: TREE_ICON_SIZE, height: TREE_ICON_HEIGHT, flexShrink: 0, opacity: 0.5, pointerEvents: "none" }}>
                <span style={{ position: "absolute", bottom: 0, left: 0, width: TREE_ICON_SIZE, height: isExpanded ? 10 : 11, background: "currentColor", borderRadius: "0 2px 2px 2px" }} />
                <span style={{ position: "absolute", top: 0, left: 0, width: 8, height: 4, background: "currentColor", borderRadius: "2px 2px 0 0" }} />
              </span>
            </span>
            {isRenaming ? (
              <input
                ref={folderRenameInputRef}
                value={folderRenameValue}
                onChange={(e) => setFolderRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleFolderRenameSubmit(node.path);
                  if (e.key === "Escape") { setRenamingFolder(null); }
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 px-1 py-0.5 text-xs border rounded outline-none"
                style={{ borderColor: "var(--accent)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
              />
            ) : (
              <span className="text-[12px] truncate flex-1 select-none">{node.name}</span>
            )}
          </div>
          {isExpanded && <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>}
        </div>
      );
    }

    const file = node.file!;
    const isMd = file.type === "md";
    const isDocx = file.type === "docx";
    return (
      <div
        key={file.id}
        draggable={true}
        onDragStart={() => { dragFileId.current = file.id; }}
        onDragEnd={() => { dragFileId.current = null; }}
        onClick={(e) => { e.stopPropagation(); setSelectedFolderPath(null); onSelectFolderPath?.(null); setHighlightFileId(file.id); onSelectFile(file.id); }}
        onContextMenu={(e) => handleContextMenu(e, file.id)}
        className={`tree-row group px-2 py-1 mx-1 cursor-pointer transition-colors duration-100 flex items-center${highlightFileId === file.id && !selectedFolderPath ? " active" : ""}`}
        style={{
          borderRadius: "var(--radius)", paddingLeft: `${TREE_INDENT_BASE + depth * TREE_INDENT_PER_DEPTH + TREE_ICON_GAP}px`,
          color: highlightFileId === file.id && !selectedFolderPath ? "var(--accent-text)" : "var(--text-secondary)",
          background: highlightFileId === file.id && !selectedFolderPath ? "var(--bg-selected)" : "transparent",
          position: "relative",
        }}
      >
        {highlightFileId === file.id && !selectedFolderPath && (
          <span style={{
            position: "absolute", left: 0, top: 2, bottom: 2,
            width: 2, background: "var(--accent)", borderRadius: 1,
          }} />
        )}
        {Array.from({ length: depth }, (_, i) => {
          const parts = node.path.split("/");
          const ancestorPath = parts.slice(0, i + 1).join("/");
          const highlighted = !!selectedFolderPath && ancestorPath === selectedFolderPath;
          return (
            <span
              key={`guide-${i}`}
              style={{
                position: "absolute",
                left: `${TREE_INDENT_BASE + i * TREE_INDENT_PER_DEPTH + TREE_CHEVRON_OFFSET + TREE_GUIDE_OFFSET}px`,
                top: 0, bottom: 0,
                background: highlighted ? TREE_GUIDE_HIGHLIGHT_COLOR : "var(--border-subtle)",
                width: highlighted ? TREE_GUIDE_HIGHLIGHT_WIDTH : 1,
                opacity: highlighted ? 0.5 : undefined,
              }}
            />
          );
        })}
        {/* File icon: absolutely positioned, aligned with folder icon (after chevron area) */}
        <span style={{
          position: "absolute",
          left: `${TREE_INDENT_BASE + depth * TREE_INDENT_PER_DEPTH + TREE_ICON_LEFT_OFFSET}px`,
          top: 0, bottom: 0,
          display: "flex", alignItems: "center",
        }}>
          {isMd
            ? <MdFileIcon width={TREE_ICON_SIZE} height={TREE_ICON_HEIGHT} style={{ opacity: 0.5, flexShrink: 0 }} />
            : isDocx
            ? <DocxFileIcon width={TREE_ICON_SIZE} height={TREE_ICON_HEIGHT} style={{ opacity: 0.5, flexShrink: 0 }} />
            : <ExcelFileIcon width={TREE_ICON_SIZE} height={TREE_ICON_HEIGHT} style={{ opacity: 0.5, flexShrink: 0 }} />
          }
        </span>
        {renamingId === file.id ? (
          <input
            ref={renameInputRef} value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => handleRenameSubmit(file.id)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRenameSubmit(file.id); if (e.key === "Escape") { setRenamingId(null); if (file.id === newFileId) onNewFileRenamed?.(); } }}
            onClick={(e) => e.stopPropagation()}
            className="w-full px-1 py-0.5 text-xs border rounded outline-none"
            style={{ borderColor: "var(--accent)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
          />
        ) : (
          <span className="text-[12px] truncate flex-1">{node.name}</span>
        )}
      </div>
    );
  };

  const header = (
    <>
      {/* Top bar */}
      <div className="flex items-center justify-between px-2"
        style={{ height: 36, borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-1">
          <span className="text-[12px] font-medium px-2 py-1" style={{ color: "var(--text-secondary)" }}>
            {folderName}
          </span>
          <button
            onClick={handleNewFolder}
            className="fe-icon-btn flex items-center justify-center rounded flex-shrink-0"
            style={{ width: 24, height: 24, color: "var(--text-tertiary)", background: "transparent", border: "none", cursor: "pointer" }}
            title={t("newFolder", lang)}
          >
            <NewFolderIcon width={14} height={14} />
          </button>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="fe-icon-btn flex items-center justify-center rounded flex-shrink-0"
              style={{ width: 24, height: 24, color: "var(--text-tertiary)", background: "transparent", border: "none", cursor: "pointer" }}
              title={t("refresh", lang)}
            >
              <RefreshIcon width={14} height={14} />
            </button>
          )}
        </div>
        <button onClick={() => navigate("/")}
          className="fe-btn text-[12px] px-2 py-1 rounded flex items-center gap-1"
          style={{ color: "var(--text-tertiary)", background: "transparent", border: "none", cursor: "pointer" }}
          title={t("backToHome", lang)}>
          <BackIcon width={12} height={12} />
          <span style={{ fontSize: 11 }}>{t("back", lang)}</span>
        </button>
      </div>

      {/* Search input (shown when search is active) */}
      {searchActive && (
        <div className="px-2 py-1.5" style={{ borderBottom: "1px solid var(--border-subtle)" }} data-search-area>
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: "var(--text-tertiary)" }} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t("searchFiles", lang)}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setSearchQuery(""); onSearchClose(); } }}
              className="input-ide pl-7 pr-2 py-1 text-[11px]"
            />
          </div>
        </div>
      )}
    </>
  );

  const footer = (
    <div className="px-3 py-2" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ position: "relative", flex: 1 }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const raw = localStorage.getItem("gull_recent_workspaces");
            const recent: { id: number; name: string }[] = raw ? JSON.parse(raw) : [];
            setWorkspaceMenu(recent.slice(0, 5));
          }}
          className="fe-workspace-btn text-[11px] font-medium truncate max-w-full text-left px-1 py-0.5 rounded"
          style={{ color: "var(--text-secondary)", background: "transparent", border: "none", cursor: "pointer" }}
          title={t("switchWorkspace", lang)}
        >
          {folderName}
        </button>
        {/* 工作区切换菜单：Portal 弹出，定位在按钮上方 */}
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
            <div className="context-menu" style={{ position: "absolute", bottom: 0 }}>
              {workspaceMenu.map((w) => (
                <button key={w.id}
                  onClick={() => { navigate(`/folder/${w.id}`); setWorkspaceMenu(null); }}
                  className="context-menu-item">{w.name}</button>
              ))}
              <div className="context-menu-divider" />
              <button
                onClick={() => {
                  setWorkspaceMenu(null);
                  const fn = (window as any).__openWorkspace;
                  if (fn) fn(); else alert("此功能仅在桌面应用中可用");
                }}
                className="context-menu-item">{t("openOtherWorkspace", lang)}</button>
            </div>
          </div>,
          document.body
        )}
      </div>
      <button
        onClick={() => {
          // 切换亮色/暗色模式：同时更新 DOM 类名、组件状态、localStorage
          const next = !document.documentElement.classList.contains("light");
          document.documentElement.classList.toggle("light", next);
          setIsLight(next);
          // 持久化主题到 localStorage，确保 App/Settings 不会覆盖用户选择
          try {
            const raw = localStorage.getItem("gull_settings");
            const s = raw ? JSON.parse(raw) : {};
            s.theme = next ? "light" : "dark";
            localStorage.setItem("gull_settings", JSON.stringify(s));
          } catch {}
        }}
        className="fe-icon-btn flex items-center justify-center rounded flex-shrink-0"
        style={{ width: 20, height: 20, color: "var(--text-tertiary)", background: "transparent", border: "none", cursor: "pointer" }}
        title={isLight ? t("switchToDark", lang) : t("switchToLight", lang)}
      >
        {isLight ? <MoonIcon width={13} height={13} /> : <SunIcon width={13} height={13} />}
      </button>
    </div>
  );

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragFileId.current) {
      onMoveFile(dragFileId.current, ""); dragFileId.current = null;
    } else if (dragFolderPath.current) {
      onMoveFolder(dragFolderPath.current, "");
      dragFolderPath.current = null;
    }
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleRootDrop}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(".tree-row")) return;
        setSelectedFolderPath(null);
        onSelectFolderPath?.(null);
        setHighlightFileId(null);
      }}
      style={{ height: "100%" }}
    >
    <Panel header={header} footer={footer}>
      {/* File tree */}
      <div className="py-1"
        onContextMenu={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest(".tree-row")) return;
          handleContextMenu(e);
        }}
        >
        {files.length === 0 && tree.length === 0 ? (
          <div className="text-center py-10 px-4">
            <div className="text-3xl mb-2 opacity-20">+</div>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("noFiles", lang)}</p>
            <p className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>{t("addFilesHint", lang)}</p>
          </div>
        ) : tree.length === 0 && searchQuery ? (
          <div className="text-center py-8 px-4">
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("noMatchingFiles", lang)}</p>
          </div>
        ) : (
          tree.map((node) => renderNode(node, 0))
        )}
      </div>

      {/* 右键上下文菜单：通过 Portal 渲染到 body，根据点击目标类型显示不同菜单项 */}
      {/* contextMenu.fileId 存在 → 文件节点菜单 / contextMenu.folderPath 存在 → 文件夹节点菜单 / 都不存在 → 空白区菜单 */}
      {contextMenu && createPortal(
        <div className="fixed z-50 context-menu animate-in" style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}>
          {/* 文件节点右键菜单：重命名 + 删除 */}
          {contextMenu.fileId ? (
            <>
              <button onClick={() => { const file = files.find((f) => f.id === contextMenu.fileId); if (file) handleRenameStart(file); }}
                className="context-menu-item">{t("rename", lang)}</button>
              <div className="context-menu-divider" />
              <button onClick={() => { onDeleteFile(contextMenu.fileId!); setContextMenu(null); }}
                className="context-menu-item danger">{t("delete", lang)}</button>
            </>
          ) : contextMenu.folderPath ? (
            <>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => { setRenamingFolder(contextMenu.folderPath!); setFolderRenameValue(contextMenu.folderPath!); setContextMenu(null); }}
                className="context-menu-item">{t("rename", lang)}</button>
              <div className="context-menu-divider" />
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => { handleNewFolder(); setContextMenu(null); }}
                className="context-menu-item">{t("newFolder", lang)}</button>
              <div className="context-menu-divider" />
              <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={() => { if (confirm(t("confirmDeleteFolderContent", lang))) { onDeleteFolder(contextMenu.folderPath!); } setContextMenu(null); }}
                className="context-menu-item danger">{t("delete", lang)}</button>
            </>
          ) : (
            <button onClick={() => { handleNewFolder(); setContextMenu(null); }}
              className="context-menu-item">{t("newFolder", lang)}</button>
          )}
        </div>,
        document.body
      )}
    </Panel>
    </div>
  );
}

export default FileExplorer;
