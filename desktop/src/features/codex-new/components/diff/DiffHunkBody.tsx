import { useI18n } from "@/i18n/I18nProvider";
import { usePaginatedLines } from "../../hooks/usePaginatedLines";

type DiffHunkBodyProps = {
  lines: string[];
  hunkKey: string;
};

export function DiffHunkBody({ lines, hunkKey }: DiffHunkBodyProps) {
  const { t } = useI18n();
  const { visibleLineCount, hiddenLineCount, hasMoreLines, loadMoreLines } = usePaginatedLines(
    lines.length,
    hunkKey,
  );
  const visibleLines = lines.slice(0, visibleLineCount);

  return (
    <div className="diff-hunk-content">
      {visibleLines.map((line, idx) => {
        const lineType = line.startsWith("+")
          ? "added"
          : line.startsWith("-")
            ? "removed"
            : "context";
        const lineNumber = idx + 1;
        return (
          <div key={idx} className={`diff-line diff-line-${lineType}`}>
            <span className="diff-line-number">{lineNumber}</span>
            <code>{line}</code>
          </div>
        );
      })}
      {hasMoreLines ? (
        <button type="button" className="diff-hunk-load-more" onClick={loadMoreLines}>
          {t("codexNew.workbench.diff.loadMoreLines", "Show {count} more lines...").replace(
            "{count}",
            String(hiddenLineCount),
          )}
        </button>
      ) : null}
    </div>
  );
}
