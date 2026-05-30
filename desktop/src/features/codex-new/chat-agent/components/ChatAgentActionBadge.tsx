import type { ChatAgentActionType } from "../types";

type ChatAgentActionBadgeProps = {
  actionType: ChatAgentActionType | string;
};

const LABELS: Record<string, string> = {
  read_file: "Read",
  search_code: "Search",
  edit_file: "Edit",
  run_command: "Shell",
  ask_user: "Ask",
  finalize: "Done",
};

export function ChatAgentActionBadge({ actionType }: ChatAgentActionBadgeProps) {
  const label = LABELS[actionType] ?? actionType;
  return <span className="chat-agent-action-badge">{label}</span>;
}
