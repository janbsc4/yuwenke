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
 * Entry-route policy: honor the saved choice first, then use the first supported
 * browser language; English is the fallback for anything else.
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

function localeResolverScript(launchApp: boolean): string {
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
  if (${launchApp ? "true" : 'navigator.standalone || (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches)'}) {
    window.location.replace(${JSON.stringify(`${import.meta.env.BASE_URL}${APP_SEGMENT}/`)} + target + "/" + window.location.search + window.location.hash);
  }
})();`;
}

/** Resolve the landing language before paint and recover older installed shortcuts. */
export function landingLangResolverScript(): string {
  return localeResolverScript(false);
}

/** The installed app's entry route shares the landing page's language policy. */
export function appLaunchResolverScript(): string {
  return localeResolverScript(true);
}
