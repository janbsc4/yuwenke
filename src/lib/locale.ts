import type { Flashcard, Locale, LocalizedText } from "../types";

export const DEFAULT_LOCALE: Locale = "es";
export const SUPPORTED_LOCALES: readonly Locale[] = ["es", "en"];

// English is public: every card has complete, owner-reviewed English content
// (Part 3 of grilled-plan-001) and the release validation is in place.
export const ENGLISH_RELEASED = true;
export const AVAILABLE_LOCALES: readonly Locale[] = ENGLISH_RELEASED
  ? SUPPORTED_LOCALES
  : [DEFAULT_LOCALE];

export const LOCALE_STORAGE_KEY = "yuwenke:locale:v1";

export function localized(value: LocalizedText | undefined, locale: Locale): string {
  if (!value) return "";
  return value[locale] ?? value.es;
}

export function localizedOrFallback(
  value: LocalizedText | undefined,
  locale: Locale,
): string {
  if (!value) return "";
  return value[locale]?.trim() ? value[locale] : value.es;
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
  available: readonly Locale[] = AVAILABLE_LOCALES,
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

export function localeUrl(locale: Locale): string {
  return `${import.meta.env.BASE_URL}${locale}/`;
}

export function parseLocaleFromPath(pathname: string): Locale | null {
  const base = import.meta.env.BASE_URL;
  for (const locale of SUPPORTED_LOCALES) {
    if (pathname.startsWith(`${base}${locale}/`)) return locale;
  }
  return null;
}
