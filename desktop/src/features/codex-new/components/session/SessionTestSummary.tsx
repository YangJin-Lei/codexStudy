import { useEffect, useState } from "react";
import Play from "lucide-react/dist/esm/icons/play";
import { useI18n } from "@/i18n/I18nProvider";
import type { CodexNewActiveTask } from "../../types";
import { LoadingSpinner } from "../LoadingSpinner";

type SessionTestSummaryProps = {
  task: CodexNewActiveTask;
  isRunning: boolean;
  onRunTest: (command: string) => void | Promise<void>;
};

export function SessionTestSummary({ task, isRunning, onRunTest }: SessionTestSummaryProps) {
  const { t } = useI18n();
  const defaultCommand =
    task.suggestedTestCommands[0] ?? task.projectSettings.defaultTestCommands[0] ?? "";
  const [commandDraft, setCommandDraft] = useState(defaultCommand);

  useEffect(() => {
    setCommandDraft(defaultCommand);
  }, [defaultCommand, task.taskId]);

  const latest = task.latestTest;

  return (
    <div className="session-test-summary">
      <div className="session-test-summary-status">
        {task.hasPassingTest
          ? t("codexNew.workbench.gates.testsPassed", "Tests passed")
          : t("codexNew.workbench.gates.testsRequired", "Passing test required")}
        {latest ? (
          <span className="session-test-summary-latest">
            {latest.command} · {latest.status}
          </span>
        ) : null}
      </div>
      <div className="session-test-summary-actions">
        <input
          type="text"
          className="session-test-summary-input"
          value={commandDraft}
          onChange={(event) => setCommandDraft(event.target.value)}
          placeholder={t("codexNew.workbench.review.testCommandPlaceholder", "e.g. pnpm test")}
        />
        <button
          type="button"
          className="session-test-summary-run"
          disabled={isRunning || !commandDraft.trim()}
          onClick={() => void onRunTest(commandDraft.trim())}
        >
          {isRunning ? (
            <LoadingSpinner size="small" inline />
          ) : (
            <Play size={13} aria-hidden />
          )}
          {t("codexNew.workbench.review.runTest", "Run test")}
        </button>
      </div>
    </div>
  );
}
