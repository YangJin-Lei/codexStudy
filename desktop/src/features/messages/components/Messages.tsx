import { memo, useCallback, useMemo, useState } from "react";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import type {
  ConversationItem,
  OpenAppTarget,
  RequestUserInputRequest,
  RequestUserInputResponse,
} from "../../../types";
import { PlanReadyFollowupMessage } from "../../app/components/PlanReadyFollowupMessage";
import { RequestUserInputMessage } from "../../app/components/RequestUserInputMessage";
import { ChatAgentAwaitingUserBanner } from "@/features/codex-new/chat-agent/components/ChatAgentAwaitingUserBanner";
import { ChatAgentInlineStepStrip } from "@/features/codex-new/chat-agent/components/ChatAgentInlineStepStrip";
import { ChatAgentRunPhaseStrip } from "@/features/codex-new/chat-agent/components/ChatAgentRunPhaseStrip";
import { ChatAgentToolApprovalBanner } from "@/features/codex-new/chat-agent/components/ChatAgentToolApprovalBanner";
import { segmentChatAgentStepsByUserTurns } from "@/features/codex-new/chat-agent/chatAgentStepSegments";
import { confirmChatAgentTool } from "@/features/codex-new/chat-agent/chatAgentThreadSync";
import { useChatAgentThreadRun } from "@/features/codex-new/chat-agent/hooks/useChatAgentThreadRun";
import { useFileLinkOpener } from "../hooks/useFileLinkOpener";
import { formatCount, parseReasoning } from "../utils/messageRenderUtils";
import {
  DiffRow,
  ExploreRow,
  MessageRow,
  ReasoningRow,
  ReviewRow,
  ToolRow,
  UserInputRow,
  WorkingIndicator,
} from "./MessageRows";
import { useMessagesViewState } from "./useMessagesViewState";

type MessagesProps = {
  items: ConversationItem[];
  threadId: string | null;
  workspaceId?: string | null;
  isThinking: boolean;
  isLoadingMessages?: boolean;
  processingStartedAt?: number | null;
  lastDurationMs?: number | null;
  showPollingFetchStatus?: boolean;
  pollingIntervalMs?: number;
  workspacePath?: string | null;
  openTargets: OpenAppTarget[];
  selectedOpenAppId: string;
  codeBlockCopyUseModifier?: boolean;
  showMessageFilePath?: boolean;
  userInputRequests?: RequestUserInputRequest[];
  onUserInputSubmit?: (
    request: RequestUserInputRequest,
    response: RequestUserInputResponse,
  ) => void;
  onPlanAccept?: () => void;
  onPlanSubmitChanges?: (changes: string) => void;
  onOpenThreadLink?: (threadId: string, workspaceId?: string | null) => void;
  onQuoteMessage?: (text: string) => void;
};

export const Messages = memo(function Messages({
  items,
  threadId,
  workspaceId = null,
  isThinking,
  isLoadingMessages = false,
  processingStartedAt = null,
  lastDurationMs = null,
  showPollingFetchStatus = false,
  pollingIntervalMs = 12000,
  workspacePath = null,
  openTargets,
  selectedOpenAppId,
  codeBlockCopyUseModifier = false,
  showMessageFilePath = true,
  userInputRequests = [],
  onUserInputSubmit,
  onPlanAccept,
  onPlanSubmitChanges,
  onOpenThreadLink,
  onQuoteMessage,
}: MessagesProps) {
  const chatAgentRun = useChatAgentThreadRun(threadId);
  const [toolApprovalBusy, setToolApprovalBusy] = useState(false);

  const handleToolApproval = useCallback(
    async (approved: boolean) => {
      if (!chatAgentRun?.runId || toolApprovalBusy) {
        return;
      }
      setToolApprovalBusy(true);
      try {
        await confirmChatAgentTool(chatAgentRun.runId, approved);
      } finally {
        setToolApprovalBusy(false);
      }
    },
    [chatAgentRun?.runId, toolApprovalBusy],
  );

  const activeUserInputRequestId =
    threadId && userInputRequests.length
      ? (userInputRequests.find(
          (request) =>
            request.params.thread_id === threadId &&
            (!workspaceId || request.workspace_id === workspaceId),
        )?.request_id ?? null)
      : null;
  const { openFileLink, showFileLinkMenu } = useFileLinkOpener(
    workspacePath,
    openTargets,
    selectedOpenAppId,
  );
  const handleOpenThreadLink = useCallback(
    (threadId: string) => {
      onOpenThreadLink?.(threadId, workspaceId ?? null);
    },
    [onOpenThreadLink, workspaceId],
  );

  const hasActiveUserInputRequest = activeUserInputRequestId !== null;
  const hasVisibleUserInputRequest = hasActiveUserInputRequest && Boolean(onUserInputSubmit);
  const userInputNode =
    hasActiveUserInputRequest && onUserInputSubmit ? (
      <RequestUserInputMessage
        requests={userInputRequests}
        activeThreadId={threadId}
        activeWorkspaceId={workspaceId}
        onSubmit={onUserInputSubmit}
      />
    ) : null;
  const {
    bottomRef,
    containerRef,
    updateAutoScroll,
    requestAutoScroll,
    expandedItems,
    toggleExpanded,
    collapsedToolGroups,
    toggleToolGroup,
    copiedMessageId,
    handleCopyMessage,
    handleQuoteMessage,
    reasoningMetaById,
    latestReasoningLabel,
    groupedItems,
    planFollowup,
    dismissPlanFollowup,
  } = useMessagesViewState({
    items,
    threadId,
    isThinking,
    activeUserInputRequestId,
    hasVisibleUserInputRequest,
    onPlanAccept,
    onPlanSubmitChanges,
    onQuoteMessage,
  });

  const chatAgentStepSegments = useMemo(
    () => segmentChatAgentStepsByUserTurns(chatAgentRun?.steps ?? []),
    [chatAgentRun?.steps],
  );
  const userMessageTurnById = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (item.kind === "message" && item.role === "user") {
        map.set(item.id, map.size);
      }
    }
    return map;
  }, [items]);
  const chatAgentInFlight = Boolean(
    chatAgentRun &&
      [
        "pending",
        "preparing",
        "planning",
        "executing",
        "observing",
        "finalizing",
        "running",
      ].includes(chatAgentRun.status),
  );
  const lastUserTurnIndex = userMessageTurnById.size - 1;

  const planFollowupNode =
    planFollowup.shouldShow && onPlanAccept && onPlanSubmitChanges ? (
      <PlanReadyFollowupMessage
        onAccept={() => {
          dismissPlanFollowup();
          onPlanAccept();
        }}
        onSubmitChanges={(changes) => {
          dismissPlanFollowup();
          onPlanSubmitChanges(changes);
        }}
      />
    ) : null;

  const renderItem = (item: ConversationItem) => {
    if (item.kind === "message") {
      const isCopied = copiedMessageId === item.id;
      const userTurnIndex =
        item.role === "user" ? userMessageTurnById.get(item.id) : undefined;
      const turnSteps =
        userTurnIndex !== undefined
          ? (chatAgentStepSegments[userTurnIndex] ?? [])
          : [];
      return (
        <div key={item.id} className="message-turn-block">
          <MessageRow
            item={item}
            isCopied={isCopied}
            onCopy={handleCopyMessage}
            onQuote={onQuoteMessage ? handleQuoteMessage : undefined}
            codeBlockCopyUseModifier={codeBlockCopyUseModifier}
            showMessageFilePath={showMessageFilePath}
            workspacePath={workspacePath}
            onOpenFileLink={openFileLink}
            onOpenFileLinkMenu={showFileLinkMenu}
            onOpenThreadLink={handleOpenThreadLink}
          />
          {userTurnIndex !== undefined && turnSteps.length > 0 ? (
            <ChatAgentInlineStepStrip
              steps={turnSteps}
              isActiveTurn={
                chatAgentInFlight && userTurnIndex === lastUserTurnIndex
              }
            />
          ) : null}
        </div>
      );
    }
    if (item.kind === "reasoning") {
      const isExpanded = expandedItems.has(item.id);
      const parsed = reasoningMetaById.get(item.id) ?? parseReasoning(item);
      return (
        <ReasoningRow
          key={item.id}
          item={item}
          parsed={parsed}
          isExpanded={isExpanded}
          onToggle={toggleExpanded}
          showMessageFilePath={showMessageFilePath}
          workspacePath={workspacePath}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
          onOpenThreadLink={handleOpenThreadLink}
        />
      );
    }
    if (item.kind === "review") {
      return (
        <ReviewRow
          key={item.id}
          item={item}
          showMessageFilePath={showMessageFilePath}
          workspacePath={workspacePath}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
          onOpenThreadLink={handleOpenThreadLink}
        />
      );
    }
    if (item.kind === "userInput") {
      const isExpanded = expandedItems.has(item.id);
      return (
        <UserInputRow
          key={item.id}
          item={item}
          isExpanded={isExpanded}
          onToggle={toggleExpanded}
        />
      );
    }
    if (item.kind === "diff") {
      return <DiffRow key={item.id} item={item} />;
    }
    if (item.kind === "tool") {
      const isExpanded = expandedItems.has(item.id);
      return (
        <ToolRow
          key={item.id}
          item={item}
          isExpanded={isExpanded}
          onToggle={toggleExpanded}
          showMessageFilePath={showMessageFilePath}
          workspacePath={workspacePath}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
          onOpenThreadLink={handleOpenThreadLink}
          onRequestAutoScroll={requestAutoScroll}
        />
      );
    }
    if (item.kind === "explore") {
      return <ExploreRow key={item.id} item={item} />;
    }
    return null;
  };

  return (
    <div
      className="messages messages-full"
      ref={containerRef}
      onScroll={updateAutoScroll}
    >
      <div className="messages-inner">
        <ChatAgentRunPhaseStrip run={chatAgentRun} />
        {groupedItems.map((entry) => {
          if (entry.kind === "toolGroup") {
            const { group } = entry;
            const isCollapsed = collapsedToolGroups.has(group.id);
            const summaryParts = [
              formatCount(group.toolCount, "tool call", "tool calls"),
            ];
            if (group.messageCount > 0) {
              summaryParts.push(formatCount(group.messageCount, "message", "messages"));
            }
            const summaryText = summaryParts.join(", ");
            const groupBodyId = `tool-group-${group.id}`;
            const ChevronIcon = isCollapsed ? ChevronDown : ChevronUp;
            return (
              <div
                key={`tool-group-${group.id}`}
                className={`tool-group ${isCollapsed ? "tool-group-collapsed" : ""}`}
              >
                <div className="tool-group-header">
                  <button
                    type="button"
                    className="tool-group-toggle"
                    onClick={() => toggleToolGroup(group.id)}
                    aria-expanded={!isCollapsed}
                    aria-controls={groupBodyId}
                    aria-label={isCollapsed ? "Expand tool calls" : "Collapse tool calls"}
                  >
                    <span className="tool-group-chevron" aria-hidden>
                      <ChevronIcon size={14} />
                    </span>
                    <span className="tool-group-summary">{summaryText}</span>
                  </button>
                </div>
                {!isCollapsed && (
                  <div className="tool-group-body" id={groupBodyId}>
                    {group.items.map(renderItem)}
                  </div>
                )}
              </div>
            );
          }
          return renderItem(entry.item);
        })}
        {planFollowupNode}
        {userInputNode}
        {chatAgentRun ? (
          <ChatAgentToolApprovalBanner
            run={chatAgentRun}
            busy={toolApprovalBusy}
            onAllow={() => void handleToolApproval(true)}
            onDeny={() => void handleToolApproval(false)}
          />
        ) : null}
        {chatAgentRun ? <ChatAgentAwaitingUserBanner run={chatAgentRun} /> : null}
        <WorkingIndicator
          isThinking={isThinking}
          processingStartedAt={processingStartedAt}
          lastDurationMs={lastDurationMs}
          hasItems={items.length > 0}
          reasoningLabel={latestReasoningLabel}
          showPollingFetchStatus={showPollingFetchStatus}
          pollingIntervalMs={pollingIntervalMs}
        />
        {!items.length && !userInputNode && !isThinking && !isLoadingMessages && (
          <div className="empty messages-empty">
            {threadId ? "Send a prompt to the agent." : "Send a prompt to start a new agent."}
          </div>
        )}
        {!items.length && !userInputNode && !isThinking && isLoadingMessages && (
          <div className="empty messages-empty">
            <div className="messages-loading-indicator" role="status" aria-live="polite">
              <span className="working-spinner" aria-hidden />
              <span className="messages-loading-label">Loading…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
});
