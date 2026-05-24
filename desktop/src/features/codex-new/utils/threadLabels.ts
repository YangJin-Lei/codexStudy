import type { CodexNewThreadRegistryEntry } from "../types";
import type { ThreadSummary } from "@/types";

export function resolveThreadTitle(
  threadsByWorkspace: Record<string, ThreadSummary[]>,
  workspaceId: string,
  threadId: string | null,
): string | null {
  if (!threadId) {
    return null;
  }
  const thread = threadsByWorkspace[workspaceId]?.find((entry) => entry.id === threadId);
  const title = thread?.name?.trim();
  return title || null;
}

export function sessionNavPrimaryLabel(
  entry: CodexNewThreadRegistryEntry,
  isChinese: boolean,
): string {
  if (entry.threadTitle?.trim()) {
    return entry.threadTitle.trim();
  }
  if (entry.localFolderName?.trim()) {
    return entry.localFolderName.trim();
  }
  const compact = entry.threadId.replace(/-/g, "").slice(0, 8);
  return isChinese ? `会话 ${compact}` : `Session ${compact}`;
}

export function sessionNavSecondaryLabel(
  entry: CodexNewThreadRegistryEntry,
  isChinese: boolean,
): string | null {
  const parts: string[] = [];
  if (entry.localFolderName?.trim()) {
    parts.push(
      isChinese
        ? `本地目录 codex-new/workspaces/${entry.localFolderName.trim()}`
        : `Local folder codex-new/workspaces/${entry.localFolderName.trim()}`,
    );
  }
  const compact = entry.threadId.replace(/-/g, "").slice(0, 8);
  parts.push(isChinese ? `对话 ID …${compact}` : `Thread …${compact}`);
  return parts.join(" · ");
}
