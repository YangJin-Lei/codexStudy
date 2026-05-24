import TerminalSquare from "lucide-react/dist/esm/icons/terminal-square";
import { useI18n } from "@/i18n/I18nProvider";
import type { CodexNewTerminalRun } from "../types";

function formatTime(timestamp: number | null) {
  if (!timestamp) {
    return "--";
  }
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeCommand(command: string) {
  return command.replace(/\s+/g, " ").trim();
}

function extractPathForCommand(command: string, verbs: string[]) {
  const escapedVerbs = verbs.map((verb) => verb.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(
    `\\b(?:${escapedVerbs.join("|")})\\b(?:\\s+-\\w+(?:\\s+(?:\"[^\"]*\"|'[^']*'|[^\\s;|]+))?)*\\s+(?:\"([^\"]+)\"|'([^']+)'|([^\\s;|]+))`,
    "i",
  );
  const match = command.match(pattern);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function classifyCommand(command: string) {
  const normalized = normalizeCommand(command);
  const readPath = extractPathForCommand(normalized, ["Get-Content", "gc", "cat", "type"]);
  if (/\b(?:Get-Content|gc|cat|type)\b/i.test(normalized)) {
    return {
      mode: "file-read" as const,
      path: readPath,
    };
  }

  const writePathMatch =
    normalized.match(/(?:-LiteralPath|-Path)\s+(['"])(.*?)\1/i)?.[2] ??
    normalized.match(/(?:-LiteralPath|-Path)\s+([^\s;|]+)/i)?.[1] ??
    extractPathForCommand(normalized, ["Set-Content", "Add-Content", "Out-File", "tee"]);
  if (writePathMatch) {
    return {
      mode: "file-write" as const,
      path: writePathMatch,
    };
  }

  if (/apply_patch/i.test(normalized)) {
    return {
      mode: "patch" as const,
      path: null,
    };
  }

  const hasInlinePayload =
    normalized.includes('@"') ||
    normalized.includes('"@') ||
    normalized.includes("@'") ||
    normalized.includes("'@") ||
    normalized.includes("<<");
  if (hasInlinePayload && normalized.length > 180) {
    return {
      mode: "inline-script" as const,
      path: null,
    };
  }

  return {
    mode: "command" as const,
    path: null,
  };
}

function summarizeCommandRun(
  run: CodexNewTerminalRun,
  t: ReturnType<typeof useI18n>["t"],
  isChinese: boolean,
) {
  const normalized = normalizeCommand(run.command);
  const classified = classifyCommand(normalized);

  if (classified.mode === "file-read") {
    return {
      title: isChinese ? "文件读取命令" : "File read command",
      command: classified.path
        ? `${isChinese ? "读取文件" : "Read file"} ${classified.path}`
        : isChinese
          ? "读取文件"
          : "Read file",
      suppressStdout: true,
    };
  }

  if (classified.mode === "file-write") {
    return {
      title: t("codexNew.window.commandWriteTitle", "File write command"),
      command: classified.path
        ? `${t("codexNew.window.commandWrite", "Write file")} ${classified.path}`
        : t("codexNew.window.commandWrite", "Write file"),
      suppressStdout: true,
    };
  }

  if (classified.mode === "patch") {
    return {
      title: t("codexNew.window.commandPatchTitle", "Patch command"),
      command: t("codexNew.window.commandPatch", "Apply patch"),
      suppressStdout: true,
    };
  }

  if (classified.mode === "inline-script") {
    return {
      title: t("codexNew.window.commandInlineTitle", "Inline script command"),
      command: t("codexNew.window.commandInline", "Inline shell script payload hidden"),
      suppressStdout: true,
    };
  }

  if (!normalized) {
    return {
      title: run.title || t("codexNew.window.commandRunTitle", "Command run"),
      command: t("codexNew.window.commandUnavailable", "Command unavailable"),
      suppressStdout: false,
    };
  }

  return {
    title:
      run.title.startsWith("Command:") || run.title.length > 120
        ? t("codexNew.window.commandRunTitle", "Command run")
        : run.title,
    command: normalized,
    suppressStdout: false,
  };
}

type CodexNewTerminalPanelProps = {
  runs: CodexNewTerminalRun[];
  compact?: boolean;
};

export function CodexNewTerminalPanel({ runs, compact = false }: CodexNewTerminalPanelProps) {
  const { t, resolvedLanguage } = useI18n();
  const isChinese = resolvedLanguage === "zh-CN";

  return (
    <div className={`codex-new-terminal-panel${compact ? " is-compact" : ""}`}>
      {runs.length === 0 ? (
        <div className="codex-new-window-empty">
          {t("codexNew.window.noCommands", "No command runs yet.")}
        </div>
      ) : (
        <div className="codex-new-window-list">
          {runs.map((run) => {
            const display = summarizeCommandRun(run, t, isChinese);
            const stdoutText = display.suppressStdout
              ? isChinese
                ? "文件内容预览请在时间线中展开对应文件。"
                : "Expand the file in the timeline tab to preview file content."
              : run.stdoutExcerpt.trim();
            const stderrText = run.stderrExcerpt.trim();
            const combinedOutput =
              stderrText ||
              stdoutText ||
              (isChinese ? "暂时没有输出。" : "No output yet.");
            const showSplitOutput = Boolean(stdoutText && stderrText);

            return (
              <article key={run.id} className={`codex-new-window-event status-${run.status}`}>
                <div className="codex-new-window-event-top">
                  <div className="codex-new-window-event-kind">
                    <TerminalSquare size={12} aria-hidden />
                    {run.status}
                  </div>
                  <div className="codex-new-window-event-time">
                    {formatTime(run.startedAt)}
                    {run.completedAt ? ` - ${formatTime(run.completedAt)}` : ""}
                  </div>
                </div>
                <h2 className="codex-new-window-event-title">{display.title}</h2>
                <div className="codex-new-window-command">{display.command}</div>
                <div className="codex-new-window-command-meta">
                  <span>{run.cwd}</span>
                  <span>
                    {run.exitCode === null
                      ? t("codexNew.window.pendingExitCode", "exit code pending")
                      : `${isChinese ? "退出码" : "exit"} ${run.exitCode}`}
                  </span>
                </div>
                {showSplitOutput ? (
                  <div className="codex-new-window-output-grid">
                    <section>
                      <div className="codex-new-window-output-label">
                        {isChinese ? "标准输出" : "stdout"}
                      </div>
                      <pre className="codex-new-window-output">{stdoutText}</pre>
                    </section>
                    <section>
                      <div className="codex-new-window-output-label">
                        {isChinese ? "标准错误" : "stderr"}
                      </div>
                      <pre className="codex-new-window-output">{stderrText}</pre>
                    </section>
                  </div>
                ) : (
                  <section>
                    <div className="codex-new-window-output-label">
                      {isChinese ? "命令输出" : "Output"}
                    </div>
                    <pre className="codex-new-window-output">{combinedOutput}</pre>
                  </section>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
