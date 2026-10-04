// @vitest-environment node
import { readFileSync } from "node:fs";
import { buildFlashcardsCsv } from "../scripts/build_flashcards.mjs";
import { loadFlashcards } from "../src/data/loadFlashcards";

const currentCsv = readFileSync("chino_flashcards.csv", "utf8");
const rows = loadFlashcards().map((card) => [
  card.id, card.tipo, card.tema, card.hanzi, card.pinyin, card.espanol,
  card.explicacion, card.ejemplo_hanzi, card.ejemplo_pinyin,
  card.ejemplo_espanol, card.pagina, card.etiquetas,
]);

it("reproduces the committed dataset from explicitly identified authored rows", () => {
  expect(buildFlashcardsCsv(undefined, currentCsv)).toBe(currentCsv);
});

it("rejects reordered source cards instead of assigning their content to another saved ID", () => {
  const reordered = [...rows];
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  expect(() => buildFlashcardsCsv(reordered, currentCsv)).toThrow(/esperado FC001; actual FC002/);
});

it("rejects removal of a deployed card", () => {
  expect(() => buildFlashcardsCsv(rows.slice(0, -1), currentCsv)).toThrow(/eliminar tarjetas/);
});

it("rejects duplicate or renumbered source IDs", () => {
  const renumbered = rows.map((row) => [...row]);
  renumbered[1][0] = "FC001";
  expect(() => buildFlashcardsCsv(renumbered, currentCsv)).toThrow(/esperado FC002; actual FC001/);
});

it("allows appending cards and editing existing content without changing identities", () => {
  const previousCsv = currentCsv.trimEnd().split("\n").slice(0, -1).join("\n") + "\n";
  expect(buildFlashcardsCsv(rows, previousCsv)).toBe(currentCsv);
  const edited = rows.map((row) => [...row]);
  edited[0][6] = "Explicación revisada.";
  expect(buildFlashcardsCsv(edited, currentCsv)).toContain("FC001,palabra,pronombres,我,wǒ,yo,Explicación revisada.");
});
