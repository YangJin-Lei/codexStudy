const MIGRATION_FLAG_KEY = "codexstudy.storageMigration.v1";

const EXACT_KEY_MAP: Record<string, string> = {
  "codexmonitor.collapsedGroups": "codexstudy.collapsedGroups",
  "codexmonitor.threadLastUserActivity": "codexstudy.threadLastUserActivity",
  "codexmonitor.pinnedThreads": "codexstudy.pinnedThreads",
  "codexmonitor.threadCustomNames": "codexstudy.threadCustomNames",
  "codexmonitor.threadCodexParams": "codexstudy.threadCodexParams",
  "codexmonitor.detachedReviewLinks": "codexstudy.detachedReviewLinks",
  "codexmonitor.pendingPostUpdateVersion": "codexstudy.pendingPostUpdateVersion",
  "codexmonitor.sidebarCollapsed": "codexstudy.sidebarCollapsed",
  "codexmonitor.rightPanelCollapsed": "codexstudy.rightPanelCollapsed",
  "codexmonitor.sidebarWidth": "codexstudy.sidebarWidth",
  "codexmonitor.rightPanelWidth": "codexstudy.rightPanelWidth",
  "codexmonitor.chatDiffSplitPositionPercent":
    "codexstudy.chatDiffSplitPositionPercent",
  "codexmonitor.planPanelHeight": "codexstudy.planPanelHeight",
  "codexmonitor.terminalPanelHeight": "codexstudy.terminalPanelHeight",
  "codexmonitor.debugPanelHeight": "codexstudy.debugPanelHeight",
  "codexmonitor.threadListSortKey": "codexstudy.threadListSortKey",
  "codexmonitor.threadListOrganizeMode": "codexstudy.threadListOrganizeMode",
};

const LEGACY_PROMPT_HISTORY_PREFIX = "codexmonitor.promptHistory.";
const PROMPT_HISTORY_PREFIX = "codexstudy.promptHistory.";

function migrateExactKeys(storage: Storage) {
  for (const [legacyKey, nextKey] of Object.entries(EXACT_KEY_MAP)) {
    const value = storage.getItem(legacyKey);
    if (value === null) {
      continue;
    }
    if (storage.getItem(nextKey) === null) {
      storage.setItem(nextKey, value);
    }
    storage.removeItem(legacyKey);
  }
}

function migratePromptHistoryKeys(storage: Storage) {
  const legacyKeys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(LEGACY_PROMPT_HISTORY_PREFIX)) {
      legacyKeys.push(key);
    }
  }

  for (const legacyKey of legacyKeys) {
    const suffix = legacyKey.slice(LEGACY_PROMPT_HISTORY_PREFIX.length);
    const nextKey = `${PROMPT_HISTORY_PREFIX}${suffix}`;
    const value = storage.getItem(legacyKey);
    if (value === null) {
      continue;
    }
    if (storage.getItem(nextKey) === null) {
      storage.setItem(nextKey, value);
    }
    storage.removeItem(legacyKey);
  }
}

/** One-time migration from CodexMonitor-era localStorage keys to CodexStudy. */
export function migrateCodexstudyStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    return;
  }

  if (storage.getItem(MIGRATION_FLAG_KEY) === "1") {
    return;
  }

  migrateExactKeys(storage);
  migratePromptHistoryKeys(storage);
  storage.setItem(MIGRATION_FLAG_KEY, "1");
}
