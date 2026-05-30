import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import { useI18n } from "@/i18n/I18nProvider";
import type { CodexNewTracebackEntry, CodexNewTracebackRestoreTarget } from "../../types";
import { formatWorkbenchTime } from "../../utils/formatWorkbenchTime";
import { CodexNewTracebackPanel } from "../CodexNewTracebackPanel";
import { LoadingSpinner } from "../LoadingSpinner";

type SessionTracebackPanelProps = {
  entries: CodexNewTracebackEntry[];
  isLoading: boolean;
  loadError: string | null;
  isRestoring: boolean;
  hasActiveSession: boolean;
  onReload: () => void | Promise<void>;
  onRestore: (path: string, target: CodexNewTracebackRestoreTarget) => void | Promise<void>;
};

export function SessionTracebackPanel({
  entries,
  isLoading,
  loadError,
  isRestoring,
  hasActiveSession,
  onReload,
  onRestore,
}: SessionTracebackPanelProps) {
  const { t, resolvedLanguage } = useI18n();

  return (
    <div className="session-traceback-panel">
      <div className="session-traceback-toolbar">
        <button
          type="button"
          className="session-review-panel-button"
          onClick={() => void onReload()}
          disabled={isLoading || isRestoring}
        >
          {isLoading ? <LoadingSpinner size="small" inline /> : <RefreshCw size={13} aria-hidden />}
          {t("codexNew.workbench.refresh", "Refresh")}
        </button>
      </div>

      {loadError ? (
        <div className="session-traceback-error" role="alert">
          {loadError}
        </div>
      ) : null}

      <CodexNewTracebackPanel
        entries={entries}
        pending={isLoading || isRestoring}
        hasActiveSession={hasActiveSession}
        onRestore={onRestore}
        formatTime={(timestamp) => formatWorkbenchTime(timestamp, resolvedLanguage)}
      />
    </div>
  );
}
