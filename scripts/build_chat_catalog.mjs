import { mkdir, writeFile } from "node:fs/promises";
import { loadFlashcards } from "../src/data/loadFlashcards.ts";
import { loadCardPackData } from "../src/data/loadCardPacks.ts";

const cards = loadFlashcards();
loadCardPackData(cards);
const fields = [
  "id",
  "tipo",
  "tema",
  "hanzi",
  "pinyin",
  "espanol",
  "ingles",
  "explicacion",
  "explicacion_ingles",
  "ejemplo_hanzi",
];
const catalog = cards.map((card) =>
  Object.fromEntries(fields.map((field) => [field, card[field]])),
);
const directory = new URL("../worker/generated/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("catalog.json", directory), JSON.stringify(catalog));
console.log(`Built conversation catalog with ${catalog.length} source cards.`);
