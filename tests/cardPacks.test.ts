import {
  loadCardPackData,
  parseCardPackCatalog,
  parseCardPackMembershipCsv,
  validateCardPackData,
} from "../src/data/loadCardPacks";
import { loadFlashcards } from "../src/data/loadFlashcards";
import { createStudyUnits } from "../src/lib/study";

describe("card pack authoring data", () => {
  it("loads an ordered catalog with exactly one membership per source flashcard", () => {
    const cards = loadFlashcards();
    const { packs, packIdByCardId } = loadCardPackData(cards);

    expect(packs.map((pack) => pack.id)).toEqual([
      "CP001",
      "CP002",
      "CP003",
      "CP004",
      "CP005",
      "CP006",
      "CP007",
      "CP008",
    ]);
    expect(Object.keys(packIdByCardId)).toHaveLength(cards.length);
    expect(packIdByCardId.FC001).toBe("CP001");
    expect(packIdByCardId.FC139).toBe("CP007");
    expect(packIdByCardId.FC140).toBe("CP008");
    expect(packIdByCardId.FC158).toBe("CP008");
    expect(
      packs.every((pack) =>
        Object.values(packIdByCardId).includes(pack.id),
      ),
    ).toBe(true);
    const units = createStudyUnits(cards);
    expect(
      Object.fromEntries(
        packs.map((pack) => [
          pack.id,
          units.filter((unit) => packIdByCardId[unit.cardId] === pack.id).length,
        ]),
      ),
    ).toEqual({
      CP001: 43,
      CP002: 49,
      CP003: 25,
      CP004: 35,
      CP005: 29,
      CP006: 49,
      CP007: 17,
      CP008: 38,
    });
  });

  it("rejects duplicate pack identities", () => {
    expect(() =>
      parseCardPackCatalog(
        JSON.stringify([
          { id: "CP001", title: "Uno", description: "Primero." },
          { id: "CP001", title: "Dos", description: "Segundo." },
        ]),
      ),
    ).toThrow("ID de pack duplicado: CP001");
  });

  it("rejects duplicate and unknown membership references", () => {
    expect(() =>
      parseCardPackMembershipCsv(
        "card_id,pack_id\nFC001,CP001\nFC001,CP001\n",
      ),
    ).toThrow("Membresía duplicada para la tarjeta FC001");

    expect(() =>
      validateCardPackData(
        [{ id: "CP001", title: "Uno", description: "Primero." }],
        { FC001: "CP999" },
        [loadFlashcards()[0]],
      ),
    ).toThrow("Pack desconocido CP999");
  });

  it("rejects missing memberships, unknown cards, and empty packs", () => {
    const cards = loadFlashcards().slice(0, 2);
    const packs = [
      { id: "CP001", title: "Uno", description: "Primero." },
      { id: "CP002", title: "Dos", description: "Segundo." },
    ];

    expect(() => validateCardPackData(packs, { FC001: "CP001" }, cards)).toThrow(
      "Falta la membresía de FC002",
    );
    expect(() =>
      validateCardPackData(packs, { FC001: "CP001", FC002: "CP001", FC999: "CP001" }, cards),
    ).toThrow("Tarjeta desconocida FC999");
    expect(() =>
      validateCardPackData(packs, { FC001: "CP001", FC002: "CP001" }, cards),
    ).toThrow("El pack CP002 no contiene tarjetas");
  });
});
