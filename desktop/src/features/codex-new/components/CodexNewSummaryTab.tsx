import FileText from "lucide-react/dist/esm/icons/file-text";
import { useI18n } from "@/i18n/I18nProvider";
import type {
  CodexNewActiveTask,
  CodexNewCandidateMemoryRecord,
  CodexNewSession,
} from "../types";

type CodexNewSummaryTabProps = {
  isChinese: boolean;
  activeSession: CodexNewSession | null;
  activeTask: CodexNewActiveTask | null;
  pendingAction: string | null;

  summaryGoalDraft: string;
  setSummaryGoalDraft: (next: string) => void;
  summaryResultDraft: string;
  setSummaryResultDraft: (next: string) => void;

  handleWriteSummary: () => void | Promise<void>;

  memoryCandidates: CodexNewCandidateMemoryRecord[];
  handleApplyMemory: (id: string) => void | Promise<void>;
  formatMemoryStatus: (status: CodexNewCandidateMemoryRecord["status"], isChinese: boolean) => string;
};

export function CodexNewSummaryTab({
  isChinese,
  activeSession,
  activeTask,
  pendingAction,
  summaryGoalDraft,
  setSummaryGoalDraft,
  summaryResultDraft,
  setSummaryResultDraft,
  handleWriteSummary,
  memoryCandidates,
  handleApplyMemory,
  formatMemoryStatus,
}: CodexNewSummaryTabProps) {
  const { t } = useI18n();
  return (
    <section className="codex-new-window-panel">
      <div className="codex-new-window-section-title">
        <FileText size={14} aria-hidden />
        {isChinese ? "任务总结" : "Task Summary"}
      </div>

      <div className="codex-new-window-inline-form">
        <label className="codex-new-window-field">
          <span className="codex-new-window-field-label">
            {isChinese ? "目标" : "Goal"}
          </span>
          <input
            className="codex-new-window-input"
            value={summaryGoalDraft}
            onChange={(event) => setSummaryGoalDraft(event.target.value)}
            placeholder={
              isChinese
                ? "概括这次任务对应的用户目标。"
                : "Summarize the user's goal for this task."
            }
          />
        </label>
        <label className="codex-new-window-field is-grow">
          <span className="codex-new-window-field-label">
            {isChinese ? "AI 结果" : "AI result"}
          </span>
          <textarea
            className="codex-new-window-textarea"
            value={summaryResultDraft}
            onChange={(event) => setSummaryResultDraft(event.target.value)}
            placeholder={
              isChinese
                ? "概括这次隔离任务实际产出的内容。"
                : "Summarize what the isolated task produced."
            }
          />
        </label>
        <button
          type="button"
          className="codex-new-mini-button"
          onClick={() => void handleWriteSummary()}
          disabled={!activeSession || !activeTask || pendingAction !== null}
        >
          <FileText size={13} aria-hidden />
          {isChinese ? "写入总结" : "Write summary"}
        </button>
      </div>

      {activeTask?.latestSummary ? (
        <div className="codex-new-window-summary-shell">
          <div className="codex-new-window-summary-block">
            <div className="codex-new-window-field-label">
              {isChinese ? "目标" : "Goal"}
            </div>
            <div className="codex-new-window-summary-text">
              {activeTask.latestSummary.userGoal}
            </div>
          </div>
          <div className="codex-new-window-summary-block">
            <div className="codex-new-window-field-label">
              {isChinese ? "结果" : "Result"}
            </div>
            <div className="codex-new-window-summary-text">
              {activeTask.latestSummary.aiResult}
            </div>
          </div>
          <div className="codex-new-window-summary-grid is-detail">
            <article className="codex-new-window-summary-card">
              <div className="codex-new-window-summary-label">
                {isChinese ? "文件" : "Files"}
              </div>
              <div className="codex-new-window-summary-list">
                {activeTask.latestSummary.filesChanged.map((path) => (
                  <div key={path}>{path}</div>
                ))}
              </div>
            </article>
            <article className="codex-new-window-summary-card">
              <div className="codex-new-window-summary-label">
                {isChinese ? "决策" : "Decisions"}
              </div>
              <div className="codex-new-window-summary-list">
                {activeTask.latestSummary.decisions.map((entry, index) => (
                  <div key={`${entry}-${index}`}>{entry}</div>
                ))}
              </div>
            </article>
            <article className="codex-new-window-summary-card">
              <div className="codex-new-window-summary-label">
                {isChinese ? "测试" : "Tests"}
              </div>
              <div className="codex-new-window-summary-list">
                {activeTask.latestSummary.tests.map((entry, index) => (
                  <div key={`${entry}-${index}`}>{entry}</div>
                ))}
              </div>
            </article>
            <article className="codex-new-window-summary-card">
              <div className="codex-new-window-summary-label">
                {isChinese ? "风险" : "Risks"}
              </div>
              <div className="codex-new-window-summary-list">
                {activeTask.latestSummary.risks.map((entry, index) => (
                  <div key={`${entry}-${index}`}>{entry}</div>
                ))}
              </div>
            </article>
          </div>
          {activeTask.latestSummary.candidateMemory.length ? (
            <div className="codex-new-window-candidate-memory">
              {activeTask.latestSummary.candidateMemory.map((memory, index) => (
                <div
                  key={`${memory.title}-${index}`}
                  className="codex-new-window-memory-item"
                >
                  <div className="codex-new-window-memory-title">
                    {memory.title}
                  </div>
                  <div className="codex-new-window-memory-detail">
                    {memory.detail}
                  </div>
                  {memory.evidencePaths.length ? (
                    <div className="codex-new-window-memory-evidence">
                      {memory.evidencePaths.join(", ")}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {memoryCandidates.length ? (
            <div className="codex-new-window-candidate-memory">
              <div className="codex-new-window-field-label">
                {t("codexNew.window.memoryCandidates", "Candidate memory")}
              </div>
              {memoryCandidates.map((record) => (
                <div
                  key={record.id}
                  className="codex-new-window-memory-item is-actionable"
                >
                  <div className="codex-new-window-memory-top">
                    <div>
                      <div className="codex-new-window-memory-title">
                        {record.candidate.title}
                      </div>
                      <div className="codex-new-window-memory-detail">
                        {record.candidate.detail}
                      </div>
                    </div>
                    <span
                      className={`codex-new-window-badge-chip is-${record.status}`}
                    >
                      {formatMemoryStatus(record.status, isChinese)}
                    </span>
                  </div>
                  {record.candidate.evidencePaths.length ? (
                    <div className="codex-new-window-memory-evidence">
                      {record.candidate.evidencePaths.join(", ")}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="codex-new-mini-button"
                    onClick={() => void handleApplyMemory(record.id)}
                    disabled={
                      !activeSession ||
                      pendingAction !== null ||
                      record.status === "same" ||
                      record.status === "conflict"
                    }
                  >
                    {t("codexNew.window.applyMemory", "Apply to project memory")}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="codex-new-window-empty">
          {isChinese ? "还没有写入任务总结。" : "No task summary has been written yet."}
        </div>
      )}
    </section>
  );
}

