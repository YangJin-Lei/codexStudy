import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { I18nProvider } from "@/i18n/I18nProvider";
import { useCodexNewStandalonePage } from "../hooks/useCodexNewStandalonePage";
import { useCodexNewWindowLanguage } from "../hooks/useCodexNewWindowLanguage";
import { WorkbenchShell } from "./WorkbenchShell";

type CodexNewWindowAppProps = {
  kind: "process" | "terminal";
};

function CodexNewWindowScreen({ kind }: CodexNewWindowAppProps) {
  useCodexNewStandalonePage();

  useEffect(() => {
    const title =
      kind === "process"
        ? "Security Mode Workbench"
        : "CLI execution stream";
    document.title = title;
    void getCurrentWindow().setTitle(title).catch(() => {});
  }, [kind]);

  return (
    <div className="codex-new-standalone-root">
      <WorkbenchShell />
    </div>
  );
}

export function CodexNewWindowApp({ kind }: CodexNewWindowAppProps) {
  const language = useCodexNewWindowLanguage();

  return (
    <I18nProvider language={language}>
      <CodexNewWindowScreen kind={kind} />
    </I18nProvider>
  );
}
