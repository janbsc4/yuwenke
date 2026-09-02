import { landingLangResolverScript } from "../src/lib/locale";
import {
  resolveLandingLangFromHtml,
  validateLocalizedRouteHtml,
  validateLandingRouteHtml,
} from "../scripts/validate_static_routes.mjs";

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
  const canonical = `${site}${base}app/${locale}/`;

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta name="description" content="${metadata.description}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="es" href="${site}${base}app/es/">
<link rel="alternate" hreflang="en" href="${site}${base}app/en/">
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
      validateLocalizedRouteHtml(
        routeHtml("en").replace("/yuwenke/app/en/", "/yuwenke/app/es/"),
        "en",
      ),
    ).toThrow("/yuwenke/app/en/");
  });

  it("ignores expected metadata hidden in comments", () => {
    const html = routeHtml("en").replace(
      '<link rel="canonical" href="https://janbsc4.github.io/yuwenke/app/en/">',
      '<!-- <link rel="canonical" href="https://janbsc4.github.io/yuwenke/app/en/"> -->',
    );
    expect(() => validateLocalizedRouteHtml(html, "en")).toThrow(
      "exactamente un elemento",
    );
  });

  it("rejects conflicting duplicate metadata", () => {
    const html = routeHtml("en").replace(
      '<link rel="canonical" href="https://janbsc4.github.io/yuwenke/app/en/">',
      '<link rel="canonical" href="https://janbsc4.github.io/yuwenke/app/en/">' +
        '<link rel="canonical" href="https://example.com/wrong/">',
    );
    expect(() => validateLocalizedRouteHtml(html, "en")).toThrow(
      "exactamente un elemento",
    );
  });
});

describe("landing root validation", () => {
  function landingHtml() {
    return `<!doctype html>
<html lang="es" data-lang="es">
<head>
<link rel="canonical" href="${site}${base}">
</head>
<body>
<a href="${base}app/es/">Abrir</a>
<a href="${base}app/en/">Open</a>
</body>
</html>`;
  }

  it("accepts a landing page that links both app locales", () => {
    expect(() => validateLandingRouteHtml(landingHtml())).not.toThrow();
  });

  it("rejects a landing page missing the bilingual data-lang flag", () => {
    const html = landingHtml().replace(' data-lang="es"', "");
    expect(() => validateLandingRouteHtml(html)).toThrow("data-lang");
  });

  it("rejects a landing page that forgets one app locale", () => {
    const html = landingHtml().replace(
      `<a href="${base}app/en/">Open</a>`,
      "",
    );
    expect(() => validateLandingRouteHtml(html)).toThrow(`${base}app/en/`);
  });

  it.each([
    ["es", ["en-US"], "es"],
    ["en", ["es-ES"], "en"],
    [null, ["es-ES", "en-US"], "es"],
    [null, ["en-US"], "en"],
    [null, ["fr-FR", "es-ES"], "es"],
    [null, ["fr-FR"], "en"],
    ["fr", ["es-ES"], "es"],
  ] as const)("resolves the landing language (%s, %j) to %s", (saved, languages, expected) => {
    const html = `<html><head><script>${landingLangResolverScript()}</script></head></html>`;
    expect(resolveLandingLangFromHtml(html, saved, [...languages])).toBe(expected);
  });
});
