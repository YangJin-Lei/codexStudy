import { useCallback, useMemo, useState } from "react";
import Play from "lucide-react/dist/esm/icons/play";
import CheckCircle from "lucide-react/dist/esm/icons/check-circle";
import XCircle from "lucide-react/dist/esm/icons/x-circle";
import Clock from "lucide-react/dist/esm/icons/clock";
import Terminal from "lucide-react/dist/esm/icons/terminal";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import Info from "lucide-react/dist/esm/icons/info";
import type { CodexNewActiveTask } from "../types";
import { CodexNewDirectoryHierarchy } from "./CodexNewDirectoryHierarchy";

type CodexNewTestPanelProps = {
  task: CodexNewActiveTask;
  isChinese: boolean;
  testCommandDraft: string;
  onTestCommandChange: (value: string) => void;
  onRunTest: () => void | Promise<void>;
  onAskTestCommand: () => void | Promise<void>;
  pending: boolean;
  hasActiveThread: boolean;
};

function formatDuration(startedAt: number, completedAt: number | null) {
  if (!completedAt) {
    return "--";
  }
  const duration = completedAt - startedAt;
  if (duration < 1000) {
    return `${duration}ms`;
  }
  return `${(duration / 1000).toFixed(1)}s`;
}

export function CodexNewTestPanel({
  task,
  isChinese,
  testCommandDraft,
  onTestCommandChange,
  onRunTest,
  onAskTestCommand,
  pending,
  hasActiveThread,
}: CodexNewTestPanelProps) {
  const [showOutput, setShowOutput] = useState(false);

  const latestTest = task.latestTest;
  const hasPassingTest = task.hasPassingTest;
  const suggestedCommands = task.suggestedTestCommands;
  const defaultCommands = task.projectSettings.defaultTestCommands;

  const testStatus = useMemo(() => {
    if (!latestTest) {
      return null;
    }
    return latestTest.status;
  }, [latestTest]);

  const StatusIcon = useMemo(() => {
    switch (testStatus) {
      case "succeeded":
        return CheckCircle;
      case "failed":
        return XCircle;
      case "running":
        return Clock;
      default:
        return Terminal;
    }
  }, [testStatus]);

  const statusColor = useMemo(() => {
    switch (testStatus) {
      case "succeeded":
        return "var(--color-success)";
      case "failed":
        return "var(--color-error)";
      case "running":
        return "var(--color-warning)";
      default:
        return "var(--text-muted)";
    }
  }, [testStatus]);

  const statusLabel = useMemo(() => {
    if (!latestTest) {
      return isChinese ? "未运行" : "Not run";
    }
    switch (testStatus) {
      case "succeeded":
        return isChinese ? "通过" : "Passed";
      case "failed":
        return isChinese ? "失败" : "Failed";
      case "running":
        return isChinese ? "运行中" : "Running";
      default:
        return isChinese ? "未知" : "Unknown";
    }
  }, [latestTest, testStatus, isChinese]);

  const handleSuggestedCommand = useCallback(
    (command: string) => {
      onTestCommandChange(command);
    },
    [onTestCommandChange],
  );

  return (
    <div className="codex-new-test-panel">
      <div className="codex-new-test-panel-header">
        <div className="codex-new-test-panel-title">
          <Terminal size={16} aria-hidden />
          {isChinese ? "测试环境" : "Test Environment"}
        </div>
        {latestTest && (
          <div className="codex-new-test-panel-status" style={{ color: statusColor }}>
            <StatusIcon size={14} aria-hidden />
            {statusLabel}
          </div>
        )}
      </div>

      <CodexNewDirectoryHierarchy
        isChinese={isChinese}
        compact
        title={isChinese ? "测试执行位置" : "Where tests run"}
        roots={[
          {
            id: "test-project",
            role: "project",
            label: isChinese ? "环境来源（原项目）" : "Environment source (project)",
            path: task.originalRoot,
            detail: isChinese
              ? "依赖、工具链、环境变量从此目录继承"
              : "Dependencies, toolchain, and env vars are inherited from here",
          },
          {
            id: "test-clone",
            role: "clone",
            label: isChinese ? "命令执行目录（隔离克隆）" : "Command cwd (isolated clone)",
            path: task.workspaceRoot,
            detail: isChinese
              ? "测试命令在此目录运行，使用上面的环境"
              : "Test commands run here using the inherited environment",
          },
        ]}
      />

      <div className="codex-new-test-panel-info">
        <Info size={14} aria-hidden />
        <span>
          {isChinese
            ? "不会污染原项目目录：只在克隆目录执行命令，但会读取原项目的 node_modules / venv / .env 等（若存在）。"
            : "The original project folder stays untouched: commands run in the clone, but reuse node_modules / venv / .env from the project when present."}
        </span>
      </div>

      {task.environmentSummary && (
        <div className="codex-new-test-panel-env">
          <div className="codex-new-test-panel-env-label">
            {isChinese ? "检测到的环境" : "Detected environment"}
          </div>
          <div className="codex-new-test-panel-env-value">{task.environmentSummary}</div>
        </div>
      )}

      <div className="codex-new-test-panel-form">
        <div className="codex-new-test-panel-field">
          <label className="codex-new-test-panel-label" htmlFor="test-command-input">
            {isChinese ? "测试命令" : "Test command"}
          </label>
          <div className="codex-new-test-panel-input-group">
            <input
              id="test-command-input"
              type="text"
              className="codex-new-test-panel-input"
              value={testCommandDraft}
              onChange={(e) => onTestCommandChange(e.target.value)}
              placeholder={
                isChinese
                  ? "例如: npm test, cargo test, pytest"
                  : "e.g., npm test, cargo test, pytest"
              }
            />
            <button
              type="button"
              className="codex-new-test-panel-run-button"
              onClick={() => void onRunTest()}
              disabled={pending || !testCommandDraft.trim()}
            >
              <Play size={14} aria-hidden />
              {isChinese ? "运行" : "Run"}
            </button>
          </div>
        </div>

        {(suggestedCommands.length > 0 || defaultCommands.length > 0) && (
          <div className="codex-new-test-panel-suggestions">
            <div className="codex-new-test-panel-suggestions-label">
              {isChinese ? "建议的命令" : "Suggested commands"}
            </div>
            <div className="codex-new-test-panel-suggestions-list">
              {[...new Set([...suggestedCommands, ...defaultCommands])].map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  className="codex-new-test-panel-suggestion-chip"
                  onClick={() => handleSuggestedCommand(cmd)}
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          className="codex-new-test-panel-ask-button"
          onClick={() => void onAskTestCommand()}
          disabled={!hasActiveThread}
          title={
            hasActiveThread
              ? undefined
              : isChinese
                ? "需要先打开一个对话"
                : "Open a chat thread first"
          }
        >
          <Sparkles size={14} aria-hidden />
          {isChinese ? "让 AI 推荐测试命令" : "Ask AI for test command"}
        </button>
      </div>

      {latestTest && (
        <div className="codex-new-test-panel-result">
          <div className="codex-new-test-panel-result-header">
            <div className="codex-new-test-panel-result-title">
              {isChinese ? "最近一次测试" : "Latest test run"}
            </div>
            <button
              type="button"
              className="codex-new-test-panel-toggle-output"
              onClick={() => setShowOutput((prev) => !prev)}
            >
              {showOutput
                ? isChinese
                  ? "隐藏输出"
                  : "Hide output"
                : isChinese
                  ? "显示输出"
                  : "Show output"}
            </button>
          </div>

          <div className="codex-new-test-panel-result-meta">
            <div className="codex-new-test-panel-result-meta-row">
              <span className="codex-new-test-panel-result-meta-label">
                {isChinese ? "命令" : "Command"}
              </span>
              <code className="codex-new-test-panel-result-meta-value">
                {latestTest.command}
              </code>
            </div>
            <div className="codex-new-test-panel-result-meta-row">
              <span className="codex-new-test-panel-result-meta-label">
                {isChinese ? "状态" : "Status"}
              </span>
              <span
                className="codex-new-test-panel-result-meta-value"
                style={{ color: statusColor }}
              >
                {statusLabel}
                {latestTest.exitCode !== null && ` (exit ${latestTest.exitCode})`}
              </span>
            </div>
            <div className="codex-new-test-panel-result-meta-row">
              <span className="codex-new-test-panel-result-meta-label">
                {isChinese ? "耗时" : "Duration"}
              </span>
              <span className="codex-new-test-panel-result-meta-value">
                {formatDuration(latestTest.startedAt, latestTest.completedAt)}
              </span>
            </div>
          </div>

          {latestTest.failureSummary && (
            <div className="codex-new-test-panel-failure">
              <div className="codex-new-test-panel-failure-label">
                {isChinese ? "失败摘要" : "Failure summary"}
              </div>
              <pre className="codex-new-test-panel-failure-text">
                {latestTest.failureSummary}
              </pre>
            </div>
          )}

          {showOutput && (
            <div className="codex-new-test-panel-output">
              {latestTest.stdoutExcerpt && (
                <div className="codex-new-test-panel-output-section">
                  <div className="codex-new-test-panel-output-label">stdout</div>
                  <pre className="codex-new-test-panel-output-text">
                    {latestTest.stdoutExcerpt}
                  </pre>
                </div>
              )}
              {latestTest.stderrExcerpt && (
                <div className="codex-new-test-panel-output-section">
                  <div className="codex-new-test-panel-output-label">stderr</div>
                  <pre className="codex-new-test-panel-output-text">
                    {latestTest.stderrExcerpt}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!hasPassingTest && task.projectSettings.requireTests && (
        <div className="codex-new-test-panel-warning">
          {isChinese
            ? "项目设置要求测试通过才能合并。请运行测试并确保通过。"
            : "Project settings require passing tests before merge. Please run tests and ensure they pass."}
        </div>
      )}
    </div>
  );
}
