import ClipboardList from "lucide-react/dist/esm/icons/clipboard-list";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle";
import { useI18n } from "@/i18n/I18nProvider";
import type { CodexNewActiveTask } from "../../types";
import { getCodexNewMergeGateReason, isCodexNewTestsRequired } from "../../utils/reviewGate";
import { LoadingSpinner } from "../LoadingSpinner";
import { SessionTestSummary } from "./SessionTestSummary";

type SessionReviewPanelProps = {
  task: CodexNewActiveTask;
  isReviewRunning: boolean;
  isTestRunning: boolean;
  onRefresh: () => void | Promise<void>;
  onRunReview: () => void | Promise<void>;
  onRunTest: (command: string) => void | Promise<void>;
};

export function SessionReviewPanel({
  task,
  isReviewRunning,
  isTestRunning,
  onRefresh,
  onRunReview,
  onRunTest,
}: SessionReviewPanelProps) {
  const { t } = useI18n();
  const gateReason = getCodexNewMergeGateReason(task);
  const gateMessage = !gateReason
    ? null
    : gateReason.kind === "noTask"
      ? t("codexNew.workbench.gates.noTask", "No active task.")
      : gateReason.kind === "reviewMissing"
        ? t("codexNew.workbench.gates.runReviewBeforeMerge", "Run review before merging.")
        : gateReason.kind === "reviewBlocked"
          ? (gateReason.summary ??
            t("codexNew.workbench.gates.reviewBlockedDetail", "Review blocked this merge."))
          : gateReason.kind === "testsBlocked"
            ? t("codexNew.workbench.gates.testsBeforeMerge", "A passing test run is required before merge.")
            : null;
  const testsRequired = isCodexNewTestsRequired(task);

  return (
    <div className="session-review-panel">
      <div className="session-review-panel-actions">
        <button
          type="button"
          className="session-review-panel-button"
          onClick={() => void onRefresh()}
          disabled={isReviewRunning || isTestRunning}
        >
          <RefreshCw size={13} aria-hidden />
          {t("codexNew.workbench.refresh", "Refresh")}
        </button>
        <button
          type="button"
          className="session-review-panel-button"
          onClick={() => void onRunReview()}
          disabled={isReviewRunning || isTestRunning}
        >
          {isReviewRunning ? (
            <LoadingSpinner size="small" inline />
          ) : (
            <ClipboardList size={13} aria-hidden />
          )}
          {t("codexNew.workbench.review.runReview", "Run review")}
        </button>
      </div>

      {gateMessage ? (
        <div className="session-review-panel-warning" role="status">
          <AlertTriangle size={14} aria-hidden />
          <span>{gateMessage}</span>
        </div>
      ) : (
        <div className="session-review-panel-ok" role="status">
          {t("codexNew.workbench.review.mergeReady", "Review and test gates are satisfied for merge.")}
        </div>
      )}

      {task.review ? (
        <div className="session-review-report">
          <div className="session-review-report-head">
            <strong>{t("codexNew.workbench.review.reportTitle", "Review report")}</strong>
            <span className="session-review-disposition">{task.review.disposition}</span>
          </div>
          <p className="session-review-summary">{task.review.summary}</p>
          {task.review.issues.length > 0 ? (
            <ul className="session-review-issues">
              {task.review.issues.slice(0, 6).map((issue, index) => (
                <li key={`${issue.path ?? "global"}-${index}`} className={`severity-${issue.severity}`}>
                  {issue.path ? <code>{issue.path}</code> : null}
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="session-review-empty">
          {t("codexNew.workbench.review.noReport", "No review report yet. Run review to evaluate changes.")}
        </p>
      )}

      {testsRequired ? (
        <SessionTestSummary task={task} isRunning={isTestRunning} onRunTest={onRunTest} />
      ) : null}
    </div>
  );
}
