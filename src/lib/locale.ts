import type { Flashcard, Locale, LocalizedText } from "../types";

export const DEFAULT_LOCALE: Locale = "es";
export const SUPPORTED_LOCALES: readonly Locale[] = ["es", "en"];

export const LOCALE_STORAGE_KEY = "yuwenke:locale:v1";

export function localized(value: LocalizedText | undefined, locale: Locale): string {
  if (!value) return "";
  return value[locale] ?? value.es;
}

/**
 * Projects a Source Flashcard into the active locale's display content.
 * Strict on purpose: no Spanish fallback, so incomplete English content is
 * visible during development instead of leaking mixed-language cards.
 */
export interface LocalizedCardContent {
  meaning: string;
  explanation: string;
  example: string;
  tags: string;
}

export function localizedCardContent(
  card: Flashcard,
  locale: Locale,
): LocalizedCardContent {
  return locale === "en"
    ? {
        meaning: card.ingles,
        explanation: card.explicacion_ingles,
        example: card.ejemplo_ingles,
        tags: card.etiquetas_ingles,
      }
    : {
        meaning: card.espanol,
        explanation: card.explicacion,
        example: card.ejemplo_espanol,
        tags: card.etiquetas,
      };
}

/**
 * Root-route policy: honor the saved choice first, then pick Spanish only
 * when the browser prefers it; English is the fallback for anything else.
 * Targets outside the available locales clamp to the default locale.
 */
export function resolveLocalePreference(
  saved: string | null,
  browserLanguages: readonly string[],
  available: readonly Locale[] = SUPPORTED_LOCALES,
): Locale {
  if (saved && (available as readonly string[]).includes(saved)) {
    return saved as Locale;
  }
  for (const language of browserLanguages) {
    const candidate = language.toLowerCase().split("-")[0];
    if ((available as readonly string[]).includes(candidate)) {
      return candidate as Locale;
    }
  }
  return available.includes("en") ? "en" : DEFAULT_LOCALE;
}

const APP_SEGMENT = "app";

/** The marketing landing page at the base of the site. */
export function homeUrl(): string {
  return import.meta.env.BASE_URL;
}

export function localeUrl(locale: Locale): string {
  return `${import.meta.env.BASE_URL}${APP_SEGMENT}/${locale}/`;
}

export function parseLocaleFromPath(pathname: string): Locale | null {
  const prefix = `${import.meta.env.BASE_URL}${APP_SEGMENT}/`;
  for (const locale of SUPPORTED_LOCALES) {
    if (pathname.startsWith(`${prefix}${locale}/`)) return locale;
  }
  return null;
}

/**
 * Pre-paint script for the bilingual landing page: picks the language with the
 * same policy as resolveLocalePreference and sets <html data-lang> before the
 * first paint, so only one language ever flashes. Inlined verbatim into the
 * landing <head> and executed by the route validator in a sandbox.
 */
export function landingLangResolverScript(): string {
  const available = JSON.stringify([...SUPPORTED_LOCALES]);
  const storageKey = JSON.stringify(LOCALE_STORAGE_KEY);
  const fallback = SUPPORTED_LOCALES.includes("en") ? "en" : DEFAULT_LOCALE;
  return `(function () {
  var saved = null;
  try { saved = window.localStorage.getItem(${storageKey}); } catch (error) {}
  var available = ${available};
  var target = available.indexOf(saved) >= 0 ? saved : null;
  if (!target) {
    var languages = navigator.languages || [navigator.language || ""];
    for (var index = 0; index < languages.length; index += 1) {
      var candidate = String(languages[index] || "").toLowerCase().split("-")[0];
      if (available.indexOf(candidate) >= 0) { target = candidate; break; }
    }
  }
  if (!target) { target = ${JSON.stringify(fallback)}; }
  document.documentElement.setAttribute("data-lang", target);
  document.documentElement.setAttribute("lang", target);
})();`;
}
