import { useEffect, useMemo, useRef, useState } from "react";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import { formatRelativeTimeShort } from "@/utils/time";
import type { CodexNewThreadRegistryEntry } from "../types";
import {
  sessionNavPrimaryLabel,
  sessionNavSecondaryLabel,
} from "../utils/threadLabels";

export type CodexNewSessionSelectAction = "chat" | "timeline" | "changes" | "review" | "summary";

type CodexNewProcessSessionNavProps = {
  workspaceName: string;
  sessions: CodexNewThreadRegistryEntry[];
  activeThreadId: string | null;
  isChinese: boolean;
  onSelectThread: (threadId: string, action: CodexNewSessionSelectAction) => void;
};

const tabActions: CodexNewSessionSelectAction[] = ["timeline", "changes", "review", "summary"];

function tabLabel(action: CodexNewSessionSelectAction, isChinese: boolean) {
  if (action === "chat") {
    return isChinese ? "对话" : "Chat";
  }
  if (!isChinese) {
    switch (action) {
      case "timeline":
        return "Timeline";
      case "changes":
        return "Changes";
      case "review":
        return "Review";
      case "summary":
        return "Memory";
      default:
        return action;
    }
  }
  switch (action) {
    case "timeline":
      return "时间线";
    case "changes":
      return "变更";
    case "review":
      return "审查";
    case "summary":
      return "记忆";
    default:
      return action;
  }
}

export function CodexNewProcessSessionNav({
  workspaceName,
  sessions,
  activeThreadId,
  isChinese,
  onSelectThread,
}: CodexNewProcessSessionNavProps) {
  const [expanded, setExpanded] = useState(true);
  const sortedSessions = useMemo(
    () =>
      [...sessions]
        .filter((entry) => Boolean(entry.isolatedRoot?.trim()))
        .sort((left, right) => right.updatedAt - left.updatedAt),
    [sessions],
  );
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    rowRefs.current[activeThreadId]?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [activeThreadId, sortedSessions]);

  if (sortedSessions.length === 0) {
    return (
      <aside className="codex-new-process-session-nav" aria-label={isChinese ? "隔离会话" : "Isolated sessions"}>
        <div className="codex-new-process-session-nav-empty">
          {isChinese
            ? "还没有开启安全模式的对话。在右侧为当前对话手动开启后，会出现在这里。"
            : "No security-armed conversations yet. Turn on Security mode for a conversation to list it here."}
        </div>
      </aside>
    );
  }

  return (
    <aside className="codex-new-process-session-nav" aria-label={isChinese ? "隔离会话" : "Isolated sessions"}>
      <button
        type="button"
        className="codex-new-process-session-nav-workspace"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        <span className="codex-new-process-session-nav-workspace-name">{workspaceName}</span>
        <span className="codex-new-process-session-nav-count">{sortedSessions.length}</span>
      </button>
      {expanded ? (
        <ul className="codex-new-process-session-nav-list">
          {sortedSessions.map((entry) => {
            const isActive = entry.threadId === activeThreadId;
            const relativeTime = entry.updatedAt ? formatRelativeTimeShort(entry.updatedAt) : null;
            const primaryLabel = sessionNavPrimaryLabel(entry, isChinese);
            const secondaryLabel = sessionNavSecondaryLabel(entry, isChinese);
            return (
              <li
                key={entry.threadId}
                className="codex-new-process-session-nav-row"
                ref={(element) => {
                  rowRefs.current[entry.threadId] = element;
                }}
              >
                <button
                  type="button"
                  className={`codex-new-process-session-nav-item${isActive ? " is-active" : ""}`}
                  onClick={() => onSelectThread(entry.threadId, "chat")}
                  aria-current={isActive ? "true" : undefined}
                  title={secondaryLabel ?? undefined}
                >
                  <span className="codex-new-process-session-nav-item-title">{primaryLabel}</span>
                  {secondaryLabel ? (
                    <span className="codex-new-process-session-nav-item-meta">{secondaryLabel}</span>
                  ) : null}
                  {relativeTime ? (
                    <span className="codex-new-process-session-nav-item-meta">
                      {isChinese ? `更新 ${relativeTime}` : `Updated ${relativeTime}`}
                    </span>
                  ) : null}
                </button>
                <div
                  className="codex-new-process-session-nav-actions"
                  role="group"
                  aria-label={primaryLabel}
                >
                  <button
                    type="button"
                    className="codex-new-process-session-nav-action"
                    onClick={() => onSelectThread(entry.threadId, "chat")}
                  >
                    {tabLabel("chat", isChinese)}
                  </button>
                  {tabActions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      className="codex-new-process-session-nav-action"
                      onClick={() => onSelectThread(entry.threadId, action)}
                    >
                      {tabLabel(action, isChinese)}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </aside>
  );
}
