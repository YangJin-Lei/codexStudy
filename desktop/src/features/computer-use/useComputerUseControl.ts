import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkspaceInfo } from "@/types";
import {
  getComputerUseStatus,
  prepareComputerUseWorkspaceDir,
} from "@services/tauri";
import type { ComputerUseStatus } from "@/features/settings/hooks/useSettingsComputerUseSection";
import {
  clearStoredComputerUseWorkspaceId,
  findComputerUseWorkspace,
  getStoredComputerUseWorkspaceId,
  setStoredComputerUseWorkspaceId,
} from "./computerUseStorage";

type UseComputerUseControlArgs = {
  workspaces: WorkspaceInfo[];
  addWorkspaceFromPath: (path: string) => Promise<WorkspaceInfo | null>;
  connectWorkspace: (workspace: WorkspaceInfo) => void;
  onAddAgent: (workspace: WorkspaceInfo) => void;
  onOpenSettings: () => void;
};

export function useComputerUseControl({
  workspaces,
  addWorkspaceFromPath,
  connectWorkspace,
  onAddAgent,
  onOpenSettings,
}: UseComputerUseControlArgs) {
  const [status, setStatus] = useState<ComputerUseStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [startingSession, setStartingSession] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const workspace = useMemo(() => findComputerUseWorkspace(workspaces), [workspaces]);
  const workspaceId = workspace?.id ?? null;

  useEffect(() => {
    if (workspace) {
      setStoredComputerUseWorkspaceId(workspace.id);
      return;
    }
    const storedId = getStoredComputerUseWorkspaceId();
    if (storedId && !workspaces.some((entry) => entry.id === storedId)) {
      clearStoredComputerUseWorkspaceId();
    }
  }, [workspace, workspaces]);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const nextStatus = await getComputerUseStatus();
      setStatus(nextStatus);
      setActionError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setActionError(message);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const ensureWorkspace = useCallback(async (): Promise<WorkspaceInfo | null> => {
    const existing = findComputerUseWorkspace(workspaces);
    if (existing) {
      if (!existing.connected) {
        connectWorkspace(existing);
      }
      setStoredComputerUseWorkspaceId(existing.id);
      return existing;
    }

    const path = await prepareComputerUseWorkspaceDir();
    const created = await addWorkspaceFromPath(path);
    if (!created) {
      return null;
    }
    setStoredComputerUseWorkspaceId(created.id);
    if (!created.connected) {
      connectWorkspace(created);
    }
    return created;
  }, [addWorkspaceFromPath, connectWorkspace, workspaces]);

  useEffect(() => {
    if (statusLoading || !status?.enabled || !status.runtimeReady || workspace) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await ensureWorkspace();
      } catch {
        if (!cancelled) {
          // Surface errors when the user explicitly starts a session.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ensureWorkspace, status, statusLoading, workspace]);

  const handleStartComputerUseSession = useCallback(async () => {
    setActionError(null);
    setStartingSession(true);
    try {
      const latestStatus = status ?? (await getComputerUseStatus());
      setStatus(latestStatus);
      if (!latestStatus.enabled) {
        onOpenSettings();
        return;
      }
      if (!latestStatus.runtimeReady) {
        onOpenSettings();
        return;
      }

      const targetWorkspace = await ensureWorkspace();
      if (!targetWorkspace) {
        throw new Error("Unable to prepare the Computer Use workspace.");
      }
      onAddAgent(targetWorkspace);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setActionError(message);
    } finally {
      setStartingSession(false);
    }
  }, [ensureWorkspace, onAddAgent, onOpenSettings, status]);

  const handleOpenComputerUseSettings = useCallback(() => {
    onOpenSettings();
  }, [onOpenSettings]);

  return {
    computerUseWorkspaceId: workspaceId,
    computerUseEnabled: Boolean(status?.enabled),
    computerUseReady: Boolean(status?.enabled && status?.runtimeReady),
    computerUseStatusLoading: statusLoading,
    computerUseStarting: startingSession,
    computerUseActionError: actionError,
    onStartComputerUseSession: handleStartComputerUseSession,
    onOpenComputerUseSettings: handleOpenComputerUseSettings,
    refreshComputerUseStatus: refreshStatus,
  };
}
