import { useCallback, useEffect, useState } from "react";
import { subscribeCodexHomeMigrationPrompt } from "@services/events";
import {
  getCodexHomeMigrationStatus,
  importCodexHomeMigration,
  skipCodexHomeMigration,
  type CodexHomeMigrationStatus,
} from "@services/tauri";

type UseCodexHomeMigrationArgs = {
  onImported?: () => void;
};

export function useCodexHomeMigration({ onImported }: UseCodexHomeMigrationArgs = {}) {
  const [status, setStatus] = useState<CodexHomeMigrationStatus | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await getCodexHomeMigrationStatus();
      setStatus(next);
      setVisible(next.shouldPrompt);
    } catch (err) {
      console.warn("Unable to load Codex home migration status", err);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return subscribeCodexHomeMigrationPrompt(() => {
      setVisible(true);
    });
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
  }, []);

  const skip = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await skipCodexHomeMigration();
      dismiss();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [dismiss, refresh]);

  const importLegacy = useCallback(
    async (sourcePath: string) => {
      setBusy(true);
      setError(null);
      try {
        await importCodexHomeMigration(sourcePath);
        dismiss();
        await refresh();
        onImported?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [dismiss, onImported, refresh],
  );

  const openPrompt = useCallback(() => {
    if (status && status.legacyHomes.length > 0) {
      setVisible(true);
    }
  }, [status]);

  return {
    status,
    visible,
    busy,
    error,
    skip,
    importLegacy,
    dismiss,
    openPrompt,
    refresh,
  };
}
