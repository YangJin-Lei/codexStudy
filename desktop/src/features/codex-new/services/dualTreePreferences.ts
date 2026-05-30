export type DualTreeFilterMode = "all" | "changed" | "pending" | "conflict";

const FILTER_MODE_STORAGE_KEY = "codex-new:dual-tree:filter-mode";

export function readDualTreeFilterMode(): DualTreeFilterMode {
  if (typeof window === "undefined") {
    return "all";
  }
  const saved = localStorage.getItem(FILTER_MODE_STORAGE_KEY);
  if (
    saved === "all" ||
    saved === "changed" ||
    saved === "pending" ||
    saved === "conflict"
  ) {
    return saved;
  }
  return "all";
}

export function writeDualTreeFilterMode(mode: DualTreeFilterMode) {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(FILTER_MODE_STORAGE_KEY, mode);
}

export function dualTreeExpansionStorageKey(
  workspaceId: string | null,
  filterMode: DualTreeFilterMode,
) {
  return `codex-new:dual-tree:expanded:${workspaceId ?? "none"}:${filterMode}`;
}

export type DualTreeExpansionSnapshot = {
  expandedNodes: string[];
  childRenderLimit: Record<string, number>;
};

export function readDualTreeExpansionSnapshot(
  storageKey: string,
): DualTreeExpansionSnapshot {
  if (typeof window === "undefined") {
    return { expandedNodes: [], childRenderLimit: {} };
  }
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return { expandedNodes: [], childRenderLimit: {} };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<DualTreeExpansionSnapshot>;
    return {
      expandedNodes: Array.isArray(parsed.expandedNodes) ? parsed.expandedNodes : [],
      childRenderLimit:
        parsed.childRenderLimit && typeof parsed.childRenderLimit === "object"
          ? parsed.childRenderLimit
          : {},
    };
  } catch {
    return { expandedNodes: [], childRenderLimit: {} };
  }
}

export function writeDualTreeExpansionSnapshot(
  storageKey: string,
  snapshot: DualTreeExpansionSnapshot,
) {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(storageKey, JSON.stringify(snapshot));
}
