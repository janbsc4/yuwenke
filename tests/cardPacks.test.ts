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
      "CP009",
      "CP010",
    ]);
    expect(packs.map(({ mark, theme }) => `${mark}/${theme}`)).toEqual([
      "启/cinnabar",
      "礼/jade",
      "家/lilac",
      "名/amber",
      "问/cinnabar",
      "时/jade",
      "音/lilac",
      "数/amber",
      "行/cinnabar",
      "食/jade",
    ]);
    expect(Object.keys(packIdByCardId)).toHaveLength(cards.length);
    expect(packIdByCardId.FC001).toBe("CP001");
    expect(packIdByCardId.FC046).toBe("CP003");
    expect(packIdByCardId.FC139).toBe("CP007");
    expect(packIdByCardId.FC140).toBe("CP008");
    expect(packIdByCardId.FC158).toBe("CP008");
    expect(packIdByCardId.FC159).toBe("CP002");
    expect(packIdByCardId.FC161).toBe("CP006");
    expect(packIdByCardId.FC166).toBe("CP007");
    expect(packIdByCardId.FC171).toBe("CP003");
    expect(packIdByCardId.FC172).toBe("CP009");
    expect(packIdByCardId.FC183).toBe("CP009");
    expect(packIdByCardId.FC184).toBe("CP010");
    expect(packIdByCardId.FC205).toBe("CP010");
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
      CP001: 51,
      CP002: 53,
      CP003: 31,
      CP004: 41,
      CP005: 31,
      CP006: 45,
      CP007: 29,
      CP008: 38,
      CP009: 24,
      CP010: 44,
    });
  });

  it("rejects duplicate pack identities", () => {
    expect(() =>
      parseCardPackCatalog(
        JSON.stringify([
          { id: "CP001", title: "Uno", description: "Primero.", mark: "一", theme: "cinnabar" },
          { id: "CP001", title: "Dos", description: "Segundo.", mark: "二", theme: "jade" },
        ]),
      ),
    ).toThrow("ID de pack duplicado: CP001");
  });

  it("rejects missing or unsupported booster artwork metadata", () => {
    expect(() =>
      parseCardPackCatalog(
        JSON.stringify([
          { id: "CP001", title: "Uno", description: "Primero.", theme: "jade" },
        ]),
      ),
    ).toThrow("Catálogo de packs inválido");

    expect(() =>
      parseCardPackCatalog(
        JSON.stringify([
          {
            id: "CP001",
            title: "Uno",
            description: "Primero.",
            mark: "一",
            theme: "neon",
          },
        ]),
      ),
    ).toThrow("Catálogo de packs inválido");
  });

  it("rejects duplicate and unknown membership references", () => {
    expect(() =>
      parseCardPackMembershipCsv(
        "card_id,pack_id\nFC001,CP001\nFC001,CP001\n",
      ),
    ).toThrow("Membresía duplicada para la tarjeta FC001");

    expect(() =>
      validateCardPackData(
        [{ id: "CP001", title: "Uno", description: "Primero.", mark: "一", theme: "cinnabar" }],
        { FC001: "CP999" },
        [loadFlashcards()[0]],
      ),
    ).toThrow("Pack desconocido CP999");
  });

  it("rejects missing memberships, unknown cards, and empty packs", () => {
    const cards = loadFlashcards().slice(0, 2);
    const packs = [
      { id: "CP001", title: "Uno", description: "Primero.", mark: "一", theme: "cinnabar" as const },
      { id: "CP002", title: "Dos", description: "Segundo.", mark: "二", theme: "jade" as const },
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
