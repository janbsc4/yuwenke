import type { Locale } from "../types";
import { localeUrl } from "./locale";
import { messages } from "./messages";

function setMetaContent(selector: string, content: string): void {
  document
    .querySelector<HTMLMetaElement>(selector)
    ?.setAttribute("content", content);
}

/**
 * Keeps document language, canonical URL, and social metadata in sync with the
 * active locale after an in-place language switch. Reads from the same message
 * dictionaries as the static pages so both paths can never drift apart.
 */
export function applyLocaleMetadata(locale: Locale): void {
  const meta = messages[locale].metadata;
  const canonicalUrl = new URL(localeUrl(locale), window.location.href).href;

  document.documentElement.lang = locale;
  setMetaContent('meta[name="description"]', meta.description);
  setMetaContent('meta[property="og:locale"]', meta.ogLocale);
  setMetaContent('meta[property="og:description"]', meta.socialDescription);
  setMetaContent('meta[property="og:url"]', canonicalUrl);
  setMetaContent('meta[property="og:image:alt"]', meta.ogImageAlt);
  setMetaContent('meta[name="twitter:description"]', meta.socialDescription);

  const canonical = document.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (canonical) canonical.href = canonicalUrl;
}
