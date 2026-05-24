import { useCallback, useEffect, useMemo, useState } from "react";
import { useTauriEvent } from "@/features/app/hooks/useTauriEvent";
import { subscribeCodexNewFocusThread } from "@/services/events";
import type { CodexNewFocusThreadPayload } from "@/types";
import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle";
import CheckCheck from "lucide-react/dist/esm/icons/check-check";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import ClipboardList from "lucide-react/dist/esm/icons/clipboard-list";
import FileText from "lucide-react/dist/esm/icons/file-text";
import History from "lucide-react/dist/esm/icons/history";
import Play from "lucide-react/dist/esm/icons/play";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import Shield from "lucide-react/dist/esm/icons/shield";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import Workflow from "lucide-react/dist/esm/icons/workflow";
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
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({});
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

  const diffFilesByPath = useMemo(
    () => new Map((activeTask?.diff.files ?? []).map((file) => [file.path, file])),
    [activeTask?.diff.files],
  );

  const acceptedCount = activeTask?.changedFiles.filter((file) => file.accepted).length ?? 0;
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

  const isHunkSelected = useCallback(
    (path: string, hunkIndex: number) =>
      selectedMergeHunks.some(
        (entry) => entry.path === path && entry.hunkIndex === hunkIndex,
      ),
    [selectedMergeHunks],
  );

  const runAction = useCallback(
    async (action: PendingAction, work: () => Promise<unknown>, successMessage: string) => {
      setPendingAction(action);
      setFeedback(null);
      try {
        await work();
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
          ? `已合并 ${selectedHunkCount} 个 hunk。`
          : `Merged ${selectedHunkCount} hunk(s).`
        : isChinese
          ? `已合并 ${selectedFileCount} 个文件。`
          : `Merged ${selectedFileCount} file(s).`,
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
          ? `已回滚 ${selectedRollbackHunkCount} 个 hunk。`
          : `Rolled back ${selectedRollbackHunkCount} hunk(s).`
        : isChinese
          ? `已回滚 ${selectedRollbackFileCount} 个文件。`
          : `Rolled back ${selectedRollbackFileCount} file(s).`,
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
        <p className="codex-new-window-environment-note">
          <span className="codex-new-window-environment-label">
            {isChinese ? "路径" : "Paths"}:
          </span>{" "}
          {isChinese ? "原项目" : "Project"}{" "}
          <code className="codex-new-window-path-inline">{activeTask.originalRoot}</code>
          {" · "}
          {isChinese ? "隔离副本（AI / 测试在此执行）" : "Isolated copy (AI + tests run here)"}{" "}
          <code className="codex-new-window-path-inline">{activeTask.workspaceRoot}</code>
        </p>
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
      <section className="codex-new-window-panel">
        <div className="codex-new-window-section-title">
          <ClipboardList size={14} aria-hidden />
          {isChinese ? "审查门禁" : "Review Gate"}
        </div>
        <div className="codex-new-window-action-row">
          <button
            type="button"
            className="codex-new-mini-button"
            onClick={() => void handleRefresh()}
            disabled={!activeSession || pendingAction !== null}
          >
            <RefreshCw size={13} aria-hidden />
            {isChinese ? "刷新" : "Refresh"}
          </button>
          <button
            type="button"
            className="codex-new-mini-button"
            onClick={() => void handleReview()}
            disabled={!activeSession || pendingAction !== null}
          >
            <ClipboardList size={13} aria-hidden />
            {isChinese ? "运行审查" : "Run review"}
          </button>
        </div>

        <div className="codex-new-window-note-list">
          <div className={`codex-new-window-note${mergeBlockedReason ? " is-warning" : ""}`}>
            <AlertTriangle size={14} aria-hidden />
            <span>
              {mergeBlockedReason ??
                (activeTask?.review?.disposition === "needsUserApproval"
                  ? isChinese
                    ? "审查已经通过策略检查，正在等待你决定是否合并。"
                    : "Review passed the policy checks and is waiting for your merge decision."
                  : isChinese
                    ? "合并门禁已放行，选中文件后就可以合并。"
                    : "Merge gate is clear. Select files and merge when ready.")}
            </span>
          </div>
          <div className="codex-new-window-note">
            <Shield size={14} aria-hidden />
            <span>
              {reviewRequired
                ? isChinese
                  ? "需要审查。"
                  : "Review is required."
                : isChinese
                  ? "审查可选。"
                  : "Review is optional."}{" "}
              {testsRequired
                ? activeTask?.hasPassingTest
                  ? isChinese
                    ? "已经记录了一次通过的测试。"
                    : "A passing test run is already recorded."
                  : isChinese
                    ? "合并前必须有一次通过的测试。"
                    : "A passing test run is required before merge."
                : isChinese
                  ? "这个任务里的测试目前只是建议项。"
                  : "Tests are advisory for this task."}
            </span>
          </div>
        </div>

        {activeTask?.review ? (
          <div className="codex-new-window-review-shell">
            <div className="codex-new-window-review-summary">{activeTask.review.summary}</div>
            <div className="codex-new-window-issue-list">
              {activeTask.review.issues.map((issue, index) => (
                <div key={`${issue.path ?? "global"}-${index}`} className={`codex-new-window-issue is-${issue.severity}`}>
                  <div className="codex-new-window-issue-title">
                    {humanizeIdentifier(issue.severity)}
                    {issue.path ? ` - ${issue.path}` : ""}
                  </div>
                  <div className="codex-new-window-issue-detail">{issue.message}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <p className="codex-new-window-field-hint">
          {t(
            "codexNew.window.testCommandHint",
            "Examples: pnpm test, npm test, cargo test, pytest. Use the button to ask the active chat.",
          )}
        </p>
        <div className="codex-new-window-inline-form">
          <label className="codex-new-window-field">
            <span className="codex-new-window-field-label">{isChinese ? "测试命令" : "Test command"}</span>
            <input
              className="codex-new-window-input"
              value={testCommandDraft}
              onChange={(event) => setTestCommandDraft(event.target.value)}
              placeholder={t("codexNew.window.testCommandPlaceholder", "e.g. pnpm test")}
            />
          </label>
          <button
            type="button"
            className="codex-new-mini-button"
            onClick={() => void handleAskTestCommand()}
            disabled={!activeSession || pendingAction !== null}
          >
            <Sparkles size={13} aria-hidden />
            {t("codexNew.window.askTestCommand", "Ask AI for test command")}
          </button>
          <button
            type="button"
            className="codex-new-mini-button"
            onClick={() => void handleRunTest()}
            disabled={!activeSession || pendingAction !== null}
          >
            <Play size={13} aria-hidden />
            {isChinese ? "运行测试" : "Run test"}
          </button>
        </div>
        {activeTask?.suggestedTestCommands.length ? (
          <div className="codex-new-window-chip-row">
            {activeTask.suggestedTestCommands.map((command) => (
              <button
                key={command}
                type="button"
                className={`codex-new-window-chip${testCommandDraft === command ? " is-active" : ""}`}
                onClick={() => setTestCommandDraft(command)}
              >
                {command}
              </button>
            ))}
          </div>
        ) : null}
        {activeTask?.latestTest ? (
          <div className="codex-new-window-test-result">
            <div className="codex-new-window-test-meta">
              {isChinese ? "最近测试：" : "Latest test: "}{" "}
              {humanizeIdentifier(activeTask.latestTest.status)}
              {activeTask.latestTest.exitCode !== null
                ? ` (exit ${activeTask.latestTest.exitCode})`
                : ""}
              {" — "}
              {activeTask.latestTest.command}
            </div>
            {activeTask.latestTest.failureSummary ? (
              <pre className="codex-new-window-test-output">
                {activeTask.latestTest.failureSummary}
              </pre>
            ) : null}
            {activeTask.latestTest.stderrExcerpt ? (
              <pre className="codex-new-window-test-output">
                {activeTask.latestTest.stderrExcerpt}
              </pre>
            ) : null}
            {!activeTask.latestTest.stderrExcerpt && activeTask.latestTest.stdoutExcerpt ? (
              <pre className="codex-new-window-test-output">
                {activeTask.latestTest.stdoutExcerpt}
              </pre>
            ) : null}
            {!activeTask.latestTest.failureSummary &&
            !activeTask.latestTest.stderrExcerpt &&
            !activeTask.latestTest.stdoutExcerpt ? (
              <div className="codex-new-window-test-output-note">
                {isChinese
                  ? "命令已结束但没有捕获到输出（常见于 Windows 上 Python 把报错打到 stdout，或进程瞬间退出）。可点「运行测试」重试，或到终端标签查看。"
                  : "The command finished without captured output. Retry Run test or check the Terminal tab."}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      ) : null}

      {activeTab === "changes" ? (
      <>
      <section className="codex-new-window-panel">
        <div className="codex-new-window-section-title">
          <CheckCheck size={14} aria-hidden />
          {isChinese ? "变更与合并" : "Changes & merge"}
        </div>
        {activeTask?.workspaceRoot ? (
          <div className="codex-new-window-note">
            <Shield size={14} aria-hidden />
            <span>
              {isChinese ? "隔离克隆目录：" : "Isolated clone: "}
              <code className="codex-new-window-path-inline">{activeTask.workspaceRoot}</code>
            </span>
          </div>
        ) : null}
        <div className="codex-new-window-note">
          <RotateCcw size={14} aria-hidden />
          <span>
            {isChinese
              ? "片段回滚测试：先展开 diff → 只勾选要撤销的 hunk（不要勾整文件）→「回滚所选」。整文件合并过的条目只能整文件回滚；只有「片段合并」过的文件才会出现可勾选的 hunk。"
              : "Hunk rollback: expand diff, select only the hunks to undo (not the whole file), then Rollback selected. Full-file merges roll back at file level; hunk checkboxes only appear after a partial hunk merge."}
          </span>
        </div>
        <div className="codex-new-window-action-row">
          <button
            type="button"
            className="codex-new-mini-button"
            onClick={() => void handleRefresh()}
            disabled={!activeSession || pendingAction !== null}
          >
            <RefreshCw size={13} aria-hidden />
            {isChinese ? "刷新变更" : "Refresh changes"}
          </button>
          <button
            type="button"
            className="codex-new-mini-button"
            onClick={() => void handleMerge()}
            disabled={
              !activeSession ||
              pendingAction !== null ||
              !hasMergeSelection ||
              mergeBlockedReason !== null
            }
          >
            <CheckCheck size={13} aria-hidden />
            {isChinese ? "合并所选" : "Merge selected"}
          </button>
          <button
            type="button"
            className="codex-new-mini-button"
            onClick={() => void handleRollback()}
            disabled={
              !activeSession ||
              pendingAction !== null ||
              acceptedCount === 0 ||
              !hasRollbackSelection
            }
          >
            <RotateCcw size={13} aria-hidden />
            {isChinese ? "回滚所选" : "Rollback selected"}
          </button>
        </div>
        {mergeBlockedReason ? (
          <div className="codex-new-window-note is-warning">
            <AlertTriangle size={14} aria-hidden />
            <span>{mergeBlockedReason}</span>
          </div>
        ) : null}
      </section>

      <section className="codex-new-window-panel">
        <div className="codex-new-window-section-title">
          <CheckCheck size={14} aria-hidden />
          {t("codexNew.window.selectiveMerge", "Selective merge")}
        </div>
        <div className="codex-new-window-note">
          <Shield size={14} aria-hidden />
          <span>
            {t(
              "codexNew.window.mergeModeHelp",
              "Unmerged files: check a file to merge the whole file, or expand diff and check hunks for a partial merge. Merged files: check files or hunks to roll back into the project tree (added files are removed). One request cannot mix file-level and hunk-level merge, or file-level and hunk-level rollback.",
            )}
          </span>
        </div>
        <div className="codex-new-window-panel-meta">
          <span>
            {activeTask
              ? isChinese
                ? `${activeTask.diff.stats.changedFiles} 个变更，${mergeablePaths.length} 个未合并，${rollbackablePaths.length} 个已合并`
                : `${activeTask.diff.stats.changedFiles} changed, ${mergeablePaths.length} unmerged, ${rollbackablePaths.length} merged`
              : isChinese
                ? "当前没有活动任务"
                : "No active task"}
          </span>
          {mergeablePaths.length > 0 || rollbackablePaths.length > 0 ? (
            <span className="codex-new-window-selection-actions">
              {mergeablePaths.length > 0 ? (
                <>
                  <button
                    type="button"
                    className="codex-new-window-inline-button"
                    onClick={() => setSelectedMergePaths(mergeablePaths)}
                  >
                    {isChinese ? "全选未合并" : "Select unmerged"}
                  </button>
                  <button
                    type="button"
                    className="codex-new-window-inline-button"
                    onClick={() => setSelectedMergePaths([])}
                  >
                    {isChinese ? "清空合并" : "Clear merge"}
                  </button>
                </>
              ) : null}
              {rollbackablePaths.length > 0 ? (
                <>
                  <button
                    type="button"
                    className="codex-new-window-inline-button"
                    onClick={() => setSelectedRollbackPaths(rollbackablePaths)}
                  >
                    {isChinese ? "全选已合并" : "Select merged"}
                  </button>
                  <button
                    type="button"
                    className="codex-new-window-inline-button"
                    onClick={() => {
                      setSelectedRollbackPaths([]);
                      setSelectedRollbackHunks([]);
                    }}
                  >
                    {isChinese ? "清空回滚" : "Clear rollback"}
                  </button>
                </>
              ) : null}
            </span>
          ) : null}
        </div>
        {activeTask?.diff.riskMarkers.length ? (
          <div className="codex-new-window-risk-list">
            {activeTask.diff.riskMarkers.map((marker, index) => (
              <div key={`${marker.kind}-${marker.path ?? "global"}-${index}`} className="codex-new-window-risk">
                <AlertTriangle size={13} aria-hidden />
                <span>
                  {marker.path ? `${marker.path}: ` : ""}
                  {marker.message}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {activeTask?.changedFiles.length ? (
          <div className="codex-new-window-merge-list">
            {activeTask.changedFiles.map((file) => {
              const diffFile = diffFilesByPath.get(file.path);
              const diffOpen = expandedDiffs[diffToggleKey(file.path)] ?? false;
              const mergeSelectable = !file.accepted;
              const rollbackSelectable = file.accepted;
              const mergeSelected = selectedMergePaths.includes(file.path);
              const rollbackSelected = selectedRollbackPaths.includes(file.path);
              const partialMerge = (file.mergedHunks?.length ?? 0) > 0;
              const fileHunkCount = diffFile?.hunks.length ?? 0;
              const selectedMergeFileHunkCount = selectedMergeHunks.filter(
                (entry) => entry.path === file.path,
              ).length;
              const selectedRollbackFileHunkCount = selectedRollbackHunks.filter(
                (entry) => entry.path === file.path,
              ).length;
              return (
                <div key={file.path} className={`codex-new-window-merge-item${diffOpen ? " is-open" : ""}`}>
                  <div className="codex-new-window-merge-top">
                    <label className="codex-new-window-merge-check">
                      <input
                        type="checkbox"
                        checked={file.accepted ? rollbackSelected : mergeSelected}
                        disabled={!mergeSelectable && !rollbackSelectable}
                        onChange={() =>
                          file.accepted
                            ? toggleRollbackPath(file.path)
                            : toggleMergePath(file.path)
                        }
                      />
                      <span className="codex-new-window-merge-path">{file.path}</span>
                    </label>
                    <div className="codex-new-window-merge-badges">
                      <span className="codex-new-window-badge-chip">{humanizeIdentifier(file.status)}</span>
                      {file.accepted ? (
                        <span className="codex-new-window-badge-chip is-accepted">{isChinese ? "已合并" : "Merged"}</span>
                      ) : selectedMergeFileHunkCount > 0 ? (
                        <span className="codex-new-window-badge-chip is-partial">
                          {isChinese
                            ? `合并 ${selectedMergeFileHunkCount}/${fileHunkCount} hunk`
                            : `Merge ${selectedMergeFileHunkCount}/${fileHunkCount} hunk(s)`}
                        </span>
                      ) : null}
                      {file.accepted && selectedRollbackFileHunkCount > 0 ? (
                        <span className="codex-new-window-badge-chip is-partial">
                          {isChinese
                            ? `回滚 ${selectedRollbackFileHunkCount}/${file.mergedHunks?.length ?? fileHunkCount} hunk`
                            : `Rollback ${selectedRollbackFileHunkCount}/${file.mergedHunks?.length ?? fileHunkCount} hunk(s)`}
                        </span>
                      ) : null}
                      {diffFile?.isLockfile ? (
                        <span className="codex-new-window-badge-chip is-warning">{isChinese ? "锁文件" : "Lockfile"}</span>
                      ) : null}
                      <button
                        type="button"
                        className="codex-new-window-inline-button"
                        onClick={() => toggleDiff(file.path)}
                      >
                        {diffOpen ? (isChinese ? "隐藏 diff" : "Hide diff") : isChinese ? "查看 diff" : "Show diff"}
                      </button>
                    </div>
                  </div>
                  {diffOpen ? (
                    <div className="codex-new-window-diff-shell">
                      {diffFile?.hunks.length ? (
                        diffFile.hunks.map((hunk, index) => {
                          const hunkMerged = file.mergedHunks?.includes(index) ?? false;
                          const hunkActionable =
                            (mergeSelectable && !partialMerge) ||
                            (rollbackSelectable && hunkMerged);
                          return (
                          <div key={`${file.path}-${index}`} className="codex-new-window-diff-block">
                            <div className="codex-new-window-diff-header">
                              <label className="codex-new-window-hunk-check">
                                <input
                                  type="checkbox"
                                  checked={
                                    file.accepted
                                      ? selectedRollbackHunks.some(
                                          (entry) =>
                                            entry.path === file.path && entry.hunkIndex === index,
                                        )
                                      : isHunkSelected(file.path, index)
                                  }
                                  disabled={!hunkActionable}
                                  onChange={() =>
                                    file.accepted
                                      ? toggleRollbackHunk(file.path, index)
                                      : toggleMergeHunk(file.path, index)
                                  }
                                />
                                <span>{hunk.header}</span>
                              </label>
                            </div>
                            <div className="codex-new-window-diff-preview">
                              {hunk.preview.map((line, lineIndex) => (
                                <div
                                  key={`${file.path}-${index}-${lineIndex}`}
                                  className={`codex-new-window-diff-line${
                                    line.startsWith("+ ") ? " is-add" : line.startsWith("- ") ? " is-del" : ""
                                  }`}
                                >
                                  {line}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                        })
                      ) : (
                        <div className="codex-new-window-file-preview-note">
                          {isChinese ? "暂时没有 diff 预览。" : "No diff preview available."}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="codex-new-window-empty">
            {isChinese ? "还没有检测到变更文件。" : "No changed files detected yet."}
          </div>
        )}
      </section>

      <section className="codex-new-window-panel">
        <div className="codex-new-window-section-title">
          <History size={14} aria-hidden />
          {t("codexNew.window.traceback", "Edit traceback")}
        </div>
        <div className="codex-new-window-note">
          <RotateCcw size={14} aria-hidden />
          <span>
            {t(
              "codexNew.window.tracebackHelp",
              "Per-file snapshots during editing. This is separate from task rollback, which only reverses merged files.",
            )}
          </span>
        </div>
        {tracebackEntries.length ? (
          <div className="codex-new-window-traceback-list">
            {tracebackEntries.map((entry) => (
              <div key={`${entry.path}-${entry.revision}`} className="codex-new-window-traceback-item">
                <div className="codex-new-window-traceback-top">
                  <div className="codex-new-window-traceback-path">{entry.path}</div>
                  <div className="codex-new-window-traceback-meta">
                    {isChinese ? "修订" : "Rev"} {entry.revision} · {formatTime(entry.updatedAt)}
                  </div>
                </div>
                <div className="codex-new-window-action-row">
                  <button
                    type="button"
                    className="codex-new-mini-button"
                    onClick={() => void handleTracebackRestore(entry.path, "project")}
                    disabled={!activeSession || pendingAction !== null}
                  >
                    {t("codexNew.window.tracebackRestoreProject", "Restore original project")}
                  </button>
                  <button
                    type="button"
                    className="codex-new-mini-button"
                    onClick={() => void handleTracebackRestore(entry.path, "workspace")}
                    disabled={!activeSession || pendingAction !== null}
                  >
                    {t("codexNew.window.tracebackRestoreWorkspace", "Reset isolated copy")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="codex-new-window-empty">
            {t("codexNew.window.noTraceback", "No traceback snapshots yet.")}
          </div>
        )}
      </section>
      </>
      ) : null}

      {activeTab === "summary" ? (
      <section className="codex-new-window-panel">
        <div className="codex-new-window-section-title">
          <FileText size={14} aria-hidden />
          {isChinese ? "任务总结" : "Task Summary"}
        </div>
        <div className="codex-new-window-inline-form">
          <label className="codex-new-window-field">
            <span className="codex-new-window-field-label">{isChinese ? "目标" : "Goal"}</span>
            <input
              className="codex-new-window-input"
              value={summaryGoalDraft}
              onChange={(event) => setSummaryGoalDraft(event.target.value)}
              placeholder={
                isChinese ? "概括这次任务对应的用户目标。" : "Summarize the user's goal for this task."
              }
            />
          </label>
          <label className="codex-new-window-field is-grow">
            <span className="codex-new-window-field-label">{isChinese ? "AI 结果" : "AI result"}</span>
            <textarea
              className="codex-new-window-textarea"
              value={summaryResultDraft}
              onChange={(event) => setSummaryResultDraft(event.target.value)}
              placeholder={
                isChinese ? "概括这次隔离任务实际产出的内容。" : "Summarize what the isolated task produced."
              }
            />
          </label>
          <button
            type="button"
            className="codex-new-mini-button"
            onClick={() => void handleWriteSummary()}
            disabled={!activeSession || !activeTask || pendingAction !== null}
          >
            <FileText size={13} aria-hidden />
            {isChinese ? "写入总结" : "Write summary"}
          </button>
        </div>
        {activeTask?.latestSummary ? (
          <div className="codex-new-window-summary-shell">
            <div className="codex-new-window-summary-block">
              <div className="codex-new-window-field-label">{isChinese ? "目标" : "Goal"}</div>
              <div className="codex-new-window-summary-text">{activeTask.latestSummary.userGoal}</div>
            </div>
            <div className="codex-new-window-summary-block">
              <div className="codex-new-window-field-label">{isChinese ? "结果" : "Result"}</div>
              <div className="codex-new-window-summary-text">{activeTask.latestSummary.aiResult}</div>
            </div>
            <div className="codex-new-window-summary-grid is-detail">
              <article className="codex-new-window-summary-card">
                <div className="codex-new-window-summary-label">{isChinese ? "文件" : "Files"}</div>
                <div className="codex-new-window-summary-list">
                  {activeTask.latestSummary.filesChanged.map((path) => (
                    <div key={path}>{path}</div>
                  ))}
                </div>
              </article>
              <article className="codex-new-window-summary-card">
                <div className="codex-new-window-summary-label">{isChinese ? "决策" : "Decisions"}</div>
                <div className="codex-new-window-summary-list">
                  {activeTask.latestSummary.decisions.map((entry, index) => (
                    <div key={`${entry}-${index}`}>{entry}</div>
                  ))}
                </div>
              </article>
              <article className="codex-new-window-summary-card">
                <div className="codex-new-window-summary-label">{isChinese ? "测试" : "Tests"}</div>
                <div className="codex-new-window-summary-list">
                  {activeTask.latestSummary.tests.map((entry, index) => (
                    <div key={`${entry}-${index}`}>{entry}</div>
                  ))}
                </div>
              </article>
              <article className="codex-new-window-summary-card">
                <div className="codex-new-window-summary-label">{isChinese ? "风险" : "Risks"}</div>
                <div className="codex-new-window-summary-list">
                  {activeTask.latestSummary.risks.map((entry, index) => (
                    <div key={`${entry}-${index}`}>{entry}</div>
                  ))}
                </div>
              </article>
            </div>
            {activeTask.latestSummary.candidateMemory.length ? (
              <div className="codex-new-window-candidate-memory">
                {activeTask.latestSummary.candidateMemory.map((memory, index) => (
                  <div key={`${memory.title}-${index}`} className="codex-new-window-memory-item">
                    <div className="codex-new-window-memory-title">{memory.title}</div>
                    <div className="codex-new-window-memory-detail">{memory.detail}</div>
                    {memory.evidencePaths.length ? (
                      <div className="codex-new-window-memory-evidence">
                        {memory.evidencePaths.join(", ")}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {memoryCandidates.length ? (
              <div className="codex-new-window-candidate-memory">
                <div className="codex-new-window-field-label">
                  {t("codexNew.window.memoryCandidates", "Candidate memory")}
                </div>
                {memoryCandidates.map((record) => (
                  <div key={record.id} className="codex-new-window-memory-item is-actionable">
                    <div className="codex-new-window-memory-top">
                      <div>
                        <div className="codex-new-window-memory-title">{record.candidate.title}</div>
                        <div className="codex-new-window-memory-detail">{record.candidate.detail}</div>
                      </div>
                      <span className={`codex-new-window-badge-chip is-${record.status}`}>
                        {formatMemoryStatus(record.status, isChinese)}
                      </span>
                    </div>
                    {record.candidate.evidencePaths.length ? (
                      <div className="codex-new-window-memory-evidence">
                        {record.candidate.evidencePaths.join(", ")}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="codex-new-mini-button"
                      onClick={() => void handleApplyMemory(record.id)}
                      disabled={
                        !activeSession ||
                        pendingAction !== null ||
                        record.status === "same" ||
                        record.status === "conflict"
                      }
                    >
                      {t("codexNew.window.applyMemory", "Apply to project memory")}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="codex-new-window-empty">
            {isChinese ? "还没有写入任务总结。" : "No task summary has been written yet."}
          </div>
        )}
      </section>
      ) : null}

      {activeTab === "timeline" ? (
      <section className="codex-new-window-stream">
        <div className="codex-new-window-section-title">
          <Workflow size={14} aria-hidden />
          {t("codexNew.window.timeline", "Process timeline")}
        </div>
        {state.processEntries.length === 0 ? (
          <div className="codex-new-window-empty">{t("codexNew.window.noTimeline", "No process timeline yet.")}</div>
        ) : (
          <div className="codex-new-window-list">
            {state.processEntries.map((entry) => (
              <article key={entry.id} className={`codex-new-window-event status-${entry.status}`}>
                <div className="codex-new-window-event-top">
                  <div className="codex-new-window-event-kind">
                    <Sparkles size={12} aria-hidden />
                    {translateProcessKind(entry.kind, isChinese)}
                  </div>
                  <div className="codex-new-window-event-time">{formatTime(entry.createdAt)}</div>
                </div>
                <h2 className="codex-new-window-event-title">{entry.title}</h2>
                {!hasRedundantDetail(entry) ? (
                  <p className="codex-new-window-event-detail">{entry.detail}</p>
                ) : null}
                {entry.files.length > 0 ? (
                  <div className="codex-new-window-file-list">
                    {entry.files.map((file) => {
                      const key = filePreviewKey(entry.id, file.path);
                      const expanded = expandedFiles[key] ?? false;
                      const preview = previewCache[key];
                      return (
                        <div
                          key={key}
                          className={`codex-new-window-file-item${expanded ? " is-open" : ""}`}
                        >
                          <button
                            type="button"
                            className="codex-new-window-file-toggle"
                            onClick={() => void handleToggleFile(entry.id, file.path)}
                          >
                            <span className="codex-new-window-file-toggle-left">
                              <span className="codex-new-window-file-path">{file.path}</span>
                              <span className="codex-new-window-file-hint">
                                {preview?.status === "loading"
                                  ? t("codexNew.window.previewLoading", "Loading preview...")
                                  : t("codexNew.window.previewToggle", "Click to preview code")}
                              </span>
                            </span>
                            <ChevronRight
                              size={14}
                              aria-hidden
                              className={`codex-new-window-file-chevron${expanded ? " is-open" : ""}`}
                            />
                          </button>
                          {expanded ? (
                            <div className="codex-new-window-file-preview-shell">
                              {preview?.status === "loading" ? (
                                <div className="codex-new-window-file-preview-note">
                                  {t("codexNew.window.previewLoading", "Loading preview...")}
                                </div>
                              ) : null}
                              {preview?.status === "error" ? (
                                <div className="codex-new-window-file-preview-note">{preview.message}</div>
                              ) : null}
                              {preview?.status === "ready" && preview.preview.status === "binary" ? (
                                <div className="codex-new-window-file-preview-note">
                                  {t("codexNew.window.previewBinary", "Binary file preview unavailable.")}
                                </div>
                              ) : null}
                              {preview?.status === "ready" && preview.preview.status === "missing" ? (
                                <div className="codex-new-window-file-preview-note">
                                  {t("codexNew.window.previewMissing", "File preview unavailable.")}
                                </div>
                              ) : null}
                              {preview?.status === "ready" && preview.preview.status === "ready" ? (
                                <>
                                  <pre className="codex-new-window-file-preview">
                                    {preview.preview.content ||
                                      t("codexNew.window.previewEmpty", "This file is empty.")}
                                  </pre>
                                  {preview.preview.truncated ? (
                                    <div className="codex-new-window-file-preview-note">
                                      {t("codexNew.window.previewTruncated", "Preview truncated.")}
                                    </div>
                                  ) : null}
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
      ) : null}
      </div>
        </div>
      </div>
      </div>

      <CodexNewTerminalDock
        open={terminalDockOpen}
        onToggle={() => setTerminalDockOpen((current) => !current)}
        runs={state.terminalRuns}
      />
    </main>
  );
}
