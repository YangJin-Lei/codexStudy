import type { AppSettings, ModelOption } from "@/types";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { useI18n } from "@/i18n/I18nProvider";

type SettingsGitSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  models: ModelOption[];
  commitMessagePromptDraft: string;
  commitMessagePromptDirty: boolean;
  commitMessagePromptSaving: boolean;
  onSetCommitMessagePromptDraft: (value: string) => void;
  onSaveCommitMessagePrompt: () => Promise<void>;
  onResetCommitMessagePrompt: () => Promise<void>;
};

export function SettingsGitSection({
  appSettings,
  onUpdateAppSettings,
  models,
  commitMessagePromptDraft,
  commitMessagePromptDirty,
  commitMessagePromptSaving,
  onSetCommitMessagePromptDraft,
  onSaveCommitMessagePrompt,
  onResetCommitMessagePrompt,
}: SettingsGitSectionProps) {
  const { t } = useI18n();
  return (
    <SettingsSection
      title={t("settings.git.title", "Git")}
      subtitle={t("settings.git.subtitle", "Manage how diffs are loaded in the Git sidebar.")}
    >
      <SettingsToggleRow
        title={t("settings.git.preload.title", "Preload git diffs")}
        subtitle={t("settings.git.preload.subtitle", "Make viewing git diff faster.")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.preloadGitDiffs}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              preloadGitDiffs: !appSettings.preloadGitDiffs,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("settings.git.ignoreWhitespace.title", "Ignore whitespace changes")}
        subtitle={t("settings.git.ignoreWhitespace.subtitle", "Hides whitespace-only changes in local and commit diffs.")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.gitDiffIgnoreWhitespaceChanges}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              gitDiffIgnoreWhitespaceChanges: !appSettings.gitDiffIgnoreWhitespaceChanges,
            })
          }
        />
      </SettingsToggleRow>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.git.commitPrompt.label", "Commit message prompt")}</div>
        <div className="settings-help">
          {t("settings.git.commitPrompt.help", "Used when generating commit messages. Include")} <code>{"{diff}"}</code> {t("settings.git.commitPrompt.helpSuffix", "to insert the git diff.")}
        </div>
        <textarea
          className="settings-agents-textarea"
          value={commitMessagePromptDraft}
          onChange={(event) => onSetCommitMessagePromptDraft(event.target.value)}
          spellCheck={false}
          disabled={commitMessagePromptSaving}
        />
        <div className="settings-field-actions">
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              void onResetCommitMessagePrompt();
            }}
            disabled={commitMessagePromptSaving || !commitMessagePromptDirty}
          >
            {t("settings.common.reset", "Reset")}
          </button>
          <button
            type="button"
            className="primary settings-button-compact"
            onClick={() => {
              void onSaveCommitMessagePrompt();
            }}
            disabled={commitMessagePromptSaving || !commitMessagePromptDirty}
          >
            {commitMessagePromptSaving
              ? t("settings.common.saving", "Saving...")
              : t("settings.common.save", "Save")}
          </button>
        </div>
      </div>
      {models.length > 0 && (
        <div className="settings-field">
          <label className="settings-field-label" htmlFor="commit-message-model-select">
            {t("settings.git.commitModel.label", "Commit message model")}
          </label>
          <div className="settings-help">
            {t("settings.git.commitModel.help", "The model used when generating commit messages. Leave on default to use the workspace model.")}
          </div>
          <select
            id="commit-message-model-select"
            className="settings-select"
            value={appSettings.commitMessageModelId ?? ""}
            onChange={(event) => {
              const value = event.target.value || null;
              void onUpdateAppSettings({
                ...appSettings,
                commitMessageModelId: value,
              });
            }}
          >
            <option value="">{t("settings.common.default", "Default")}</option>
            {models.map((model) => (
              <option key={model.id} value={model.model}>
                {model.displayName?.trim() || model.model}
              </option>
            ))}
          </select>
        </div>
      )}
    </SettingsSection>
  );
}
