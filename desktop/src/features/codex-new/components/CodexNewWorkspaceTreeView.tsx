import { useCallback, useMemo, useState } from "react";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import File from "lucide-react/dist/esm/icons/file";
import FileCode from "lucide-react/dist/esm/icons/file-code";
import FilePlus from "lucide-react/dist/esm/icons/file-plus";
import FileMinus from "lucide-react/dist/esm/icons/file-minus";
import Folder from "lucide-react/dist/esm/icons/folder";
import FolderOpen from "lucide-react/dist/esm/icons/folder-open";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import type { CodexNewActiveTask, CodexNewChangedFile } from "../types";
import { bucketChangedFiles } from "../utils/taskPhases";
import { CodexNewDirectoryHierarchy } from "./CodexNewDirectoryHierarchy";

type TreeNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
  file?: CodexNewChangedFile;
};

type CodexNewWorkspaceTreeViewProps = {
  task: CodexNewActiveTask;
  isChinese: boolean;
  onFileClick?: (path: string) => void;
};

function buildFileTree(files: CodexNewChangedFile[]): TreeNode {
  const root: TreeNode = {
    name: "",
    path: "",
    type: "folder",
    children: [],
  };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join("/");

      if (isLast) {
        // 叶子节点（文件）
        if (!current.children) {
          current.children = [];
        }
        current.children.push({
          name: part,
          path: currentPath,
          type: "file",
          file,
        });
      } else {
        // 中间节点（文件夹）
        if (!current.children) {
          current.children = [];
        }
        let folder = current.children.find(
          (child) => child.name === part && child.type === "folder",
        );
        if (!folder) {
          folder = {
            name: part,
            path: currentPath,
            type: "folder",
            children: [],
          };
          current.children.push(folder);
        }
        current = folder;
      }
    }
  }

  // 排序：文件夹在前，文件在后，同类按字母排序
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => {
      if (node.children) {
        sortNodes(node.children);
      }
    });
  };

  if (root.children) {
    sortNodes(root.children);
  }

  return root;
}

function getFileIcon(file: CodexNewChangedFile) {
  switch (file.status) {
    case "added":
      return FilePlus;
    case "deleted":
      return FileMinus;
    case "modified":
      return FileCode;
    default:
      return File;
  }
}

function getFileStatusColor(file: CodexNewChangedFile) {
  switch (file.status) {
    case "added":
      return "var(--color-success)";
    case "deleted":
      return "var(--color-error)";
    case "modified":
      return "var(--color-warning)";
    default:
      return "var(--text-muted)";
  }
}

function getFileStatusLabel(file: CodexNewChangedFile, isChinese: boolean) {
  switch (file.status) {
    case "added":
      return isChinese ? "新增" : "Added";
    case "deleted":
      return isChinese ? "删除" : "Deleted";
    case "modified":
      return isChinese ? "修改" : "Modified";
    default:
      return "";
  }
}

type TreeNodeItemProps = {
  node: TreeNode;
  level: number;
  isChinese: boolean;
  onFileClick?: (path: string) => void;
};

function TreeNodeItem({ node, level, isChinese, onFileClick }: TreeNodeItemProps) {
  const [expanded, setExpanded] = useState(level < 2);

  const handleToggle = useCallback(() => {
    if (node.type === "folder") {
      setExpanded((prev) => !prev);
    } else if (node.file && onFileClick) {
      onFileClick(node.path);
    }
  }, [node, onFileClick]);

  const Icon = useMemo(() => {
    if (node.type === "folder") {
      return expanded ? FolderOpen : Folder;
    }
    return node.file ? getFileIcon(node.file) : File;
  }, [node, expanded]);

  const iconColor = useMemo(() => {
    if (node.type === "folder") {
      return "var(--text-muted)";
    }
    return node.file ? getFileStatusColor(node.file) : "var(--text-muted)";
  }, [node]);

  const statusLabel = useMemo(() => {
    return node.file ? getFileStatusLabel(node.file, isChinese) : "";
  }, [node.file, isChinese]);

  const mergeStatus = useMemo(() => {
    if (!node.file) return null;
    if (node.file.accepted) {
      return isChinese ? "已合并·可回滚" : "Merged·reversible";
    }
    return isChinese ? "待合并" : "Pending merge";
  }, [node.file, isChinese]);

  return (
    <div className="codex-new-tree-node">
      <button
        type="button"
        className={`codex-new-tree-node-button${node.type === "file" ? " is-file" : ""}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleToggle}
      >
        {node.type === "folder" && (
          <ChevronRight
            size={14}
            className={`codex-new-tree-chevron${expanded ? " is-expanded" : ""}`}
            aria-hidden
          />
        )}
        <Icon size={16} style={{ color: iconColor }} aria-hidden />
        <span className="codex-new-tree-node-name">{node.name}</span>
        {statusLabel && (
          <span
            className="codex-new-tree-node-status"
            style={{ color: iconColor }}
          >
            {statusLabel}
          </span>
        )}
        {mergeStatus && (
          <span
            className={`codex-new-tree-node-phase${
              node.file?.accepted ? " is-merged" : " is-pending"
            }`}
          >
            {mergeStatus}
          </span>
        )}
        {node.file?.mergedHunks && node.file.mergedHunks.length > 0 && (
          <span className="codex-new-tree-node-partial">
            {isChinese ? "部分" : "Partial"}
          </span>
        )}
      </button>
      {node.type === "folder" && expanded && node.children && (
        <div className="codex-new-tree-children">
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.path}
              node={child}
              level={level + 1}
              isChinese={isChinese}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FileTreeSection({
  title,
  files,
  isChinese,
  onFileClick,
  emptyLabel,
}: {
  title: string;
  files: CodexNewChangedFile[];
  isChinese: boolean;
  onFileClick?: (path: string) => void;
  emptyLabel: string;
}) {
  const tree = useMemo(() => buildFileTree(files), [files]);
  if (files.length === 0) {
    return (
      <div className="codex-new-workspace-tree-section is-empty">
        <div className="codex-new-workspace-tree-section-title">{title}</div>
        <div className="codex-new-workspace-tree-empty">{emptyLabel}</div>
      </div>
    );
  }
  return (
    <div className="codex-new-workspace-tree-section">
      <div className="codex-new-workspace-tree-section-title">{title}</div>
      <div className="codex-new-workspace-tree-body">
        {tree.children?.map((child) => (
          <TreeNodeItem
            key={child.path}
            node={child}
            level={0}
            isChinese={isChinese}
            onFileClick={onFileClick}
          />
        ))}
      </div>
    </div>
  );
}

export function CodexNewWorkspaceTreeView({
  task,
  isChinese,
  onFileClick,
}: CodexNewWorkspaceTreeViewProps) {
  const { pendingMerge, merged } = useMemo(
    () => bucketChangedFiles(task.changedFiles),
    [task.changedFiles],
  );

  const stats = useMemo(() => {
    const total = task.changedFiles.length;
    const added = task.changedFiles.filter((f) => f.status === "added").length;
    const modified = task.changedFiles.filter((f) => f.status === "modified").length;
    const deleted = task.changedFiles.filter((f) => f.status === "deleted").length;
    return { total, added, modified, deleted, merged: merged.length, pending: pendingMerge.length };
  }, [task.changedFiles, merged.length, pendingMerge.length]);

  return (
    <div className="codex-new-workspace-tree">
      <CodexNewDirectoryHierarchy
        isChinese={isChinese}
        title={isChinese ? "目录对照" : "Directory map"}
        roots={[
          {
            id: "task-project",
            role: "project",
            label: isChinese ? "原项目" : "Original project",
            path: task.originalRoot,
          },
          {
            id: "task-clone",
            role: "clone",
            label: isChinese ? "隔离克隆（AI / 测试）" : "Isolated clone (AI / tests)",
            path: task.workspaceRoot,
          },
        ]}
      />
      <div className="codex-new-workspace-tree-header">
        <div className="codex-new-workspace-tree-title">
          <GitBranch size={14} aria-hidden />
          {isChinese ? "变更文件树" : "Changed files"}
        </div>
        <div className="codex-new-workspace-tree-stats">
          <span className="codex-new-tree-stat" style={{ color: "var(--color-success)" }}>
            +{stats.added}
          </span>
          <span className="codex-new-tree-stat" style={{ color: "var(--color-warning)" }}>
            ~{stats.modified}
          </span>
          <span className="codex-new-tree-stat" style={{ color: "var(--color-error)" }}>
            -{stats.deleted}
          </span>
          <span className="codex-new-tree-stat" style={{ color: "var(--accent-primary)" }}>
            {isChinese ? `待${stats.pending}` : `P${stats.pending}`}
          </span>
          <span className="codex-new-tree-stat" style={{ color: "var(--text-muted)" }}>
            {isChinese ? `并${stats.merged}` : `M${stats.merged}`}
          </span>
        </div>
      </div>
      <FileTreeSection
        title={isChinese ? "待合并（原项目尚未应用）" : "Pending merge (not on project yet)"}
        files={pendingMerge}
        isChinese={isChinese}
        onFileClick={onFileClick}
        emptyLabel={
          isChinese
            ? "没有待合并项。若刚完成回滚，已回滚的文件会出现在这里。"
            : "Nothing pending. Files return here after a successful rollback."
        }
      />
      <FileTreeSection
        title={isChinese ? "已合并到原项目（可回滚）" : "Merged into project (rollback available)"}
        files={merged}
        isChinese={isChinese}
        onFileClick={onFileClick}
        emptyLabel={
          isChinese
            ? "当前没有已合并项。合并成功后才会出现在这里。"
            : "Nothing merged yet. Items appear here only after a successful merge."
        }
      />
    </div>
  );
}
