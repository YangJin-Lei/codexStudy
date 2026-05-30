import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle";
import GitMerge from "lucide-react/dist/esm/icons/git-merge";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import type { CodexNewChangedFile, CodexNewDiffFile, CodexNewHunkSelection } from "../types";
import {
  describeFileMergeImpact,
  describeFileRollbackImpact,
  describeHunkMergeImpact,
  describeHunkRollbackImpact,
  formatHunkRange,
  formatHunkStats,
} from "../utils/changeImpact";

type CodexNewOperationImpactSummaryProps = {
  mode: "merge" | "rollback";
  isChinese: boolean;
  selectedPaths: string[];
  selectedHunks: CodexNewHunkSelection[];
  filesByPath: Map<string, CodexNewChangedFile>;
  diffFilesByPath: Map<string, CodexNewDiffFile>;
};

export function CodexNewOperationImpactSummary({
  mode,
  isChinese,
  selectedPaths,
  selectedHunks,
  filesByPath,
  diffFilesByPath,
}: CodexNewOperationImpactSummaryProps) {
  if (selectedPaths.length === 0 && selectedHunks.length === 0) {
    return null;
  }

  const Icon = mode === "merge" ? GitMerge : RotateCcw;
  const title =
    mode === "merge"
      ? isChinese
        ? "即将合并到原项目"
        : "Will merge into the project"
      : isChinese
        ? "即将从原项目回滚"
        : "Will roll back in the project";

  return (
    <div className={`codex-new-operation-impact is-${mode}`}>
      <div className="codex-new-operation-impact-title">
        <Icon size={15} aria-hidden />
        <span>{title}</span>
      </div>
      <ul className="codex-new-operation-impact-list">
        {selectedPaths.map((path) => {
          const file = filesByPath.get(path);
          if (!file) {
            return null;
          }
          const impact =
            mode === "merge"
              ? describeFileMergeImpact(file, isChinese)
              : describeFileRollbackImpact(file, isChinese);
          return (
            <li key={`path-${path}`} className="codex-new-operation-impact-item">
              <span className="codex-new-operation-impact-path">{path}</span>
              <span className="codex-new-operation-impact-detail">{impact}</span>
            </li>
          );
        })}
        {selectedHunks.map((selection) => {
          const file = filesByPath.get(selection.path);
          const diffFile = diffFilesByPath.get(selection.path);
          const hunk = diffFile?.hunks[selection.hunkIndex];
          if (!file || !hunk) {
            return null;
          }
          const hunkImpact =
            mode === "merge"
              ? describeHunkMergeImpact(isChinese)
              : describeHunkRollbackImpact(isChinese);
          return (
            <li
              key={`hunk-${selection.path}-${selection.hunkIndex}`}
              className="codex-new-operation-impact-item is-hunk"
            >
              <span className="codex-new-operation-impact-path">
                {selection.path} · {isChinese ? "代码段" : "Block"}{" "}
                {selection.hunkIndex + 1}
              </span>
              <span className="codex-new-operation-impact-detail">
                {formatHunkRange(hunk, isChinese)} · {formatHunkStats(hunk, isChinese)}
              </span>
              <span className="codex-new-operation-impact-detail">{hunkImpact}</span>
            </li>
          );
        })}
      </ul>
      {mode === "rollback" ? (
        <div className="codex-new-operation-impact-footnote">
          <AlertTriangle size={13} aria-hidden />
          <span>
            {isChinese
              ? "回滚只影响原项目文件，不会删除隔离副本中的工作。"
              : "Rollback only changes project files; your isolated copy is kept."}
          </span>
        </div>
      ) : null}
    </div>
  );
}
