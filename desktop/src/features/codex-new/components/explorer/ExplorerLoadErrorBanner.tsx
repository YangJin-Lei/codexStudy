import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import { useI18n } from "@/i18n/I18nProvider";

type ExplorerLoadErrorBannerProps = {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
};

export function ExplorerLoadErrorBanner({
  message,
  isRetrying,
  onRetry,
}: ExplorerLoadErrorBannerProps) {
  const { t } = useI18n();

  return (
    <div className="explorer-load-error-banner" role="alert">
      <AlertTriangle size={14} aria-hidden />
      <div className="explorer-load-error-copy">
        <strong>{t("codexNew.workbench.explorer.fullTreeLoadFailed", "Failed to load full directory tree")}</strong>
        <span>{message}</span>
      </div>
      <button
        type="button"
        className="explorer-load-error-retry"
        onClick={onRetry}
        disabled={isRetrying}
      >
        <RefreshCw size={13} aria-hidden />
        {isRetrying
          ? t("codexNew.workbench.refreshing", "Refreshing")
          : t("codexNew.workbench.explorer.retryLoad", "Retry")}
      </button>
    </div>
  );
}
