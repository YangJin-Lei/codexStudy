import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import { useI18n } from "@/i18n/I18nProvider";

type WorkbenchRefreshErrorBannerProps = {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
  onDismiss: () => void;
};

export function WorkbenchRefreshErrorBanner({
  message,
  isRetrying,
  onRetry,
  onDismiss,
}: WorkbenchRefreshErrorBannerProps) {
  const { t } = useI18n();

  return (
    <div className="workbench-refresh-error-banner" role="alert">
      <AlertTriangle size={14} aria-hidden />
      <div className="workbench-refresh-error-copy">
        <strong>{t("codexNew.workbench.errors.refreshTitle", "Unable to refresh changes")}</strong>
        <span>{message}</span>
      </div>
      <div className="workbench-refresh-error-actions">
        <button
          type="button"
          className="workbench-refresh-error-button"
          onClick={onRetry}
          disabled={isRetrying}
        >
          <RefreshCw size={13} aria-hidden />
          {isRetrying
            ? t("codexNew.workbench.refreshing", "Refreshing")
            : t("codexNew.workbench.errors.refreshRetry", "Retry")}
        </button>
        <button type="button" className="workbench-refresh-error-button is-muted" onClick={onDismiss}>
          {t("codexNew.workbench.errors.dismiss", "Dismiss")}
        </button>
      </div>
    </div>
  );
}
