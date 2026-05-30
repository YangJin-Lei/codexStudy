import type { CodexNewActiveTask, CodexNewChangedFile } from "../types";

export type ChangedFileBuckets = {
  pendingMerge: CodexNewChangedFile[];
  merged: CodexNewChangedFile[];
};

export function bucketChangedFiles(files: CodexNewChangedFile[]): ChangedFileBuckets {
  const pendingMerge: CodexNewChangedFile[] = [];
  const merged: CodexNewChangedFile[] = [];
  for (const file of files) {
    if (file.accepted) {
      merged.push(file);
    } else {
      pendingMerge.push(file);
    }
  }
  return { pendingMerge, merged };
}

export function resolveTaskWorkflowPhase(task: CodexNewActiveTask): "editing" | "merge" | "rollback" {
  const { pendingMerge, merged } = bucketChangedFiles(task.changedFiles);
  if (merged.length > 0) {
    return "rollback";
  }
  if (pendingMerge.length > 0) {
    return "merge";
  }
  return "editing";
}

export function taskPhaseHeadline(task: CodexNewActiveTask, isChinese: boolean): string {
  const { pendingMerge, merged } = bucketChangedFiles(task.changedFiles);
  const phase = resolveTaskWorkflowPhase(task);
  if (phase === "rollback") {
    return isChinese
      ? `阶段：已合并 ${merged.length} 项（可回滚）${pendingMerge.length > 0 ? `，另有 ${pendingMerge.length} 项待合并` : ""}`
      : `Phase: ${merged.length} merged (rollback available)${
          pendingMerge.length > 0 ? `, ${pendingMerge.length} still pending merge` : ""
        }`;
  }
  if (phase === "merge") {
    return isChinese
      ? `阶段：${pendingMerge.length} 项待合并到原项目（尚未写入原项目）`
      : `Phase: ${pendingMerge.length} change(s) ready to merge into the project`;
  }
  return isChinese ? "阶段：隔离区暂无待处理变更" : "Phase: no pending isolated changes";
}

export function taskPhaseDetail(task: CodexNewActiveTask, isChinese: boolean): string | null {
  const { pendingMerge, merged } = bucketChangedFiles(task.changedFiles);
  if (merged.length > 0 && pendingMerge.length > 0) {
    return isChinese
      ? "回滚只影响原项目；隔离克隆里的修改仍在，回滚后会回到「待合并」列表。"
      : "Rollback only affects the project copy. Isolated edits remain and return to the pending-merge list after rollback.";
  }
  if (merged.length > 0) {
    return isChinese
      ? "下列「已合并」仅列出仍写入原项目的项。回滚成功后它们会离开本区，回到「待合并」。"
      : "Merged items are only those still applied to the project. After rollback they leave this section and return to pending merge.";
  }
  if (pendingMerge.length > 0) {
    return isChinese
      ? "勾选后合并才会改动原项目；未勾选的变更只留在隔离克隆里。"
      : "Only selected items change the project when you merge. Unselected edits stay in the isolated clone.";
  }
  return null;
}
