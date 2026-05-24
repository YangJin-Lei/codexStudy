import { useEffect, useMemo, useRef } from "react";
import Stethoscope from "lucide-react/dist/esm/icons/stethoscope";
import type { Dispatch, SetStateAction } from "react";
import type {
  AppSettings,
  CodexDoctorResult,
  CodexUpdateResult,
  ModelOption,
  ModelProviderAuthMode,
  ModelProviderHistoryEntry,
  ModelProviderPreset,
} from "@/types";
import { isAccountLoginUiEnabled } from "@/codexStudyUiFlags";
import {
  SettingsSection,
  SettingsToggleRow,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { FileEditorCard } from "@/features/shared/components/FileEditorCard";
import { useI18n } from "@/i18n/I18nProvider";

type SettingsCodexSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  defaultModels: ModelOption[];
  defaultModelsLoading: boolean;
  defaultModelsError: string | null;
  defaultModelsConnectedWorkspaceCount: number;
  onRefreshDefaultModels: () => void;
  codexPathDraft: string;
  codexArgsDraft: string;
  codexDirty: boolean;
  isSavingSettings: boolean;
  doctorState: {
    status: "idle" | "running" | "done";
    result: CodexDoctorResult | null;
  };
  codexUpdateState: {
    status: "idle" | "running" | "done";
    result: CodexUpdateResult | null;
  };
  providerSettingsLoading: boolean;
  providerSettingsSaving: boolean;
  providerSettingsDirty: boolean;
  providerSettingsError: string | null;
  providerSettingsSaveMessage: string | null;
  providerHistory: ModelProviderHistoryEntry[];
  providerHistoryLoading: boolean;
  providerHistoryDeletingId: string | null;
  providerHistoryError: string | null;
  providerPreset: ModelProviderPreset;
  providerNameDraft: string;
  providerBaseUrlDraft: string;
  providerAuthModeDraft: ModelProviderAuthMode;
  providerApiKeyDraft: string;
  providerAwsProfileDraft: string;
  providerAwsRegionDraft: string;
  providerApiKeyConfigured: boolean;
  providerConnectionMode: "managedLogin" | "direct" | "compatibilityBridge";
  providerEffectiveBaseUrl: string | null;
  providerBridgeBaseUrl: string | null;
  providerUpstreamBaseUrl: string | null;
  providerConnectionTestState: {
    status: "idle" | "running" | "done";
    result: {
      status: "ok" | "warning" | "error";
      canTest: boolean;
      checkedUrl: string | null;
      responseStatus: number | null;
      summary: string;
      detail: string | null;
      actionHint: string | null;
    } | null;
  };
  globalAgentsMeta: string;
  globalAgentsError: string | null;
  globalAgentsContent: string;
  globalAgentsLoading: boolean;
  globalAgentsRefreshDisabled: boolean;
  globalAgentsSaveDisabled: boolean;
  globalAgentsSaveLabel: string;
  globalConfigMeta: string;
  globalConfigError: string | null;
  globalConfigContent: string;
  globalConfigLoading: boolean;
  globalConfigRefreshDisabled: boolean;
  globalConfigSaveDisabled: boolean;
  globalConfigSaveLabel: string;
  onSetCodexPathDraft: Dispatch<SetStateAction<string>>;
  onSetCodexArgsDraft: Dispatch<SetStateAction<string>>;
  onSetProviderPreset: (value: ModelProviderPreset) => void;
  onSetProviderNameDraft: (value: string) => void;
  onSetProviderBaseUrlDraft: (value: string) => void;
  onSetProviderAuthModeDraft: (value: ModelProviderAuthMode) => void;
  onSetProviderApiKeyDraft: (value: string) => void;
  onSetProviderAwsProfileDraft: (value: string) => void;
  onSetProviderAwsRegionDraft: (value: string) => void;
  onSetGlobalAgentsContent: (value: string) => void;
  onSetGlobalConfigContent: (value: string) => void;
  onBrowseCodex: () => Promise<void>;
  onSaveCodexSettings: () => Promise<void>;
  onRunDoctor: () => Promise<void>;
  onRunCodexUpdate: () => Promise<void>;
  onRefreshProviderSettings: () => void;
  onRunProviderConnectionTest: () => Promise<void>;
  onSaveProviderSettings: () => Promise<void>;
  onDeleteProviderHistoryEntry: (entry: ModelProviderHistoryEntry) => Promise<void>;
  onRefreshGlobalAgents: () => void;
  onSaveGlobalAgents: () => void;
  onRefreshGlobalConfig: () => void;
  onSaveGlobalConfig: () => void;
};

const DEFAULT_REASONING_EFFORT = "medium";
const BEDROCK_ENDPOINT = import.meta.env.VITE_BEDROCK_ENDPOINT || "https://bedrock-mantle.us-east-1.api.aws/openai/v1";

const PROVIDER_PRESET_LABELS: Record<ModelProviderPreset, string> = {
  chatgpt: "ChatGPT / OpenAI",
  openaiApi: "OpenAI API key",
  deepSeek: "DeepSeek",
  qwen: "Qwen (Responses)",
  doubao: "Doubao (Ark)",
  claude: "Claude (Anthropic)",
  gemini: "Gemini (Google)",
  zhipu: "智谱AI (GLM)",
  moonshot: "月之暗面 (Kimi)",
  baichuan: "百川智能",
  minimax: "MiniMax",
  customResponses: "Custom Responses API",
  ollama: "Ollama",
  lmstudio: "LM Studio",
  amazonBedrock: "Amazon Bedrock",
};

const PROVIDER_PRESET_HELP: Record<ModelProviderPreset, string> = {
  chatgpt:
    "Uses Codex's built-in ChatGPT/OpenAI login flow. Switch back here when you want the original account-based experience.",
  openaiApi:
    "Stores an OpenAI-compatible bearer token in config.toml and talks directly to the Responses API endpoint.",
  deepSeek:
    "Uses DeepSeek through CodexStudy's local compatibility bridge. Requires an API key from platform.deepseek.com.",
  qwen:
    "Uses Qwen's Responses-compatible endpoint. Leave the default base URL unless you need a different regional route.",
  doubao:
    "Uses Doubao through CodexStudy's local compatibility bridge. Requires an API key from Volcengine Ark.",
  claude:
    "Uses Anthropic's Claude API. Requires an API key from console.anthropic.com.",
  gemini:
    "Uses Google's Gemini API. Requires an API key from ai.google.dev.",
  zhipu:
    "使用智谱AI的API。需要从open.bigmodel.cn获取API密钥。",
  moonshot:
    "使用月之暗面(Kimi)的API。需要从platform.moonshot.cn获取API密钥。",
  baichuan:
    "使用百川智能的API。需要从platform.baichuan-ai.com获取API密钥。",
  minimax:
    "Uses MiniMax's API. Requires an API key from api.minimax.chat.",
  customResponses:
    "For other vendors, use this when you have a Responses-compatible gateway or adapter URL.",
  ollama:
    "Targets a local Ollama server. You can change the base URL if your local gateway is on another port.",
  lmstudio:
    "Targets LM Studio's local OpenAI-compatible server. Adjust the base URL if you use a custom port.",
  amazonBedrock:
    "Uses Codex's built-in Amazon Bedrock provider. Only AWS profile and region are configurable here.",
};

const CUSTOM_AUTH_OPTIONS: { value: ModelProviderAuthMode; label: string }[] = [
  { value: "apiKey", label: "API key" },
  { value: "none", label: "No auth" },
];

const AUTH_MODE_LABELS: Record<ModelProviderAuthMode, string> = {
  chatgpt: "Managed login",
  apiKey: "API key",
  none: "No auth",
  aws: "AWS",
};

const VISION_FALLBACK_LABELS = {
  doubao: "Doubao Vision",
  qwen: "Qwen VL",
  zhipu: "Zhipu GLM-V",
  moonshot: "Kimi Vision",
  baichuan: "Baichuan Vision",
  minimax: "MiniMax Vision",
} as const;

const VISION_FALLBACK_DEFAULTS = {
  doubao: {
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-1.5-vision-pro-32k-250115",
  },
  qwen: {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-vl-max-latest",
  },
  zhipu: {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4.1v-thinking-flashx",
  },
  moonshot: {
    baseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-k2.5-vision-preview",
  },
  baichuan: {
    baseUrl: "https://api.baichuan-ai.com/v1",
    model: "Baichuan4-Vision",
  },
  minimax: {
    baseUrl: "https://api.minimax.chat/v1",
    model: "MiniMax-VL-01",
  },
} as const;

const normalizeEffortValue = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
};

function coerceSavedModelSlug(value: string | null, models: ModelOption[]): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return null;
  }
  const bySlug = models.find((model) => model.model === trimmed);
  if (bySlug) {
    return bySlug.model;
  }
  const byId = models.find((model) => model.id === trimmed);
  return byId ? byId.model : null;
}

const getReasoningSupport = (model: ModelOption | null): boolean => {
  if (!model) {
    return false;
  }
  return model.supportedReasoningEfforts.length > 0 || model.defaultReasoningEffort !== null;
};

const getReasoningOptions = (model: ModelOption | null): string[] => {
  if (!model) {
    return [];
  }
  const supported = model.supportedReasoningEfforts
    .map((effort) => normalizeEffortValue(effort.reasoningEffort))
    .filter((effort): effort is string => Boolean(effort));
  if (supported.length > 0) {
    return Array.from(new Set(supported));
  }
  const fallback = normalizeEffortValue(model.defaultReasoningEffort);
  return fallback ? [fallback] : [];
};

type TranslateFn = (key: string, fallback: string) => string;

function providerPresetLabel(
  preset: ModelProviderPreset,
  t: TranslateFn,
): string {
  return t(`settings.codex.providerPresetLabel.${preset}`, PROVIDER_PRESET_LABELS[preset]);
}

function providerPresetHelp(
  preset: ModelProviderPreset,
  t: TranslateFn,
): string {
  return t(`settings.codex.providerPresetHelp.${preset}`, PROVIDER_PRESET_HELP[preset]);
}

function providerRouteModeLabel(
  mode: "managedLogin" | "direct" | "compatibilityBridge",
  t: TranslateFn,
): string {
  switch (mode) {
    case "managedLogin":
      return t("settings.codex.routeMode.managedLogin", "Managed login");
    case "compatibilityBridge":
      return t("settings.codex.routeMode.compatibilityBridge", "Protocol bridge");
    case "direct":
    default:
      return t("settings.codex.routeMode.direct", "Direct");
  }
}

function providerRouteStatusClass(status: "ok" | "warning" | "error"): string {
  switch (status) {
    case "warning":
      return "settings-provider-status settings-provider-status--warning";
    case "error":
      return "settings-provider-status settings-provider-status--error";
    case "ok":
    default:
      return "settings-provider-status settings-provider-status--ok";
  }
}

function formatHistoryTimestamp(value: number, fallback: string): string {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SettingsCodexSection({
  appSettings,
  onUpdateAppSettings,
  defaultModels,
  defaultModelsLoading,
  defaultModelsError,
  defaultModelsConnectedWorkspaceCount,
  onRefreshDefaultModels,
  codexPathDraft,
  codexArgsDraft,
  codexDirty,
  isSavingSettings,
  doctorState,
  codexUpdateState,
  providerSettingsLoading,
  providerSettingsSaving,
  providerSettingsDirty,
  providerSettingsError,
  providerSettingsSaveMessage,
  providerHistory,
  providerHistoryLoading,
  providerHistoryDeletingId,
  providerHistoryError,
  providerPreset,
  providerNameDraft,
  providerBaseUrlDraft,
  providerAuthModeDraft,
  providerApiKeyDraft,
  providerAwsProfileDraft,
  providerAwsRegionDraft,
  providerApiKeyConfigured,
  providerConnectionMode,
  providerEffectiveBaseUrl,
  providerBridgeBaseUrl,
  providerUpstreamBaseUrl,
  providerConnectionTestState,
  globalAgentsMeta,
  globalAgentsError,
  globalAgentsContent,
  globalAgentsLoading,
  globalAgentsRefreshDisabled,
  globalAgentsSaveDisabled,
  globalAgentsSaveLabel,
  globalConfigMeta,
  globalConfigError,
  globalConfigContent,
  globalConfigLoading,
  globalConfigRefreshDisabled,
  globalConfigSaveDisabled,
  globalConfigSaveLabel,
  onSetCodexPathDraft,
  onSetCodexArgsDraft,
  onSetProviderPreset,
  onSetProviderNameDraft,
  onSetProviderBaseUrlDraft,
  onSetProviderAuthModeDraft,
  onSetProviderApiKeyDraft,
  onSetProviderAwsProfileDraft,
  onSetProviderAwsRegionDraft,
  onSetGlobalAgentsContent,
  onSetGlobalConfigContent,
  onBrowseCodex,
  onSaveCodexSettings,
  onRunDoctor,
  onRunCodexUpdate,
  onRefreshProviderSettings,
  onRunProviderConnectionTest,
  onSaveProviderSettings,
  onDeleteProviderHistoryEntry,
  onRefreshGlobalAgents,
  onSaveGlobalAgents,
  onRefreshGlobalConfig,
  onSaveGlobalConfig,
}: SettingsCodexSectionProps) {
  const { t } = useI18n();
  const tx: TranslateFn = (key, fallback) => t(key as never, fallback);
  const visionFallback = appSettings.visionFallback ?? {
    enabled: false,
    preset: "doubao" as const,
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-1.5-vision-pro-32k-250115",
    apiKey: null,
  };
  const latestModelSlug = defaultModels[0]?.model ?? null;
  const savedModelSlug = useMemo(
    () => coerceSavedModelSlug(appSettings.lastComposerModelId, defaultModels),
    [appSettings.lastComposerModelId, defaultModels],
  );
  const selectedModelSlug = savedModelSlug ?? latestModelSlug ?? "";
  const selectedModel = useMemo(
    () => defaultModels.find((model) => model.model === selectedModelSlug) ?? null,
    [defaultModels, selectedModelSlug],
  );
  const reasoningSupported = useMemo(
    () => getReasoningSupport(selectedModel),
    [selectedModel],
  );
  const reasoningOptions = useMemo(
    () => getReasoningOptions(selectedModel),
    [selectedModel],
  );
  const visibleProviderPresets = useMemo(
    () =>
      (Object.keys(PROVIDER_PRESET_LABELS) as ModelProviderPreset[]).filter(
        (preset) =>
          isAccountLoginUiEnabled() ||
          preset !== "chatgpt" ||
          providerPreset === preset,
      ),
    [providerPreset],
  );
  const showProviderNameField = providerPreset === "customResponses";
  const showBaseUrlField =
    providerPreset !== "chatgpt" && providerPreset !== "amazonBedrock";
  const showApiKeyField =
    providerPreset === "openaiApi" ||
    providerPreset === "deepSeek" ||
    providerPreset === "qwen" ||
    providerPreset === "doubao" ||
    providerPreset === "claude" ||
    providerPreset === "gemini" ||
    providerPreset === "zhipu" ||
    providerPreset === "moonshot" ||
    providerPreset === "baichuan" ||
    providerPreset === "minimax" ||
    (providerPreset === "customResponses" && providerAuthModeDraft === "apiKey");
  const showCustomAuthMode = providerPreset === "customResponses";
  const showAwsFields = providerPreset === "amazonBedrock";
  const routeModeLabel = providerRouteModeLabel(providerConnectionMode, tx);
  const routeTestResult = providerConnectionTestState.result;
  const routeTestStatusClass = routeTestResult
    ? providerRouteStatusClass(routeTestResult.status)
    : null;
  const savedEffort = useMemo(
    () => normalizeEffortValue(appSettings.lastComposerReasoningEffort),
    [appSettings.lastComposerReasoningEffort],
  );
  const selectedEffort = useMemo(() => {
    if (!reasoningSupported) {
      return "";
    }
    if (savedEffort && reasoningOptions.includes(savedEffort)) {
      return savedEffort;
    }
    if (reasoningOptions.includes(DEFAULT_REASONING_EFFORT)) {
      return DEFAULT_REASONING_EFFORT;
    }
    const fallback = normalizeEffortValue(selectedModel?.defaultReasoningEffort);
    if (fallback && reasoningOptions.includes(fallback)) {
      return fallback;
    }
    return reasoningOptions[0] ?? "";
  }, [reasoningOptions, reasoningSupported, savedEffort, selectedModel]);

  const didNormalizeDefaultsRef = useRef(false);
  useEffect(() => {
    if (didNormalizeDefaultsRef.current) {
      return;
    }
    if (!defaultModels.length) {
      return;
    }
    const savedRawModel = (appSettings.lastComposerModelId ?? "").trim();
    const savedRawEffort = (appSettings.lastComposerReasoningEffort ?? "").trim();
    const shouldNormalizeModel = savedRawModel.length === 0 || savedModelSlug === null;
    const shouldNormalizeEffort =
      reasoningSupported &&
      (savedRawEffort.length === 0 ||
        savedEffort === null ||
        !reasoningOptions.includes(savedEffort));
    if (!shouldNormalizeModel && !shouldNormalizeEffort) {
      didNormalizeDefaultsRef.current = true;
      return;
    }

    const next: AppSettings = {
      ...appSettings,
      lastComposerModelId: shouldNormalizeModel ? selectedModelSlug : appSettings.lastComposerModelId,
      lastComposerReasoningEffort: shouldNormalizeEffort
        ? selectedEffort
        : appSettings.lastComposerReasoningEffort,
    };
    didNormalizeDefaultsRef.current = true;
    void onUpdateAppSettings(next);
  }, [
    appSettings,
    defaultModels.length,
    onUpdateAppSettings,
    reasoningOptions,
    reasoningSupported,
    savedEffort,
    savedModelSlug,
    selectedModelSlug,
    selectedEffort,
  ]);

  return (
    <SettingsSection
      title={t("settings.codex.title", "Codex")}
      subtitle={t("settings.codex.subtitle", "Configure the Codex CLI used by the desktop app. Leave the path blank to use the bundled copy.")}
    >
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="codex-path">
          {t("settings.codex.path.label", "Codex path override")}
        </label>
        <div className="settings-field-row">
          <input
            id="codex-path"
            className="settings-input"
            value={codexPathDraft}
            placeholder={t("settings.codex.path.placeholder", "Bundled codex (default)")}
            onChange={(event) => onSetCodexPathDraft(event.target.value)}
          />
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void onBrowseCodex();
            }}
          >
            {t("settings.common.browse", "Browse")}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => onSetCodexPathDraft("")}
          >
            {t("settings.codex.path.useBundled", "Use bundled")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.codex.path.help", "Leave empty to use the Codex CLI bundled with CodexStudy. Set a path only to override it.")}
        </div>
        <label className="settings-field-label" htmlFor="codex-args">
          {t("settings.codex.args.label", "Default Codex args")}
        </label>
        <div className="settings-field-row">
          <input
            id="codex-args"
            className="settings-input"
            value={codexArgsDraft}
            placeholder={t("settings.codex.args.placeholder", "--profile personal")}
            onChange={(event) => onSetCodexArgsDraft(event.target.value)}
          />
          <button
            type="button"
            className="ghost"
            onClick={() => onSetCodexArgsDraft("")}
          >
            {t("settings.projects.groups.clear", "Clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.codex.args.help", "Extra flags passed before")} <code>app-server</code>. {t("settings.codex.args.helpSuffix", "Use quotes for values with spaces.")}
        </div>
        <div className="settings-help">
          {t("settings.codex.args.sharedServer", "These settings apply to the shared Codex app-server used across all connected workspaces.")}
        </div>
        <div className="settings-help">
          {t("settings.codex.args.perThreadOverride", "Per-thread override processing ignores unsupported flags:")} <code>-m</code>/
          <code>--model</code>, <code>-a</code>/<code>--ask-for-approval</code>,{" "}
          <code>-s</code>/<code>--sandbox</code>, <code>--full-auto</code>,{" "}
          <code>--dangerously-bypass-approvals-and-sandbox</code>, <code>--oss</code>,{" "}
          <code>--local-provider</code>, {t("settings.codex.args.and", "and")} <code>--no-alt-screen</code>.
        </div>
        <div className="settings-field-actions">
          {codexDirty && (
            <button
              type="button"
              className="primary"
              onClick={() => {
                void onSaveCodexSettings();
              }}
              disabled={isSavingSettings}
            >
              {isSavingSettings ? t("settings.common.saving", "Saving...") : t("settings.common.save", "Save")}
            </button>
          )}
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              void onRunDoctor();
            }}
            disabled={doctorState.status === "running"}
          >
            <Stethoscope aria-hidden />
            {doctorState.status === "running" ? t("settings.codex.doctor.running", "Running...") : t("settings.codex.doctor.run", "Run doctor")}
          </button>
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              void onRunCodexUpdate();
            }}
            disabled={codexUpdateState.status === "running"}
            title={t("settings.codex.update.title", "Update Codex")}
          >
            <Stethoscope aria-hidden />
            {codexUpdateState.status === "running" ? t("settings.codex.update.running", "Updating...") : t("settings.codex.update.button", "Update")}
          </button>
        </div>

        {doctorState.result && (
          <div className={`settings-doctor ${doctorState.result.ok ? "ok" : "error"}`}>
            <div className="settings-doctor-title">
              {doctorState.result.ok
                ? t("settings.codex.doctor.ok", "Codex looks good")
                : t("settings.codex.doctor.issue", "Codex issue detected")}
            </div>
            <div className="settings-doctor-body">
              <div>{t("settings.about.version", "Version:")} {doctorState.result.version ?? t("settings.common.unknown", "unknown")}</div>
              <div>{t("settings.codex.appServer", "App-server:")} {doctorState.result.appServerOk ? t("settings.codex.ok", "ok") : t("settings.codex.failed", "failed")}</div>
              <div>
                {t("settings.codex.node", "Node:")}{" "}
                {doctorState.result.nodeOk
                  ? `${t("settings.codex.ok", "ok")} (${doctorState.result.nodeVersion ?? t("settings.common.unknown", "unknown")})`
                  : t("settings.codex.missing", "missing")}
              </div>
              {doctorState.result.details && <div>{doctorState.result.details}</div>}
              {doctorState.result.nodeDetails && <div>{doctorState.result.nodeDetails}</div>}
              {doctorState.result.path && (
                <div className="settings-doctor-path">
                  {t("settings.codex.pathValue", "Path:")} {doctorState.result.path}
                </div>
              )}
            </div>
          </div>
        )}

        {codexUpdateState.result && (
          <div
            className={`settings-doctor ${codexUpdateState.result.ok ? "ok" : "error"}`}
          >
            <div className="settings-doctor-title">
              {codexUpdateState.result.ok
                ? codexUpdateState.result.upgraded
                  ? t("settings.codex.updated", "Codex updated")
                  : t("settings.codex.upToDate", "Codex already up-to-date")
                : t("settings.codex.updateFailed", "Codex update failed")}
            </div>
            <div className="settings-doctor-body">
              <div>{t("settings.codex.method", "Method:")} {codexUpdateState.result.method}</div>
              {codexUpdateState.result.package && (
                <div>{t("settings.codex.package", "Package:")} {codexUpdateState.result.package}</div>
              )}
              <div>
                {t("settings.about.version", "Version:")}{" "}
                {codexUpdateState.result.afterVersion ??
                  codexUpdateState.result.beforeVersion ??
                  t("settings.common.unknown", "unknown")}
              </div>
              {codexUpdateState.result.details && <div>{codexUpdateState.result.details}</div>}
              {codexUpdateState.result.output && (
                <details>
                  <summary>{t("settings.codex.output", "output")}</summary>
                  <pre>{codexUpdateState.result.output}</pre>
                </details>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="settings-divider" />
      <div className="settings-field">
        <div className="settings-field-label settings-field-label--section">
          {t("settings.codex.modelProvider", "Model provider")}
        </div>
        <div className="settings-provider-card">
          <div className="settings-provider-route">
            <div className="settings-provider-route-header">
              <div className="settings-field-label">
                {t("settings.codex.currentRoute", "Current route")}
              </div>
              <span className="settings-provider-route-badge">{routeModeLabel}</span>
            </div>
            {providerConnectionMode === "compatibilityBridge" && providerBridgeBaseUrl && (
              <div className="settings-provider-route-row">
                <span>{t("settings.codex.localBridge", "Local bridge")}</span>
                <code>{providerBridgeBaseUrl}</code>
              </div>
            )}
            {providerConnectionMode !== "compatibilityBridge" && providerEffectiveBaseUrl && (
              <div className="settings-provider-route-row">
                <span>{t("settings.codex.codexEndpoint", "Codex endpoint")}</span>
                <code>{providerEffectiveBaseUrl}</code>
              </div>
            )}
            {providerConnectionMode === "compatibilityBridge" && providerUpstreamBaseUrl && (
              <div className="settings-provider-route-row">
                <span>{t("settings.codex.upstreamEndpoint", "Upstream API")}</span>
                <code>{providerUpstreamBaseUrl}</code>
              </div>
            )}
            {isAccountLoginUiEnabled() && providerConnectionMode === "managedLogin" && (
              <div className="settings-help">
                {t(
                  "settings.codex.routeManagedLoginHelp",
                  "This provider uses Codex's built-in login flow instead of a custom API base URL.",
                )}
              </div>
            )}
            {providerConnectionMode === "direct" && providerEffectiveBaseUrl && (
              <div className="settings-help">
                {t(
                  "settings.codex.routeDirectHelp",
                  "Requests go straight to this base URL using your current system network route.",
                )}
              </div>
            )}
            {providerConnectionMode === "compatibilityBridge" && (
              <div className="settings-help">
                {t(
                  "settings.codex.routeBridgeHelp",
                  "The local bridge only translates protocol. It does not provide a VPN or proxy.",
                )}
              </div>
            )}
            {providerSettingsDirty && (
              <div className="settings-help">
                {t(
                  "settings.codex.routeUnsaved",
                  "Unsaved edits above will not affect requests until you save this provider.",
                )}
              </div>
            )}
          </div>

          <div className="settings-provider-grid">
            <div className="settings-provider-field">
              <label className="settings-field-label" htmlFor="provider-preset">
                {t("settings.codex.providerPreset", "Provider preset")}
              </label>
              <select
                id="provider-preset"
                className="settings-select"
                value={providerPreset}
                disabled={providerSettingsLoading || providerSettingsSaving}
                onChange={(event) =>
                  onSetProviderPreset(event.target.value as ModelProviderPreset)
                }
              >
                {visibleProviderPresets.map((preset) => (
                  <option key={preset} value={preset}>
                    {providerPresetLabel(preset, tx)}
                  </option>
                ))}
              </select>
              <div className="settings-help">{providerPresetHelp(providerPreset, tx)}</div>
            </div>

            {showProviderNameField && (
              <div className="settings-provider-field">
                <label className="settings-field-label" htmlFor="provider-name">
                  {t("settings.codex.providerName", "Provider name")}
                </label>
                <input
                  id="provider-name"
                  className="settings-input"
                  value={providerNameDraft}
                  placeholder={t(
                    "settings.codex.providerName.placeholder",
                    "Custom Responses API",
                  )}
                  disabled={providerSettingsLoading || providerSettingsSaving}
                  onChange={(event) => onSetProviderNameDraft(event.target.value)}
                />
              </div>
            )}

            {showBaseUrlField && (
              <div className="settings-provider-field">
                <label className="settings-field-label" htmlFor="provider-base-url">
                  {t("settings.codex.baseUrl", "Base URL")}
                </label>
                <input
                  id="provider-base-url"
                  className="settings-input"
                  value={providerBaseUrlDraft}
                  placeholder="https://api.example.com/v1"
                  disabled={providerSettingsLoading || providerSettingsSaving}
                  onChange={(event) => onSetProviderBaseUrlDraft(event.target.value)}
                />
              </div>
            )}

            {showCustomAuthMode && (
              <div className="settings-provider-field">
                <label className="settings-field-label" htmlFor="provider-auth-mode">
                  {t("settings.codex.authMode", "Auth mode")}
                </label>
                <select
                  id="provider-auth-mode"
                  className="settings-select"
                  value={providerAuthModeDraft}
                  disabled={providerSettingsLoading || providerSettingsSaving}
                  onChange={(event) =>
                    onSetProviderAuthModeDraft(event.target.value as ModelProviderAuthMode)
                  }
                >
                  {CUSTOM_AUTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(`settings.codex.authOption.${option.value}` as never, option.label)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {showApiKeyField && (
              <div className="settings-provider-field">
                <label className="settings-field-label" htmlFor="provider-api-key">
                  {t("settings.codex.apiKey", "API key")}
                </label>
                <input
                  id="provider-api-key"
                  className="settings-input"
                  type="password"
                  value={providerApiKeyDraft}
                  placeholder={
                    providerApiKeyConfigured
                      ? t("settings.codex.leaveBlankKeepKey", "Leave blank to keep current key")
                      : "sk-..."
                  }
                  disabled={providerSettingsLoading || providerSettingsSaving}
                  onChange={(event) => onSetProviderApiKeyDraft(event.target.value)}
                />
                <div className="settings-help">
                  {t("settings.codex.providerStored", "Stored in CodexStudy's isolated config.toml for this provider preset.")}
                </div>
              </div>
            )}

            {showAwsFields && (
              <>
                <div className="settings-provider-field">
                  <label className="settings-field-label" htmlFor="provider-aws-profile">
                    {t("settings.codex.awsProfile", "AWS profile")}
                  </label>
                  <input
                    id="provider-aws-profile"
                    className="settings-input"
                    value={providerAwsProfileDraft}
                    placeholder="default"
                    disabled={providerSettingsLoading || providerSettingsSaving}
                    onChange={(event) => onSetProviderAwsProfileDraft(event.target.value)}
                  />
                </div>
                <div className="settings-provider-field">
                  <label className="settings-field-label" htmlFor="provider-aws-region">
                    {t("settings.codex.awsRegion", "AWS region")}
                  </label>
                  <input
                    id="provider-aws-region"
                    className="settings-input"
                    value={providerAwsRegionDraft}
                    placeholder="us-east-1"
                    disabled={providerSettingsLoading || providerSettingsSaving}
                    onChange={(event) => onSetProviderAwsRegionDraft(event.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          {providerPreset === "amazonBedrock" && (
            <div className="settings-provider-note">
              {t("settings.codex.fixedEndpoint", "Fixed endpoint:")} <code>{BEDROCK_ENDPOINT}</code>
            </div>
          )}

          <div className="settings-provider-note">
            {t(
              "settings.codex.providerBridgeNote",
              "DeepSeek, Qwen, Doubao, Zhipu, Kimi, Baichuan, MiniMax, Ollama, and LM Studio use the local compatibility bridge here. It converts protocol shape only; your upstream network path still has to be reachable on its own.",
            )}
          </div>

          <div className="settings-provider-note">
            {t(
              "settings.codex.imageSupportNote",
              "Image support depends on the specific model, not just the vendor. Vision models are exposed as image-capable when CodexStudy can verify them; everything else stays text-only by default.",
            )}
          </div>

          <div className="settings-field-actions">
            <button
              type="button"
              className="ghost"
              onClick={onRefreshProviderSettings}
              disabled={providerSettingsLoading || providerSettingsSaving}
            >
              {t("settings.common.refresh", "Refresh")}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                void onRunProviderConnectionTest();
              }}
              disabled={
                providerSettingsLoading ||
                providerSettingsSaving ||
                providerConnectionMode === "managedLogin" ||
                providerConnectionTestState.status === "running"
              }
            >
              {providerConnectionTestState.status === "running"
                ? t("settings.codex.testRoute.running", "Testing...")
                : t("settings.codex.testRoute", "Test route")}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                void onSaveProviderSettings();
              }}
              disabled={
                providerSettingsLoading || providerSettingsSaving || !providerSettingsDirty
              }
            >
              {providerSettingsSaving
                ? t("settings.common.saving", "Saving...")
                : t("settings.codex.saveProvider", "Save provider")}
            </button>
          </div>

          {providerSettingsError && (
            <div className="settings-provider-status settings-provider-status--error">
              {providerSettingsError}
            </div>
          )}

          {routeTestResult && routeTestStatusClass && (
            <div className={routeTestStatusClass}>
              <div>{routeTestResult.summary}</div>
              {routeTestResult.responseStatus !== null && (
                <div>
                  {t("settings.codex.routeHttpStatus", "HTTP status:")}{" "}
                  <code>{routeTestResult.responseStatus}</code>
                </div>
              )}
              {routeTestResult.detail && <div>{routeTestResult.detail}</div>}
              {routeTestResult.actionHint && <div>{routeTestResult.actionHint}</div>}
              {routeTestResult.checkedUrl && (
                <div>
                  {t("settings.codex.checkedRoute", "Checked route:")}{" "}
                  <code>{routeTestResult.checkedUrl}</code>
                </div>
              )}
            </div>
          )}

          {providerSettingsSaveMessage && !providerSettingsError && (
            <div className="settings-provider-status settings-provider-status--ok">
              {providerSettingsSaveMessage}
            </div>
          )}

          <div className="settings-provider-history">
            <div className="settings-provider-history-header">
              <div className="settings-field-label">
                {t("settings.codex.savedApis", "Saved API history")}
              </div>
            </div>
            <div className="settings-help">
              {t(
                "settings.codex.savedApis.help",
                "Each entry keeps the route, auth mode, and the latest model snapshot fetched for that API.",
              )}
            </div>
            {providerHistoryLoading ? (
              <div className="settings-provider-note">
                {t("settings.codex.savedApis.loading", "Loading saved APIs...")}
              </div>
            ) : providerHistory.length === 0 ? (
              <div className="settings-provider-note">
                {t(
                  "settings.codex.savedApis.empty",
                  "No saved API history yet. Save a provider once and it will appear here.",
                )}
              </div>
            ) : (
              <div className="settings-provider-history-list">
                {providerHistory.map((entry) => (
                  <div className="settings-provider-history-item" key={entry.id}>
                    <div className="settings-provider-history-row">
                      <div className="settings-provider-history-main">
                        <div className="settings-provider-history-title">
                          <span>{entry.providerName}</span>
                          <span className="settings-provider-history-chip">
                            {providerPresetLabel(entry.preset, tx)}
                          </span>
                          {entry.isCurrent && (
                            <span className="settings-provider-history-chip settings-provider-history-chip--current">
                              {t("settings.codex.savedApis.current", "Current")}
                            </span>
                          )}
                        </div>
                        <div className="settings-provider-history-meta">
                          <span>
                            {t(
                              `settings.codex.authOption.${entry.authMode}` as never,
                              AUTH_MODE_LABELS[entry.authMode],
                            )}
                          </span>
                          <span>
                            {t("settings.codex.savedApis.models", "Models:")} {entry.models.length}
                          </span>
                          <span>
                            {t("settings.codex.savedApis.lastUsed", "Last used:")}{" "}
                            {formatHistoryTimestamp(
                              entry.lastUsedAt,
                              t("settings.common.unknown", "unknown"),
                            )}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="ghost"
                        disabled={providerHistoryDeletingId === entry.id}
                        onClick={() => {
                          void onDeleteProviderHistoryEntry(entry);
                        }}
                      >
                        {providerHistoryDeletingId === entry.id
                          ? t("settings.codex.savedApis.deleting", "Deleting...")
                          : t("settings.codex.savedApis.delete", "Delete")}
                      </button>
                    </div>
                    {entry.baseUrl && (
                      <div className="settings-provider-history-url">
                        <code>{entry.baseUrl}</code>
                      </div>
                    )}
                    {entry.models.length > 0 && (
                      <details className="settings-provider-history-models">
                        <summary>
                          {t("settings.codex.savedApis.viewModels", "View models")}
                        </summary>
                        <div className="settings-provider-history-model-grid">
                          {entry.models.map((model) => (
                            <code key={model}>{model}</code>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
            {providerHistoryError && (
              <div className="settings-provider-status settings-provider-status--error">
                {providerHistoryError}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="settings-divider" />
      <div className="settings-field">
        <div className="settings-field-label settings-field-label--section">
          {t("settings.codex.visionFallback", "Vision fallback")}
        </div>
        <div className="settings-provider-card">
          <div className="settings-help">
            {t("settings.codex.visionFallback.help", "When the selected model is text-only, attached images can be routed through a separate vision model first, then the extracted visual context is forwarded to the main model.")}
          </div>

          <SettingsToggleRow
            title={t("settings.codex.enableVisionFallback", "Enable vision fallback")}
            subtitle={t("settings.codex.enableVisionFallbackHelp", "Useful for DeepSeek and other text-only models.")}
          >
            <input
              type="checkbox"
              checked={visionFallback.enabled}
              onChange={(event) =>
                void onUpdateAppSettings({
                  ...appSettings,
                  visionFallback: {
                    ...visionFallback,
                    enabled: event.target.checked,
                  },
                })
              }
            />
          </SettingsToggleRow>

          <div className="settings-provider-grid">
            <div className="settings-provider-field">
              <label className="settings-field-label" htmlFor="vision-fallback-preset">
                {t("settings.codex.visionProvider", "Vision provider")}
              </label>
              <select
                id="vision-fallback-preset"
                className="settings-select"
                value={visionFallback.preset}
                onChange={(event) =>
                  {
                    const preset = event.target.value as NonNullable<
                      AppSettings["visionFallback"]
                    >["preset"];
                    void onUpdateAppSettings({
                      ...appSettings,
                      visionFallback: {
                        ...visionFallback,
                        preset,
                        ...VISION_FALLBACK_DEFAULTS[preset],
                      },
                    });
                  }
                }
              >
                {Object.entries(VISION_FALLBACK_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-provider-field">
              <label className="settings-field-label" htmlFor="vision-fallback-base-url">
                {t("settings.codex.baseUrl", "Base URL")}
              </label>
              <input
                id="vision-fallback-base-url"
                className="settings-input"
                value={visionFallback.baseUrl}
                placeholder="https://api.example.com/v1"
                onChange={(event) =>
                  void onUpdateAppSettings({
                    ...appSettings,
                    visionFallback: {
                      ...visionFallback,
                      baseUrl: event.target.value,
                    },
                  })
                }
              />
            </div>

            <div className="settings-provider-field">
              <label className="settings-field-label" htmlFor="vision-fallback-model">
                {t("settings.codex.visionModel", "Vision model")}
              </label>
              <input
                id="vision-fallback-model"
                className="settings-input"
                value={visionFallback.model}
                placeholder="qwen-vl-max-latest"
                onChange={(event) =>
                  void onUpdateAppSettings({
                    ...appSettings,
                    visionFallback: {
                      ...visionFallback,
                      model: event.target.value,
                    },
                  })
                }
              />
            </div>

            <div className="settings-provider-field">
              <label className="settings-field-label" htmlFor="vision-fallback-api-key">
                {t("settings.codex.apiKey", "API key")}
              </label>
              <input
                id="vision-fallback-api-key"
                className="settings-input"
                type="password"
                value={visionFallback.apiKey ?? ""}
                placeholder="sk-..."
                onChange={(event) =>
                  void onUpdateAppSettings({
                    ...appSettings,
                    visionFallback: {
                      ...visionFallback,
                      apiKey: event.target.value,
                    },
                  })
                }
              />
            </div>
          </div>

          <div className="settings-provider-note">
            {t("settings.codex.visionFallback.note", "Default route prefers a domestic vision model. If this section is enabled and configured, image attachment stays available even when the main model itself is text-only.")}
          </div>
        </div>
      </div>

      <div className="settings-divider" />
      <div className="settings-field-label settings-field-label--section">
        {t("settings.codex.defaultParameters", "Default parameters")}
      </div>

      <SettingsToggleRow
        title={
          <label htmlFor="default-model">
            {t("settings.codex.defaultModel", "Model")}
          </label>
        }
        subtitle={
          defaultModelsConnectedWorkspaceCount === 0
            ? t("settings.codex.addWorkspaceModels", "Add a workspace to load available models.")
            : defaultModelsLoading
              ? t("settings.codex.loadingModels", "Loading models from the first workspace...")
              : defaultModelsError
                ? `${t("settings.codex.modelsLoadFailed", "Couldn't load models:")} ${defaultModelsError}`
                : t("settings.codex.defaultModelHelp", "Sourced from the first workspace and used when there is no thread-specific override.")
        }
      >
        <div className="settings-field-row">
          <select
            id="default-model"
            className="settings-select"
            value={selectedModelSlug}
            disabled={!defaultModels.length || defaultModelsLoading}
            onChange={(event) =>
              void onUpdateAppSettings({
                ...appSettings,
                lastComposerModelId: event.target.value,
              })
            }
            aria-label={t("settings.codex.defaultModel", "Model")}
          >
            {defaultModels.map((model) => (
              <option key={model.model} value={model.model}>
                {model.displayName?.trim() || model.model}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ghost"
            onClick={onRefreshDefaultModels}
            disabled={defaultModelsLoading || defaultModelsConnectedWorkspaceCount === 0}
          >
            {t("settings.common.refresh", "Refresh")}
          </button>
        </div>
      </SettingsToggleRow>

      <SettingsToggleRow
        title={
          <label htmlFor="default-effort">
            {t("settings.codex.reasoningEffort", "Reasoning effort")}
          </label>
        }
        subtitle={
          reasoningSupported
            ? t("settings.codex.reasoningEffortHelp", "Available options depend on the selected model.")
            : t("settings.codex.reasoningEffortUnsupported", "The selected model does not expose reasoning effort options.")
        }
      >
        <select
          id="default-effort"
          className="settings-select"
          value={selectedEffort}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              lastComposerReasoningEffort: event.target.value,
            })
          }
          aria-label={t("settings.codex.reasoningEffort", "Reasoning effort")}
          disabled={!reasoningSupported}
        >
          {!reasoningSupported && <option value="">{t("settings.common.notSupported", "not supported")}</option>}
          {reasoningOptions.map((effort) => (
            <option key={effort} value={effort}>
              {effort}
            </option>
          ))}
        </select>
      </SettingsToggleRow>

      <SettingsToggleRow
        title={
          <label htmlFor="default-access">
            {t("settings.codex.accessMode", "Access mode")}
          </label>
        }
        subtitle={t("settings.codex.usedNoThreadOverride", "Used when there is no thread-specific override.")}
      >
        <select
          id="default-access"
          className="settings-select"
          value={appSettings.defaultAccessMode}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              defaultAccessMode: event.target.value as AppSettings["defaultAccessMode"],
            })
          }
        >
          <option value="read-only">{t("settings.codex.readOnly", "Read only")}</option>
          <option value="current">{t("settings.codex.onRequest", "On-request")}</option>
          <option value="full-access">{t("settings.codex.fullAccess", "Full access")}</option>
        </select>
      </SettingsToggleRow>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="review-delivery">
          {t("settings.codex.reviewMode", "Review mode")}
        </label>
        <select
          id="review-delivery"
          className="settings-select"
          value={appSettings.reviewDeliveryMode}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              reviewDeliveryMode: event.target.value as AppSettings["reviewDeliveryMode"],
            })
          }
        >
          <option value="inline">{t("settings.codex.reviewMode.inline", "Inline (same thread)")}</option>
          <option value="detached">{t("settings.codex.reviewMode.detached", "Detached (new review thread)")}</option>
        </select>
        <div className="settings-help">
          {t("settings.codex.reviewMode.help", "Choose whether /review runs in the current thread or a detached review thread.")}
        </div>
      </div>

      <FileEditorCard
        title={t("settings.codex.globalAgents", "Global AGENTS.md")}
        meta={globalAgentsMeta}
        error={globalAgentsError}
        value={globalAgentsContent}
        placeholder={t("settings.codex.globalAgents.placeholder", "Add global instructions for Codex agents...")}
        disabled={globalAgentsLoading}
        refreshDisabled={globalAgentsRefreshDisabled}
        saveDisabled={globalAgentsSaveDisabled}
        saveLabel={globalAgentsSaveLabel}
        onChange={onSetGlobalAgentsContent}
        onRefresh={onRefreshGlobalAgents}
        onSave={onSaveGlobalAgents}
        helpText={
          <>
            {t("settings.codex.storedHome", "Stored in CodexStudy's isolated home.")}
          </>
        }
        classNames={{
          container: "settings-field settings-agents",
          header: "settings-agents-header",
          title: "settings-field-label",
          actions: "settings-agents-actions",
          meta: "settings-help settings-help-inline",
          iconButton: "ghost settings-icon-button",
          error: "settings-agents-error",
          textarea: "settings-agents-textarea",
          help: "settings-help",
        }}
      />

      <FileEditorCard
        title={t("settings.codex.globalConfig", "Global config.toml")}
        meta={globalConfigMeta}
        error={globalConfigError}
        value={globalConfigContent}
        placeholder={t("settings.codex.globalConfig.placeholder", "Edit the global Codex config.toml...")}
        disabled={globalConfigLoading}
        refreshDisabled={globalConfigRefreshDisabled}
        saveDisabled={globalConfigSaveDisabled}
        saveLabel={globalConfigSaveLabel}
        onChange={onSetGlobalConfigContent}
        onRefresh={onRefreshGlobalConfig}
        onSave={onSaveGlobalConfig}
        helpText={
          <>
            {t("settings.codex.storedHome", "Stored in CodexStudy's isolated home.")}
          </>
        }
        classNames={{
          container: "settings-field settings-agents",
          header: "settings-agents-header",
          title: "settings-field-label",
          actions: "settings-agents-actions",
          meta: "settings-help settings-help-inline",
          iconButton: "ghost settings-icon-button",
          error: "settings-agents-error",
          textarea: "settings-agents-textarea",
          help: "settings-help",
        }}
      />
    </SettingsSection>
  );
}





