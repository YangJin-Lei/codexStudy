import { Bot } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import {
  CHAT_AGENT_STATE_EVENT,
  patchChatAgentSettings,
  readChatAgentStore,
  refreshChatAgentSettings,
  saveChatAgentSettings,
} from "../state";
import type { ChatAgentSettings } from "../types";

type ChatAgentComposerEngineSelectProps = {
  disabled?: boolean;
};

export function ChatAgentComposerEngineSelect({
  disabled = false,
}: ChatAgentComposerEngineSelectProps) {
  const { t, resolvedLanguage } = useI18n();
  const isChinese = resolvedLanguage === "zh-CN";
  const [preference, setPreference] = useState<ChatAgentSettings["enginePreference"]>(
    () => readChatAgentStore().settings.enginePreference,
  );
  const [saving, setSaving] = useState(false);

  const syncFromStore = useCallback(() => {
    setPreference(readChatAgentStore().settings.enginePreference);
  }, []);

  useEffect(() => {
    void refreshChatAgentSettings()
      .then(syncFromStore)
      .catch(() => {
        // Keep local preference when backend fetch fails.
      });
  }, [syncFromStore]);

  useEffect(() => {
    window.addEventListener(CHAT_AGENT_STATE_EVENT, syncFromStore);
    return () => window.removeEventListener(CHAT_AGENT_STATE_EVENT, syncFromStore);
  }, [syncFromStore]);

  const handleChange = async (next: ChatAgentSettings["enginePreference"]) => {
    setPreference(next);
    patchChatAgentSettings({ enginePreference: next });
    setSaving(true);
    try {
      await saveChatAgentSettings({ ...readChatAgentStore().settings, enginePreference: next });
    } catch {
      syncFromStore();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="composer-select-wrap composer-select-wrap--agent-engine">
      <span className="composer-icon composer-icon--agent-engine" aria-hidden>
        <Bot size={14} strokeWidth={1.8} />
      </span>
      <select
        className="composer-select composer-select--agent-engine"
        aria-label={isChinese ? "Agent 引擎" : "Agent engine"}
        disabled={disabled || saving}
        value={preference}
        onChange={(event) =>
          void handleChange(event.target.value as ChatAgentSettings["enginePreference"])
        }
      >
        <option value="auto">{isChinese ? "Agent · 自动" : "Agent · Auto"}</option>
        <option value="chat_agent">
          {t("codexNew.chatAgent.engineChatAgent", "Chat Agent")}
        </option>
        <option value="hybrid">
          {isChinese ? "Agent · 混合" : "Agent · Hybrid"}
        </option>
        <option value="codex_core">
          {t("codexNew.chatAgent.engineCodexCore", "Codex Core")}
        </option>
      </select>
    </div>
  );
}
