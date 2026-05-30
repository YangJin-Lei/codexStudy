import { useMemo } from "react";
import { requestCodexHomeMigrationPrompt } from "@services/events";
import type { CodexNewFrontendState } from "../types";
import { CodexNewDirectoryHierarchy, type CodexNewDirectoryRoot } from "./CodexNewDirectoryHierarchy";

type CodexNewDataPathsPanelProps = {
  isChinese: boolean;
  dataPaths: CodexNewFrontendState["dataPaths"];
  localFolderName?: string | null;
  isolatedRoot?: string | null;
};

export function CodexNewDataPathsPanel({
  isChinese,
  dataPaths,
  localFolderName = null,
  isolatedRoot = null,
}: CodexNewDataPathsPanelProps) {
  const roots = useMemo(() => {
    const items: CodexNewDirectoryRoot[] = [];
    if (dataPaths.codexHome) {
      items.push({
        id: "codex-home",
        role: "data",
        label: "CODEX_HOME",
        path: dataPaths.codexHome,
        detail: isChinese ? "全局配置与会话数据" : "Global config and session data",
      });
    }
    if (dataPaths.codexNewRoot) {
      items.push({
        id: "codex-new-root",
        role: "data",
        label: isChinese ? "安全模式数据根目录" : "Safe mode data root",
        path: dataPaths.codexNewRoot,
        detail: isChinese ? "隔离工作区与任务状态" : "Isolated workspaces and task state",
      });
    }
    const clonePath =
      isolatedRoot?.trim() ||
      (localFolderName?.trim() && dataPaths.codexNewRoot
        ? `${dataPaths.codexNewRoot.replace(/[/\\]+$/, "")}/workspaces/${localFolderName.trim()}`
        : "");
    if (clonePath) {
      items.push({
        id: "clone-workspace",
        role: "clone",
        label: isChinese ? "当前对话的克隆目录" : "This conversation's clone folder",
        path: clonePath,
        badge: localFolderName?.trim() ?? undefined,
        detail: isChinese
          ? "AI 修改与测试默认在此目录执行"
          : "AI edits and tests run here by default",
      });
    }
    return items;
  }, [dataPaths.codexHome, dataPaths.codexNewRoot, isolatedRoot, isChinese, localFolderName]);

  if (roots.length === 0) {
    return null;
  }

  return (
    <div className="codex-new-data-paths">
      <CodexNewDirectoryHierarchy
        title={isChinese ? "目录布局" : "Directory layout"}
        roots={roots}
        isChinese={isChinese}
        compact
      />
      {dataPaths.legacyCodexHomes.length > 0 ? (
        <div className="codex-new-data-paths-note">
          {isChinese
            ? `检测到旧数据目录（会话可能仍在）：${dataPaths.legacyCodexHomes.join(" · ")}。`
            : `Legacy Codex homes detected (older chats may live there): ${dataPaths.legacyCodexHomes.join(" · ")}`}
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
