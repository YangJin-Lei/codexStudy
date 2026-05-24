import Monitor from "lucide-react/dist/esm/icons/monitor";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Stethoscope from "lucide-react/dist/esm/icons/stethoscope";
import Wrench from "lucide-react/dist/esm/icons/wrench";
import {
  SettingsSection,
  SettingsSubsection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { useI18n } from "@/i18n/I18nProvider";
import type { SettingsComputerUseSectionProps } from "@settings/hooks/useSettingsComputerUseSection";

export function SettingsComputerUseSection({
  featureWorkspaceId,
  status,
  statusLoading,
  statusError,
  actionError,
  actionBusy,
  mcpServerStatus,
  mcpServerError,
  onRefreshStatus,
  onToggleEnabled,
  onRepairInstall,
  onRunDoctor,
}: SettingsComputerUseSectionProps) {
  const { t } = useI18n();
  const enabled = status?.enabled ?? false;
  const runtimeReady = status?.runtimeReady ?? false;

  const runtimeLabel = statusLoading
    ? t("settings.computerUse.status.loading", "Loading...")
    : runtimeReady
      ? status?.version
        ? `${t("settings.computerUse.status.runtimeReady", "Ready")} (${status.version})`
        : t("settings.computerUse.status.runtimeReady", "Ready")
      : t("settings.computerUse.status.runtimeMissing", "Not ready");

  return (
    <SettingsSection
      title={t("settings.computerUse.title", "Computer Use")}
      subtitle={t(
        "settings.computerUse.subtitle",
        "Control desktop apps through the bundled Open Computer Use MCP server.",
      )}
    >
      <SettingsToggleRow
        title={t("settings.computerUse.enable.title", "Enable Computer Use")}
        subtitle={t(
          "settings.computerUse.enable.subtitle",
          "Installs the local runtime, registers the Codex plugin, and restarts the agent session.",
        )}
      >
        <SettingsToggleSwitch
          pressed={enabled}
          disabled={actionBusy || statusLoading || !status?.bundledAvailable}
          onClick={() => onToggleEnabled(!enabled)}
        />
      </SettingsToggleRow>

      <SettingsSubsection
        title={t("settings.computerUse.status.title", "Status")}
        subtitle={t(
          "settings.computerUse.status.subtitle",
          "Bundled runtime, install state, and MCP connectivity.",
        )}
      />

      <SettingsToggleRow
        title={t("settings.computerUse.status.bundle", "Bundled runtime")}
        subtitle={
          status?.bundledAvailable
            ? t("settings.computerUse.status.available", "Available")
            : t("settings.computerUse.status.missing", "Missing from build")
        }
      >
        <span>{runtimeLabel}</span>
      </SettingsToggleRow>

      <SettingsToggleRow
        title={t("settings.computerUse.status.install", "Install state")}
        subtitle={
          status?.installed
            ? t("settings.computerUse.status.installed", "Installed")
            : t("settings.computerUse.status.notInstalled", "Not installed")
        }
      >
        <span>{status?.runtimePath ?? t("settings.common.unknown", "Unknown")}</span>
      </SettingsToggleRow>

      {featureWorkspaceId ? (
        <SettingsToggleRow
          title={t("settings.computerUse.status.mcp", "MCP server")}
          subtitle={
            mcpServerError
              ? t("settings.computerUse.status.mcpUnavailable", "Not connected")
              : t("settings.computerUse.status.mcpConnected", "Connected")
          }
        >
          <span>{mcpServerStatus ?? t("settings.common.unknown", "Unknown")}</span>
        </SettingsToggleRow>
      ) : null}

      {status?.platformNotes ? (
        <div className="settings-help">{status.platformNotes}</div>
      ) : null}
      {status?.lastError ? <div className="settings-help">{status.lastError}</div> : null}
      {statusError ? <div className="settings-help">{statusError}</div> : null}
      {actionError ? <div className="settings-help">{actionError}</div> : null}

      <SettingsSubsection
        title={t("settings.computerUse.actions.title", "Actions")}
        subtitle={t(
          "settings.computerUse.actions.subtitle",
          "Refresh status, repair the install, or run diagnostics.",
        )}
      />

      <SettingsToggleRow
        title={t("settings.computerUse.actions.refresh", "Refresh status")}
        subtitle={t("settings.computerUse.actions.refreshHint", "Reload install and MCP state.")}
      >
        <button
          type="button"
          className="ghost"
          disabled={actionBusy || statusLoading}
          onClick={onRefreshStatus}
        >
          <RefreshCw aria-hidden size={14} />
        </button>
      </SettingsToggleRow>

      <SettingsToggleRow
        title={t("settings.computerUse.actions.repair", "Repair install")}
        subtitle={t(
          "settings.computerUse.actions.repairHint",
          "Re-copy bundled runtime and rewrite Codex plugin config.",
        )}
      >
        <button
          type="button"
          className="ghost"
          disabled={actionBusy || !status?.bundledAvailable}
          onClick={onRepairInstall}
        >
          <Wrench aria-hidden size={14} />
        </button>
      </SettingsToggleRow>

      <SettingsToggleRow
        title={t("settings.computerUse.actions.doctor", "Run doctor")}
        subtitle={t(
          "settings.computerUse.actions.doctorHint",
          "Verify the runtime binary and platform permissions.",
        )}
      >
        <button
          type="button"
          className="ghost"
          disabled={actionBusy || !runtimeReady}
          onClick={onRunDoctor}
        >
          <Stethoscope aria-hidden size={14} />
        </button>
      </SettingsToggleRow>

      <div className="settings-help">
        <Monitor aria-hidden size={14} />{" "}
        {t(
          "settings.computerUse.help",
          "Computer Use exposes nine desktop automation tools to Codex through a local MCP server.",
        )}
      </div>
    </SettingsSection>
  );
}


