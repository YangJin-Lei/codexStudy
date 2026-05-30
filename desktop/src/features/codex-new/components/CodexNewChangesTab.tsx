import type {
  CodexNewActiveTask,
  CodexNewHunkSelection,
  CodexNewSession,
  CodexNewTracebackEntry,
  CodexNewTracebackRestoreTarget,
} from "../types";
import { CodexNewChangesPhaseStrip } from "./CodexNewChangesPhaseStrip";
import { CodexNewWorkspaceTreeView } from "./CodexNewWorkspaceTreeView";
import { CodexNewMergePanel } from "./CodexNewMergePanel";
import { CodexNewRollbackPanel } from "./CodexNewRollbackPanel";
import { CodexNewTracebackPanel } from "./CodexNewTracebackPanel";

type CodexNewChangesTabProps = {
  isChinese: boolean;
  activeSession: CodexNewSession | null;
  activeTask: CodexNewActiveTask | null;
  pendingAction: string | null;
  hasPendingMerge: boolean;
  hasMerged: boolean;
  toggleDiff: (path: string) => void;

  selectedMergePaths: string[];
  selectedMergeHunks: CodexNewHunkSelection[];
  toggleMergePath: (path: string) => void;
  toggleMergeHunk: (path: string, hunkIndex: number) => void;
  handleMerge: () => void | Promise<void>;
  mergeBlockedReason: string | null;

  selectedRollbackPaths: string[];
  selectedRollbackHunks: CodexNewHunkSelection[];
  toggleRollbackPath: (path: string) => void;
  toggleRollbackHunk: (path: string, hunkIndex: number) => void;
  handleRollback: () => void | Promise<void>;

  tracebackEntries: CodexNewTracebackEntry[];
  formatTime: (timestamp: number) => string;
  handleTracebackRestore: (
    path: string,
    target: CodexNewTracebackRestoreTarget,
  ) => void | Promise<void>;
};

export function CodexNewChangesTab({
  isChinese,
  activeSession,
  activeTask,
  pendingAction,
  hasPendingMerge,
  hasMerged,
  toggleDiff,
  selectedMergePaths,
  selectedMergeHunks,
  toggleMergePath,
  toggleMergeHunk,
  handleMerge,
  mergeBlockedReason,
  selectedRollbackPaths,
  selectedRollbackHunks,
  toggleRollbackPath,
  toggleRollbackHunk,
  handleRollback,
  tracebackEntries,
  formatTime,
  handleTracebackRestore,
}: CodexNewChangesTabProps) {
  return (
    <>
      {activeTask ? (
        <>
          <CodexNewChangesPhaseStrip task={activeTask} isChinese={isChinese} />

          <section className="codex-new-window-panel">
            <CodexNewWorkspaceTreeView
              task={activeTask}
              isChinese={isChinese}
              onFileClick={(path) => toggleDiff(path)}
            />
          </section>

          {hasPendingMerge ? (
            <section className="codex-new-window-panel">
              <CodexNewMergePanel
                task={activeTask}
                isChinese={isChinese}
                selectedPaths={selectedMergePaths}
                selectedHunks={selectedMergeHunks}
                onTogglePath={toggleMergePath}
                onToggleHunk={toggleMergeHunk}
                onMerge={handleMerge}
                mergeBlocked={mergeBlockedReason !== null}
                mergeBlockedReason={mergeBlockedReason}
                pending={pendingAction !== null}
              />
            </section>
          ) : (
            <section className="codex-new-window-panel codex-new-window-phase-empty">
              <div className="codex-new-window-section-title">
                {isChinese ? "合并到原项目" : "Merge to project"}
              </div>
              <p className="codex-new-window-phase-empty-copy">
                {isChinese
                  ? "当前没有待合并项。若你刚完成回滚，相关文件会重新出现在上方「待合并」树中。"
                  : "Nothing to merge right now. After a rollback, files return to the Pending merge tree above."}
              </p>
            </section>
          )}

          {hasMerged ? (
            <section className="codex-new-window-panel">
              <CodexNewRollbackPanel
                task={activeTask}
                isChinese={isChinese}
                selectedPaths={selectedRollbackPaths}
                selectedHunks={selectedRollbackHunks}
                onTogglePath={toggleRollbackPath}
                onToggleHunk={toggleRollbackHunk}
                onRollback={handleRollback}
                pending={pendingAction !== null}
              />
            </section>
          ) : (
            <section className="codex-new-window-panel codex-new-window-phase-empty">
              <div className="codex-new-window-section-title">
                {isChinese ? "回滚已合并" : "Rollback merged"}
              </div>
              <p className="codex-new-window-phase-empty-copy">
                {isChinese
                  ? "当前没有已合并项，无需回滚。全部回滚完成后，本区会保持为空。"
                  : "No merged items to roll back. This section stays empty until something is merged."}
              </p>
            </section>
          )}

          <section className="codex-new-window-panel">
            <CodexNewTracebackPanel
              entries={tracebackEntries}
              pending={pendingAction !== null}
              hasActiveSession={Boolean(activeSession)}
              formatTime={formatTime}
              onRestore={(path, target) =>
                void handleTracebackRestore(path, target)
              }
            />
          </section>
        </>
      ) : (
        <div className="codex-new-window-empty">
          {isChinese ? "当前没有活动任务" : "No active task"}
        </div>
      )}
    </>
  );
}

