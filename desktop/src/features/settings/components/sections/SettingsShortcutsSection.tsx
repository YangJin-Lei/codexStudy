import { useMemo, useState, type KeyboardEvent } from "react";
import {
  SettingsSection,
  SettingsSubsection,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { formatShortcut, getDefaultInterruptShortcut } from "@utils/shortcuts";
import { isMacPlatform } from "@utils/platformPaths";
import { useI18n } from "@/i18n/I18nProvider";
import type {
  ShortcutDraftKey,
  ShortcutDrafts,
  ShortcutSettingKey,
} from "@settings/components/settingsTypes";

type ShortcutItem = {
  label: string;
  draftKey: ShortcutDraftKey;
  settingKey: ShortcutSettingKey;
  help: string;
};

type ShortcutGroup = {
  title: string;
  subtitle: string;
  items: ShortcutItem[];
};

type SettingsShortcutsSectionProps = {
  shortcutDrafts: ShortcutDrafts;
  onShortcutKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    key: ShortcutSettingKey,
  ) => void;
  onClearShortcut: (key: ShortcutSettingKey) => void;
};

function ShortcutField({
  item,
  shortcutDrafts,
  onShortcutKeyDown,
  onClearShortcut,
  typeShortcutLabel,
  clearLabel,
}: {
  item: ShortcutItem;
  shortcutDrafts: ShortcutDrafts;
  onShortcutKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    key: ShortcutSettingKey,
  ) => void;
  onClearShortcut: (key: ShortcutSettingKey) => void;
  typeShortcutLabel: string;
  clearLabel: string;
}) {
  return (
    <div className="settings-field">
      <div className="settings-field-label">{item.label}</div>
      <div className="settings-field-row">
        <input
          className="settings-input settings-input--shortcut"
          value={formatShortcut(shortcutDrafts[item.draftKey])}
          onKeyDown={(event) => onShortcutKeyDown(event, item.settingKey)}
          placeholder={typeShortcutLabel}
          readOnly
        />
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => onClearShortcut(item.settingKey)}
        >
          {clearLabel}
        </button>
      </div>
      <div className="settings-help">{item.help}</div>
    </div>
  );
}

export function SettingsShortcutsSection({
  shortcutDrafts,
  onShortcutKeyDown,
  onClearShortcut,
}: SettingsShortcutsSectionProps) {
  const { t } = useI18n();
  const isMac = isMacPlatform();
  const [searchQuery, setSearchQuery] = useState("");

  const groups = useMemo<ShortcutGroup[]>(
    () => [
      {
        title: t("settings.shortcuts.group.file", "File"),
        subtitle: t("settings.shortcuts.group.file.subtitle", "Create agents and worktrees from the keyboard."),
        items: [
          {
            label: t("settings.shortcuts.newAgent", "New Agent"),
            draftKey: "newAgent",
            settingKey: "newAgentShortcut",
            help: `${t("settings.shortcuts.defaultPrefix", "Default:")} ${formatShortcut("cmd+n")}`,
          },
          {
            label: t("settings.shortcuts.newWorktreeAgent", "New Worktree Agent"),
            draftKey: "newWorktreeAgent",
            settingKey: "newWorktreeAgentShortcut",
            help: `${t("settings.shortcuts.defaultPrefix", "Default:")} ${formatShortcut("cmd+shift+n")}`,
          },
          {
            label: t("settings.shortcuts.newCloneAgent", "New Clone Agent"),
            draftKey: "newCloneAgent",
            settingKey: "newCloneAgentShortcut",
            help: `${t("settings.shortcuts.defaultPrefix", "Default:")} ${formatShortcut("cmd+alt+n")}`,
          },
          {
            label: t("settings.shortcuts.archiveThread", "Archive active thread"),
            draftKey: "archiveThread",
            settingKey: "archiveThreadShortcut",
            help: `${t("settings.shortcuts.defaultPrefix", "Default:")} ${formatShortcut(isMac ? "cmd+ctrl+a" : "ctrl+alt+a")}`,
          },
        ],
      },
      {
        title: t("settings.shortcuts.group.composer", "Composer"),
        subtitle: t("settings.shortcuts.group.composer.subtitle", "Cycle between model, access, reasoning, and collaboration modes."),
        items: [
          {
            label: t("settings.shortcuts.cycleModel", "Cycle model"),
            draftKey: "model",
            settingKey: "composerModelShortcut",
            help: `${t("settings.shortcuts.pressNew", "Press a new shortcut while focused. Default:")} ${formatShortcut("cmd+shift+m")}`,
          },
          {
            label: t("settings.shortcuts.cycleAccess", "Cycle access mode"),
            draftKey: "access",
            settingKey: "composerAccessShortcut",
            help: `${t("settings.shortcuts.defaultPrefix", "Default:")} ${formatShortcut("cmd+shift+a")}`,
          },
          {
            label: t("settings.shortcuts.cycleReasoning", "Cycle reasoning mode"),
            draftKey: "reasoning",
            settingKey: "composerReasoningShortcut",
            help: `${t("settings.shortcuts.defaultPrefix", "Default:")} ${formatShortcut("cmd+shift+r")}`,
          },
          {
            label: t("settings.shortcuts.cycleCollaboration", "Cycle collaboration mode"),
            draftKey: "collaboration",
            settingKey: "composerCollaborationShortcut",
            help: `${t("settings.shortcuts.defaultPrefix", "Default:")} ${formatShortcut("shift+tab")}`,
          },
          {
            label: t("settings.shortcuts.stopRun", "Stop active run"),
            draftKey: "interrupt",
            settingKey: "interruptShortcut",
            help: `${t("settings.shortcuts.defaultPrefix", "Default:")} ${formatShortcut(getDefaultInterruptShortcut())}`,
          },
        ],
      },
      {
        title: t("settings.shortcuts.group.panels", "Panels"),
        subtitle: t("settings.shortcuts.group.panels.subtitle", "Toggle sidebars and panels."),
        items: [
          {
            label: t("settings.shortcuts.toggleProjectsSidebar", "Toggle projects sidebar"),
            draftKey: "projectsSidebar",
            settingKey: "toggleProjectsSidebarShortcut",
            help: `${t("settings.shortcuts.defaultPrefix", "Default:")} ${formatShortcut("cmd+shift+p")}`,
          },
          {
            label: t("settings.shortcuts.toggleGitSidebar", "Toggle git sidebar"),
            draftKey: "gitSidebar",
            settingKey: "toggleGitSidebarShortcut",
            help: `${t("settings.shortcuts.defaultPrefix", "Default:")} ${formatShortcut("cmd+shift+g")}`,
          },
          {
            label: t("settings.shortcuts.branchSwitcher", "Branch switcher"),
            draftKey: "branchSwitcher",
            settingKey: "branchSwitcherShortcut",
            help: `${t("settings.shortcuts.defaultPrefix", "Default:")} ${formatShortcut("cmd+b")}`,
          },
          {
            label: t("settings.shortcuts.toggleDebugPanel", "Toggle debug panel"),
            draftKey: "debugPanel",
            settingKey: "toggleDebugPanelShortcut",
            help: `${t("settings.shortcuts.defaultPrefix", "Default:")} ${formatShortcut("cmd+shift+d")}`,
          },
          {
            label: t("settings.shortcuts.toggleTerminalPanel", "Toggle terminal panel"),
            draftKey: "terminal",
            settingKey: "toggleTerminalShortcut",
            help: `${t("settings.shortcuts.defaultPrefix", "Default:")} ${formatShortcut("cmd+shift+t")}`,
          },
        ],
      },
      {
        title: t("settings.shortcuts.group.navigation", "Navigation"),
        subtitle: t("settings.shortcuts.group.navigation.subtitle", "Cycle between agents and workspaces."),
        items: [
          {
            label: t("settings.shortcuts.nextAgent", "Next agent"),
            draftKey: "cycleAgentNext",
            settingKey: "cycleAgentNextShortcut",
            help: `${t("settings.shortcuts.defaultPrefix", "Default:")} ${formatShortcut(isMac ? "cmd+ctrl+down" : "ctrl+alt+down")}`,
          },
          {
            label: t("settings.shortcuts.previousAgent", "Previous agent"),
            draftKey: "cycleAgentPrev",
            settingKey: "cycleAgentPrevShortcut",
            help: `${t("settings.shortcuts.defaultPrefix", "Default:")} ${formatShortcut(isMac ? "cmd+ctrl+up" : "ctrl+alt+up")}`,
          },
          {
            label: t("settings.shortcuts.nextWorkspace", "Next workspace"),
            draftKey: "cycleWorkspaceNext",
            settingKey: "cycleWorkspaceNextShortcut",
            help: `${t("settings.shortcuts.defaultPrefix", "Default:")} ${formatShortcut(isMac ? "cmd+shift+down" : "ctrl+alt+shift+down")}`,
          },
          {
            label: t("settings.shortcuts.previousWorkspace", "Previous workspace"),
            draftKey: "cycleWorkspacePrev",
            settingKey: "cycleWorkspacePrevShortcut",
            help: `${t("settings.shortcuts.defaultPrefix", "Default:")} ${formatShortcut(isMac ? "cmd+shift+up" : "ctrl+alt+shift+up")}`,
          },
        ],
      },
    ],
    [isMac, t],
  );

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!normalizedSearchQuery) {
      return groups;
    }
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const searchValue = `${group.title} ${group.subtitle} ${item.label} ${item.help}`.toLowerCase();
          return searchValue.includes(normalizedSearchQuery);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, normalizedSearchQuery]);

  return (
    <SettingsSection
      title={t("settings.shortcuts.title", "Shortcuts")}
      subtitle={t("settings.shortcuts.subtitle", "Customize keyboard shortcuts for file actions, composer, panels, and navigation.")}
    >
      <div className="settings-field settings-shortcuts-search">
        <label className="settings-field-label" htmlFor="settings-shortcuts-search">
          {t("settings.shortcuts.search.label", "Search shortcuts")}
        </label>
        <div className="settings-field-row">
          <input
            id="settings-shortcuts-search"
            className="settings-input"
            placeholder={t("settings.shortcuts.search.label", "Search shortcuts")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="ghost settings-button-compact"
              onClick={() => setSearchQuery("")}
            >
              {t("settings.projects.groups.clear", "Clear")}
            </button>
          )}
        </div>
        <div className="settings-help">{t("settings.shortcuts.search.help", "Filter by section name, action, or default shortcut.")}</div>
      </div>
      {filteredGroups.map((group, index) => (
        <div key={group.title}>
          {index > 0 && <div className="settings-divider" />}
          <SettingsSubsection title={group.title} subtitle={group.subtitle} />
          {group.items.map((item) => (
            <ShortcutField
              key={item.settingKey}
              item={item}
              shortcutDrafts={shortcutDrafts}
              onShortcutKeyDown={onShortcutKeyDown}
              onClearShortcut={onClearShortcut}
              typeShortcutLabel={t("settings.shortcuts.typeShortcut", "Type shortcut")}
              clearLabel={t("settings.projects.groups.clear", "Clear")}
            />
          ))}
        </div>
      ))}
      {filteredGroups.length === 0 && (
        <div className="settings-empty">
          {t("settings.shortcuts.empty.prefix", "No shortcuts match")} {normalizedSearchQuery ? `"${searchQuery.trim()}"` : t("settings.shortcuts.empty.search", "your search")}.
        </div>
      )}
    </SettingsSection>
  );
}
