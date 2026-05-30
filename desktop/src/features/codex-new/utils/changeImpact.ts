import type { CodexNewChangedFile, CodexNewDiffHunk } from "../types";

export function summarizeHunkPreview(hunk: CodexNewDiffHunk) {
  let added = 0;
  let removed = 0;
  for (const line of hunk.preview) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
      continue;
    }
    if (line.startsWith("+")) {
      added += 1;
    } else if (line.startsWith("-")) {
      removed += 1;
    }
  }
  return { added, removed };
}

export function formatHunkRange(hunk: CodexNewDiffHunk, isChinese: boolean) {
  if (isChinese) {
    return `原文件第 ${hunk.beforeStart} 行起（${hunk.beforeLines} 行）→ 新内容第 ${hunk.afterStart} 行起（${hunk.afterLines} 行）`;
  }
  return `Original lines ${hunk.beforeStart}+ (${hunk.beforeLines} lines) → new lines ${hunk.afterStart}+ (${hunk.afterLines} lines)`;
}

export function formatHunkStats(hunk: CodexNewDiffHunk, isChinese: boolean) {
  const { added, removed } = summarizeHunkPreview(hunk);
  if (isChinese) {
    return `+${added} / -${removed} 行`;
  }
  return `+${added} / -${removed} lines`;
}

export function describeFileMergeImpact(
  file: CodexNewChangedFile,
  isChinese: boolean,
): string {
  if (file.accepted) {
    return isChinese ? "此文件已全部合并到原项目" : "Already fully merged into the project";
  }
  switch (file.status) {
    case "added":
      return isChinese
        ? "合并后：在原项目中新建此文件"
        : "After merge: create this new file in the project";
    case "deleted":
      return isChinese
        ? "合并后：从原项目中删除此文件"
        : "After merge: delete this file from the project";
    case "modified":
      return isChinese
        ? "合并后：用隔离副本中的修改覆盖原项目对应文件"
        : "After merge: apply isolated edits onto the project file";
    default:
      return "";
  }
}

export function describeFileRollbackImpact(
  file: CodexNewChangedFile,
  isChinese: boolean,
): string {
  switch (file.status) {
    case "added":
      return isChinese
        ? "回滚后：从原项目中移除本次新增的文件"
        : "After rollback: remove this newly added file from the project";
    case "deleted":
      return isChinese
        ? "回滚后：在原项目中恢复被删除的文件"
        : "After rollback: restore this deleted file in the project";
    case "modified":
      return isChinese
        ? "回滚后：把原项目文件恢复为合并前的版本"
        : "After rollback: restore the project file to its pre-merge version";
    default:
      return "";
  }
}

export function describeHunkMergeImpact(isChinese: boolean) {
  return isChinese
    ? "仅合并选中的代码段到原项目，其余修改仍留在隔离副本"
    : "Only the selected code block is merged into the project; other edits stay in the isolated copy";
}

export function describeHunkRollbackImpact(isChinese: boolean) {
  return isChinese
    ? "仅撤销选中的已合并代码段，原项目其余部分不变"
    : "Only undo the selected merged block; the rest of the project file stays as-is";
}
