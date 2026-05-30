import { isComputerUseWorkspace } from "@/features/computer-use/computerUseStorage";
import type { ThreadSummary, WorkspaceInfo } from "@/types";
import { useCodexNewController } from "@/features/codex-new/hooks/useCodexNewController";

type UseMainAppCodexNewWiringArgs = {
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
};

export function useMainAppCodexNewWiring({
  activeWorkspace,
  activeThreadId,
  threadsByWorkspace,
}: UseMainAppCodexNewWiringArgs) {
  const isComputerUseActiveWorkspace = activeWorkspace
    ? isComputerUseWorkspace(activeWorkspace)
    : false;

  const codexNew = useCodexNewController({
    activeWorkspace,
    activeThreadId,
    threadsByWorkspace,
    securityToggleDisabled: isComputerUseActiveWorkspace,
  });

  return {
    codexNew,
    codexNewPropsForLayout: {
      securityEnabled: codexNew.isSecurityEnabled,
      securityToggleDisabled: isComputerUseActiveWorkspace,
      activeSession: codexNew.state.activeSession,
      activeThreadRegistryEntry: codexNew.activeThreadRegistryEntry,
      dataPaths: codexNew.state.dataPaths,
      onOpenUi: codexNew.openProcessWindow,
      onToggleSecurity: codexNew.handleToggleSecurity,
      onOpenProcessWindow: codexNew.openProcessWindow,
      onOpenTerminalWindow: codexNew.openTerminalWindow,
    },
  };
}

