import type { CodexNewChangedFile } from "../types";

export type DualTreeFileNode = {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: DualTreeFileNode[];
  status?: CodexNewChangedFile["status"];
  accepted?: boolean;
  hasConflict?: boolean;
};

export type DualTreeFileIcon = {
  icon: string;
  color: string;
};

export function normalizeDualTreePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

export function dedupeDualTreePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.map(normalizeDualTreePath).filter(Boolean)));
}

export function getDualTreeFileIcon(
  status?: CodexNewChangedFile["status"],
  accepted?: boolean,
  hasConflict?: boolean,
): DualTreeFileIcon | null {
  if (hasConflict) {
    return { icon: "⚠️", color: "var(--warning-foreground)" };
  }
  if (accepted) {
    return { icon: "✓", color: "var(--success-foreground)" };
  }
  if (status === "added") {
    return { icon: "➕", color: "var(--success-foreground)" };
  }
  if (status === "modified") {
    return { icon: "✏️", color: "var(--warning-foreground)" };
  }
  if (status === "deleted") {
    return { icon: "❌", color: "var(--error-foreground)" };
  }
  return null;
}

export function buildDualTreeFromPaths(
  paths: string[],
  metadataMap: Map<string, CodexNewChangedFile>,
  conflictPathSet?: ReadonlySet<string>,
): DualTreeFileNode[] {
  const root: DualTreeFileNode[] = [];
  const nodeMap = new Map<string, DualTreeFileNode>();

  for (const rawPath of paths) {
    const normalizedPath = normalizeDualTreePath(rawPath);
    const file = metadataMap.get(normalizedPath);
    const parts = normalizedPath.split("/");
    let currentPath = "";

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = index === parts.length - 1;

      if (!nodeMap.has(currentPath)) {
        const node: DualTreeFileNode = {
          name: part,
          path: currentPath,
          isDirectory: !isLast,
          children: isLast ? undefined : [],
          status: isLast ? file?.status : undefined,
          accepted: isLast ? file?.accepted : undefined,
          hasConflict: isLast
            ? conflictPathSet?.has(currentPath) || file?.mergeStatus === "conflict"
            : undefined,
        };

        nodeMap.set(currentPath, node);

        if (parentPath) {
          const parent = nodeMap.get(parentPath);
          if (parent?.children) {
            parent.children.push(node);
          }
        } else {
          root.push(node);
        }
      }
    }
  }

  const sortNodes = (nodes: DualTreeFileNode[]) => {
    nodes.sort((left, right) => {
      if (left.isDirectory !== right.isDirectory) {
        return left.isDirectory ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
    for (const node of nodes) {
      if (node.children) {
        sortNodes(node.children);
      }
    }
  };
  sortNodes(root);

  return root;
}
