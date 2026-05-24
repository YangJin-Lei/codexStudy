import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { I18nProvider, useI18n } from "@/i18n/I18nProvider";
import { useCodexNewWindowLanguage } from "../hooks/useCodexNewWindowLanguage";
import { CodexNewProcessWindow } from "./CodexNewProcessWindow";

type CodexNewWindowAppProps = {
  kind: "process" | "terminal";
};

function CodexNewWindowScreen({ kind }: CodexNewWindowAppProps) {
  const { t } = useI18n();

  useEffect(() => {
    const title =
      kind === "process"
        ? t("codexNew.processWindow.title", "AI coding process")
        : t("codexNew.terminalWindow.title", "CLI execution stream");
    document.title = title;
    void getCurrentWindow().setTitle(title).catch(() => {});
  }, [kind, t]);

  return (
    <CodexNewProcessWindow initialTerminalDockOpen={kind === "terminal"} />
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
