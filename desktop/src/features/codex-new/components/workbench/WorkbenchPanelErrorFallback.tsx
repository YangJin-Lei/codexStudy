import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import { useI18n } from "@/i18n/I18nProvider";

type WorkbenchPanelErrorFallbackProps = {
  panelLabel: string;
  errorMessage: string | null;
  onRetry: () => void;
};

export function WorkbenchPanelErrorFallback({
  panelLabel,
  errorMessage,
  onRetry,
}: WorkbenchPanelErrorFallbackProps) {
  const { t } = useI18n();

  return (
    <div className="workbench-panel-error-fallback" role="alert">
      <div className="workbench-panel-error-title">
        <AlertTriangle size={16} aria-hidden />
        <strong>
          {t("codexNew.workbench.errors.panelTitle", "{panel} failed to render").replace(
            "{panel}",
            panelLabel,
          )}
        </strong>
      </div>
      <p className="workbench-panel-error-message">
        {errorMessage ??
          t("codexNew.workbench.errors.panelGeneric", "An unexpected error occurred in this panel.")}
      </p>
      <button type="button" className="workbench-panel-error-retry" onClick={onRetry}>
        <RefreshCw size={13} aria-hidden />
        {t("codexNew.workbench.errors.retryPanel", "Retry panel")}
      </button>
    </div>
  );
}
