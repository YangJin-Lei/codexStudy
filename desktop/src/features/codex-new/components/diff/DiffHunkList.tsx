import type { CodexNewDiffHunk } from "../../types";
import { useDiffHunkPagination } from "../../hooks/useDiffHunkPagination";
import { useI18n } from "@/i18n/I18nProvider";
import { DiffHunk } from "./DiffHunk";

type DiffHunkListProps = {
  filePath: string;
  hunks: CodexNewDiffHunk[];
  isHunkSelected: (hunkIndex: number) => boolean;
  onHunkToggle?: (path: string, hunkIndex: number) => void;
};

export function DiffHunkList({
  filePath,
  hunks,
  isHunkSelected,
  onHunkToggle,
}: DiffHunkListProps) {
  const { t } = useI18n();
  const { visibleHunkIndexes, hiddenHunkCount, hasMoreHunks, loadMoreHunks } = useDiffHunkPagination(
    filePath,
    hunks.length,
  );

  return (
    <div className="file-diff-hunks">
      {visibleHunkIndexes.map((hunkIndex) => {
        const hunk = hunks[hunkIndex];
        if (!hunk) {
          return null;
        }
        return (
          <DiffHunk
            key={hunkIndex}
            hunk={hunk}
            hunkIndex={hunkIndex}
            filePath={filePath}
            isSelected={isHunkSelected(hunkIndex)}
            onToggle={onHunkToggle}
          />
        );
      })}
      {hasMoreHunks ? (
        <button type="button" className="diff-hunk-load-more is-block" onClick={loadMoreHunks}>
          {t("codexNew.workbench.diff.loadMoreHunks", "Show {count} more hunks...").replace(
            "{count}",
            String(hiddenHunkCount),
          )}
        </button>
      ) : null}
    </div>
  );
}
