import { requestCodexHomeMigrationPrompt } from "@services/events";
import { useCodexNewState } from "../hooks/useCodexNewState";

type CodexNewDataPathsPanelProps = {
  isChinese: boolean;
};

export function CodexNewDataPathsPanel({ isChinese }: CodexNewDataPathsPanelProps) {
  const state = useCodexNewState();
  const paths = state.dataPaths;

  if (!paths.codexHome && !paths.codexNewRoot) {
    return null;
  }

  return (
    <div className="codex-new-data-paths">
      <div className="codex-new-data-paths-title">
        {isChinese ? "数据目录" : "Data locations"}
      </div>
      <div className="codex-new-data-paths-row">
        <span className="codex-new-data-paths-label">CODEX_HOME</span>
        <code className="codex-new-data-paths-value">{paths.codexHome}</code>
      </div>
      <div className="codex-new-data-paths-row">
        <span className="codex-new-data-paths-label">codex-new</span>
        <code className="codex-new-data-paths-value">{paths.codexNewRoot}</code>
      </div>
      {paths.legacyCodexHomes.length > 0 ? (
        <div className="codex-new-data-paths-note">
          {isChinese
            ? `检测到旧数据目录（会话可能仍在）：${paths.legacyCodexHomes.join(" · ")}。`
            : `Legacy Codex homes detected (older chats may live there): ${paths.legacyCodexHomes.join(" · ")}`}
          <button
            type="button"
            className="ghost codex-new-data-paths-import"
            onClick={() => requestCodexHomeMigrationPrompt()}
          >
            {isChinese ? "导入到 CodexStudy" : "Import into CodexStudy"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
