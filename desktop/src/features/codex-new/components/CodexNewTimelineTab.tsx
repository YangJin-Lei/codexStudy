import Workflow from "lucide-react/dist/esm/icons/workflow";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import { useI18n } from "@/i18n/I18nProvider";
import type { CodexNewProcessEntry, CodexNewSession } from "../types";
import { ChatAgentRunPanel } from "../chat-agent/components/ChatAgentRunPanel";
import type { CodexNewFilePreview } from "../types";

type PreviewCacheEntry =
  | { status: "loading" }
  | { status: "ready"; preview: CodexNewFilePreview }
  | { status: "error"; message: string };

type CodexNewTimelineTabProps = {
  isChinese: boolean;
  activeSession: CodexNewSession | null;
  securityMode: boolean;
  taskPrompt: string | undefined;
  processEntries: CodexNewProcessEntry[];
  expandedFiles: Record<string, boolean>;
  previewCache: Record<string, PreviewCacheEntry | undefined>;
  onToggleFile: (entryId: string, path: string) => void;
  filePreviewKey: (entryId: string, path: string) => string;
  hasRedundantDetail: (entry: CodexNewProcessEntry) => boolean;
  translateProcessKind: (kind: CodexNewProcessEntry["kind"], isChinese: boolean) => string;
  formatTime: (timestamp: number) => string;
};

export function CodexNewTimelineTab({
  isChinese,
  activeSession,
  securityMode,
  taskPrompt,
  processEntries,
  expandedFiles,
  previewCache,
  onToggleFile,
  filePreviewKey,
  hasRedundantDetail,
  translateProcessKind,
  formatTime,
}: CodexNewTimelineTabProps) {
  const { t } = useI18n();
  return (
    <section className="codex-new-window-stream">
      {activeSession?.workspaceId ? (
        <ChatAgentRunPanel
          workspaceId={activeSession.workspaceId}
          threadId={activeSession.threadId}
          securityMode={securityMode}
          taskPrompt={taskPrompt}
        />
      ) : null}
      <div className="codex-new-window-section-title">
        <Workflow size={14} aria-hidden />
        {t("codexNew.window.timeline", "Process timeline")}
      </div>
      {processEntries.length === 0 ? (
        <div className="codex-new-window-empty">
          {t("codexNew.window.noTimeline", "No process timeline yet.")}
        </div>
      ) : (
        <div className="codex-new-window-list">
          {processEntries.map((entry) => (
            <article
              key={entry.id}
              className={`codex-new-window-event status-${entry.status}`}
            >
              <div className="codex-new-window-event-top">
                <div className="codex-new-window-event-kind">
                  <Sparkles size={12} aria-hidden />
                  {translateProcessKind(entry.kind, isChinese)}
                </div>
                <div className="codex-new-window-event-time">
                  {formatTime(entry.createdAt)}
                </div>
              </div>
              <h2 className="codex-new-window-event-title">{entry.title}</h2>
              {!hasRedundantDetail(entry) ? (
                <p className="codex-new-window-event-detail">{entry.detail}</p>
              ) : null}
              {entry.files.length > 0 ? (
                <div className="codex-new-window-file-list">
                  {entry.files.map((file) => {
                    const key = filePreviewKey(entry.id, file.path);
                    const expanded = expandedFiles[key] ?? false;
                    const preview = previewCache[key];
                    return (
                      <div
                        key={key}
                        className={`codex-new-window-file-item${expanded ? " is-open" : ""}`}
                      >
                        <button
                          type="button"
                          className="codex-new-window-file-toggle"
                          onClick={() => void onToggleFile(entry.id, file.path)}
                        >
                          <span className="codex-new-window-file-toggle-left">
                            <span className="codex-new-window-file-path">
                              {file.path}
                            </span>
                            <span className="codex-new-window-file-hint">
                              {preview?.status === "loading"
                                ? t("codexNew.window.previewLoading", "Loading preview...")
                                : t(
                                    "codexNew.window.previewToggle",
                                    "Click to preview code",
                                  )}
                            </span>
                          </span>
                          <ChevronRight
                            size={14}
                            aria-hidden
                            className={`codex-new-window-file-chevron${expanded ? " is-open" : ""}`}
                          />
                        </button>
                        {expanded ? (
                          <div className="codex-new-window-file-preview-shell">
                            {preview?.status === "loading" ? (
                              <div className="codex-new-window-file-preview-note">
                                {t("codexNew.window.previewLoading", "Loading preview...")}
                              </div>
                            ) : null}
                            {preview?.status === "error" ? (
                              <div className="codex-new-window-file-preview-note">
                                {preview.message}
                              </div>
                            ) : null}
                            {preview?.status === "ready" &&
                            preview.preview.status === "binary" ? (
                              <div className="codex-new-window-file-preview-note">
                                {t(
                                  "codexNew.window.previewBinary",
                                  "Binary file preview unavailable.",
                                )}
                              </div>
                            ) : null}
                            {preview?.status === "ready" &&
                            preview.preview.status === "missing" ? (
                              <div className="codex-new-window-file-preview-note">
                                {t(
                                  "codexNew.window.previewMissing",
                                  "File preview unavailable.",
                                )}
                              </div>
                            ) : null}
                            {preview?.status === "ready" &&
                            preview.preview.status === "ready" ? (
                              <>
                                <pre className="codex-new-window-file-preview">
                                  {preview.preview.content ||
                                    t(
                                      "codexNew.window.previewEmpty",
                                      "This file is empty.",
                                    )}
                                </pre>
                                {preview.preview.truncated ? (
                                  <div className="codex-new-window-file-preview-note">
                                    {t(
                                      "codexNew.window.previewTruncated",
                                      "Preview truncated.",
                                    )}
                                  </div>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

