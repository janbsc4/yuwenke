import { validateLocalizedRouteHtml } from "../scripts/validate_static_routes.mjs";

const site = "https://janbsc4.github.io";
const base = "/yuwenke/";

function routeHtml(locale: "es" | "en") {
  const metadata =
    locale === "es"
      ? {
          description:
            "Cartas de vocabulario, frases y conceptos de mandarín con explicaciones en español.",
          ogLocale: "es_ES",
        }
      : {
          description:
            "Mandarin vocabulary, phrase, and concept flashcards with explanations in English.",
          ogLocale: "en_US",
        };
  const canonical = `${site}${base}${locale}/`;

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta name="description" content="${metadata.description}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="es" href="${site}${base}es/">
<link rel="alternate" hreflang="en" href="${site}${base}en/">
<link rel="alternate" hreflang="x-default" href="${site}${base}">
<meta property="og:locale" content="${metadata.ogLocale}">
<meta property="og:url" content="${canonical}">
<script src="${base}_astro/app.js"></script>
</head>
</html>`;
}

describe("localized static route validation", () => {
  it.each(["es", "en"] as const)("accepts complete %s metadata", (locale) => {
    expect(() => validateLocalizedRouteHtml(routeHtml(locale), locale)).not.toThrow();
  });

  it("rejects metadata that points at the wrong locale", () => {
    expect(() =>
      validateLocalizedRouteHtml(routeHtml("en").replace("/yuwenke/en/", "/yuwenke/es/"), "en"),
    ).toThrow("/yuwenke/en/");
  });

  it("ignores expected metadata hidden in comments", () => {
    const html = routeHtml("en").replace(
      '<link rel="canonical" href="https://janbsc4.github.io/yuwenke/en/">',
      '<!-- <link rel="canonical" href="https://janbsc4.github.io/yuwenke/en/"> -->',
    );
    expect(() => validateLocalizedRouteHtml(html, "en")).toThrow(
      "exactamente un elemento",
    );
  });

  it("rejects conflicting duplicate metadata", () => {
    const html = routeHtml("en").replace(
      '<link rel="canonical" href="https://janbsc4.github.io/yuwenke/en/">',
      '<link rel="canonical" href="https://janbsc4.github.io/yuwenke/en/">' +
        '<link rel="canonical" href="https://example.com/wrong/">',
    );
    expect(() => validateLocalizedRouteHtml(html, "en")).toThrow(
      "exactamente un elemento",
    );
  });
});
