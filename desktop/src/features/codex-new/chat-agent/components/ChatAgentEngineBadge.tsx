import { useI18n } from "@/i18n/I18nProvider";



type ChatAgentEngineBadgeProps = {

  engine: "chat_agent" | "codex_core" | "hybrid" | string;

};



export function ChatAgentEngineBadge({ engine }: ChatAgentEngineBadgeProps) {

  const { t } = useI18n();

  const label =

    engine === "hybrid"

      ? t("codexNew.chatAgent.engineHybrid", "Hybrid")

      : engine === "chat_agent"

        ? t("codexNew.chatAgent.engineChatAgent", "Chat Agent")

        : t("codexNew.chatAgent.engineCodexCore", "Codex Core");



  const className =

    engine === "hybrid"

      ? "chat-agent-engine-badge chat-agent-engine-badge--hybrid"

      : engine === "chat_agent"

        ? "chat-agent-engine-badge chat-agent-engine-badge--chat"

        : "chat-agent-engine-badge chat-agent-engine-badge--core";



  return <span className={className}>{label}</span>;

}


