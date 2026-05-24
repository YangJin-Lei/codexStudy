import { useEffect, useState } from "react";
import type { UiLanguagePreference } from "@/types";
import { getAppSettings } from "@services/tauri";

export function useCodexNewWindowLanguage() {
  const [language, setLanguage] = useState<UiLanguagePreference>("system");

  useEffect(() => {
    let cancelled = false;
    const syncLanguage = () => {
      getAppSettings()
        .then((settings) => {
          if (!cancelled) {
            setLanguage(settings.uiLanguage ?? "system");
          }
        })
        .catch(() => {
          if (!cancelled) {
            setLanguage("system");
          }
        });
    };

    syncLanguage();
    const interval = window.setInterval(syncLanguage, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return language;
}
