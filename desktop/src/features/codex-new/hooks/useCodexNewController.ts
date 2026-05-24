import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CodexNewFocusThreadPayload } from "@/types";
import type { ThreadSummary, WorkspaceInfo } from "@/types";
import {
  disableCodexNewSecurity,
  enableCodexNewSecurity,
  focusCodexNewSession,
  syncCodexNewThreadTitles,
  syncCodexNewViewingContext,
} from "../state";
import { requestCodexNewFocusThread } from "../services/navigation";
import { resolveThreadTitle } from "../utils/threadLabels";
import { requestCodexNewTerminalDockOpen } from "../services/uiPreferences";
import { ensureCodexNewWorkbenchWindows, openCodexNewWindow } from "../services/windows";
import { useCodexNewState } from "./useCodexNewState";

type UseCodexNewControllerArgs = {
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  securityToggleDisabled?: boolean;
};

export function useCodexNewController({
  activeWorkspace,
  activeThreadId,
  threadsByWorkspace,
  securityToggleDisabled = false,
}: UseCodexNewControllerArgs) {
  const state = useCodexNewState();

  const activeThreadTitle = useMemo(
    () =>
      activeWorkspace
        ? resolveThreadTitle(threadsByWorkspace, activeWorkspace.id, activeThreadId)
        : null,
    [activeThreadId, activeWorkspace, threadsByWorkspace],
  );

  const isSecurityEnabled = useMemo(() => {
    if (!activeWorkspace || !activeThreadId) {
      return false;
    }
    const workspaceArmed = Boolean(state.workspaceSecurity[activeWorkspace.id]);
    if (!workspaceArmed) {
      return false;
    }
    const entry = state.threadRegistry[activeThreadId];
    if (!entry) {
      return true;
    }
    return entry.workspaceId === activeWorkspace.id;
  }, [activeThreadId, activeWorkspace, state.threadRegistry, state.workspaceSecurity]);

  useEffect(() => {
    if (!activeWorkspace) {
      return;
    }
    void syncCodexNewViewingContext(activeWorkspace, activeThreadId, activeThreadTitle);
  }, [activeThreadId, activeThreadTitle, activeWorkspace]);

  const lastFocusEmitRef = useRef<string>("");
  const lastFocusedSessionRef = useRef<string>("");

  useEffect(() => {
    if (!activeWorkspace || !activeThreadId) {
      return;
    }
    const payload: CodexNewFocusThreadPayload = {
      workspaceId: activeWorkspace.id,
      threadId: activeThreadId,
    };
    const focusKey = `${payload.workspaceId}:${payload.threadId}`;
    if (lastFocusEmitRef.current === focusKey) {
      return;
    }
    lastFocusEmitRef.current = focusKey;
    void requestCodexNewFocusThread(payload);
  }, [activeThreadId, activeWorkspace?.id]);

  useEffect(() => {
    if (!activeWorkspace || !activeThreadId || !isSecurityEnabled) {
      return;
    }
    const focusKey = `${activeWorkspace.id}:${activeThreadId}:${activeThreadTitle ?? ""}`;
    if (lastFocusedSessionRef.current === focusKey) {
      return;
    }
    lastFocusedSessionRef.current = focusKey;
    void focusCodexNewSession(activeWorkspace, activeThreadId, activeThreadTitle);
  }, [activeThreadId, activeThreadTitle, activeWorkspace, isSecurityEnabled]);

  useEffect(() => {
    if (!activeWorkspace) {
      return;
    }
    const entries = Object.values(state.threadRegistry)
      .filter((entry) => entry.workspaceId === activeWorkspace.id && entry.isolatedRoot)
      .map((entry) => ({
        threadId: entry.threadId,
        threadTitle: resolveThreadTitle(
          threadsByWorkspace,
          activeWorkspace.id,
          entry.threadId,
        ),
      }))
      .filter((entry) => entry.threadTitle);
    if (entries.length === 0) {
      return;
    }
    void syncCodexNewThreadTitles(activeWorkspace.id, entries);
  }, [activeWorkspace, state.threadRegistry, threadsByWorkspace]);

  const handleToggleSecurity = useCallback(async () => {
    if (securityToggleDisabled || !activeWorkspace) {
      return;
    }
    if (isSecurityEnabled) {
      await disableCodexNewSecurity(activeWorkspace.id);
      return;
    }
    await enableCodexNewSecurity(activeWorkspace, activeThreadId, activeThreadTitle);
    await syncCodexNewViewingContext(activeWorkspace, activeThreadId, activeThreadTitle);
  }, [
    activeThreadId,
    activeThreadTitle,
    activeWorkspace,
    isSecurityEnabled,
    securityToggleDisabled,
  ]);

  const openWorkbench = useCallback(async () => {
    if (activeWorkspace && isSecurityEnabled) {
      await focusCodexNewSession(activeWorkspace, activeThreadId, activeThreadTitle);
    }
    await ensureCodexNewWorkbenchWindows();
  }, [activeThreadId, activeThreadTitle, activeWorkspace, isSecurityEnabled]);

  const openProcessWindow = useCallback(async () => {
    if (activeWorkspace) {
      await syncCodexNewViewingContext(activeWorkspace, activeThreadId, activeThreadTitle);
      if (isSecurityEnabled) {
        await focusCodexNewSession(activeWorkspace, activeThreadId, activeThreadTitle);
      }
    }
    await openCodexNewWindow("codex-new-process");
  }, [activeThreadId, activeThreadTitle, activeWorkspace, isSecurityEnabled]);

  const openTerminalWindow = useCallback(async () => {
    if (activeWorkspace) {
      await syncCodexNewViewingContext(activeWorkspace, activeThreadId, activeThreadTitle);
      if (isSecurityEnabled) {
        await focusCodexNewSession(activeWorkspace, activeThreadId, activeThreadTitle);
      }
    }
    requestCodexNewTerminalDockOpen();
    await openCodexNewWindow("codex-new-process");
  }, [activeThreadId, activeThreadTitle, activeWorkspace, isSecurityEnabled]);

  const activeWorkspaceSecurityState = activeWorkspace
    ? state.workspaceSecurity[activeWorkspace.id] ?? null
    : null;

  const activeThreadRegistryEntry = activeThreadId
    ? state.threadRegistry[activeThreadId] ?? null
    : null;

  return {
    state,
    isSecurityEnabled,
    activeWorkspaceSecurityState,
    activeThreadRegistryEntry,
    handleToggleSecurity,
    openWorkbench,
    openProcessWindow,
    openTerminalWindow,
    securityToggleDisabled,
  };
}
