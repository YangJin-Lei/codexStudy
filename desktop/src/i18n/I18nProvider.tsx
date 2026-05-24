import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type PropsWithChildren,
} from "react";
import type { UiLanguagePreference } from "../types";
import { messages, type UiLanguage } from "./messages";

type MessageKey = keyof (typeof messages)["en-US"];

type I18nContextValue = {
  language: UiLanguagePreference;
  resolvedLanguage: UiLanguage;
  t: (key: MessageKey, fallback: string) => string;
};

const I18nContext = createContext<I18nContextValue>({
  language: "system",
  resolvedLanguage: "en-US",
  t: (_key, fallback) => fallback,
});

function resolveLanguage(language: UiLanguagePreference | null | undefined): UiLanguage {
  if (language === "zh-CN") {
    return "zh-CN";
  }
  if (language === "en-US") {
    return "en-US";
  }
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh")) {
    return "zh-CN";
  }
  return "en-US";
}

export function I18nProvider({
  language,
  children,
}: PropsWithChildren<{ language?: UiLanguagePreference | null }>) {
  const resolvedLanguage = resolveLanguage(language);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.lang = resolvedLanguage;
  }, [resolvedLanguage]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language: language ?? "system",
      resolvedLanguage,
      t: (key, fallback) => messages[resolvedLanguage][key] ?? fallback,
    }),
    [language, resolvedLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
