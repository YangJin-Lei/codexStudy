import { useI18n } from "@/i18n/I18nProvider";
import { LoadingSpinner } from "../LoadingSpinner";

type ExplorerLoadingIndicatorProps = {
  isBlocking: boolean;
  isBackgroundRefresh: boolean;
};

export function ExplorerLoadingIndicator({
  isBlocking,
  isBackgroundRefresh,
}: ExplorerLoadingIndicatorProps) {
  const { t } = useI18n();

  if (!isBlocking && !isBackgroundRefresh) {
    return null;
  }

  return (
    <div
      className={`explorer-loading-indicator${isBlocking ? " is-blocking" : " is-background"}`}
      role="status"
    >
      <LoadingSpinner size="small" inline />
      <span>
        {isBlocking
          ? t("codexNew.workbench.explorer.loadingFullTree", "Loading full directory tree...")
          : t("codexNew.workbench.explorer.refreshingTree", "Refreshing directory tree...")}
      </span>
    </div>
  );
}
