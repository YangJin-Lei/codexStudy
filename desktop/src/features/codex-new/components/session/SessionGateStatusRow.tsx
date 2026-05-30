import ClipboardList from "lucide-react/dist/esm/icons/clipboard-list";
import FlaskConical from "lucide-react/dist/esm/icons/flask-conical";
import { useI18n } from "@/i18n/I18nProvider";
import type { CodexNewActiveTask } from "../../types";
import { getCodexNewMergeGateReason, isCodexNewReviewRequired, isCodexNewTestsRequired } from "../../utils/reviewGate";

type SessionGateStatusRowProps = {
  task: CodexNewActiveTask;
};

export function SessionGateStatusRow({ task }: SessionGateStatusRowProps) {
  const { t } = useI18n();
  const reviewRequired = isCodexNewReviewRequired(task);
  const testsRequired = isCodexNewTestsRequired(task);
  const gateReason = getCodexNewMergeGateReason(task);

  if (!reviewRequired && !testsRequired) {
    return null;
  }

  const reviewLabel = !task.review
    ? t("codexNew.workbench.gates.reviewPending", "Review not run")
    : task.review.disposition === "blocked"
      ? t("codexNew.workbench.gates.reviewBlocked", "Review blocked")
      : task.review.disposition === "needsUserApproval"
        ? t("codexNew.workbench.gates.reviewApproval", "Review awaiting merge")
        : t("codexNew.workbench.gates.reviewPassed", "Review passed");

  const testLabel = task.hasPassingTest
    ? t("codexNew.workbench.gates.testsPassed", "Tests passed")
    : t("codexNew.workbench.gates.testsRequired", "Passing test required");

  return (
    <div className="session-gate-status-row">
      {reviewRequired ? (
        <span
          className={`session-gate-pill review${
            gateReason?.kind === "reviewMissing" || gateReason?.kind === "reviewBlocked"
              ? " is-warning"
              : " is-ok"
          }`}
        >
          <ClipboardList size={12} aria-hidden />
          {reviewLabel}
        </span>
      ) : null}
      {testsRequired ? (
        <span className={`session-gate-pill tests${task.hasPassingTest ? " is-ok" : " is-warning"}`}>
          <FlaskConical size={12} aria-hidden />
          {testLabel}
        </span>
      ) : null}
    </div>
  );
}
