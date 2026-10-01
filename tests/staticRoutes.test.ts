import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

import { afterEach } from "vitest";

import { appLaunchResolverScript, landingLangResolverScript } from "../src/lib/locale";
import {
  assertAuditsNotDeployed,
  resolveEntryFromHtml,
  resolveLandingLangFromHtml,
  validateLocalizedRouteHtml,
  validateLandingRouteHtml,
  validateAppEntryRouteHtml,
} from "../scripts/validate_static_routes.mjs";

const site = "https://janbsc4.github.io";
const base = "/yuwenke/";

function routeHtml(locale: "es" | "en") {
  const metadata =
    locale === "es"
      ? {
          description:
            "Aprende mandarín con cartas y practica tus palabras con Léi, tu compañero de conversación con IA. Con pinyin y explicaciones en español.",
          ogLocale: "es_ES",
        }
      : {
          description:
            "Learn Mandarin with flashcards and practice your words with Léi, your AI conversation partner. With pinyin and explanations in English.",
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
<body><aside data-home-screen-hint hidden></aside></body>
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

  it("requires the installation hint in the app", () => {
    const html = routeHtml("en").replace('<aside data-home-screen-hint hidden></aside>', "");
    expect(() => validateLocalizedRouteHtml(html, "en")).toThrow("[data-home-screen-hint]");
  });
});

describe("landing root validation", () => {
  function landingHtml() {
    return `<!doctype html>
<html lang="es" data-lang="es">
<head>
<link rel="canonical" href="${site}${base}">
<script data-install-suppression>window.addEventListener("beforeinstallprompt", (event) => event.preventDefault());</script>
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

  it("rejects an installation banner on the landing page", () => {
    const html = landingHtml().replace("</body>", '<aside data-home-screen-hint></aside></body>');
    expect(() => validateLandingRouteHtml(html)).toThrow("se esperaba 0");
  });

  it("requires the landing page to suppress Chrome's automatic install promotion", () => {
    const html = landingHtml().replace("event.preventDefault()", "event");
    expect(() => validateLandingRouteHtml(html)).toThrow("se esperaba true");
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
    const attributes: Record<string, string> = {};
    runInNewContext(landingLangResolverScript(), {
      navigator: { languages },
      window: { localStorage: { getItem: () => saved } },
      document: { documentElement: {
        setAttribute: (name: string, value: string) => { attributes[name] = value; },
      } },
    });
    expect(attributes).toEqual({ "data-lang": expected, lang: expected });
  });
});

describe("Home Screen app entry", () => {
  const rootHtml = `<script>${landingLangResolverScript()}</script>`;
  const appHtml = `<script data-app-launch>${appLaunchResolverScript()}</script>`;

  it("keeps ordinary browser visits on the landing page", () => {
    expect(resolveEntryFromHtml(rootHtml, "es", ["en-US"]).destination).toBeNull();
  });

  it.each([
    { standalone: true },
    { appleStandalone: true },
  ])("sends an existing installed root shortcut to the saved language (%j)", (options) => {
    expect(resolveEntryFromHtml(rootHtml, "es", ["en-US"], options).destination).toBe("/app/es/");
  });

  it("launches the app in the saved language while keeping conversation links", () => {
    expect(resolveEntryFromHtml(appHtml, "en", ["es-ES"], {
      search: "?source=homescreen", hash: "#conversation",
    }).destination).toBe("/app/en/?source=homescreen#conversation");
  });

  it("uses browser language when storage is blocked", () => {
    expect(resolveEntryFromHtml(appHtml, "en", ["es-ES"], {
      storageBlocked: true,
    }).destination).toBe("/app/es/");
  });

  it("falls back to English when neither language preference is supported", () => {
    expect(resolveEntryFromHtml(appHtml, "fr", ["de-DE"]).destination).toBe("/app/en/");
  });

  it("requires the app entry to link its manifest and both language fallbacks", () => {
    const html = `${appHtml}
      <link rel="manifest" href="${base}site.webmanifest">
      <a lang="es" href="${base}app/es/">Abrir</a>
      <a lang="en" href="${base}app/en/">Open</a>`;
    expect(() => validateAppEntryRouteHtml(html)).not.toThrow();
    expect(() => validateAppEntryRouteHtml(html.replace(`${base}app/en/`, "/wrong/")))
      .toThrow("se esperaba /yuwenke/app/en/");
  });
});

describe("audits deployment guard", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function tempProject() {
    const root = await mkdtemp(join(tmpdir(), "yuwenke-audits-"));
    tempDirs.push(root);
    const dist = join(root, "dist");
    const publicDirectory = join(root, "public");
    await mkdir(dist, { recursive: true });
    await mkdir(publicDirectory, { recursive: true });
    return { dist, publicDirectory };
  }

  it("accepts a build output without audit files", async () => {
    const { dist, publicDirectory } = await tempProject();
    await writeFile(join(dist, "index.html"), "<html></html>");
    await expect(assertAuditsNotDeployed(dist, publicDirectory)).resolves.toBeUndefined();
  });

  it("rejects a build output that copied the audits folder", async () => {
    const { dist, publicDirectory } = await tempProject();
    await mkdir(join(dist, "audits"), { recursive: true });
    await writeFile(join(dist, "audits", "report.md"), "# report");
    await expect(assertAuditsNotDeployed(dist, publicDirectory)).rejects.toThrow(
      /audits/,
    );
  });

  it("rejects a nested audits path anywhere in the build output", async () => {
    const { dist, publicDirectory } = await tempProject();
    await mkdir(join(dist, "assets", "audits"), { recursive: true });
    await writeFile(join(dist, "assets", "audits", "report.md"), "# report");
    await expect(assertAuditsNotDeployed(dist, publicDirectory)).rejects.toThrow(
      /audits/,
    );
  });

  it("rejects moving audits into the deployable public folder", async () => {
    const { dist, publicDirectory } = await tempProject();
    await mkdir(join(publicDirectory, "audits"), { recursive: true });
    await expect(assertAuditsNotDeployed(dist, publicDirectory)).rejects.toThrow(
      /public\/audits/,
    );
  });
});
