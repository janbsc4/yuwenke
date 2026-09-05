import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

import { JSDOM } from "jsdom";

import astroConfig from "../astro.config.mjs";

const expectedMetadata = {
  es: {
    description:
      "Cartas de vocabulario, frases y conceptos de mandarín con explicaciones en español.",
    ogLocale: "es_ES",
  },
  en: {
    description:
      "Mandarin vocabulary, phrase, and concept flashcards with explanations in English.",
    ogLocale: "en_US",
  },
};

function singleElement(document, selector, route) {
  const elements = document.querySelectorAll(selector);
  if (elements.length !== 1) {
    throw new Error(`${route} debe contener exactamente un elemento ${selector}.`);
  }
  return elements[0];
}

function requireAttribute(document, selector, attribute, expected, route) {
  const element = singleElement(document, selector, route);
  const actual = element.getAttribute(attribute);
  if (actual !== expected) {
    throw new Error(`${route} tiene ${selector}[${attribute}] = ${actual}; se esperaba ${expected}.`);
  }
}

function siteAndBase() {
  const site = String(astroConfig.site).replace(/\/$/, "");
  const base = `/${String(astroConfig.base).replace(/^\/+|\/+$/g, "")}/`;
  return { site, base };
}

export function validateLocalizedRouteHtml(html, locale) {
  const { site, base } = siteAndBase();
  const route = `${base}app/${locale}/`;
  const canonical = `${site}${route}`;
  const metadata = expectedMetadata[locale];
  if (!metadata) throw new Error(`Locale no soportado: ${locale}`);

  const document = new JSDOM(html).window.document;
  if (document.documentElement.lang !== locale) {
    throw new Error(
      `${route} tiene html[lang] = ${document.documentElement.lang}; se esperaba ${locale}.`,
    );
  }
  requireAttribute(document, 'meta[name="description"]', "content", metadata.description, route);
  requireAttribute(document, 'link[rel="canonical"]', "href", canonical, route);
  requireAttribute(
    document,
    'meta[property="og:locale"]',
    "content",
    metadata.ogLocale,
    route,
  );
  requireAttribute(document, 'meta[property="og:url"]', "content", canonical, route);
  requireAttribute(
    document,
    'link[rel="alternate"][hreflang="x-default"]',
    "href",
    `${site}${base}`,
    route,
  );

  const localizedAssets = document.querySelectorAll(
    `[src^="${base}_astro/"], [href^="${base}_astro/"]`,
  );
  if (localizedAssets.length === 0) {
    throw new Error(`${route} no contiene recursos bajo ${base}_astro/.`);
  }

  for (const alternate of Object.keys(expectedMetadata)) {
    requireAttribute(
      document,
      `link[rel="alternate"][hreflang="${alternate}"]`,
      "href",
      `${site}${base}app/${alternate}/`,
      route,
    );
  }
}

export function resolveLandingLangFromHtml(html, saved, browserLanguages) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error("La página raíz no contiene el resolver de idioma.");

  let lang = "";
  runInNewContext(script, {
    navigator: { languages: browserLanguages, language: browserLanguages[0] ?? "" },
    document: { documentElement: { setAttribute: (_name, value) => { lang = value; } } },
    window: { localStorage: { getItem: () => saved } },
  });
  return lang;
}

export function validateLandingRouteHtml(html) {
  const { site, base } = siteAndBase();
  const route = base;
  const canonical = `${site}${base}`;

  const document = new JSDOM(html).window.document;
  if (!document.documentElement.hasAttribute("data-lang")) {
    throw new Error(`${route} debe exponer html[data-lang] para el interruptor bilingüe.`);
  }
  requireAttribute(document, 'link[rel="canonical"]', "href", canonical, route);

  const appLinks = [...document.querySelectorAll(`a[href^="${base}app/"]`)]
    .map((anchor) => new URL(anchor.getAttribute("href"), site).pathname);
  for (const locale of Object.keys(expectedMetadata)) {
    if (!appLinks.includes(`${base}app/${locale}/`)) {
      throw new Error(`${route} debe enlazar a la app en ${locale} (${base}app/${locale}/).`);
    }
  }
}

export async function assertAuditsNotDeployed(
  distDirectory = resolve("dist"),
  publicDirectory = resolve("public"),
) {
  if (existsSync(resolve(publicDirectory, "audits"))) {
    throw new Error(
      "public/audits no debe existir: las auditorías se guardan en audits/ y no se despliegan.",
    );
  }
  const entries = await readdir(distDirectory, { recursive: true });
  const leaked = entries.filter((entry) => entry.split(/[\\/]/).includes("audits"));
  if (leaked.length > 0) {
    throw new Error(
      `dist contiene rutas de auditoría que no deben desplegarse: ${leaked.join(", ")}`,
    );
  }
}

export async function validateStaticRoutes(distDirectory = resolve("dist")) {
  await Promise.all(
    Object.keys(expectedMetadata).map(async (locale) => {
      const html = await readFile(resolve(distDirectory, "app", locale, "index.html"), "utf8");
      validateLocalizedRouteHtml(html, locale);
    }),
  );

  const rootHtml = await readFile(resolve(distDirectory, "index.html"), "utf8");
  validateLandingRouteHtml(rootHtml);

  const rootCases = [
    ["es", ["en-US"], "es"],
    ["en", ["es-ES"], "en"],
    [null, ["es-ES", "en-US"], "es"],
    [null, ["en-US"], "en"],
    [null, ["fr-FR", "es-ES"], "es"],
    [null, ["fr-FR"], "en"],
    ["fr", ["es-ES"], "es"],
  ];
  for (const [saved, languages, expected] of rootCases) {
    const actual = resolveLandingLangFromHtml(rootHtml, saved, languages);
    if (actual !== expected) {
      throw new Error(`La raíz resolvió el idioma ${actual}; se esperaba ${expected}.`);
    }
  }

  await assertAuditsNotDeployed(distDirectory);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  await validateStaticRoutes();
  console.log("Rutas estáticas validadas: landing raíz y app localizada.");
}
