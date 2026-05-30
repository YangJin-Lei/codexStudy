import { useCallback, useEffect, useMemo, useState } from "react";
import { useTauriEvent } from "@/features/app/hooks/useTauriEvent";
import { subscribeCodexNewFocusThread } from "@/services/events";
import type { CodexNewFocusThreadPayload } from "@/types";
import Shield from "lucide-react/dist/esm/icons/shield";
import { useI18n } from "@/i18n/I18nProvider";
import {
  applyCodexNewMemoryCandidatesBackend,
  listCodexNewMemoryCandidatesBackend,
  listCodexNewTracebackBackend,
  readCodexNewFilePreview,
  restoreCodexNewTracebackBackend,
  sendUserMessage,
} from "@/services/tauri";
import type { WorkspaceInfo } from "@/types";
import {
  focusCodexNewSession,
  mergeCodexNewChanges,
  refreshCodexNewChanges,
  rollbackCodexNewTask,
  runCodexNewReview,
  runCodexNewTest,
  setCodexNewState,
  writeCodexNewSummary,
} from "../state";
import type {
  CodexNewActiveTask,
  CodexNewCandidateMemoryRecord,
  CodexNewFilePreview,
  CodexNewHunkSelection,
  CodexNewProcessEntry,
  CodexNewThreadRegistryEntry,
  CodexNewTracebackEntry,
} from "../types";
import { useCodexNewState } from "../hooks/useCodexNewState";
import { consumeCodexNewTerminalDockRequest } from "../services/uiPreferences";
import {
  CodexNewProcessSessionNav,
  type CodexNewSessionSelectAction,
} from "./CodexNewProcessSessionNav";
import { requestCodexNewFocusThread } from "../services/navigation";
import { CodexNewTerminalDock } from "./CodexNewTerminalDock";
import { CodexNewDirectoryHierarchy } from "./CodexNewDirectoryHierarchy";
import { CodexNewDataPathsPanel } from "./CodexNewDataPathsPanel";
import { bucketChangedFiles } from "../utils/taskPhases";
import { CodexNewReviewTab } from "./CodexNewReviewTab";
import { CodexNewChangesTab } from "./CodexNewChangesTab";
import { CodexNewSummaryTab } from "./CodexNewSummaryTab";
import { CodexNewTimelineTab } from "./CodexNewTimelineTab";
import { CODEX_NEW_PROCESS_TAB_EVENT } from "../services/uiEvents";

type CodexNewProcessTab = "timeline" | "changes" | "review" | "summary";

type CodexNewProcessWindowProps = {
  initialTerminalDockOpen?: boolean;
};

function formatTime(timestamp: number) {
  if (!timestamp) {
    return "--";
  }
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function humanizeIdentifier(value: string | null | undefined) {
  if (!value) {
    return "--";
  }
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!spaced) {
    return "--";
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatReviewValue(task: CodexNewActiveTask | null, isChinese: boolean) {
  if (!task) {
    return "--";
  }
  if (!task.review) {
    return task.projectSettings.requireReview
      ? isChinese
        ? "需要审查"
        : "Review required"
      : isChinese
        ? "可选"
        : "Optional";
  }
  return humanizeIdentifier(task.review.disposition);
}

function formatRollbackValue(task: CodexNewActiveTask | null, isChinese: boolean) {
  if (!task) {
    return "--";
  }
  const accepted = task.changedFiles.filter((file) => file.accepted).length;
  if (accepted === 0) {
    return isChinese ? "还没有已合并文件" : "No merged files";
  }
  if (isChinese) {
    return `${accepted} 个文件可回滚`;
  }
  return `${accepted} reversible file${accepted === 1 ? "" : "s"}`;
}

function formatMemoryValue(task: CodexNewActiveTask | null, isChinese: boolean) {
  if (!task) {
    return "--";
  }
  if (!task.latestSummary) {
    return isChinese ? "未写入" : "Not written";
  }
  if (isChinese) {
    return `已总结 ${task.latestSummary.filesChanged.length} 个文件`;
  }
  return `${task.latestSummary.filesChanged.length} file${task.latestSummary.filesChanged.length === 1 ? "" : "s"} summarized`;
}

function buildDefaultSummaryResult(task: CodexNewActiveTask, isChinese: boolean) {
  const parts = [
    isChinese
      ? `已在隔离工作区准备好 ${task.diff.stats.changedFiles} 个变更文件。`
      : `Prepared ${task.diff.stats.changedFiles} changed file(s) in the isolated workspace.`,
  ];
  if (task.review?.summary) {
    parts.push(task.review.summary);
  }
  if (task.latestTest) {
    parts.push(
      task.latestTest.status === "succeeded"
        ? isChinese
          ? "最近一次测试已通过。"
          : "Latest test passed."
        : task.latestTest.status === "failed"
          ? task.latestTest.exitCode === null
            ? isChinese
              ? "最近一次测试失败。"
              : "Latest test failed."
            : isChinese
              ? `最近一次测试失败，退出码 ${task.latestTest.exitCode}。`
              : `Latest test failed with exit code ${task.latestTest.exitCode}.`
          : isChinese
            ? "最近一次测试仍在运行。"
            : "Latest test is still running.",
    );
  }
  return parts.join(" ");
}

function translateProcessKind(kind: CodexNewProcessEntry["kind"], isChinese: boolean) {
  if (!isChinese) {
    return humanizeIdentifier(kind);
  }
  switch (kind) {
    case "workspace":
      return "工作区";
    case "plan":
      return "计划";
    case "edit":
      return "编辑";
    case "review":
      return "审查";
    case "summary":
      return "总结";
    case "notice":
      return "提示";
    default:
      return kind;
  }
}

type PreviewCacheEntry =
  | { status: "loading" }
  | { status: "ready"; preview: CodexNewFilePreview }
  | { status: "error"; message: string };

type PendingAction =
  | "refresh"
  | "review"
  | "merge"
  | "rollback"
  | "traceback"
  | "memory"
  | "summary"
  | "test"
  | null;

type FeedbackState = {
  tone: "info" | "error" | "success";
  message: string;
} | null;

function filePreviewKey(entryId: string, path: string) {
  return `${entryId}:${path}`;
}

function diffToggleKey(path: string) {
  return `diff:${path}`;
}

function hasRedundantDetail(entry: CodexNewProcessEntry) {
  if (entry.files.length === 0) {
    return false;
  }
  const normalizedDetail = entry.detail.trim();
  if (!normalizedDetail) {
    return true;
  }
  const fileSummary = entry.files.map((file) => file.path).join(", ");
  return normalizedDetail === fileSummary;
}

function mergeablePathsForTask(task: CodexNewActiveTask | null) {
  if (!task) {
    return [];
  }
  return task.changedFiles.filter((file) => !file.accepted).map((file) => file.path);
}

function rollbackablePathsForTask(task: CodexNewActiveTask | null) {
  if (!task) {
    return [];
  }
  return task.changedFiles.filter((file) => file.accepted).map((file) => file.path);
}

function isSameHunkSelection(left: CodexNewHunkSelection, right: CodexNewHunkSelection) {
  return left.path === right.path && left.hunkIndex === right.hunkIndex;
}

function workspaceFromThreadEntry(entry: CodexNewThreadRegistryEntry): WorkspaceInfo {
  return {
    id: entry.workspaceId,
    name: entry.workspaceName,
    path: entry.originalRoot,
    connected: true,
    settings: { sidebarCollapsed: false },
  };
}

function formatMemoryStatus(status: CodexNewCandidateMemoryRecord["status"], isChinese: boolean) {
  switch (status) {
    case "pending":
      return isChinese ? "待采纳" : "Pending";
    case "same":
      return isChinese ? "已存在" : "Already stored";
    case "compatibleUpdate":
      return isChinese ? "可更新" : "Compatible update";
    case "conflict":
      return isChinese ? "冲突" : "Conflict";
    default:
      return humanizeIdentifier(status);
  }
}

export function CodexNewProcessWindow({
  initialTerminalDockOpen = false,
}: CodexNewProcessWindowProps) {
  const { t, resolvedLanguage } = useI18n();
  const isChinese = resolvedLanguage === "zh-CN";
  const state = useCodexNewState();
  const [activeTab, setActiveTab] = useState<CodexNewProcessTab>("timeline");
  const [terminalDockOpen, setTerminalDockOpen] = useState(initialTerminalDockOpen);
  const activeSession = state.activeSession;
  const activeTask = state.activeTask;
  const activeThreadRegistryEntry = activeSession?.threadId
    ? state.threadRegistry[activeSession.threadId] ?? null
    : null;
  const workspaceSessions = useMemo(() => {
    if (!activeSession?.workspaceId) {
      return [];
    }
    return Object.values(state.threadRegistry).filter(
      (entry) => entry.workspaceId === activeSession.workspaceId,
    );
  }, [activeSession?.workspaceId, state.threadRegistry]);
  useTauriEvent(subscribeCodexNewFocusThread, (payload: CodexNewFocusThreadPayload) => {
    if (payload.processTab) {
      setActiveTab(payload.processTab);
    }
  });

  useEffect(() => {
    const onProcessTab = (event: Event) => {
      const tab = (event as CustomEvent<{ tab?: CodexNewProcessTab }>).detail?.tab;
      if (tab) {
        setActiveTab(tab);
      }
    };
    window.addEventListener(CODEX_NEW_PROCESS_TAB_EVENT, onProcessTab);
    return () => window.removeEventListener(CODEX_NEW_PROCESS_TAB_EVENT, onProcessTab);
  }, []);

  const handleSelectProcessThread = useCallback(
    async (threadId: string, action: CodexNewSessionSelectAction = "timeline") => {
      const entry = state.threadRegistry[threadId];
      if (!entry) {
        return;
      }
      const processTab = action === "chat" ? "timeline" : action;
      setActiveTab(processTab);
      await requestCodexNewFocusThread({
        workspaceId: entry.workspaceId,
        threadId,
        processTab,
      });
      await focusCodexNewSession(
        workspaceFromThreadEntry(entry),
        threadId,
        entry.threadTitle,
      );
      setActiveTab(action === "chat" ? "timeline" : action);
    },
    [state.threadRegistry],
  );
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [, setExpandedDiffs] = useState<Record<string, boolean>>({});
  const [previewCache, setPreviewCache] = useState<Record<string, PreviewCacheEntry>>({});
  const [selectedMergePaths, setSelectedMergePaths] = useState<string[]>([]);
  const [selectedMergeHunks, setSelectedMergeHunks] = useState<CodexNewHunkSelection[]>([]);
  const [selectedRollbackPaths, setSelectedRollbackPaths] = useState<string[]>([]);
  const [selectedRollbackHunks, setSelectedRollbackHunks] = useState<CodexNewHunkSelection[]>([]);
  const [tracebackEntries, setTracebackEntries] = useState<CodexNewTracebackEntry[]>([]);
  const [memoryCandidates, setMemoryCandidates] = useState<CodexNewCandidateMemoryRecord[]>([]);
  const [summaryGoalDraft, setSummaryGoalDraft] = useState("");
  const [summaryResultDraft, setSummaryResultDraft] = useState("");
  const [testCommandDraft, setTestCommandDraft] = useState("");
  const [draftTaskId, setDraftTaskId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  useEffect(() => {
    if (consumeCodexNewTerminalDockRequest()) {
      setTerminalDockOpen(true);
    }
  }, []);

  useEffect(() => {
    setExpandedFiles({});
    setExpandedDiffs({});
    setPreviewCache({});
    setFeedback(null);
    setSelectedMergeHunks([]);
    setSelectedRollbackPaths([]);
    setSelectedRollbackHunks([]);
  }, [activeSession?.workspaceId, activeTask?.taskId]);

  useEffect(() => {
    if (!activeTask) {
      setDraftTaskId(null);
      setSummaryGoalDraft("");
      setSummaryResultDraft("");
      setTestCommandDraft("");
      return;
    }
    if (draftTaskId !== activeTask.taskId) {
      setDraftTaskId(activeTask.taskId);
      setSummaryGoalDraft(activeTask.latestSummary?.userGoal ?? activeTask.title);
      setSummaryResultDraft(
        activeTask.latestSummary?.aiResult ?? buildDefaultSummaryResult(activeTask, isChinese),
      );
      const suggested =
        activeTask.suggestedTestCommands[0] ??
        activeTask.projectSettings.defaultTestCommands[0] ??
        "";
      setTestCommandDraft(suggested);
    }
  }, [activeTask, draftTaskId, isChinese]);

  const changeBuckets = useMemo(
    () =>
      activeTask
        ? bucketChangedFiles(activeTask.changedFiles)
        : { pendingMerge: [], merged: [] },
    [activeTask],
  );
  const mergeablePaths = useMemo(() => mergeablePathsForTask(activeTask), [activeTask]);
  const rollbackablePaths = useMemo(() => rollbackablePathsForTask(activeTask), [activeTask]);
  const mergeableSignature = mergeablePaths.join("\n");
  const rollbackableSignature = rollbackablePaths.join("\n");
  const selectedHunkCount = selectedMergeHunks.length;
  const selectedFileCount = selectedMergePaths.length;
  const selectedRollbackHunkCount = selectedRollbackHunks.length;
  const selectedRollbackFileCount = selectedRollbackPaths.length;
  const hasMergeSelection = selectedHunkCount > 0 || selectedFileCount > 0;
  const hasRollbackSelection = selectedRollbackHunkCount > 0 || selectedRollbackFileCount > 0;

  useEffect(() => {
    setSelectedMergePaths((current) =>
      current.filter((path) => mergeablePaths.includes(path)),
    );
  }, [activeTask?.taskId, mergeableSignature, mergeablePaths]);

  useEffect(() => {
    setSelectedRollbackPaths((current) =>
      current.filter((path) => rollbackablePaths.includes(path)),
    );
    setSelectedRollbackHunks((current) =>
      current.filter((entry) => rollbackablePaths.includes(entry.path)),
    );
  }, [activeTask?.taskId, rollbackableSignature, rollbackablePaths]);

  useEffect(() => {
    if (!activeSession?.workspaceId) {
      setTracebackEntries([]);
      setMemoryCandidates([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [traceback, candidates] = await Promise.all([
          listCodexNewTracebackBackend(activeSession.workspaceId),
          listCodexNewMemoryCandidatesBackend(activeSession.workspaceId),
        ]);
        if (!cancelled) {
          setTracebackEntries(traceback);
          setMemoryCandidates(candidates);
        }
      } catch {
        if (!cancelled) {
          setTracebackEntries([]);
          setMemoryCandidates([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSession?.workspaceId, activeTask?.taskId, state.lastUpdatedAt]);

  const reviewRequired = activeTask?.projectSettings.requireReview ?? false;
  const testsRequired = activeTask?.projectSettings.requireTests ?? false;
  const reviewMissing = reviewRequired && !activeTask?.review;
  const reviewBlocked = activeTask?.review?.disposition === "blocked";
  const testsBlocked = testsRequired && !activeTask?.hasPassingTest;
  const mergeBlockedReason = !activeTask
    ? isChinese
      ? "当前没有活动任务。"
      : "No active task."
    : reviewMissing
      ? isChinese
        ? "合并前先运行审查。"
        : "Run review before merging."
      : reviewBlocked
        ? activeTask.review?.summary || (isChinese ? "审查阻止了这次合并。" : "Review is blocked.")
        : testsBlocked
          ? isChinese
            ? "合并前必须有一次通过的测试。"
            : "A passing test run is required before merge."
          : null;

  const handleToggleFile = useCallback(
    async (entryId: string, path: string) => {
      const key = filePreviewKey(entryId, path);
      const isOpen = expandedFiles[key];
      setExpandedFiles((current) => ({
        ...current,
        [key]: !isOpen,
      }));
      if (
        isOpen ||
        previewCache[key]?.status === "ready" ||
        previewCache[key]?.status === "loading" ||
        !activeSession?.workspaceId
      ) {
        return;
      }
      setPreviewCache((current) => ({
        ...current,
        [key]: { status: "loading" },
      }));
      try {
        const preview = await readCodexNewFilePreview(activeSession.workspaceId, path);
        setPreviewCache((current) => ({
          ...current,
          [key]: { status: "ready", preview },
        }));
      } catch (error) {
        setPreviewCache((current) => ({
          ...current,
          [key]: {
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : t("codexNew.window.previewFailed", "Preview unavailable."),
          },
        }));
      }
    },
    [activeSession?.workspaceId, expandedFiles, previewCache, t],
  );

  const toggleDiff = useCallback((path: string) => {
    const key = diffToggleKey(path);
    setExpandedDiffs((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  const toggleMergePath = useCallback((path: string) => {
    setSelectedMergePaths((current) => {
      const next = current.includes(path)
        ? current.filter((entry) => entry !== path)
        : [...current, path];
      if (!current.includes(path)) {
        setSelectedMergeHunks((hunks) => hunks.filter((hunk) => hunk.path !== path));
      }
      return next;
    });
  }, []);

  const toggleMergeHunk = useCallback((path: string, hunkIndex: number) => {
    const nextSelection = { path, hunkIndex };
    setSelectedMergeHunks((current) => {
      const exists = current.some((entry) => isSameHunkSelection(entry, nextSelection));
      return exists
        ? current.filter((entry) => !isSameHunkSelection(entry, nextSelection))
        : [...current, nextSelection];
    });
    setSelectedMergePaths((current) => current.filter((entry) => entry !== path));
  }, []);

  const toggleRollbackPath = useCallback((path: string) => {
    setSelectedRollbackPaths((current) => {
      const next = current.includes(path)
        ? current.filter((entry) => entry !== path)
        : [...current, path];
      if (!current.includes(path)) {
        setSelectedRollbackHunks((hunks) => hunks.filter((hunk) => hunk.path !== path));
      }
      return next;
    });
  }, []);

  const toggleRollbackHunk = useCallback((path: string, hunkIndex: number) => {
    const nextSelection = { path, hunkIndex };
    setSelectedRollbackHunks((current) => {
      const exists = current.some((entry) => isSameHunkSelection(entry, nextSelection));
      return exists
        ? current.filter((entry) => !isSameHunkSelection(entry, nextSelection))
        : [...current, nextSelection];
    });
    setSelectedRollbackPaths((current) => current.filter((entry) => entry !== path));
  }, []);

  const runAction = useCallback(
    async (
      action: PendingAction,
      work: () => Promise<unknown>,
      successMessage: string,
      onSuccess?: () => void,
    ) => {
      setPendingAction(action);
      setFeedback(null);
      try {
        await work();
        onSuccess?.();
        setFeedback({ tone: "info", message: successMessage });
      } catch (error) {
        setFeedback({
          tone: "error",
          message:
            error instanceof Error ? error.message : t("codexNew.window.commandUnavailable", "Command unavailable"),
        });
      } finally {
        setPendingAction(null);
      }
    },
    [t],
  );

  const handleRefresh = useCallback(async () => {
    if (!activeSession) {
      return;
    }
    await runAction(
      "refresh",
      () => refreshCodexNewChanges(activeSession.workspaceId),
      isChinese ? "任务视图已刷新。" : "Task view refreshed.",
    );
  }, [activeSession, isChinese, runAction]);

  const handleReview = useCallback(async () => {
    if (!activeSession) {
      return;
    }
    await runAction(
      "review",
      () => runCodexNewReview(activeSession.workspaceId),
      isChinese ? "审查已完成。" : "Review completed.",
    );
  }, [activeSession, isChinese, runAction]);

  const handleMerge = useCallback(async () => {
    if (!activeSession || !hasMergeSelection) {
      setFeedback({
        tone: "error",
        message: isChinese
          ? "至少选择一个尚未合并的文件或 diff hunk。"
          : "Select at least one unmerged file or diff hunk.",
      });
      return;
    }
    await runAction(
      "merge",
      () =>
        mergeCodexNewChanges(
          activeSession.workspaceId,
          selectedHunkCount > 0
            ? { hunks: selectedMergeHunks }
            : { paths: selectedMergePaths },
        ),
      selectedHunkCount > 0
        ? isChinese
          ? `已合并 ${selectedHunkCount} 个代码段，已移至「已合并」阶段。`
          : `Merged ${selectedHunkCount} block(s). They now appear under Merged.`
        : isChinese
          ? `已合并 ${selectedFileCount} 个文件，已移至「已合并」阶段。`
          : `Merged ${selectedFileCount} file(s). They now appear under Merged.`,
      () => {
        setSelectedMergePaths([]);
        setSelectedMergeHunks([]);
      },
    );
  }, [
    activeSession,
    hasMergeSelection,
    isChinese,
    runAction,
    selectedFileCount,
    selectedHunkCount,
    selectedMergeHunks,
    selectedMergePaths,
  ]);

  const reloadTaskExtras = useCallback(async (workspaceId: string) => {
    const [traceback, candidates] = await Promise.all([
      listCodexNewTracebackBackend(workspaceId),
      listCodexNewMemoryCandidatesBackend(workspaceId),
    ]);
    setTracebackEntries(traceback);
    setMemoryCandidates(candidates);
  }, []);

  const handleTracebackRestore = useCallback(
    async (path: string, target: "project" | "workspace") => {
      if (!activeSession) {
        return;
      }
      await runAction(
        "traceback",
        async () => {
          const next = await restoreCodexNewTracebackBackend(
            activeSession.workspaceId,
            path,
            target,
          );
          await setCodexNewState(next);
          await reloadTaskExtras(activeSession.workspaceId);
        },
        target === "project"
          ? isChinese
            ? `已把 ${path} 恢复到原项目快照。`
            : `Restored ${path} on the original project.`
          : isChinese
            ? `已把 ${path} 重置为隔离区快照。`
            : `Reset ${path} in the isolated workspace.`,
      );
    },
    [activeSession, isChinese, reloadTaskExtras, runAction],
  );

  const handleApplyMemory = useCallback(
    async (candidateId: string) => {
      if (!activeSession) {
        return;
      }
      await runAction(
        "memory",
        async () => {
          const outcome = await applyCodexNewMemoryCandidatesBackend(activeSession.workspaceId, [
            candidateId,
          ]);
          await reloadTaskExtras(activeSession.workspaceId);
          if (outcome.conflicts.length > 0) {
            throw new Error(
              isChinese
                ? `记忆冲突：${outcome.conflicts.join(", ")}`
                : `Memory conflict: ${outcome.conflicts.join(", ")}`,
            );
          }
          if (outcome.applied.length === 0) {
            throw new Error(
              isChinese ? "这条候选记忆没有被采纳。" : "This memory candidate was not applied.",
            );
          }
        },
        isChinese ? "候选记忆已写入项目记忆。" : "Candidate memory applied to project memory.",
      );
    },
    [activeSession, isChinese, reloadTaskExtras, runAction],
  );

  const handleRollback = useCallback(async () => {
    if (!activeSession || !hasRollbackSelection) {
      setFeedback({
        tone: "error",
        message: isChinese
          ? "至少选择一个已合并的文件或 diff hunk。"
          : "Select at least one merged file or diff hunk.",
      });
      return;
    }
    await runAction(
      "rollback",
      () =>
        rollbackCodexNewTask(
          activeSession.workspaceId,
          selectedRollbackHunkCount > 0
            ? { hunks: selectedRollbackHunks }
            : { paths: selectedRollbackPaths },
        ),
      selectedRollbackHunkCount > 0
        ? isChinese
          ? `已回滚 ${selectedRollbackHunkCount} 个代码段，已从「已合并」移除。`
          : `Rolled back ${selectedRollbackHunkCount} block(s). They left the Merged section.`
        : isChinese
          ? `已回滚 ${selectedRollbackFileCount} 个文件，已回到「待合并」阶段。`
          : `Rolled back ${selectedRollbackFileCount} file(s). They are back under Pending merge.`,
      () => {
        setSelectedRollbackPaths([]);
        setSelectedRollbackHunks([]);
      },
    );
  }, [
    activeSession,
    hasRollbackSelection,
    isChinese,
    runAction,
    selectedRollbackFileCount,
    selectedRollbackHunkCount,
    selectedRollbackHunks,
    selectedRollbackPaths,
  ]);

  const handleWriteSummary = useCallback(async () => {
    if (!activeSession || !activeTask) {
      return;
    }
    await runAction(
      "summary",
      () => writeCodexNewSummary(activeSession.workspaceId, summaryGoalDraft, summaryResultDraft),
      isChinese ? "任务总结已写入。" : "Task summary written.",
    );
  }, [activeSession, activeTask, isChinese, runAction, summaryGoalDraft, summaryResultDraft]);

  const handleRunTest = useCallback(async () => {
    if (!activeSession || !testCommandDraft.trim()) {
      setFeedback({
        tone: "error",
        message: isChinese ? "运行测试前先输入测试命令。" : "Enter a test command before running tests.",
      });
      return;
    }
    await runAction(
      "test",
      () => runCodexNewTest(activeSession.workspaceId, testCommandDraft),
      isChinese ? "测试已执行完成。" : "Test run finished.",
    );
  }, [activeSession, isChinese, runAction, testCommandDraft]);

  const handleAskTestCommand = useCallback(async () => {
    if (!activeSession) {
      return;
    }
    if (!activeSession.threadId) {
      setFeedback({
        tone: "error",
        message: t(
          "codexNew.window.askTestCommandNoThread",
          "Open a chat thread in this workspace before asking the AI.",
        ),
      });
      return;
    }
    const originalRoot = activeTask?.originalRoot ?? activeSession.workspacePath;
    const workspaceRoot = activeTask?.workspaceRoot ?? activeSession.workspacePath;
    const prompt = isChinese
      ? `当前任务在隔离工作区开发（路径：${workspaceRoot}）。原始项目在：${originalRoot}。请根据**原始项目**的包管理器、脚本和语言环境，告诉我应在此隔离工作区运行的测试命令。只回复一条可直接复制执行的 shell 命令，不要解释。`
      : `This task runs in an isolated workspace (${workspaceRoot}). The original project is at ${originalRoot}. Based on the **original** project's package manager, scripts, and language setup, what single shell command should I run to execute tests here? Reply with one copy-pasteable command only, no explanation.`;
    try {
      await sendUserMessage(activeSession.workspaceId, activeSession.threadId, prompt);
      setFeedback({
        tone: "success",
        message: t(
          "codexNew.window.askTestCommandSent",
          "Sent to the active chat — check the reply for a copy-pasteable command.",
        ),
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [activeSession, activeTask, isChinese, t]);

  const processTabs: { id: CodexNewProcessTab; label: string }[] = [
    { id: "timeline", label: t("codexNew.window.tabTimeline", "Timeline") },
    { id: "changes", label: t("codexNew.window.tabChanges", "Changes & merge") },
    { id: "review", label: t("codexNew.window.tabReview", "Review & tests") },
    { id: "summary", label: t("codexNew.window.tabSummary", "Summary & memory") },
  ];

  return (
    <main className="codex-new-window codex-new-window-shell">
      <div className="codex-new-window-body">
      <header className="codex-new-window-header">
        <div>
          <div className="codex-new-window-eyebrow">{t("codexNew.window.processEyebrow", "codex-new workbench")}</div>
          <h1 className="codex-new-window-title">{t("codexNew.processWindow.title", "AI coding process")}</h1>
          <p className="codex-new-window-subtitle">
            {activeTask
              ? isChinese
                ? "审查、选择性合并、回滚和任务记忆现在都已经接到当前隔离任务上了。"
                : "Review, selective merge, rollback, and task memory are now wired to the active isolated task."
              : t(
                  "codexNew.window.awaitingBackend",
                  "The desktop workbench is ready. Hook backend task events here to stream plan, edits, review, and summary updates.",
                )}
          </p>
        </div>
        <span className={`codex-new-window-badge${activeSession ? " is-active" : ""}`}>
          <Shield size={13} aria-hidden />
          {activeSession ? t("codexNew.active", "Active") : t("codexNew.inactive", "Inactive")}
        </span>
      </header>

      <section className="codex-new-window-summary-grid">
        <article className="codex-new-window-summary-card">
          <div className="codex-new-window-summary-label">{t("codexNew.window.workspace", "Workspace")}</div>
          <div className="codex-new-window-summary-value">
            {activeSession?.workspaceName ?? t("codexNew.status.awaitingSession", "No armed workspace")}
          </div>
        </article>
        <article className="codex-new-window-summary-card">
          <div className="codex-new-window-summary-label">{isChinese ? "任务" : "Task"}</div>
          <div className="codex-new-window-summary-value">{humanizeIdentifier(activeTask?.status)}</div>
        </article>
        <article className="codex-new-window-summary-card">
          <div className="codex-new-window-summary-label">{t("codexNew.window.review", "Review")}</div>
          <div className="codex-new-window-summary-value">{formatReviewValue(activeTask, isChinese)}</div>
        </article>
        <article className="codex-new-window-summary-card">
          <div className="codex-new-window-summary-label">{t("codexNew.window.rollback", "Rollback")}</div>
          <div className="codex-new-window-summary-value">{formatRollbackValue(activeTask, isChinese)}</div>
        </article>
        <article className="codex-new-window-summary-card">
          <div className="codex-new-window-summary-label">{t("codexNew.window.memory", "Memory")}</div>
          <div className="codex-new-window-summary-value">{formatMemoryValue(activeTask, isChinese)}</div>
        </article>
      </section>

      {activeTask ? (
        <section className="codex-new-window-panel">
          <CodexNewDirectoryHierarchy
            isChinese={isChinese}
            title={isChinese ? "项目与克隆目录" : "Project and clone folders"}
            roots={[
              {
                id: "window-project",
                role: "project",
                label: isChinese ? "原项目" : "Original project",
                path: activeTask.originalRoot,
              },
              {
                id: "window-clone",
                role: "clone",
                label: isChinese ? "隔离克隆（AI / 测试）" : "Isolated clone (AI / tests)",
                path: activeTask.workspaceRoot,
              },
            ]}
          />
          <CodexNewDataPathsPanel
            isChinese={isChinese}
            dataPaths={state.dataPaths}
            localFolderName={activeThreadRegistryEntry?.localFolderName}
            isolatedRoot={activeThreadRegistryEntry?.isolatedRoot}
          />
        </section>
      ) : null}

      {activeTask?.environmentSummary ? (
        <p className="codex-new-window-environment-note" title={t("codexNew.window.environmentHelp", "")}>
          <span className="codex-new-window-environment-label">
            {t("codexNew.window.environment", "Environment")}:
          </span>{" "}
          {activeTask.environmentSummary}
        </p>
      ) : null}

      {feedback ? (
        <div className={`codex-new-window-feedback is-${feedback.tone}`}>{feedback.message}</div>
      ) : null}

      <div className="codex-new-window-layout">
        <CodexNewProcessSessionNav
          workspaceName={activeSession?.workspaceName ?? t("codexNew.status.awaitingSession", "No armed workspace")}
          sessions={workspaceSessions}
          activeThreadId={activeSession?.threadId ?? null}
          isChinese={isChinese}
          onSelectThread={(threadId) => void handleSelectProcessThread(threadId)}
        />
        <div className="codex-new-window-main">
      <nav className="codex-new-window-tabs" aria-label={t("codexNew.window.tabs", "Process sections")}>
        {processTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`codex-new-window-tab${activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="codex-new-window-tab-panel">
      {activeTab === "review" ? (
        <CodexNewReviewTab
          isChinese={isChinese}
          activeSession={activeSession}
          activeTask={activeTask}
          pendingAction={pendingAction}
          mergeBlockedReason={mergeBlockedReason}
          reviewRequired={reviewRequired}
          testsRequired={testsRequired}
          handleRefresh={handleRefresh}
          handleReview={handleReview}
          humanizeIdentifier={humanizeIdentifier}
          testCommandDraft={testCommandDraft}
          setTestCommandDraft={setTestCommandDraft}
          handleRunTest={handleRunTest}
          handleAskTestCommand={handleAskTestCommand}
        />
      ) : null}

      {activeTab === "changes" ? (
        <CodexNewChangesTab
          isChinese={isChinese}
          activeSession={activeSession}
          activeTask={activeTask}
          pendingAction={pendingAction}
          hasPendingMerge={changeBuckets.pendingMerge.length > 0}
          hasMerged={changeBuckets.merged.length > 0}
          toggleDiff={toggleDiff}
          selectedMergePaths={selectedMergePaths}
          selectedMergeHunks={selectedMergeHunks}
          toggleMergePath={toggleMergePath}
          toggleMergeHunk={toggleMergeHunk}
          handleMerge={handleMerge}
          mergeBlockedReason={mergeBlockedReason}
          selectedRollbackPaths={selectedRollbackPaths}
          selectedRollbackHunks={selectedRollbackHunks}
          toggleRollbackPath={toggleRollbackPath}
          toggleRollbackHunk={toggleRollbackHunk}
          handleRollback={handleRollback}
          tracebackEntries={tracebackEntries}
          formatTime={formatTime}
          handleTracebackRestore={handleTracebackRestore}
        />
      ) : null}

      {activeTab === "summary" ? (
        <CodexNewSummaryTab
          isChinese={isChinese}
          activeSession={activeSession}
          activeTask={activeTask}
          pendingAction={pendingAction}
          summaryGoalDraft={summaryGoalDraft}
          setSummaryGoalDraft={setSummaryGoalDraft}
          summaryResultDraft={summaryResultDraft}
          setSummaryResultDraft={setSummaryResultDraft}
          handleWriteSummary={handleWriteSummary}
          memoryCandidates={memoryCandidates}
          handleApplyMemory={handleApplyMemory}
          formatMemoryStatus={formatMemoryStatus}
        />
      ) : null}

      {activeTab === "timeline" ? (
        <CodexNewTimelineTab
          isChinese={isChinese}
          activeSession={activeSession}
          securityMode={true}
          taskPrompt={
            activeTask?.latestSummary?.userGoal ?? activeTask?.title ?? undefined
          }
          processEntries={state.processEntries}
          expandedFiles={expandedFiles}
          previewCache={previewCache}
          onToggleFile={handleToggleFile}
          filePreviewKey={filePreviewKey}
          hasRedundantDetail={hasRedundantDetail}
          translateProcessKind={translateProcessKind}
          formatTime={formatTime}
        />
      ) : null}
      </div>
        </div>
      </div>

      <CodexNewTerminalDock
        open={terminalDockOpen}
        onToggle={() => setTerminalDockOpen((current) => !current)}
        runs={state.terminalRuns}
      />
      </div>
    </main>
  );
}
