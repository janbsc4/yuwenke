import {
  localizedCardContent,
  parseLocaleFromPath,
  resolveLocalePreference,
} from "../src/lib/locale";
import { messages, topicDisplayLabel } from "../src/lib/messages";
import type { Flashcard, Locale } from "../src/types";

const bothLocales: readonly Locale[] = ["es", "en"];

function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

const card: Flashcard = {
  id: "FC001",
  tipo: "palabra",
  tema: "saludos",
  hanzi: "你好",
  pinyin: "nǐ hǎo",
  espanol: "hola",
  explicacion: "Un saludo básico.",
  ejemplo_hanzi: "你好！",
  ejemplo_pinyin: "Nǐ hǎo!",
  ejemplo_espanol: "¡Hola!",
  pagina: "1",
  etiquetas: "saludo;basico",
  nombres_propios: "",
  ingles: "hello",
  explicacion_ingles: "A basic greeting.",
  ejemplo_ingles: "Hello!",
  etiquetas_ingles: "greeting;basics",
};

describe("locale messages", () => {
  it("keeps identical dictionary keys in Spanish and English", () => {
    expect(keyPaths(messages.en).sort()).toEqual(keyPaths(messages.es).sort());
  });

  it("resolves topic labels per locale with a capitalized fallback", () => {
    expect(topicDisplayLabel("es", "saludos")).toBe("Saludos");
    expect(topicDisplayLabel("en", "saludos")).toBe("Greetings");
    expect(topicDisplayLabel("en", "nuevo-tema")).toBe("Nuevo-tema");
  });
});

describe("localizedCardContent", () => {
  it("projects the active locale's card fields", () => {
    expect(localizedCardContent(card, "es")).toEqual({
      meaning: "hola",
      explanation: "Un saludo básico.",
      example: "¡Hola!",
      tags: "saludo;basico",
    });
    expect(localizedCardContent(card, "en")).toEqual({
      meaning: "hello",
      explanation: "A basic greeting.",
      example: "Hello!",
      tags: "greeting;basics",
    });
  });

  it("never falls back to Spanish for missing English content", () => {
    const untranslated = { ...card, ingles: "", ejemplo_ingles: "" };
    const content = localizedCardContent(untranslated, "en");
    expect(content.meaning).toBe("");
    expect(content.example).toBe("");
    expect(content.explanation).toBe("A basic greeting.");
  });
});

describe("resolveLocalePreference", () => {
  it("honors a saved choice before browser languages", () => {
    expect(resolveLocalePreference("en", ["es-ES"], bothLocales)).toBe("en");
    expect(resolveLocalePreference("es", ["en-US"], bothLocales)).toBe("es");
  });

  it("uses the first supported browser language and otherwise falls back to English", () => {
    expect(resolveLocalePreference(null, ["es-MX", "en"], bothLocales)).toBe("es");
    expect(resolveLocalePreference(null, ["en-US", "es-ES"], bothLocales)).toBe("en");
    expect(resolveLocalePreference(null, ["fr-FR", "es-ES"], bothLocales)).toBe("es");
    expect(resolveLocalePreference(null, ["fr-FR"], bothLocales)).toBe("en");
    expect(resolveLocalePreference(null, [], bothLocales)).toBe("en");
  });

  it("clamps to the available locales, defaulting to Spanish", () => {
    expect(resolveLocalePreference("en", ["en-US"], ["es"])).toBe("es");
    expect(resolveLocalePreference(null, ["en-US"], ["es"])).toBe("es");
    expect(resolveLocalePreference("fr", ["es"], bothLocales)).toBe("es");
  });
});

describe("parseLocaleFromPath", () => {
  it("reads the locale segment under the base path", () => {
    expect(parseLocaleFromPath("/es/")).toBe("es");
    expect(parseLocaleFromPath("/en/")).toBe("en");
    expect(parseLocaleFromPath("/")).toBeNull();
    expect(parseLocaleFromPath("/escape/")).toBeNull();
  });
});
