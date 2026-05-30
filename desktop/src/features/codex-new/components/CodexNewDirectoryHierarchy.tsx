import { useMemo } from "react";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import Copy from "lucide-react/dist/esm/icons/copy";
import Folder from "lucide-react/dist/esm/icons/folder";
import FolderGit2 from "lucide-react/dist/esm/icons/folder-git-2";
import FolderOpen from "lucide-react/dist/esm/icons/folder-open";
import HardDrive from "lucide-react/dist/esm/icons/hard-drive";
import Shield from "lucide-react/dist/esm/icons/shield";
import { buildPathTreeSegments } from "../utils/pathTree";

export type CodexNewDirectoryRole = "project" | "clone" | "data" | "session";

export type CodexNewDirectoryRoot = {
  id: string;
  role: CodexNewDirectoryRole;
  label: string;
  path: string;
  detail?: string | null;
  badge?: string | null;
};

type CodexNewDirectoryHierarchyProps = {
  roots: CodexNewDirectoryRoot[];
  isChinese: boolean;
  compact?: boolean;
  title?: string;
};

function roleIcon(role: CodexNewDirectoryRole) {
  switch (role) {
    case "project":
      return FolderGit2;
    case "clone":
      return Shield;
    case "session":
      return FolderOpen;
    case "data":
      return HardDrive;
    default:
      return Folder;
  }
}

function roleToneClass(role: CodexNewDirectoryRole) {
  switch (role) {
    case "project":
      return "is-project";
    case "clone":
      return "is-clone";
    case "session":
      return "is-session";
    case "data":
      return "is-data";
    default:
      return "";
  }
}

async function copyPath(path: string) {
  try {
    await navigator.clipboard.writeText(path);
  } catch {
    // ignore
  }
}

export function CodexNewDirectoryHierarchy({
  roots,
  isChinese,
  compact = false,
  title,
}: CodexNewDirectoryHierarchyProps) {
  const visibleRoots = useMemo(() => roots.filter((root) => root.path.trim().length > 0), [roots]);

  if (visibleRoots.length === 0) {
    return null;
  }

  return (
    <div className={`codex-new-directory-hierarchy${compact ? " is-compact" : ""}`}>
      {title ? <div className="codex-new-directory-hierarchy-title">{title}</div> : null}
      <div className="codex-new-directory-hierarchy-roots">
        {visibleRoots.map((root, rootIndex) => {
          const Icon = roleIcon(root.role);
          const segments = buildPathTreeSegments(root.path);
          const previous = visibleRoots[rootIndex - 1];
          const connector =
            root.role === "clone" && previous?.role === "project" ? (
              <div className="codex-new-directory-hierarchy-connector" aria-hidden>
                <ChevronRight size={12} />
                <span>{isChinese ? "克隆副本" : "Cloned copy"}</span>
              </div>
            ) : null;

          return (
            <div key={root.id} className="codex-new-directory-hierarchy-root-block">
              <div className={`codex-new-directory-hierarchy-root ${roleToneClass(root.role)}`}>
                <div className="codex-new-directory-hierarchy-root-head">
                  <Icon size={15} aria-hidden />
                  <div className="codex-new-directory-hierarchy-root-copy">
                    <div className="codex-new-directory-hierarchy-root-label">{root.label}</div>
                    {root.detail ? (
                      <div className="codex-new-directory-hierarchy-root-detail">{root.detail}</div>
                    ) : null}
                  </div>
                  {root.badge ? (
                    <span className="codex-new-directory-hierarchy-badge">{root.badge}</span>
                  ) : null}
                  <button
                    type="button"
                    className="codex-new-directory-hierarchy-copy"
                    onClick={() => void copyPath(root.path)}
                    title={isChinese ? "复制路径" : "Copy path"}
                  >
                    <Copy size={13} aria-hidden />
                  </button>
                </div>
                <div className="codex-new-directory-hierarchy-tree" role="tree">
                  {segments.map((segment, index) => (
                    <div
                      key={`${root.id}-${segment.path}`}
                      className="codex-new-directory-hierarchy-segment"
                      style={{ paddingLeft: `${index * 14 + 4}px` }}
                      role="treeitem"
                      aria-level={index + 1}
                    >
                      <Folder size={13} aria-hidden />
                      <span className="codex-new-directory-hierarchy-segment-name">
                        {segment.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {connector}
            </div>
          );
        })}
      </div>
    </div>
  );
}
