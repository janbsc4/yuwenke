import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadFlashcards } from "../src/data/loadFlashcards";

describe("Chinese knowledge inventory", () => {
  it("contains every unique Chinese card prompt and example in card order", () => {
    const cards = loadFlashcards();
    const expected = Array.from(
      new Set(
        cards.flatMap((card) => [card.hanzi, card.ejemplo_hanzi])
          .map((entry) => entry.trim())
          .filter((entry) => (
            /\p{Script=Han}/u.test(entry)
            && !/\p{Script=Latin}/u.test(entry)
          )),
      ),
    );
    const knowledge = readFileSync(
      resolve(process.cwd(), "chinese-knowledge.md"),
      "utf8",
    ).trim().split(", ");

    expect(knowledge).toEqual(expected);
    expect(knowledge).toHaveLength(308);
    expect(knowledge.every((entry) => !/\p{Script=Latin}/u.test(entry))).toBe(true);
  });
});
