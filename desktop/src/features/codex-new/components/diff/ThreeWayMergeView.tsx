import { useI18n } from "@/i18n/I18nProvider";
import { useThreeWayPreviews } from "../../hooks/useThreeWayPreviews";
import type { CodexNewDiffFile, CodexNewHunkSelection } from "../../types";
import { DiffHunkList } from "./DiffHunkList";
import { ThreeWayPreviewColumn } from "./ThreeWayPreviewColumn";

type ThreeWayMergeViewProps = {
  workspaceId: string | null;
  filePath: string;
  diffFile: CodexNewDiffFile;
  selectedHunks: CodexNewHunkSelection[];
  onHunkToggle?: (path: string, hunkIndex: number) => void;
};

export function ThreeWayMergeView({
  workspaceId,
  filePath,
  diffFile,
  selectedHunks,
  onHunkToggle,
}: ThreeWayMergeViewProps) {
  const { t } = useI18n();
  const previews = useThreeWayPreviews(workspaceId, filePath, true);

  const isHunkSelected = (hunkIndex: number) =>
    selectedHunks.some((selection) => selection.path === filePath && selection.hunkIndex === hunkIndex);

  return (
    <div className="three-way-merge-view">
      <p className="three-way-merge-hint">
        {t(
          "codexNew.workbench.threeWay.hint",
          "The project file changed since the task started. Compare project vs clone, then resolve in your editor and refresh.",
        )}
      </p>

      {previews.error ? (
        <div className="three-way-merge-error" role="alert">
          {previews.error}
        </div>
      ) : null}

      <div className="three-way-columns">
        <ThreeWayPreviewColumn
          title={t("codexNew.workbench.threeWay.projectColumn", "Project (on disk)")}
          preview={previews.project}
          isLoading={previews.isLoading}
        />
        <ThreeWayPreviewColumn
          title={t("codexNew.workbench.threeWay.cloneColumn", "Isolated clone (AI)")}
          preview={previews.workspace}
          isLoading={previews.isLoading}
        />
      </div>

      <div className="three-way-diff-section">
        <h3 className="three-way-diff-title">
          {t("codexNew.workbench.threeWay.diffSection", "AI diff hunks")}
        </h3>
        {diffFile.hunks.length === 0 ? (
          <div className="file-diff-notice">
            {t("codexNew.workbench.threeWay.noHunks", "No diff hunks for this file")}
          </div>
        ) : (
          <DiffHunkList
            filePath={filePath}
            hunks={diffFile.hunks}
            isHunkSelected={isHunkSelected}
            onHunkToggle={onHunkToggle}
          />
        )}
      </div>

      <div className="three-way-actions">
        <button type="button" className="three-way-action-button" disabled title={t(
          "codexNew.workbench.threeWay.keepProjectDisabled",
          "Edit the project file directly, then refresh changes",
        )}>
          {t("codexNew.workbench.threeWay.keepProject", "Keep project version")}
        </button>
        <button type="button" className="three-way-action-button" disabled title={t(
          "codexNew.workbench.threeWay.keepCloneDisabled",
          "Force overwrite is not available yet — merge after resolving conflicts",
        )}>
          {t("codexNew.workbench.threeWay.keepClone", "Keep clone version")}
        </button>
      </div>
    </div>
  );
}
