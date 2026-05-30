import GitMerge from "lucide-react/dist/esm/icons/git-merge";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import type { CodexNewActiveTask } from "../types";
import {
  bucketChangedFiles,
  resolveTaskWorkflowPhase,
  taskPhaseDetail,
  taskPhaseHeadline,
} from "../utils/taskPhases";

type CodexNewChangesPhaseStripProps = {
  task: CodexNewActiveTask;
  isChinese: boolean;
};

export function CodexNewChangesPhaseStrip({ task, isChinese }: CodexNewChangesPhaseStripProps) {
  const phase = resolveTaskWorkflowPhase(task);
  const { pendingMerge, merged } = bucketChangedFiles(task.changedFiles);
  const detail = taskPhaseDetail(task, isChinese);
  const Icon = phase === "rollback" ? RotateCcw : phase === "merge" ? GitMerge : Pencil;

  return (
    <div className={`codex-new-changes-phase is-${phase}`}>
      <div className="codex-new-changes-phase-head">
        <Icon size={16} aria-hidden />
        <div className="codex-new-changes-phase-copy">
          <div className="codex-new-changes-phase-title">{taskPhaseHeadline(task, isChinese)}</div>
          {detail ? <div className="codex-new-changes-phase-detail">{detail}</div> : null}
        </div>
      </div>
      <div className="codex-new-changes-phase-stats">
        <span className="codex-new-changes-phase-stat is-pending">
          {isChinese ? `待合并 ${pendingMerge.length}` : `Pending ${pendingMerge.length}`}
        </span>
        <span className="codex-new-changes-phase-stat is-merged">
          {isChinese ? `已合并 ${merged.length}` : `Merged ${merged.length}`}
        </span>
      </div>
    </div>
  );
}
