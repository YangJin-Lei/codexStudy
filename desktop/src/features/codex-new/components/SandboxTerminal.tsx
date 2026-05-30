import { useState, useEffect, useCallback, useMemo } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { useCodexNewState } from "../hooks/useCodexNewState";
import Terminal from "lucide-react/dist/esm/icons/terminal";
import { WorkbenchPanelHeader } from "./workbench/WorkbenchPanelHeader";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import XCircle from "lucide-react/dist/esm/icons/x-circle";
import Clock from "lucide-react/dist/esm/icons/clock";
import type { CodexNewTerminalRun } from "../types";
import { PaginatedTerminalOutput } from "./terminal/PaginatedTerminalOutput";
import "./SandboxTerminal.css";

type SandboxTerminalProps = {
  width: number;
  onWidthChange: (width: number) => void;
  activeThreadId: string | null;
};

function TerminalRunItem({ run }: { run: CodexNewTerminalRun }) {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(false);

  const statusIcon = useMemo(() => {
    switch (run.status) {
      case "succeeded":
        return <CheckCircle2 size={16} className="terminal-status-icon success" />;
      case "failed":
        return <XCircle size={16} className="terminal-status-icon error" />;
      case "running":
        return <Clock size={16} className="terminal-status-icon running" />;
      default:
        return <Clock size={16} className="terminal-status-icon pending" />;
    }
  }, [run.status]);

  const statusText = useMemo(() => {
    if (run.status === "succeeded") {
      return t("codexNew.workbench.terminal.statusSucceeded", "Succeeded");
    }
    if (run.status === "failed") {
      return t("codexNew.workbench.terminal.statusFailed", "Failed (exit {code})").replace(
        "{code}",
        String(run.exitCode ?? "unknown"),
      );
    }
    if (run.status === "running") {
      return t("codexNew.workbench.terminal.statusRunning", "Running");
    }
    return t("codexNew.workbench.terminal.statusPending", "Pending");
  }, [run.status, run.exitCode, t]);

  const formatTime = useCallback((timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, []);

  return (
    <div className={`terminal-run-item status-${run.status}`}>
      <div
        className="terminal-run-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="terminal-run-info">
          {statusIcon}
          <div className="terminal-run-title">{run.title}</div>
        </div>
        <div className="terminal-run-meta">
          <span className="terminal-run-time">{formatTime(run.startedAt)}</span>
          <span className="terminal-run-status">{statusText}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="terminal-run-body">
          <div className="terminal-run-command">
            <div className="terminal-run-label">
              {t("codexNew.workbench.terminal.command", "Command")}:
            </div>
            <code className="terminal-run-code">{run.command}</code>
          </div>

          <div className="terminal-run-cwd">
            <div className="terminal-run-label">
              {t("codexNew.workbench.terminal.cwd", "Working directory")}:
            </div>
            <code className="terminal-run-code">{run.cwd}</code>
          </div>

          {run.stdoutExcerpt ? (
            <div className="terminal-run-output">
              <div className="terminal-run-label">
                {t("codexNew.workbench.terminal.output", "Output")}:
              </div>
              <PaginatedTerminalOutput
                text={run.stdoutExcerpt}
                variant="stdout"
                outputKey={`${run.id}:stdout`}
              />
            </div>
          ) : null}

          {run.stderrExcerpt ? (
            <div className="terminal-run-output">
              <div className="terminal-run-label">
                {t("codexNew.workbench.terminal.errors", "Errors")}:
              </div>
              <PaginatedTerminalOutput
                text={run.stderrExcerpt}
                variant="stderr"
                outputKey={`${run.id}:stderr`}
              />
            </div>
          ) : null}

          {run.completedAt && (
            <div className="terminal-run-duration">
              {t("codexNew.workbench.terminal.duration", "Duration: {seconds}s").replace(
                "{seconds}",
                String(Math.round((run.completedAt - run.startedAt) / 1000)),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function inferThreadScopedRuns(
  runs: CodexNewTerminalRun[],
  isolatedRoot: string | null,
): CodexNewTerminalRun[] {
  if (!isolatedRoot) {
    return runs;
  }
  const normalizedRoot = isolatedRoot.replace(/\\/g, "/").toLowerCase();
  return runs.filter((run) => {
    const cwd = run.cwd.replace(/\\/g, "/").toLowerCase();
    return cwd.startsWith(normalizedRoot);
  });
}

export function SandboxTerminal({
  width,
  onWidthChange,
  activeThreadId,
}: SandboxTerminalProps) {
  const { t } = useI18n();
  const state = useCodexNewState();
  const [isResizing, setIsResizing] = useState(false);
  const activeThreadEntry = activeThreadId
    ? state.threadRegistry[activeThreadId] ?? null
    : null;

  // 过滤当前会话的终端运行记录
  const terminalRuns = useMemo(() => {
    if (!activeThreadId) {
      return state.terminalRuns;
    }
    return inferThreadScopedRuns(
      state.terminalRuns,
      activeThreadEntry?.isolatedRoot ?? state.activeTask?.workspaceRoot ?? null,
    );
  }, [activeThreadEntry?.isolatedRoot, activeThreadId, state.activeTask?.workspaceRoot, state.terminalRuns]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const windowWidth = window.innerWidth;
      const newWidth = Math.max(300, Math.min(800, windowWidth - e.clientX));
      onWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, onWidthChange]);

  return (
    <div className="sandbox-terminal" style={{ width: `${width}px` }} tabIndex={-1}>
      <div
        className="sandbox-terminal-resizer"
        onMouseDown={handleMouseDown}
        style={{ cursor: isResizing ? "col-resize" : "ew-resize" }}
      />

      <WorkbenchPanelHeader
        icon={<Terminal size={14} />}
        title={t("codexNew.workbench.terminal.title", "Terminal Sandbox")}
        meta={
          terminalRuns.length === 0
            ? t("codexNew.workbench.terminal.emptyRuns", "No command runs yet")
            : t("codexNew.workbench.terminal.runCount", "{count} command run(s)").replace(
                "{count}",
                String(terminalRuns.length),
              )
        }
      />

      <div className="sandbox-terminal-content">
        {terminalRuns.length === 0 ? (
          <div className="sandbox-terminal-empty">
            <Terminal size={48} className="terminal-empty-icon" />
            <p>{t("codexNew.workbench.terminal.emptyHint", "Command runs will appear here")}</p>
          </div>
        ) : (
          <div className="terminal-run-list">
            {terminalRuns
              .slice()
              .reverse()
              .map((run) => (
                <TerminalRunItem key={run.id} run={run} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
