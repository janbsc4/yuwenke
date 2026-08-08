import fs from "node:fs/promises";
import Papa from "papaparse";

const cardsPath = new URL("../chino_flashcards.csv", import.meta.url);
const outputPath = new URL("../chinese-knowledge.md", import.meta.url);
const knowledgeFields = ["hanzi", "ejemplo_hanzi"];

const csv = await fs.readFile(cardsPath, "utf8");
const parsed = Papa.parse(csv, { header: true, skipEmptyLines: "greedy" });

if (parsed.errors.length > 0) {
  throw new Error(`No se pudo analizar el CSV: ${parsed.errors[0].message}`);
}

const fields = parsed.meta.fields ?? [];
for (const field of knowledgeFields) {
  if (!fields.includes(field)) throw new Error(`Falta la columna ${field}.`);
}

const knowledge = [];
const seen = new Set();

for (const card of parsed.data) {
  for (const field of knowledgeFields) {
    const entry = (card[field] ?? "").trim();
    const isChineseOnly = /\p{Script=Han}/u.test(entry)
      && !/\p{Script=Latin}/u.test(entry);
    if (isChineseOnly && !seen.has(entry)) {
      seen.add(entry);
      knowledge.push(entry);
    }
  }
}

await fs.writeFile(outputPath, `${knowledge.join(", ")}\n`, "utf8");
console.log(`Escritas ${knowledge.length} entradas en ${outputPath.pathname}`);
