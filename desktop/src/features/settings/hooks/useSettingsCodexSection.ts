import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AppSettings,
  CodexDoctorResult,
  CodexUpdateResult,
  ModelOption,
  ModelProviderAuthMode,
  ModelProviderConnectionDiagnostic,
  ModelProviderConnectionMode,
  ModelProviderHistoryEntry,
  ModelProviderPreset,
  ModelProviderSettings,
  WorkspaceInfo,
} from "@/types";
import {
  deleteModelProviderHistoryEntry,
  diagnoseModelProviderConnection,
  getAppSettings,
  getModelProviderHistory,
  getModelProviderSettings,
  saveModelProviderSettings,
  syncCurrentModelProviderHistoryModels,
} from "@/services/tauri";
import { useGlobalAgentsMd } from "./useGlobalAgentsMd";
import { useGlobalCodexConfigToml } from "./useGlobalCodexConfigToml";
import { useSettingsDefaultModels } from "./useSettingsDefaultModels";
import { buildEditorContentMeta } from "@settings/components/settingsViewHelpers";
import { normalizeCodexArgsInput } from "@/utils/codexArgsInput";
import { clearThreadCodexModelSelections } from "@threads/utils/threadStorage";
import { dispatchModelProviderSessionRefreshed } from "@settings/modelProviderEvents";

type UseSettingsCodexSectionArgs = {
  appSettings: AppSettings;
  projects: WorkspaceInfo[];
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  onRunDoctor: (
    codexBin: string | null,
    codexArgs: string | null,
  ) => Promise<CodexDoctorResult>;
  onRunCodexUpdate?: (
    codexBin: string | null,
    codexArgs: string | null,
  ) => Promise<CodexUpdateResult>;
};

type ProviderDraft = {
  preset: ModelProviderPreset;
  providerName: string;
  baseUrl: string;
  authMode: ModelProviderAuthMode;
  apiKey: string;
  awsProfile: string;
  awsRegion: string;
};

export type SettingsCodexSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  defaultModels: ReturnType<typeof useSettingsDefaultModels>["models"];
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
  providerConnectionMode: ModelProviderConnectionMode;
  providerEffectiveBaseUrl: string | null;
  providerBridgeBaseUrl: string | null;
  providerUpstreamBaseUrl: string | null;
  providerConnectionTestState: {
    status: "idle" | "running" | "done";
    result: ModelProviderConnectionDiagnostic | null;
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
const DEFAULT_PROVIDER_BASE_URLS: Partial<Record<ModelProviderPreset, string>> = {
  openaiApi: import.meta.env.VITE_OPENAI_API_BASE_URL || "https://api.openai.com/v1",
  deepSeek: "https://api.deepseek.com",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  doubao: "https://ark.cn-beijing.volces.com/api/v3",
  claude: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
  moonshot: "https://api.moonshot.cn/v1",
  baichuan: "https://api.baichuan-ai.com/v1",
  minimax: "https://api.minimax.chat/v1",
  ollama: "http://localhost:11434/v1",
  lmstudio: "http://localhost:1234/v1",
};

const DEFAULT_PROVIDER_NAMES: Partial<Record<ModelProviderPreset, string>> = {
  chatgpt: "ChatGPT / OpenAI",
  openaiApi: "OpenAI",
  deepSeek: "DeepSeek",
  qwen: "Qwen",
  doubao: "Doubao",
  claude: "Claude",
  gemini: "Gemini",
  zhipu: "智谱AI",
  moonshot: "月之暗面",
  baichuan: "百川智能",
  minimax: "MiniMax",
  customResponses: "Custom Responses API",
  ollama: "Ollama",
  lmstudio: "LM Studio",
  amazonBedrock: "Amazon Bedrock",
};

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

function defaultProviderBaseUrl(preset: ModelProviderPreset): string {
  return DEFAULT_PROVIDER_BASE_URLS[preset] ?? "";
}

function defaultProviderName(preset: ModelProviderPreset): string {
  return DEFAULT_PROVIDER_NAMES[preset] ?? "Custom Responses API";
}

function buildProviderDraft(settings: ModelProviderSettings): ProviderDraft {
  return {
    preset: settings.preset,
    providerName: settings.providerName ?? defaultProviderName(settings.preset),
    baseUrl: settings.baseUrl ?? defaultProviderBaseUrl(settings.preset),
    authMode: settings.authMode,
    apiKey: "",
    awsProfile: settings.awsProfile ?? "",
    awsRegion: settings.awsRegion ?? "",
  };
}

function canonicalizeProviderDraft(draft: ProviderDraft) {
  const providerName = draft.providerName.trim();
  const baseUrl = draft.baseUrl.trim();
  const apiKey = draft.apiKey.trim();
  const awsProfile = draft.awsProfile.trim();
  const awsRegion = draft.awsRegion.trim();

  switch (draft.preset) {
    case "chatgpt":
      return { preset: "chatgpt" as const };
    case "openaiApi":
      return {
        preset: "openaiApi" as const,
        baseUrl: baseUrl || defaultProviderBaseUrl("openaiApi"),
        apiKey,
      };
    case "deepSeek":
      return {
        preset: "deepSeek" as const,
        baseUrl: baseUrl || defaultProviderBaseUrl("deepSeek"),
        apiKey,
      };
    case "qwen":
      return {
        preset: "qwen" as const,
        baseUrl: baseUrl || defaultProviderBaseUrl("qwen"),
        apiKey,
      };
    case "claude":
      return {
        preset: "claude" as const,
        baseUrl: baseUrl || defaultProviderBaseUrl("claude"),
        apiKey,
      };
    case "doubao":
      return {
        preset: "doubao" as const,
        baseUrl: baseUrl || defaultProviderBaseUrl("doubao"),
        apiKey,
      };
    case "gemini":
      return {
        preset: "gemini" as const,
        baseUrl: baseUrl || defaultProviderBaseUrl("gemini"),
        apiKey,
      };
    case "zhipu":
      return {
        preset: "zhipu" as const,
        baseUrl: baseUrl || defaultProviderBaseUrl("zhipu"),
        apiKey,
      };
    case "moonshot":
      return {
        preset: "moonshot" as const,
        baseUrl: baseUrl || defaultProviderBaseUrl("moonshot"),
        apiKey,
      };
    case "baichuan":
      return {
        preset: "baichuan" as const,
        baseUrl: baseUrl || defaultProviderBaseUrl("baichuan"),
        apiKey,
      };
    case "minimax":
      return {
        preset: "minimax" as const,
        baseUrl: baseUrl || defaultProviderBaseUrl("minimax"),
        apiKey,
      };
    case "customResponses":
      return {
        preset: "customResponses" as const,
        providerName: providerName || defaultProviderName("customResponses"),
        baseUrl,
        authMode: draft.authMode,
        apiKey: draft.authMode === "apiKey" ? apiKey : "",
      };
    case "ollama":
      return {
        preset: "ollama" as const,
        baseUrl: baseUrl || defaultProviderBaseUrl("ollama"),
      };
    case "lmstudio":
      return {
        preset: "lmstudio" as const,
        baseUrl: baseUrl || defaultProviderBaseUrl("lmstudio"),
      };
    case "amazonBedrock":
      return {
        preset: "amazonBedrock" as const,
        awsProfile,
        awsRegion,
      };
  }
}

function buildProviderModelCatalogSignature(
  provider:
    | ReturnType<typeof canonicalizeProviderDraft>
    | ModelProviderSettings
    | null,
): string | null {
  if (!provider) {
    return null;
  }

  switch (provider.preset) {
    case "chatgpt":
      return "chatgpt";
    case "openaiApi":
    case "deepSeek":
    case "qwen":
    case "doubao":
    case "claude":
    case "gemini":
    case "zhipu":
    case "moonshot":
    case "baichuan":
    case "minimax":
    case "ollama":
    case "lmstudio":
      return JSON.stringify({
        preset: provider.preset,
        baseUrl: "baseUrl" in provider ? provider.baseUrl ?? null : null,
      });
    case "customResponses":
      return JSON.stringify({
        preset: provider.preset,
        baseUrl: provider.baseUrl ?? null,
        authMode: provider.authMode,
        providerName: provider.providerName ?? null,
      });
    case "amazonBedrock":
      return JSON.stringify({
        preset: provider.preset,
        awsProfile: provider.awsProfile ?? null,
        awsRegion: provider.awsRegion ?? null,
      });
  }
}

function applyProviderPresetDraft(
  previous: ProviderDraft,
  preset: ModelProviderPreset,
): ProviderDraft {
  if (preset === "customResponses") {
    return {
      ...previous,
      preset,
      providerName: previous.providerName.trim() || defaultProviderName(preset),
      authMode: previous.authMode === "none" ? "none" : "apiKey",
      awsProfile: "",
      awsRegion: "",
    };
  }

  if (preset === "chatgpt") {
    return {
      ...previous,
      preset,
      providerName: defaultProviderName(preset),
      baseUrl: "",
      authMode: "chatgpt",
      awsProfile: "",
      awsRegion: "",
    };
  }

  if (preset === "amazonBedrock") {
    return {
      ...previous,
      preset,
      providerName: defaultProviderName(preset),
      baseUrl: "",
      authMode: "aws",
    };
  }

  return {
    ...previous,
    preset,
    providerName: defaultProviderName(preset),
    baseUrl: defaultProviderBaseUrl(preset),
    authMode:
      preset === "openaiApi" ||
      preset === "deepSeek" ||
      preset === "qwen" ||
      preset === "doubao" ||
      preset === "claude" ||
      preset === "gemini" ||
      preset === "zhipu" ||
      preset === "moonshot" ||
      preset === "baichuan" ||
      preset === "minimax"
        ? "apiKey"
        : "none",
    awsProfile: "",
    awsRegion: "",
  };
}

export const useSettingsCodexSection = ({
  appSettings,
  projects,
  onUpdateAppSettings,
  onRunDoctor,
  onRunCodexUpdate,
}: UseSettingsCodexSectionArgs): SettingsCodexSectionProps => {
  const [codexPathDraft, setCodexPathDraft] = useState(appSettings.codexBin ?? "");
  const [codexArgsDraft, setCodexArgsDraft] = useState(appSettings.codexArgs ?? "");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [doctorState, setDoctorState] = useState<{
    status: "idle" | "running" | "done";
    result: CodexDoctorResult | null;
  }>({ status: "idle", result: null });
  const [codexUpdateState, setCodexUpdateState] = useState<{
    status: "idle" | "running" | "done";
    result: CodexUpdateResult | null;
  }>({ status: "idle", result: null });
  const [providerSettings, setProviderSettings] = useState<ModelProviderSettings | null>(null);
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>({
    preset: "chatgpt",
    providerName: defaultProviderName("chatgpt"),
    baseUrl: "",
    authMode: "chatgpt",
    apiKey: "",
    awsProfile: "",
    awsRegion: "",
  });
  const [providerSettingsLoading, setProviderSettingsLoading] = useState(true);
  const [providerSettingsSaving, setProviderSettingsSaving] = useState(false);
  const [providerSettingsError, setProviderSettingsError] = useState<string | null>(null);
  const [providerSettingsSaveMessage, setProviderSettingsSaveMessage] =
    useState<string | null>(null);
  const [providerHistory, setProviderHistory] = useState<ModelProviderHistoryEntry[]>([]);
  const [providerHistoryLoading, setProviderHistoryLoading] = useState(true);
  const [providerHistoryDeletingId, setProviderHistoryDeletingId] = useState<string | null>(null);
  const [providerHistoryError, setProviderHistoryError] = useState<string | null>(null);
  const [providerHistorySyncPending, setProviderHistorySyncPending] = useState(false);
  const [providerConnectionTestState, setProviderConnectionTestState] = useState<{
    status: "idle" | "running" | "done";
    result: ModelProviderConnectionDiagnostic | null;
  }>({ status: "idle", result: null });

  const {
    models: defaultModels,
    isLoading: defaultModelsLoading,
    error: defaultModelsError,
    connectedWorkspaceCount: defaultModelsConnectedWorkspaceCount,
    refresh: refreshDefaultModels,
  } = useSettingsDefaultModels(projects);

  const {
    content: globalAgentsContent,
    exists: globalAgentsExists,
    truncated: globalAgentsTruncated,
    isLoading: globalAgentsLoading,
    isSaving: globalAgentsSaving,
    error: globalAgentsError,
    isDirty: globalAgentsDirty,
    setContent: setGlobalAgentsContent,
    refresh: refreshGlobalAgents,
    save: saveGlobalAgents,
  } = useGlobalAgentsMd();

  const {
    content: globalConfigContent,
    exists: globalConfigExists,
    truncated: globalConfigTruncated,
    isLoading: globalConfigLoading,
    isSaving: globalConfigSaving,
    error: globalConfigError,
    isDirty: globalConfigDirty,
    setContent: setGlobalConfigContent,
    refresh: refreshGlobalConfig,
    save: saveGlobalConfig,
  } = useGlobalCodexConfigToml();

  const globalAgentsEditorMeta = buildEditorContentMeta({
    isLoading: globalAgentsLoading,
    isSaving: globalAgentsSaving,
    exists: globalAgentsExists,
    truncated: globalAgentsTruncated,
    isDirty: globalAgentsDirty,
  });

  const globalConfigEditorMeta = buildEditorContentMeta({
    isLoading: globalConfigLoading,
    isSaving: globalConfigSaving,
    exists: globalConfigExists,
    truncated: globalConfigTruncated,
    isDirty: globalConfigDirty,
  });

  const loadProviderSettings = useCallback(async () => {
    setProviderSettingsLoading(true);
    setProviderSettingsError(null);
    setProviderConnectionTestState({ status: "idle", result: null });
    try {
      const settings = await getModelProviderSettings();
      setProviderSettings(settings);
      setProviderDraft(buildProviderDraft(settings));
    } catch (error) {
      setProviderSettingsError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setProviderSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProviderSettings();
  }, [loadProviderSettings]);

  const loadProviderHistory = useCallback(async () => {
    setProviderHistoryLoading(true);
    setProviderHistoryError(null);
    try {
      const history = await getModelProviderHistory();
      setProviderHistory(history);
    } catch (error) {
      setProviderHistoryError(error instanceof Error ? error.message : String(error));
    } finally {
      setProviderHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProviderHistory();
  }, [loadProviderHistory]);

  useEffect(() => {
    setCodexPathDraft(appSettings.codexBin ?? "");
  }, [appSettings.codexBin]);

  useEffect(() => {
    setCodexArgsDraft(appSettings.codexArgs ?? "");
  }, [appSettings.codexArgs]);

  const nextCodexBin = codexPathDraft.trim() ? codexPathDraft.trim() : null;
  const nextCodexArgs = normalizeCodexArgsInput(codexArgsDraft);
  const codexDirty =
    nextCodexBin !== (appSettings.codexBin ?? null) ||
    nextCodexArgs !== (appSettings.codexArgs ?? null);

  const providerSettingsDirty = useMemo(() => {
    if (!providerSettings) {
      return false;
    }
    const savedDraft = buildProviderDraft(providerSettings);
    return (
      JSON.stringify(canonicalizeProviderDraft(savedDraft)) !==
      JSON.stringify(canonicalizeProviderDraft(providerDraft))
    );
  }, [providerDraft, providerSettings]);

  useEffect(() => {
    if (!providerHistorySyncPending || defaultModelsLoading) {
      return;
    }
    setProviderHistorySyncPending(false);
    if (defaultModelsError) {
      return;
    }
    void syncCurrentModelProviderHistoryModels(defaultModels.map((model) => model.model))
      .then((history) => {
        setProviderHistory(history);
        setProviderHistoryError(null);
      })
      .catch((error) => {
        setProviderHistoryError(error instanceof Error ? error.message : String(error));
      });
  }, [
    defaultModels,
    defaultModelsError,
    defaultModelsLoading,
    providerHistorySyncPending,
  ]);

  const handleBrowseCodex = async () => {
    const selection = await open({ multiple: false, directory: false });
    if (!selection || Array.isArray(selection)) {
      return;
    }
    setCodexPathDraft(selection);
  };

  const handleSaveCodexSettings = async () => {
    setIsSavingSettings(true);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        codexBin: nextCodexBin,
        codexArgs: nextCodexArgs,
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleRunDoctor = async () => {
    setDoctorState({ status: "running", result: null });
    try {
      const result = await onRunDoctor(nextCodexBin, nextCodexArgs);
      setDoctorState({ status: "done", result });
    } catch (error) {
      setDoctorState({
        status: "done",
        result: {
          ok: false,
          codexBin: nextCodexBin,
          version: null,
          appServerOk: false,
          details: error instanceof Error ? error.message : String(error),
          path: null,
          nodeOk: false,
          nodeVersion: null,
          nodeDetails: null,
        },
      });
    }
  };

  const handleRunCodexUpdate = async () => {
    setCodexUpdateState({ status: "running", result: null });
    try {
      if (!onRunCodexUpdate) {
        setCodexUpdateState({
          status: "done",
          result: {
            ok: false,
            method: "unknown",
            package: null,
            beforeVersion: null,
            afterVersion: null,
            upgraded: false,
            output: null,
            details: "Codex updates are not available in this build.",
          },
        });
        return;
      }

      const result = await onRunCodexUpdate(nextCodexBin, nextCodexArgs);
      setCodexUpdateState({ status: "done", result });
    } catch (error) {
      setCodexUpdateState({
        status: "done",
        result: {
          ok: false,
          method: "unknown",
          package: null,
          beforeVersion: null,
          afterVersion: null,
          upgraded: false,
          output: null,
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };

  const handleSaveProviderSettings = async () => {
    setProviderSettingsSaving(true);
    setProviderSettingsError(null);
    setProviderSettingsSaveMessage(null);
    setProviderHistoryError(null);
    try {
      const previousProviderSignature = buildProviderModelCatalogSignature(providerSettings);
      const result = await saveModelProviderSettings({
        preset: providerDraft.preset,
        providerName: providerDraft.providerName.trim() || null,
        baseUrl: providerDraft.baseUrl.trim() || null,
        authMode: providerDraft.authMode,
        apiKey: providerDraft.apiKey.trim() || null,
        awsProfile: providerDraft.awsProfile.trim() || null,
        awsRegion: providerDraft.awsRegion.trim() || null,
      });
      const nextProviderSignature = buildProviderModelCatalogSignature(result.settings);
      const didChangeModelCatalog =
        previousProviderSignature !== null &&
        nextProviderSignature !== null &&
        previousProviderSignature !== nextProviderSignature;
      setProviderSettings(result.settings);
      setProviderHistory(result.history);
      setProviderDraft(buildProviderDraft(result.settings));
      setProviderConnectionTestState({ status: "idle", result: null });
      const latestAppSettings = await getAppSettings();
      if (didChangeModelCatalog) {
        clearThreadCodexModelSelections();
        await onUpdateAppSettings({
          ...latestAppSettings,
          lastComposerModelId: null,
          lastComposerReasoningEffort: null,
          commitMessageModelId: null,
        });
      } else {
        await onUpdateAppSettings(latestAppSettings);
      }
      if (result.respawned) {
        const label =
          result.affectedWorkspaceCount === 1
            ? "1 connected workspace restarted."
            : `${result.affectedWorkspaceCount} connected workspaces restarted.`;
        setProviderSettingsSaveMessage(`Saved. ${label}`);
        dispatchModelProviderSessionRefreshed({
          affectedWorkspaceCount: result.affectedWorkspaceCount,
        });
      } else {
        setProviderSettingsSaveMessage(
          "Saved. Connect a workspace to refresh the available models for this provider.",
        );
      }
      await refreshDefaultModels();
      setProviderHistorySyncPending(result.settings.preset !== "chatgpt");
    } catch (error) {
      setProviderSettingsError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setProviderSettingsSaving(false);
    }
  };

  const handleRunProviderConnectionTest = async () => {
    setProviderConnectionTestState({ status: "running", result: null });
    try {
      const result = await diagnoseModelProviderConnection();
      setProviderConnectionTestState({ status: "done", result });
    } catch (error) {
      setProviderConnectionTestState({
        status: "done",
        result: {
          preset: providerSettings?.preset ?? providerDraft.preset,
          providerName:
            providerSettings?.providerName ??
            (providerDraft.providerName.trim() || "Provider"),
          status: "error",
          canTest: true,
          connectionMode: providerSettings?.connectionMode ?? "direct",
          effectiveBaseUrl: providerSettings?.effectiveBaseUrl ?? null,
          bridgeBaseUrl: providerSettings?.bridgeBaseUrl ?? null,
          upstreamBaseUrl: providerSettings?.upstreamBaseUrl ?? null,
          checkedUrl: null,
          responseStatus: null,
          summary: "Route test failed before a response was received.",
          detail: error instanceof Error ? error.message : String(error),
          actionHint: null,
        },
      });
    }
  };

  const handleDeleteProviderHistoryEntry = async (entry: ModelProviderHistoryEntry) => {
    setProviderHistoryDeletingId(entry.id);
    setProviderHistoryError(null);
    setProviderSettingsError(null);
    setProviderSettingsSaveMessage(null);
    try {
      const result = await deleteModelProviderHistoryEntry(entry.id);
      setProviderHistory(result.history);
      setProviderSettings(result.settings);
      setProviderDraft(buildProviderDraft(result.settings));
      setProviderConnectionTestState({ status: "idle", result: null });
      const latestAppSettings = await getAppSettings();
      if (result.removedCurrent) {
        clearThreadCodexModelSelections();
        await onUpdateAppSettings({
          ...latestAppSettings,
          lastComposerModelId: null,
          lastComposerReasoningEffort: null,
          commitMessageModelId: null,
        });
        if (result.respawned) {
          dispatchModelProviderSessionRefreshed({
            affectedWorkspaceCount: result.affectedWorkspaceCount,
          });
        }
        await refreshDefaultModels();
        setProviderSettingsSaveMessage(
          "Deleted the active API entry, cleared its stored credentials, and switched back to ChatGPT / OpenAI.",
        );
      } else {
        await onUpdateAppSettings(latestAppSettings);
        setProviderSettingsSaveMessage("Deleted saved API history.");
      }
    } catch (error) {
      setProviderHistoryError(error instanceof Error ? error.message : String(error));
    } finally {
      setProviderHistoryDeletingId(null);
    }
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
      lastComposerModelId: shouldNormalizeModel
        ? selectedModelSlug
        : appSettings.lastComposerModelId,
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

  return {
    appSettings,
    onUpdateAppSettings,
    defaultModels,
    defaultModelsLoading,
    defaultModelsError,
    defaultModelsConnectedWorkspaceCount,
    onRefreshDefaultModels: () => {
      void refreshDefaultModels();
    },
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
    providerPreset: providerDraft.preset,
    providerNameDraft: providerDraft.providerName,
    providerBaseUrlDraft: providerDraft.baseUrl,
    providerAuthModeDraft: providerDraft.authMode,
    providerApiKeyDraft: providerDraft.apiKey,
    providerAwsProfileDraft: providerDraft.awsProfile,
    providerAwsRegionDraft: providerDraft.awsRegion,
    providerApiKeyConfigured: providerSettings?.apiKeyConfigured ?? false,
    providerConnectionMode: providerSettings?.connectionMode ?? "direct",
    providerEffectiveBaseUrl: providerSettings?.effectiveBaseUrl ?? null,
    providerBridgeBaseUrl: providerSettings?.bridgeBaseUrl ?? null,
    providerUpstreamBaseUrl: providerSettings?.upstreamBaseUrl ?? null,
    providerConnectionTestState,
    globalAgentsMeta: globalAgentsEditorMeta.meta,
    globalAgentsError,
    globalAgentsContent,
    globalAgentsLoading,
    globalAgentsRefreshDisabled: globalAgentsEditorMeta.refreshDisabled,
    globalAgentsSaveDisabled: globalAgentsEditorMeta.saveDisabled,
    globalAgentsSaveLabel: globalAgentsEditorMeta.saveLabel,
    globalConfigMeta: globalConfigEditorMeta.meta,
    globalConfigError,
    globalConfigContent,
    globalConfigLoading,
    globalConfigRefreshDisabled: globalConfigEditorMeta.refreshDisabled,
    globalConfigSaveDisabled: globalConfigEditorMeta.saveDisabled,
    globalConfigSaveLabel: globalConfigEditorMeta.saveLabel,
    onSetCodexPathDraft: setCodexPathDraft,
    onSetCodexArgsDraft: setCodexArgsDraft,
    onSetProviderPreset: (value) => {
      setProviderDraft((current) => applyProviderPresetDraft(current, value));
      setProviderSettingsSaveMessage(null);
      setProviderConnectionTestState({ status: "idle", result: null });
    },
    onSetProviderNameDraft: (value) => {
      setProviderDraft((current) => ({ ...current, providerName: value }));
      setProviderSettingsSaveMessage(null);
      setProviderConnectionTestState({ status: "idle", result: null });
    },
    onSetProviderBaseUrlDraft: (value) => {
      setProviderDraft((current) => ({ ...current, baseUrl: value }));
      setProviderSettingsSaveMessage(null);
      setProviderConnectionTestState({ status: "idle", result: null });
    },
    onSetProviderAuthModeDraft: (value) => {
      setProviderDraft((current) => ({ ...current, authMode: value }));
      setProviderSettingsSaveMessage(null);
      setProviderConnectionTestState({ status: "idle", result: null });
    },
    onSetProviderApiKeyDraft: (value) => {
      setProviderDraft((current) => ({ ...current, apiKey: value }));
      setProviderSettingsSaveMessage(null);
      setProviderConnectionTestState({ status: "idle", result: null });
    },
    onSetProviderAwsProfileDraft: (value) => {
      setProviderDraft((current) => ({ ...current, awsProfile: value }));
      setProviderSettingsSaveMessage(null);
      setProviderConnectionTestState({ status: "idle", result: null });
    },
    onSetProviderAwsRegionDraft: (value) => {
      setProviderDraft((current) => ({ ...current, awsRegion: value }));
      setProviderSettingsSaveMessage(null);
      setProviderConnectionTestState({ status: "idle", result: null });
    },
    onSetGlobalAgentsContent: setGlobalAgentsContent,
    onSetGlobalConfigContent: setGlobalConfigContent,
    onBrowseCodex: handleBrowseCodex,
    onSaveCodexSettings: handleSaveCodexSettings,
    onRunDoctor: handleRunDoctor,
    onRunCodexUpdate: handleRunCodexUpdate,
    onRefreshProviderSettings: () => {
      setProviderSettingsSaveMessage(null);
      void loadProviderSettings();
      void loadProviderHistory();
    },
    onRunProviderConnectionTest: handleRunProviderConnectionTest,
    onSaveProviderSettings: handleSaveProviderSettings,
    onDeleteProviderHistoryEntry: handleDeleteProviderHistoryEntry,
    onRefreshGlobalAgents: () => {
      void refreshGlobalAgents();
    },
    onSaveGlobalAgents: () => {
      void saveGlobalAgents();
    },
    onRefreshGlobalConfig: () => {
      void refreshGlobalConfig();
    },
    onSaveGlobalConfig: () => {
      void saveGlobalConfig();
    },
  };
};
