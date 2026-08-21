import { readFile } from "node:fs/promises";
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

export function validateLocalizedRouteHtml(html, locale) {
  const site = String(astroConfig.site).replace(/\/$/, "");
  const base = `/${String(astroConfig.base).replace(/^\/+|\/+$/g, "")}/`;
  const route = `${base}${locale}/`;
  const canonical = `${site}${route}`;
  const metadata = expectedMetadata[locale];
  if (!metadata) throw new Error(`Locale no soportado: ${locale}`);

  const document = new JSDOM(html).window.document;
  if (document.documentElement.lang !== locale) {
    throw new Error(
      `${route} tiene html[lang] = ${document.documentElement.lang}; se esperaba ${locale}.`,
    );
  }
  requireAttribute(
    document,
    'meta[name="description"]',
    "content",
    metadata.description,
    route,
  );
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
      `${site}${base}${alternate}/`,
      route,
    );
  }
}

export function resolveRootTargetFromHtml(html, saved, browserLanguages) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error("La ruta raíz no contiene el resolver de locale.");

  let target = "";
  runInNewContext(script, {
    navigator: { languages: browserLanguages, language: browserLanguages[0] ?? "" },
    window: {
      localStorage: { getItem: () => saved },
      location: { replace: (value) => { target = value; } },
    },
  });
  return target;
}

export async function validateStaticRoutes(distDirectory = resolve("dist")) {
  await Promise.all(
    Object.keys(expectedMetadata).map(async (locale) => {
      const html = await readFile(resolve(distDirectory, locale, "index.html"), "utf8");
      validateLocalizedRouteHtml(html, locale);
    }),
  );

  const rootHtml = await readFile(resolve(distDirectory, "index.html"), "utf8");
  const rootCases = [
    ["es", ["en-US"], "/yuwenke/es/"],
    [null, ["en-US", "es-ES"], "/yuwenke/en/"],
    [null, ["fr-FR", "es-ES"], "/yuwenke/es/"],
    [null, ["fr-FR"], "/yuwenke/en/"],
  ];
  for (const [saved, languages, expected] of rootCases) {
    const actual = resolveRootTargetFromHtml(rootHtml, saved, languages);
    if (actual !== expected) {
      throw new Error(`La ruta raíz resolvió ${actual}; se esperaba ${expected}.`);
    }
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  await validateStaticRoutes();
  console.log("Rutas estáticas localizadas validadas.");
}
