import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle";
import { useI18n } from "@/i18n/I18nProvider";

type ConflictStatsStripProps = {
  conflictCount: number;
  onViewConflicts: () => void;
};

export function ConflictStatsStrip({ conflictCount, onViewConflicts }: ConflictStatsStripProps) {
  const { t } = useI18n();

  if (conflictCount <= 0) {
    return null;
  }

  return (
    <div className="conflict-stats-strip" role="status">
      <AlertTriangle size={14} />
      <span>
        {t("codexNew.workbench.conflicts.stats", "{count} conflicted file(s)").replace(
          "{count}",
          String(conflictCount),
        )}
      </span>
      <button type="button" className="conflict-stats-strip-action" onClick={onViewConflicts}>
        {t("codexNew.workbench.conflicts.view", "View")}
      </button>
    </div>
  );
}
