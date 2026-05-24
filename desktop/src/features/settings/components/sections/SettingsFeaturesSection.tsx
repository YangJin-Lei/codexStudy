import type { CodexFeature } from "@/types";
import {
  SettingsSection,
  SettingsSubsection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import type { SettingsFeaturesSectionProps } from "@settings/hooks/useSettingsFeaturesSection";
import { fileManagerName, openInFileManagerLabel } from "@utils/platformPaths";
import { useI18n } from "@/i18n/I18nProvider";

type TranslateFn = (key: string, fallback: string) => string;

const FEATURE_DESCRIPTION_FALLBACKS: Record<string, string> = {
  undo: "Create a ghost commit at each turn.",
  shell_tool: "Enable the default shell tool.",
  unified_exec: "Use the single unified PTY-backed exec tool.",
  shell_snapshot: "Enable shell snapshotting.",
  js_repl: "Enable JavaScript REPL tools backed by a persistent Node kernel.",
  js_repl_tools_only: "Only expose js_repl tools directly to the model.",
  web_search_request: "Deprecated. Use top-level web_search instead.",
  web_search_cached: "Deprecated. Use top-level web_search instead.",
  search_tool: "Removed legacy search flag kept for backward compatibility.",
  runtime_metrics: "Enable runtime metrics snapshots via a manual reader.",
  sqlite: "Persist rollout metadata to a local SQLite database.",
  memory_tool: "Enable startup memory extraction and memory consolidation.",
  child_agents_md: "Append additional AGENTS.md guidance to user instructions.",
  apply_patch_freeform: "Include the freeform apply_patch tool.",
  use_linux_sandbox_bwrap: "Use the bubblewrap-based Linux sandbox pipeline.",
  request_rule: "Allow approval requests and exec rule proposals.",
  experimental_windows_sandbox:
    "Removed Windows sandbox flag kept for backward compatibility.",
  elevated_windows_sandbox:
    "Removed elevated Windows sandbox flag kept for backward compatibility.",
  remote_models: "Refresh remote models before AppReady.",
  powershell_utf8: "Enforce UTF-8 output in PowerShell.",
  enable_request_compression:
    "Compress streaming request bodies sent to codex-backend.",
  apps: "Enable ChatGPT Apps integration.",
  apps_mcp_gateway: "Route Apps MCP calls through the configured gateway.",
  skill_mcp_dependency_install:
    "Allow prompting and installing missing MCP dependencies.",
  skill_env_var_dependency_prompt:
    "Prompt for missing skill environment variable dependencies.",
  steer: "Enable turn steering capability when supported by Codex.",
  collaboration_modes: "Enable collaboration mode presets.",
  personality: "Enable personality selection.",
  responses_websockets:
    "Use Responses API WebSocket transport for OpenAI by default.",
  responses_websockets_v2: "Enable Responses API WebSocket v2 mode.",
  plugin_sharing: "Share plugins across workspaces.",
  plugins: "Enable plugin system.",
  tool_call_mcp_elicitation: "Enable MCP tool call elicitation.",
  tool_search: "Enable tool search.",
  tool_suggest: "Enable tool suggestions.",
  apply_patch_streaming_events: "Stream apply_patch events in real time.",
  apps_mcp_path_override: "Override MCP path for apps.",
  artifact: "Enable artifact support.",
  auth_elicitation: "Enable authentication elicitation.",
  chronicle: "Enable chronicle.",
  code_mode: "Enable code mode.",
  code_mode_only: "Restrict to code mode only.",
  default_mode_request_user_input: "Request user input in default mode.",
  exec_permission_approvals: "Enable exec permission approvals.",
  external_migration:
    "Show a startup prompt when Codex detects migratable external agent config for this machine or project.",
  goals: "Set a persistent goal Codex can continue over time.",
  memories:
    "Allow Codex to create new memories from conversations and bring relevant memories into new conversations.",
  mentions_v2:
    "Use a unified @ mention popup for files, folders, apps, plugins, and skills.",
  multi_agent_v2: "Enable multi-agent V2.",
  network_proxy:
    "Apply network proxy restrictions to sandboxed sessions that already have network access.",
  prevent_sleep_while_running: "Keep your computer awake while Codex is running a thread.",
  realtime_conversation: "Enable realtime conversation.",
  remote_compaction_v2: "Enable remote compaction V2.",
  remote_completion_v2: "Enable remote completion V2.",
  remote_plugin: "Enable remote plugin.",
  request_permissions_tool: "Enable request permissions tool.",
  responses_websocket_response_processed: "Enable WebSocket response processed events.",
  shell_zsh_fork: "Enable shell zsh fork.",
  terminal_resize_reflow:
    "Rebuild Codex-owned transcript scrollback when the terminal width changes.",
  tool_search_always_defer_mcp_tools: "Always defer MCP tools in tool search.",
  browser_use: "Enable browser automation capabilities.",
  browser_use_external: "Enable external browser automation.",
  computer_use: "Enable computer control capabilities.",
  fast_mode: "Enable fast mode.",
  guardian_approval: "Enable guardian approval.",
  hooks: "Enable hooks.",
  image_generation: "Enable image generation.",
  in_app_browser: "Enable in-app browser.",
};

function formatFeatureLabel(feature: CodexFeature, t: TranslateFn): string {
  const generatedLabel = feature.name
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
  const fallbackLabel = feature.displayName?.trim() || generatedLabel;
  return t(`settings.features.flag.${feature.name}.title`, fallbackLabel);
}

function featureSubtitle(feature: CodexFeature, t: TranslateFn): string {
  const backendDescription = feature.description?.trim() || feature.announcement?.trim() || "";
  const fallbackDescription = FEATURE_DESCRIPTION_FALLBACKS[feature.name] || backendDescription;
  if (fallbackDescription) {
    return t(`settings.features.flag.${feature.name}.subtitle`, fallbackDescription);
  }
  if (feature.stage === "deprecated") {
    return t("settings.features.flag.deprecated", "Deprecated feature flag.");
  }
  if (feature.stage === "removed") {
    return t(
      "settings.features.flag.removed",
      "Legacy feature flag kept for backward compatibility.",
    );
  }
  return `${t("settings.features.flag.keyPrefix", "Feature key:")} features.${feature.name}`;
}

export function SettingsFeaturesSection({
  appSettings,
  hasFeatureWorkspace,
  openConfigError,
  featureError,
  featuresLoading,
  featureUpdatingKey,
  stableFeatures,
  experimentalFeatures,
  hasDynamicFeatureRows,
  onOpenConfig,
  onToggleCodexFeature,
  onUpdateAppSettings,
}: SettingsFeaturesSectionProps) {
  const { t } = useI18n();
  const tx: TranslateFn = (key, fallback) => t(key as never, fallback);

  return (
    <SettingsSection
      title={t("settings.features.title", "Features")}
      subtitle={t(
        "settings.features.subtitle",
        "Manage stable and experimental Codex features.",
      )}
    >
      <SettingsToggleRow
        title={t("settings.features.config.title", "Config file")}
        subtitle={t(
          "settings.features.config.subtitle",
          `Open the Codex config in ${fileManagerName()}.`,
        )}
      >
        <button type="button" className="ghost" onClick={onOpenConfig}>
          {openInFileManagerLabel()}
        </button>
      </SettingsToggleRow>
      {openConfigError && <div className="settings-help">{openConfigError}</div>}

      <SettingsSubsection
        title={t("settings.features.stable.title", "Stable Features")}
        subtitle={t(
          "settings.features.stable.subtitle",
          "Production-ready features enabled by default.",
        )}
      />

      <SettingsToggleRow
        title={t("settings.features.personality.title", "Personality")}
        subtitle={t(
          "settings.features.personality.subtitle",
          "Choose Codex communication style (writes top-level personality in config.toml).",
        )}
      >
        <select
          id="features-personality-select"
          className="settings-select"
          value={appSettings.personality}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              personality: event.target.value as (typeof appSettings)["personality"],
            })
          }
          aria-label={t("settings.features.personality.title", "Personality")}
        >
          <option value="friendly">
            {t("settings.features.personality.friendly", "Friendly")}
          </option>
          <option value="pragmatic">
            {t("settings.features.personality.pragmatic", "Pragmatic")}
          </option>
        </select>
      </SettingsToggleRow>

      <SettingsToggleRow
        title={t(
          "settings.features.pauseQueued.title",
          "Pause queued messages when a response is required",
        )}
        subtitle={t(
          "settings.features.pauseQueued.subtitle",
          "Keep queued messages paused while Codex is waiting for plan accept/changes or your answers.",
        )}
      >
        <SettingsToggleSwitch
          pressed={appSettings.pauseQueuedMessagesWhenResponseRequired}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              pauseQueuedMessagesWhenResponseRequired:
                !appSettings.pauseQueuedMessagesWhenResponseRequired,
            })
          }
        />
      </SettingsToggleRow>

      {stableFeatures.map((feature) => (
        <SettingsToggleRow
          key={feature.name}
          title={formatFeatureLabel(feature, tx)}
          subtitle={featureSubtitle(feature, tx)}
        >
          <SettingsToggleSwitch
            pressed={feature.enabled}
            onClick={() => onToggleCodexFeature(feature)}
            disabled={featureUpdatingKey === feature.name}
          />
        </SettingsToggleRow>
      ))}

      {hasFeatureWorkspace &&
        !featuresLoading &&
        !featureError &&
        stableFeatures.length === 0 && (
          <div className="settings-help">
            {t(
              "settings.features.stable.empty",
              "No stable feature flags returned by Codex.",
            )}
          </div>
        )}

      <SettingsSubsection
        title={t("settings.features.experimental.title", "Experimental Features")}
        subtitle={t(
          "settings.features.experimental.subtitle",
          "Preview and under-development features.",
        )}
      />

      {experimentalFeatures.map((feature) => (
        <SettingsToggleRow
          key={feature.name}
          title={formatFeatureLabel(feature, tx)}
          subtitle={featureSubtitle(feature, tx)}
        >
          <SettingsToggleSwitch
            pressed={feature.enabled}
            onClick={() => onToggleCodexFeature(feature)}
            disabled={featureUpdatingKey === feature.name}
          />
        </SettingsToggleRow>
      ))}

      {hasFeatureWorkspace &&
        !featuresLoading &&
        !featureError &&
        hasDynamicFeatureRows &&
        experimentalFeatures.length === 0 && (
          <div className="settings-help">
            {t(
              "settings.features.experimental.empty",
              "No preview or under-development feature flags returned by Codex.",
            )}
          </div>
        )}

      {featuresLoading && (
        <div className="settings-help">
          {t("settings.features.loading", "Loading Codex feature flags...")}
        </div>
      )}

      {!hasFeatureWorkspace && !featuresLoading && (
        <div className="settings-help">
          {t(
            "settings.features.connectWorkspace",
            "Connect a workspace to load Codex feature flags.",
          )}
        </div>
      )}

      {featureError && <div className="settings-help">{featureError}</div>}
    </SettingsSection>
  );
}
