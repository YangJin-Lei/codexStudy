import ClipboardList from "lucide-react/dist/esm/icons/clipboard-list";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle";
import Shield from "lucide-react/dist/esm/icons/shield";

import type { CodexNewActiveTask, CodexNewSession } from "../types";
import { CodexNewTestPanel } from "./CodexNewTestPanel";

type CodexNewReviewTabProps = {
  isChinese: boolean;
  activeSession: CodexNewSession | null;
  activeTask: CodexNewActiveTask | null;
  pendingAction: string | null;
  mergeBlockedReason: string | null;
  reviewRequired: boolean;
  testsRequired: boolean;
  handleRefresh: () => void | Promise<void>;
  handleReview: () => void | Promise<void>;
  humanizeIdentifier: (value: string | null | undefined) => string;
  testCommandDraft: string;
  setTestCommandDraft: (next: string) => void;
  handleRunTest: () => void | Promise<void>;
  handleAskTestCommand: () => void | Promise<void>;
};

export function CodexNewReviewTab({
  isChinese,
  activeSession,
  activeTask,
  pendingAction,
  mergeBlockedReason,
  reviewRequired,
  testsRequired,
  handleRefresh,
  handleReview,
  humanizeIdentifier,
  testCommandDraft,
  setTestCommandDraft,
  handleRunTest,
  handleAskTestCommand,
}: CodexNewReviewTabProps) {
  return (
    <>
      <section className="codex-new-window-panel">
        <div className="codex-new-window-section-title">
          <ClipboardList size={14} aria-hidden />
          {isChinese ? "审查门禁" : "Review Gate"}
        </div>
        <div className="codex-new-window-action-row">
          <button
            type="button"
            className="codex-new-mini-button"
            onClick={() => void handleRefresh()}
            disabled={!activeSession || pendingAction !== null}
          >
            <RefreshCw size={13} aria-hidden />
            {isChinese ? "刷新" : "Refresh"}
          </button>
          <button
            type="button"
            className="codex-new-mini-button"
            onClick={() => void handleReview()}
            disabled={!activeSession || pendingAction !== null}
          >
            <ClipboardList size={13} aria-hidden />
            {isChinese ? "运行审查" : "Run review"}
          </button>
        </div>

        <div className="codex-new-window-note-list">
          <div
            className={`codex-new-window-note${mergeBlockedReason ? " is-warning" : ""}`}
          >
            <AlertTriangle size={14} aria-hidden />
            <span>
              {mergeBlockedReason ??
                (activeTask?.review?.disposition === "needsUserApproval"
                  ? isChinese
                    ? "审查已经通过策略检查，正在等待你决定是否合并。"
                    : "Review passed the policy checks and is waiting for your merge decision."
                  : isChinese
                    ? "合并门禁已放行，选中文件后就可以合并。"
                    : "Merge gate is clear. Select files and merge when ready.")}
            </span>
          </div>
          <div className="codex-new-window-note">
            <Shield size={14} aria-hidden />
            <span>
              {reviewRequired
                ? isChinese
                  ? "需要审查。"
                  : "Review is required."
                : isChinese
                  ? "审查可选。"
                  : "Review is optional."}{" "}
              {testsRequired
                ? activeTask?.hasPassingTest
                  ? isChinese
                    ? "已经记录了一次通过的测试。"
                    : "A passing test run is already recorded."
                  : isChinese
                    ? "合并前必须有一次通过的测试。"
                    : "A passing test run is required before merge."
                : isChinese
                  ? "这个任务里的测试目前只是建议项。"
                  : "Tests are advisory for this task."}
            </span>
          </div>
        </div>

        {activeTask?.review ? (
          <div className="codex-new-window-review-shell">
            <div className="codex-new-window-review-summary">
              {activeTask.review.summary}
            </div>
            <div className="codex-new-window-issue-list">
              {activeTask.review.issues.map((issue, index) => (
                <div
                  key={`${issue.path ?? "global"}-${index}`}
                  className={`codex-new-window-issue is-${issue.severity}`}
                >
                  <div className="codex-new-window-issue-title">
                    {humanizeIdentifier(issue.severity)}
                    {issue.path ? ` - ${issue.path}` : ""}
                  </div>
                  <div className="codex-new-window-issue-detail">{issue.message}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {activeTask ? (
        <section className="codex-new-window-panel">
          <CodexNewTestPanel
            task={activeTask}
            isChinese={isChinese}
            testCommandDraft={testCommandDraft}
            onTestCommandChange={setTestCommandDraft}
            onRunTest={handleRunTest}
            onAskTestCommand={handleAskTestCommand}
            pending={pendingAction !== null}
            hasActiveThread={activeSession?.threadId !== null}
          />
        </section>
      ) : null}
    </>
  );
}

