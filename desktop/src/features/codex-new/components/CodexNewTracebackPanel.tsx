import { useMemo } from "react";
import FileCode from "lucide-react/dist/esm/icons/file-code";
import History from "lucide-react/dist/esm/icons/history";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import { useI18n } from "@/i18n/I18nProvider";
import type { CodexNewTracebackEntry } from "../types";
import { pathBasename } from "../utils/pathTree";

type CodexNewTracebackPanelProps = {
  entries: CodexNewTracebackEntry[];
  pending: boolean;
  hasActiveSession: boolean;
  onRestore: (path: string, target: "project" | "workspace") => void | Promise<void>;
  formatTime: (timestamp: number) => string;
};

export function CodexNewTracebackPanel({
  entries,
  pending,
  hasActiveSession,
  onRestore,
  formatTime,
}: CodexNewTracebackPanelProps) {
  const { t } = useI18n();

  const grouped = useMemo(() => {
    const map = new Map<string, CodexNewTracebackEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.path) ?? [];
      list.push(entry);
      map.set(entry.path, list);
    }
    for (const list of map.values()) {
      list.sort((left, right) => right.revision - left.revision);
    }
    return [...map.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [entries]);

  return (
    <div className="codex-new-traceback-panel">
      <div className="codex-new-traceback-panel-header">
        <div className="codex-new-traceback-panel-title">
          <History size={16} aria-hidden />
          {t("codexNew.workbench.traceback.title", "Edit snapshots (per file)")}
        </div>
        <span className="codex-new-traceback-panel-count">
          {t("codexNew.workbench.traceback.entryCount", "{count} entries").replace(
            "{count}",
            String(entries.length),
          )}
        </span>
      </div>
      <div className="codex-new-traceback-panel-note">
        {t(
          "codexNew.workbench.traceback.note",
          "Per-file snapshots captured during editing. Unlike merged rollback, this restores a specific file revision in the project or isolated copy.",
        )}
      </div>
      {grouped.length === 0 ? (
        <div className="codex-new-traceback-panel-empty">
          {t("codexNew.workbench.traceback.empty", "No edit snapshots yet")}
        </div>
      ) : (
        <div className="codex-new-traceback-panel-list">
          {grouped.map(([path, revisions]) => (
            <article key={path} className="codex-new-traceback-file-card">
              <div className="codex-new-traceback-file-head">
                <FileCode size={16} aria-hidden />
                <div className="codex-new-traceback-file-copy">
                  <div className="codex-new-traceback-file-name">{pathBasename(path)}</div>
                  <div className="codex-new-traceback-file-path">{path}</div>
                </div>
              </div>
              <div className="codex-new-traceback-revisions">
                {revisions.map((entry) => (
                  <div key={`${entry.path}-${entry.revision}`} className="codex-new-traceback-revision">
                    <div className="codex-new-traceback-revision-meta">
                      <span className="codex-new-traceback-revision-badge">
                        {t("codexNew.workbench.traceback.snapshot", "Snapshot #{revision}").replace(
                          "{revision}",
                          String(entry.revision),
                        )}
                      </span>
                      <span>{formatTime(entry.updatedAt)}</span>
                    </div>
                    <div className="codex-new-traceback-revision-actions">
                      <button
                        type="button"
                        className="codex-new-mini-button"
                        onClick={() => void onRestore(entry.path, "project")}
                        disabled={!hasActiveSession || pending}
                      >
                        <RotateCcw size={13} aria-hidden />
                        {t("codexNew.workbench.traceback.restoreProject", "Restore project file")}
                      </button>
                      <button
                        type="button"
                        className="codex-new-mini-button"
                        onClick={() => void onRestore(entry.path, "workspace")}
                        disabled={!hasActiveSession || pending}
                      >
                        <RotateCcw size={13} aria-hidden />
                        {t("codexNew.workbench.traceback.restoreWorkspace", "Reset isolated copy")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
