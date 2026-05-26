import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getComputerUseStatus,
  listMcpServerStatus,
  repairComputerUseInstall,
  runComputerUseDoctor,
  setComputerUseEnabled,
} from "@services/tauri";

export type ComputerUseStatus = {
  enabled: boolean;
  installed: boolean;
  bundledAvailable: boolean;
  version: string | null;
  runtimeReady: boolean;
  runtimePath: string | null;
  marketplacePath: string | null;
  pluginPath: string | null;
  platformNotes: string | null;
  lastError: string | null;
};

export type SettingsComputerUseSectionProps = {
  featureWorkspaceId: string | null;
  status: ComputerUseStatus | null;
  statusLoading: boolean;
  statusError: string | null;
  actionError: string | null;
  actionBusy: boolean;
  mcpServerStatus: string | null;
  mcpServerError: boolean;
  onRefreshStatus: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onRepairInstall: () => void;
  onRunDoctor: () => void;
};

function normalizeComputerUseStatus(raw: unknown): ComputerUseStatus | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  return {
    enabled: Boolean(record.enabled),
    installed: Boolean(record.installed),
    bundledAvailable: Boolean(record.bundledAvailable),
    version: typeof record.version === "string" ? record.version : null,
    runtimeReady: Boolean(record.runtimeReady),
    runtimePath: typeof record.runtimePath === "string" ? record.runtimePath : null,
    marketplacePath:
      typeof record.marketplacePath === "string" ? record.marketplacePath : null,
    pluginPath: typeof record.pluginPath === "string" ? record.pluginPath : null,
    platformNotes:
      typeof record.platformNotes === "string" ? record.platformNotes : null,
    lastError: typeof record.lastError === "string" ? record.lastError : null,
  };
}

function parseMcpServerLabel(response: unknown): { label: string; isError: boolean } {
  if (!response || typeof response !== "object") {
    return { label: "Unknown", isError: true };
  }
  const root = response as Record<string, unknown>;
  const result =
    root.result && typeof root.result === "object"
      ? (root.result as Record<string, unknown>)
      : root;
  const data = Array.isArray(result.data) ? result.data : [];
  const match = data.find((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const record = item as Record<string, unknown>;
    const name = String(record.name ?? record.serverName ?? "").trim();
    return (
      name === "computer-use" ||
      name === "open-computer-use" ||
      name.endsWith("/computer-use") ||
      name.endsWith("/open-computer-use")
    );
  }) as Record<string, unknown> | undefined;
  if (!match) {
    return { label: "Not connected", isError: true };
  }
  const status = String(match.status ?? match.state ?? "unknown").trim();
  return {
    label: status.length > 0 ? status : "unknown",
    isError: status !== "ready" && status !== "connected",
  };
}

type UseSettingsComputerUseSectionArgs = {
  featureWorkspaceId: string | null;
  computerUseWorkspaceId: string | null;
};

export function useSettingsComputerUseSection({
  featureWorkspaceId,
  computerUseWorkspaceId,
}: UseSettingsComputerUseSectionArgs): SettingsComputerUseSectionProps {
  const [status, setStatus] = useState<ComputerUseStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [mcpServerStatus, setMcpServerStatus] = useState<string | null>(null);
  const [mcpServerError, setMcpServerError] = useState(false);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const nextStatus = normalizeComputerUseStatus(await getComputerUseStatus());
      setStatus(nextStatus);
      const mcpWorkspaceId = computerUseWorkspaceId ?? featureWorkspaceId;
      if (mcpWorkspaceId) {
        try {
          const mcpResponse = await listMcpServerStatus(mcpWorkspaceId, null, 100);
          const parsed = parseMcpServerLabel(mcpResponse);
          setMcpServerStatus(parsed.label);
          setMcpServerError(parsed.isError);
        } catch {
          setMcpServerStatus("Unavailable");
          setMcpServerError(true);
        }
      } else if (nextStatus?.runtimeReady) {
        setMcpServerStatus("Start a computer-use session");
        setMcpServerError(true);
      } else {
        setMcpServerStatus(null);
        setMcpServerError(false);
      }
    } catch (error) {
      setStatus(null);
      setStatusError(
        error instanceof Error ? error.message : "Unable to load Computer Use status.",
      );
    } finally {
      setStatusLoading(false);
    }
  }, [computerUseWorkspaceId, featureWorkspaceId]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const onToggleEnabled = useCallback(
    (enabled: boolean) => {
      void (async () => {
        setActionBusy(true);
        setActionError(null);
        try {
          const result = await setComputerUseEnabled(enabled);
          setStatus(normalizeComputerUseStatus(result.status));
          await refreshStatus();
        } catch (error) {
          setActionError(
            error instanceof Error
              ? error.message
              : "Unable to update Computer Use settings.",
          );
        } finally {
          setActionBusy(false);
        }
      })();
    },
    [refreshStatus],
  );

  const onRepairInstall = useCallback(() => {
    void (async () => {
      setActionBusy(true);
      setActionError(null);
      try {
        const result = await repairComputerUseInstall();
        setStatus(normalizeComputerUseStatus(result.status));
        await refreshStatus();
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Unable to repair Computer Use install.",
        );
      } finally {
        setActionBusy(false);
      }
    })();
  }, [refreshStatus]);

  const onRunDoctor = useCallback(() => {
    void (async () => {
      setActionBusy(true);
      setActionError(null);
      try {
        await runComputerUseDoctor();
        await refreshStatus();
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Computer Use doctor failed.",
        );
      } finally {
        setActionBusy(false);
      }
    })();
  }, [refreshStatus]);

  return useMemo(
    () => ({
      featureWorkspaceId,
      status,
      statusLoading,
      statusError,
      actionError,
      actionBusy,
      mcpServerStatus,
      mcpServerError,
      onRefreshStatus: () => {
        void refreshStatus();
      },
      onToggleEnabled,
      onRepairInstall,
      onRunDoctor,
    }),
    [
      actionBusy,
      actionError,
      featureWorkspaceId,
      mcpServerError,
      mcpServerStatus,
      onRepairInstall,
      onRunDoctor,
      onToggleEnabled,
      refreshStatus,
      status,
      statusError,
      statusLoading,
    ],
  );
}
