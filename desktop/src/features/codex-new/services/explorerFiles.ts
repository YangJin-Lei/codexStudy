import { getWorkspaceFiles } from "@/services/tauri";

const WORKSPACE_FILES_TIMEOUT_MS = 45_000;

export async function fetchWorkspaceFilesWithTimeout(
  workspaceId: string,
  timeoutMs = WORKSPACE_FILES_TIMEOUT_MS,
): Promise<string[]> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getWorkspaceFiles(workspaceId),
      new Promise<string[]>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Workspace file listing timed out after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
