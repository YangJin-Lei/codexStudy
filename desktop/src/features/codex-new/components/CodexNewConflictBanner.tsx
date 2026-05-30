import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle";
import { useI18n } from "@/i18n/I18nProvider";

type CodexNewConflictBannerProps = {
  conflictPaths: string[];
  pinnedPath?: string | null;
  onOpenFile: (path: string) => void;
  onViewConflicts: () => void;
  onRefreshChanges: () => void;
  isRefreshing?: boolean;
};

export function CodexNewConflictBanner({
  conflictPaths,
  pinnedPath,
  onOpenFile,
  onViewConflicts,
  onRefreshChanges,
  isRefreshing = false,
}: CodexNewConflictBannerProps) {
  const { t } = useI18n();

  if (conflictPaths.length === 0) {
    return null;
  }

  const orderedPaths =
    pinnedPath && conflictPaths.includes(pinnedPath)
      ? [pinnedPath, ...conflictPaths.filter((path) => path !== pinnedPath)]
      : conflictPaths;

  return (
    <section className="session-conflict-banner" aria-live="polite">
      <div className="session-conflict-header">
        <AlertTriangle size={16} />
        <strong>
          {t("codexNew.workbench.conflicts.bannerTitle", "{count} conflicted file(s) detected").replace(
            "{count}",
            String(conflictPaths.length),
          )}
        </strong>
      </div>
      <div className="session-conflict-subtitle">
        {t(
          "codexNew.workbench.conflicts.bannerSubtitle",
          "Resolve conflicts in the project, refresh changes, then merge again.",
        )}
      </div>

      <div className="session-conflict-actions">
        <button type="button" className="session-conflict-action" onClick={onViewConflicts}>
          {t("codexNew.workbench.conflicts.viewConflicts", "View conflicts")}
        </button>
        <button
          type="button"
          className="session-conflict-action"
          onClick={onRefreshChanges}
          disabled={isRefreshing}
        >
          {isRefreshing
            ? t("codexNew.workbench.refreshing", "Refreshing")
            : t("codexNew.workbench.conflicts.refreshChanges", "Refresh changes")}
        </button>
        <button
          type="button"
          className="session-conflict-action is-muted"
          disabled
          title={t(
            "codexNew.workbench.conflicts.forceOverwriteDisabled",
            "Force overwrite is not available yet",
          )}
        >
          {t("codexNew.workbench.conflicts.forceOverwrite", "Force overwrite")}
        </button>
      </div>

      <div className="session-conflict-list">
        {orderedPaths.slice(0, 8).map((path) => (
          <button
            key={path}
            type="button"
            className={`session-conflict-file${path === pinnedPath ? " is-pinned" : ""}`}
            onClick={() => onOpenFile(path)}
          >
            ⚠ {path}
          </button>
        ))}
        {conflictPaths.length > 8 ? (
          <div className="session-conflict-more">
            {t("codexNew.workbench.conflicts.moreFiles", "{count} more conflicted files...").replace(
              "{count}",
              String(conflictPaths.length - 8),
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
