import fs from "node:fs/promises";
import Papa from "papaparse";

const cardsPath = new URL("../chino_flashcards.csv", import.meta.url);
const outputPath = new URL("../chinese-characters.md", import.meta.url);

const csv = await fs.readFile(cardsPath, "utf8");
const parsed = Papa.parse(csv, { header: true, skipEmptyLines: "greedy" });

if (parsed.errors.length > 0) {
  throw new Error(`No se pudo analizar el CSV: ${parsed.errors[0].message}`);
}

const fields = parsed.meta.fields ?? [];
if (!fields.includes("hanzi")) throw new Error("Falta la columna hanzi.");

function uniqueHanCharacters(fieldNames) {
  const characters = [];
  const seen = new Set();

  for (const card of parsed.data) {
    for (const fieldName of fieldNames) {
      for (const character of card[fieldName] ?? "") {
        if (/\p{Script=Han}/u.test(character) && !seen.has(character)) {
          seen.add(character);
          characters.push(character);
        }
      }
    }
  }

  return characters;
}

function formatCharacters(characters) {
  const lineLength = 20;
  const lines = [];
  for (let index = 0; index < characters.length; index += lineLength) {
    lines.push(characters.slice(index, index + lineLength).join(" "));
  }
  return lines.join("\n");
}

const characters = uniqueHanCharacters(["hanzi"]);
const document = `${formatCharacters(characters)}\n`;

await fs.writeFile(outputPath, document, "utf8");
console.log(`Escritos ${characters.length} caracteres en ${outputPath.pathname}`);
