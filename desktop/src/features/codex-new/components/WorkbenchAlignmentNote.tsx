import { useEffect, useState } from "react";
import X from "lucide-react/dist/esm/icons/x";
import { useI18n } from "@/i18n/I18nProvider";

const DISMISS_STORAGE_KEY = "codex-new:workbench:alignment-note-dismissed";

type WorkbenchAlignmentNoteProps = {
  isVisible: boolean;
};

export function WorkbenchAlignmentNote({ isVisible }: WorkbenchAlignmentNoteProps) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return localStorage.getItem(DISMISS_STORAGE_KEY) === "true";
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    localStorage.setItem(DISMISS_STORAGE_KEY, String(dismissed));
  }, [dismissed]);

  if (!isVisible || dismissed) {
    return null;
  }

  return (
    <div className="workbench-alignment-note" role="status" aria-live="polite">
      <div className="workbench-alignment-note-copy">
        <strong>{t("codexNew.workbench.alignmentPrefix", "Doc alignment in progress:")}</strong>
        {t(
          "codexNew.workbench.alignmentDetail",
          "layout/diff/hunk/session flow is active; full directory tree and advanced conflict workflow are still being implemented.",
        )}{" "}
        {t(
          "codexNew.workbench.nextTask",
          "Next: integrate the full directory tree data source and then deepen the conflict resolution workflow.",
        )}
      </div>
      <button
        type="button"
        className="workbench-alignment-note-dismiss"
        onClick={() => setDismissed(true)}
        aria-label={t("codexNew.workbench.alignmentDismiss", "Dismiss")}
      >
        <X size={14} />
      </button>
    </div>
  );
}
