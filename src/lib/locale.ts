import type { LocalizedText, Locale } from "../types";

export const DEFAULT_LOCALE: Locale = "es";

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