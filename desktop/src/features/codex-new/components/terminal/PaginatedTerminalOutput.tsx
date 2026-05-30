import { useI18n } from "@/i18n/I18nProvider";
import { usePaginatedLines } from "../../hooks/usePaginatedLines";
import {
  TERMINAL_OUTPUT_LINES_INITIAL,
  TERMINAL_OUTPUT_LINES_LOAD_BATCH,
} from "../../constants/diffPagination";

type PaginatedTerminalOutputProps = {
  text: string;
  variant?: "stdout" | "stderr";
  outputKey: string;
};

function splitTerminalLines(text: string): string[] {
  if (!text) {
    return [];
  }
  return text.split(/\r?\n/);
}

export function PaginatedTerminalOutput({
  text,
  variant = "stdout",
  outputKey,
}: PaginatedTerminalOutputProps) {
  const { t } = useI18n();
  const lines = splitTerminalLines(text);
  const pagination = usePaginatedLines(lines.length, `${outputKey}:${variant}`, {
    initialCount: TERMINAL_OUTPUT_LINES_INITIAL,
    loadBatch: TERMINAL_OUTPUT_LINES_LOAD_BATCH,
  });
  const visibleText = lines.slice(0, pagination.visibleLineCount).join("\n");

  return (
    <div className="terminal-output-block">
      <pre className={`terminal-run-pre${variant === "stderr" ? " error" : ""}`}>{visibleText}</pre>
      {pagination.hasMoreLines ? (
        <button
          type="button"
          className="terminal-output-load-more"
          onClick={pagination.loadMoreLines}
        >
          {t("codexNew.workbench.terminal.loadMoreLines", "Show {count} more lines...").replace(
            "{count}",
            String(pagination.hiddenLineCount),
          )}
        </button>
      ) : null}
    </div>
  );
}
