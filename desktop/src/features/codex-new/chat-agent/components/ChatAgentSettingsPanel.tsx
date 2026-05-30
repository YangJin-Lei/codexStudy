import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { saveChatAgentSettings } from "../state";
import type { ChatAgentSettings } from "../types";

type ChatAgentSettingsPanelProps = {
  settings: ChatAgentSettings;
};

const MAX_TURNS_MIN = 1;
const MAX_TURNS_MAX = 200;

export function ChatAgentSettingsPanel({ settings }: ChatAgentSettingsPanelProps) {
  const { resolvedLanguage } = useI18n();
  const isChinese = resolvedLanguage === "zh-CN";
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges = useMemo(
    () =>
      draft.maxTurns !== settings.maxTurns ||
      draft.showThoughts !== settings.showThoughts,
    [draft, settings],
  );

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const handleSave = async () => {
    const next = {
      ...draft,
      maxTurns: Math.max(MAX_TURNS_MIN, Math.min(MAX_TURNS_MAX, draft.maxTurns)),
    };
    setSaving(true);
    setError(null);
    try {
      await saveChatAgentSettings(next);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="chat-agent-settings-panel">
      <div className="chat-agent-settings-panel__title">
        {isChinese ? "Agent 设置" : "Agent settings"}
      </div>
      <p className="chat-agent-settings-panel__hint">
        {isChinese
          ? "引擎偏好在输入框下方切换；此处仅保留运行参数。"
          : "Switch engine preference in the composer bar below; advanced run options live here."}
      </p>

      <div className="chat-agent-settings-panel__row">
        <label htmlFor="chat-agent-max-turns">
          {isChinese ? "最大轮数" : "Max turns"}
        </label>
        <input
          id="chat-agent-max-turns"
          type="number"
          min={MAX_TURNS_MIN}
          max={MAX_TURNS_MAX}
          value={draft.maxTurns}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              maxTurns: Number(event.target.value || current.maxTurns),
            }))
          }
        />
      </div>

      <label className="chat-agent-settings-panel__checkbox">
        <input
          type="checkbox"
          checked={draft.showThoughts}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              showThoughts: event.target.checked,
            }))
          }
        />
        {isChinese ? "显示推理想法" : "Show reasoning thoughts"}
      </label>

      {error ? <p className="chat-agent-settings-panel__error">{error}</p> : null}

      <button
        type="button"
        className="chat-agent-settings-panel__save"
        onClick={() => void handleSave()}
        disabled={saving || !hasChanges}
      >
        {saving
          ? isChinese
            ? "保存中..."
            : "Saving..."
          : isChinese
            ? "保存设置"
            : "Save settings"}
      </button>
    </section>
  );
}
