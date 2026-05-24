import { useEffect, useState } from "react";
import type { AppSettings } from "@/types";
import {
  getAppBuildType,
  isMobileRuntime,
  type AppBuildType,
} from "@services/tauri";
import { useUpdater } from "@/features/update/hooks/useUpdater";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { useI18n } from "@/i18n/I18nProvider";

type SettingsAboutSectionProps = {
  appSettings: AppSettings;
  onToggleAutomaticAppUpdateChecks?: () => void;
};

const APP_UPDATES_ENABLED = import.meta.env.VITE_ENABLE_APP_UPDATES === "1";

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function SettingsAboutSection({
  appSettings,
  onToggleAutomaticAppUpdateChecks,
}: SettingsAboutSectionProps) {
  const { t } = useI18n();
  const [appBuildType, setAppBuildType] = useState<AppBuildType | "unknown">("unknown");
  const [updaterEnabled, setUpdaterEnabled] = useState(false);
  const { state: updaterState, checkForUpdates, startUpdate } = useUpdater({
    enabled: updaterEnabled,
    autoCheckOnMount: false,
  });

  useEffect(() => {
    let active = true;
    const loadBuildType = async () => {
      try {
        const value = await getAppBuildType();
        if (active) {
          setAppBuildType(value);
        }
      } catch {
        if (active) {
          setAppBuildType("unknown");
        }
      }
    };
    void loadBuildType();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const detectRuntime = async () => {
      try {
        const mobileRuntime = await isMobileRuntime();
        if (active) {
          setUpdaterEnabled(APP_UPDATES_ENABLED && !mobileRuntime);
        }
      } catch {
        if (active) {
          setUpdaterEnabled(APP_UPDATES_ENABLED);
        }
      }
    };
    void detectRuntime();
    return () => {
      active = false;
    };
  }, []);

  const buildDateValue = __APP_BUILD_DATE__.trim();
  const parsedBuildDate = Date.parse(buildDateValue);
  const buildDateLabel = Number.isNaN(parsedBuildDate)
    ? buildDateValue || "unknown"
    : new Date(parsedBuildDate).toLocaleString();

  return (
    <SettingsSection
      title={t("settings.about.title", "About")}
      subtitle={t("settings.about.subtitle", "App version, build metadata, and update controls.")}
    >
      <div className="settings-field">
        <div className="settings-help">
          {t("settings.about.version", "Version:")} <code>{__APP_VERSION__}</code>
        </div>
        <div className="settings-help">
          {t("settings.about.buildType", "Build type:")} <code>{appBuildType}</code>
        </div>
        <div className="settings-help">
          {t("settings.about.branch", "Branch:")} <code>{__APP_GIT_BRANCH__ || t("settings.common.unknown", "unknown")}</code>
        </div>
        <div className="settings-help">
          {t("settings.about.commit", "Commit:")} <code>{__APP_COMMIT_HASH__ || t("settings.common.unknown", "unknown")}</code>
        </div>
        <div className="settings-help">
          {t("settings.about.buildDate", "Build date:")} <code>{buildDateLabel}</code>
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-label">{t("settings.about.updates.label", "App Updates")}</div>
        <SettingsToggleRow
          title={t("settings.about.updates.autoCheck.title", "Automatically check for app updates")}
          subtitle={t("settings.about.updates.autoCheck.subtitle", "When enabled, Codex checks for new app versions on launch.")}
        >
          <SettingsToggleSwitch
            pressed={appSettings.automaticAppUpdateChecksEnabled}
            onClick={() => {
              onToggleAutomaticAppUpdateChecks?.();
            }}
          />
        </SettingsToggleRow>
        <div className="settings-help">
          {t("settings.about.updates.currentVersion", "Currently running version")} <code>{__APP_VERSION__}</code>
        </div>
        {!updaterEnabled && (
          <div className="settings-help">
            {t("settings.about.updates.disabled", "App updates are disabled for this build.")}
          </div>
        )}

        {updaterState.stage === "error" && (
          <div className="settings-help ds-text-danger">
            {t("settings.about.updates.failed", "Update failed:")} {updaterState.error}
          </div>
        )}

        {updaterState.stage === "downloading" ||
        updaterState.stage === "installing" ||
        updaterState.stage === "restarting" ? (
          <div className="settings-help">
            {updaterState.stage === "downloading" ? (
              <>
                {t("settings.about.updates.downloading", "Downloading update...")}{" "}
                {updaterState.progress?.totalBytes
                  ? `${Math.round((updaterState.progress.downloadedBytes / updaterState.progress.totalBytes) * 100)}%`
                  : formatBytes(updaterState.progress?.downloadedBytes ?? 0)}
              </>
            ) : updaterState.stage === "installing" ? (
              t("settings.about.updates.installing", "Installing update...")
            ) : (
              t("settings.about.updates.restarting", "Restarting...")
            )}
          </div>
        ) : updaterState.stage === "available" ? (
          <div className="settings-help">
            {t("settings.about.updates.available", "Version")} <code>{updaterState.version}</code> {t("settings.about.updates.availableSuffix", "is available.")}
          </div>
        ) : updaterState.stage === "latest" ? (
          <div className="settings-help">{t("settings.about.updates.latest", "You are on the latest version.")}</div>
        ) : null}

        <div className="settings-controls">
          {updaterState.stage === "available" ? (
            <button
              type="button"
              className="primary"
              disabled={!updaterEnabled}
              onClick={() => void startUpdate()}
            >
              {t("settings.about.updates.downloadInstall", "Download & Install")}
            </button>
          ) : (
            <button
              type="button"
              className="ghost"
              disabled={
                !updaterEnabled ||
                updaterState.stage === "checking" ||
                updaterState.stage === "downloading" ||
                updaterState.stage === "installing" ||
                updaterState.stage === "restarting"
              }
              onClick={() => void checkForUpdates({ announceNoUpdate: true })}
            >
              {updaterState.stage === "checking"
                ? t("settings.about.updates.checking", "Checking...")
                : t("settings.about.updates.check", "Check for updates")}
            </button>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}

