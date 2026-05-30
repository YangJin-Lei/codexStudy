import type { CodexNewActiveTask } from "../types";

export type CodexNewMergeGateReason =
  | { kind: "noTask" }
  | { kind: "reviewMissing" }
  | { kind: "reviewBlocked"; summary: string | null }
  | { kind: "testsBlocked" };

export function getCodexNewMergeGateReason(
  task: CodexNewActiveTask | null,
): CodexNewMergeGateReason | null {
  if (!task) {
    return { kind: "noTask" };
  }

  const reviewRequired = task.projectSettings.requireReview;
  const testsRequired = task.projectSettings.requireTests;
  const reviewMissing = reviewRequired && !task.review;
  const reviewBlocked = task.review?.disposition === "blocked";
  const testsBlocked = testsRequired && !task.hasPassingTest;

  if (reviewMissing) {
    return { kind: "reviewMissing" };
  }
  if (reviewBlocked) {
    return { kind: "reviewBlocked", summary: task.review?.summary ?? null };
  }
  if (testsBlocked) {
    return { kind: "testsBlocked" };
  }

  return null;
}

export function isCodexNewReviewRequired(task: CodexNewActiveTask | null): boolean {
  return task?.projectSettings.requireReview ?? false;
}

export function isCodexNewTestsRequired(task: CodexNewActiveTask | null): boolean {
  return task?.projectSettings.requireTests ?? false;
}
