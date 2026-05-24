import type { WorkspaceInfo } from "@/types";

export const COMPUTER_USE_WORKSPACE_DIR = "computer-use";
const STORAGE_KEY = "codexstudy.computerUseWorkspaceId";

export function getStoredComputerUseWorkspaceId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.localStorage.getItem(STORAGE_KEY)?.trim();
  return value || null;
}

export function setStoredComputerUseWorkspaceId(workspaceId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, workspaceId);
}

export function clearStoredComputerUseWorkspaceId(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
}

export function isComputerUseWorkspacePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.endsWith(`/${COMPUTER_USE_WORKSPACE_DIR}`);
}

export function isComputerUseWorkspace(
  workspace: Pick<WorkspaceInfo, "id" | "path">,
  storedId: string | null = getStoredComputerUseWorkspaceId(),
): boolean {
  if (storedId && workspace.id === storedId) {
    return true;
  }
  return isComputerUseWorkspacePath(workspace.path);
}

export function findComputerUseWorkspace(
  workspaces: WorkspaceInfo[],
): WorkspaceInfo | null {
  const storedId = getStoredComputerUseWorkspaceId();
  if (storedId) {
    const storedMatch = workspaces.find((workspace) => workspace.id === storedId);
    if (storedMatch) {
      return storedMatch;
    }
  }
  return workspaces.find((workspace) => isComputerUseWorkspacePath(workspace.path)) ?? null;
}
