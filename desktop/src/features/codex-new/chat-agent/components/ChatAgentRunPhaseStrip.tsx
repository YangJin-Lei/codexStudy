import { useI18n } from "@/i18n/I18nProvider";
import type { ChatAgentRunState, ChatAgentRunStatus } from "../types";

const PHASE_LABELS: Partial<Record<ChatAgentRunStatus, { en: string; zh: string }>> = {
  preparing: { en: "Preparing run…", zh: "准备运行…" },
  planning: { en: "Planning next step…", zh: "规划下一步…" },
  executing: { en: "Executing tool…", zh: "执行工具中…" },
  observing: { en: "Processing result…", zh: "处理结果…" },
  finalizing: { en: "Finalizing…", zh: "收尾中…" },
  awaiting_tool_approval: { en: "Waiting for tool approval", zh: "等待工具确认" },
};

type ChatAgentRunPhaseStripProps = {
  run: ChatAgentRunState | null;
};

export function ChatAgentRunPhaseStrip({ run }: ChatAgentRunPhaseStripProps) {
  const { resolvedLanguage } = useI18n();
  const isChinese = resolvedLanguage === "zh-CN";

  if (!run) {
    return null;
  }

  const label = PHASE_LABELS[run.status];
  if (!label) {
    return null;
  }

  return (
    <div className="chat-agent-run-phase-strip" role="status">
      <span className="chat-agent-run-phase-strip__spinner" aria-hidden />
      <span>{isChinese ? label.zh : label.en}</span>
    </div>
  );
}
