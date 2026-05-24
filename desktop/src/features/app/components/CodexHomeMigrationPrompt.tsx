import { ModalShell } from "@/features/design-system/components/modal/ModalShell";
import type { CodexHomeMigrationLegacyHome } from "@services/tauri";

type CodexHomeMigrationPromptProps = {
  isChinese: boolean;
  codexHome: string;
  legacyHomes: CodexHomeMigrationLegacyHome[];
  busy: boolean;
  error: string | null;
  onImport: (sourcePath: string) => void;
  onStartFresh: () => void;
  onLater: () => void;
};

export function CodexHomeMigrationPrompt({
  isChinese,
  codexHome,
  legacyHomes,
  busy,
  error,
  onImport,
  onStartFresh,
  onLater,
}: CodexHomeMigrationPromptProps) {
  const primaryLegacy = legacyHomes[0];
  const totalSessions = legacyHomes.reduce(
    (sum, entry) => sum + entry.sessionFileCount,
    0,
  );

  return (
    <ModalShell
      className="codex-home-migration-modal"
      ariaLabel={isChinese ? "导入 Codex 会话" : "Import Codex conversations"}
      onBackdropClick={() => {
        if (!busy) {
          onLater();
        }
      }}
    >
      <div className="ds-modal-title">
        {isChinese ? "发现旧的 Codex 数据" : "Found legacy Codex data"}
      </div>
      <div className="ds-modal-subtitle codex-home-migration-modal-subtitle">
        {isChinese ? (
          <>
            CodexStudy 使用独立目录保存会话，与官方 Codex CLI 的{" "}
            <code>~/.codex</code> 分开。检测到本机仍有旧会话，可合并导入到{" "}
            <code>{codexHome}</code>，或选择全新开始。
            <span className="codex-home-migration-modal-note-inline">
              此提示仅迁移历史会话，与发消息时的配置错误无关；官方 Codex 仍可继续使用{" "}
              <code>~/.codex</code>。
            </span>
          </>
        ) : (
          <>
            CodexStudy keeps conversations in its own home, separate from the official
            Codex CLI <code>~/.codex</code>. Older chats were detected on this machine.
            You can merge them into <code>{codexHome}</code> or start fresh.
            <span className="codex-home-migration-modal-note-inline">
              This only migrates old sessions and is unrelated to config errors when
              sending messages. The official Codex CLI can keep using <code>~/.codex</code>.
            </span>
          </>
        )}
      </div>
      <ul className="codex-home-migration-modal-list">
        {legacyHomes.map((entry) => (
          <li key={entry.path}>
            <code>{entry.path}</code>
            <span className="codex-home-migration-modal-count">
              {isChinese
                ? `${entry.sessionFileCount} 条会话`
                : `${entry.sessionFileCount} conversations`}
            </span>
          </li>
        ))}
      </ul>
      <div className="codex-home-migration-modal-hint">
        {isChinese
          ? `导入只会复制缺失的文件，不会覆盖 ${codexHome} 里已有的会话。官方 Codex 仍可继续使用 ~/.codex。也可设置环境变量 CODEXSTUDY_CODEX_HOME 指定目录。`
          : `Import copies only missing files and does not overwrite conversations already in ${codexHome}. The official Codex CLI can keep using ~/.codex. Set CODEXSTUDY_CODEX_HOME to choose another directory.`}
      </div>
      {error ? <div className="ds-modal-error">{error}</div> : null}
      <div className="ds-modal-actions codex-home-migration-modal-actions">
        <button
          type="button"
          className="ghost ds-modal-button"
          onClick={onLater}
          disabled={busy}
        >
          {isChinese ? "稍后" : "Later"}
        </button>
        <button
          type="button"
          className="ghost ds-modal-button"
          onClick={onStartFresh}
          disabled={busy}
        >
          {isChinese ? "全新开始" : "Start fresh"}
        </button>
        <button
          type="button"
          className="primary ds-modal-button"
          onClick={() => {
            if (primaryLegacy) {
              onImport(primaryLegacy.path);
            }
          }}
          disabled={busy || !primaryLegacy}
        >
          {busy
            ? isChinese
              ? "导入中…"
              : "Importing…"
            : isChinese
              ? `导入 ${totalSessions} 条会话`
              : `Import ${totalSessions} conversations`}
        </button>
      </div>
    </ModalShell>
  );
}
