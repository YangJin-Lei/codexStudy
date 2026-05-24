import type { AppSettings } from "@/types";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { useI18n } from "@/i18n/I18nProvider";

type ComposerPreset = AppSettings["composerEditorPreset"];

type SettingsComposerSectionProps = {
  appSettings: AppSettings;
  optionKeyLabel: string;
  followUpShortcutLabel: string;
  composerPresetLabels: Record<ComposerPreset, string>;
  onComposerPresetChange: (preset: ComposerPreset) => void;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

export function SettingsComposerSection({
  appSettings,
  optionKeyLabel,
  followUpShortcutLabel,
  composerPresetLabels,
  onComposerPresetChange,
  onUpdateAppSettings,
}: SettingsComposerSectionProps) {
  const { t } = useI18n();
  const steerUnavailable = !appSettings.steerEnabled;
  return (
    <SettingsSection
      title={t("settings.composer.title", "Composer")}
      subtitle={t(
        "settings.composer.subtitle",
        "Control helpers and formatting behavior inside the message editor.",
      )}
    >
      <div className="settings-field">
        <div className="settings-field-label">
          {t("settings.composer.followUp.label", "Follow-up behavior")}
        </div>
        <div className={`settings-segmented${appSettings.followUpMessageBehavior === "steer" ? " is-second-active" : ""}`} aria-label={t("settings.composer.followUp.label", "Follow-up behavior")}>
          <label
            className={`settings-segmented-option${
              appSettings.followUpMessageBehavior === "queue" ? " is-active" : ""
            }`}
          >
            <input
              className="settings-segmented-input"
              type="radio"
              name="follow-up-behavior"
              value="queue"
              checked={appSettings.followUpMessageBehavior === "queue"}
              onChange={() =>
                void onUpdateAppSettings({
                  ...appSettings,
                  followUpMessageBehavior: "queue",
                })
              }
            />
            <span className="settings-segmented-option-label">{t("composer.followUp.mode.queue", "Queue")}</span>
          </label>
          <label
            className={`settings-segmented-option${
              appSettings.followUpMessageBehavior === "steer" ? " is-active" : ""
            }${steerUnavailable ? " is-disabled" : ""}`}
            title={steerUnavailable ? t("settings.composer.followUp.steerUnavailable", "Steer is unavailable in the current Codex config.") : ""}
          >
            <input
              className="settings-segmented-input"
              type="radio"
              name="follow-up-behavior"
              value="steer"
              checked={appSettings.followUpMessageBehavior === "steer"}
              disabled={steerUnavailable}
              onChange={() => {
                if (steerUnavailable) {
                  return;
                }
                void onUpdateAppSettings({
                  ...appSettings,
                  followUpMessageBehavior: "steer",
                });
              }}
            />
            <span className="settings-segmented-option-label">{t("composer.followUp.mode.steer", "Steer")}</span>
          </label>
        </div>
        <div className="settings-help">
          {t(
            "settings.composer.followUp.help",
            "Choose the default while a run is active. Press {shortcut} to send the opposite behavior for one message.",
          ).replace("{shortcut}", followUpShortcutLabel)}
        </div>
        <SettingsToggleRow
          title={t("settings.composer.followUp.showHint.title", "Show follow-up hint while processing")}
          subtitle={t("settings.composer.followUp.showHint.subtitle", "Displays queue/steer shortcut guidance above the composer.")}
        >
          <SettingsToggleSwitch
            pressed={appSettings.composerFollowUpHintEnabled}
            onClick={() =>
              void onUpdateAppSettings({
                ...appSettings,
                composerFollowUpHintEnabled: !appSettings.composerFollowUpHintEnabled,
              })
            }
          />
        </SettingsToggleRow>
        {steerUnavailable && (
          <div className="settings-help">
            {t("settings.composer.followUp.steerUnavailableQueue", "Steer is unavailable in the current Codex config. Follow-ups will queue.")}
          </div>
        )}
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{t("settings.composer.presets.title", "Presets")}</div>
      <div className="settings-subsection-subtitle">
        {t("settings.composer.presets.subtitle", "Choose a starting point and fine-tune the toggles below.")}
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="composer-preset">
          {t("settings.composer.presets.label", "Preset")}
        </label>
        <select
          id="composer-preset"
          className="settings-select"
          value={appSettings.composerEditorPreset}
          onChange={(event) =>
            onComposerPresetChange(event.target.value as ComposerPreset)
          }
        >
          {Object.entries(composerPresetLabels).map(([preset, label]) => (
            <option key={preset} value={preset}>
              {label}
            </option>
          ))}
        </select>
        <div className="settings-help">
          {t("settings.composer.presets.help", "Presets update the toggles below. Customize any setting after selecting.")}
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{t("settings.composer.codeFences.title", "Code fences")}</div>
      <SettingsToggleRow
        title={t("settings.composer.codeFences.expandSpace.title", "Expand fences on Space")}
        subtitle={t("settings.composer.codeFences.expandSpace.subtitle", "Typing ``` then Space inserts a fenced block.")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceExpandOnSpace}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceExpandOnSpace: !appSettings.composerFenceExpandOnSpace,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("settings.composer.codeFences.expandEnter.title", "Expand fences on Enter")}
        subtitle={t("settings.composer.codeFences.expandEnter.subtitle", "Use Enter to expand ``` lines when enabled.")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceExpandOnEnter}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceExpandOnEnter: !appSettings.composerFenceExpandOnEnter,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("settings.composer.codeFences.languageTags.title", "Support language tags")}
        subtitle={t("settings.composer.codeFences.languageTags.subtitle", "Allows ```lang + Space to include a language.")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceLanguageTags}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceLanguageTags: !appSettings.composerFenceLanguageTags,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("settings.composer.codeFences.wrapSelection.title", "Wrap selection in fences")}
        subtitle={t("settings.composer.codeFences.wrapSelection.subtitle", "Wraps selected text when creating a fence.")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceWrapSelection}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceWrapSelection: !appSettings.composerFenceWrapSelection,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("settings.composer.codeFences.copyWithoutFences.title", "Copy blocks without fences")}
        subtitle={
          <>
            {t(
              "settings.composer.codeFences.copyWithoutFences.subtitle",
              "When enabled, Copy is plain text. Hold {key} to include ``` fences.",
            ).replace("{key}", optionKeyLabel)}
          </>
        }
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerCodeBlockCopyUseModifier}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerCodeBlockCopyUseModifier:
                !appSettings.composerCodeBlockCopyUseModifier,
            })
          }
        />
      </SettingsToggleRow>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{t("settings.composer.pasting.title", "Pasting")}</div>
      <SettingsToggleRow
        title={t("settings.composer.pasting.multiLine.title", "Auto-wrap multi-line paste")}
        subtitle={t("settings.composer.pasting.multiLine.subtitle", "Wraps multi-line paste inside a fenced block.")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceAutoWrapPasteMultiline}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceAutoWrapPasteMultiline:
                !appSettings.composerFenceAutoWrapPasteMultiline,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("settings.composer.pasting.singleLine.title", "Auto-wrap code-like single lines")}
        subtitle={t("settings.composer.pasting.singleLine.subtitle", "Wraps long single-line code snippets on paste.")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceAutoWrapPasteCodeLike}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceAutoWrapPasteCodeLike:
                !appSettings.composerFenceAutoWrapPasteCodeLike,
            })
          }
        />
      </SettingsToggleRow>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{t("settings.composer.lists.title", "Lists")}</div>
      <SettingsToggleRow
        title={t("settings.composer.lists.continue.title", "Continue lists on Shift+Enter")}
        subtitle={t("settings.composer.lists.continue.subtitle", "Continues numbered and bulleted lists when the line has content.")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerListContinuation}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerListContinuation: !appSettings.composerListContinuation,
            })
          }
        />
      </SettingsToggleRow>
    </SettingsSection>
  );
}
