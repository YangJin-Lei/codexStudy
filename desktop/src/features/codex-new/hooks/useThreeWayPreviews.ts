import { useEffect, useState } from "react";
import { readCodexNewFilePreview } from "@/services/tauri";
import type { CodexNewFilePreview } from "../types";

type ThreeWayPreviewState = {
  project: CodexNewFilePreview | null;
  workspace: CodexNewFilePreview | null;
  isLoading: boolean;
  error: string | null;
};

const EMPTY_STATE: ThreeWayPreviewState = {
  project: null,
  workspace: null,
  isLoading: false,
  error: null,
};

export function useThreeWayPreviews(
  workspaceId: string | null,
  filePath: string | null,
  enabled: boolean,
) {
  const [state, setState] = useState<ThreeWayPreviewState>(EMPTY_STATE);

  useEffect(() => {
    if (!enabled || !workspaceId || !filePath) {
      setState(EMPTY_STATE);
      return;
    }

    let cancelled = false;
    setState({ project: null, workspace: null, isLoading: true, error: null });

    void (async () => {
      try {
        const [project, workspace] = await Promise.all([
          readCodexNewFilePreview(workspaceId, filePath, "project"),
          readCodexNewFilePreview(workspaceId, filePath, "workspace"),
        ]);
        if (cancelled) {
          return;
        }
        setState({ project, workspace, isLoading: false, error: null });
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setState({ project: null, workspace: null, isLoading: false, error: message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, filePath, workspaceId]);

  return state;
}
