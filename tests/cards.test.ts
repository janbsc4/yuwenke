import { loadFlashcards, parseFlashcardsCsv } from "../src/data/loadFlashcards";

const header =
  "id,tipo,tema,hanzi,pinyin,espanol,explicacion,ejemplo_hanzi,ejemplo_pinyin,ejemplo_espanol,pagina,etiquetas,nombres_propios";

describe("flashcard CSV", () => {
  it("loads and validates all class-note cards", () => {
    const cards = loadFlashcards();
    expect(cards).toHaveLength(139);
    expect(new Set(cards.map((card) => card.id)).size).toBe(139);
    expect(cards.map((card) => card.id)).toEqual(
      Array.from({ length: 139 }, (_, index) => `FC${String(index + 1).padStart(3, "0")}`),
    );
    expect(cards.every((card) => card.hanzi && card.pinyin && card.espanol)).toBe(true);
    expect(cards.find((card) => card.id === "FC089")?.pinyin).toBe("shuí / shéi");
    expect(cards.find((card) => card.id === "FC086")?.nombres_propios).toContain("张欣");
    expect(cards.slice(-5).map((card) => card.hanzi)).toEqual([
      "加油！",
      "什么时候",
      "跑步",
      "洗澡",
      "喝牛奶",
    ]);
  });

  it("expresses every concept as a direct Spanish question and answer", () => {
    const concepts = loadFlashcards().filter((card) => card.tipo === "concepto");

    expect(concepts).toHaveLength(31);
    expect(
      concepts.every(
        (card) => card.espanol.startsWith("¿") && card.espanol.endsWith("?"),
      ),
    ).toBe(true);
    expect(concepts.every((card) => card.explicacion.trim().length > 0)).toBe(true);
    expect(concepts.find((card) => card.id === "FC133")).toMatchObject({
      espanol: "¿Cuántas marcas tonales puede haber por sílaba?",
      explicacion:
        "Solo puede haber una, aunque la sílaba tenga varias vocales.",
    });
    expect(concepts.find((card) => card.id === "FC011")).toMatchObject({
      espanol:
        "¿Qué indica el orden de los trazos (笔顺) al escribir un carácter chino?",
      ejemplo_hanzi: "十",
      ejemplo_espanol:
        "En 十, se escribe primero el trazo horizontal y después el vertical.",
    });
  });

  it("distinguishes formal characters from everyday family words", () => {
    const cards = loadFlashcards();

    expect(cards.find((card) => card.id === "FC023")).toMatchObject({
      hanzi: "父",
      espanol: "padre (carácter formal y componente)",
      ejemplo_hanzi: "父亲／爸爸",
    });
    expect(cards.find((card) => card.id === "FC056")).toMatchObject({
      hanzi: "爸爸",
      espanol: "papá / padre (forma habitual)",
    });
  });

  it("does not expect different Hanzi for the same Spanish prompt", () => {
    const cards = loadFlashcards().filter((card) => card.tipo !== "concepto");
    const firstAnswerByPrompt = new Map<string, { id: string; hanzi: string }>();
    const conflicts: string[] = [];

    for (const card of cards) {
      const prompt = card.espanol
        .normalize("NFC")
        .toLocaleLowerCase("es")
        .replace(/\s+/g, " ")
        .trim();
      const previous = firstAnswerByPrompt.get(prompt);
      if (previous && previous.hanzi !== card.hanzi) {
        conflicts.push(
          `${previous.id}:${previous.hanzi} y ${card.id}:${card.hanzi} comparten «${card.espanol}»`,
        );
      } else if (!previous) {
        firstAnswerByPrompt.set(prompt, { id: card.id, hanzi: card.hanzi });
      }
    }

    expect(conflicts).toEqual([]);
  });

  it("does not reveal the Hanzi answer inside Spanish reverse prompts", () => {
    const reversePrompts = loadFlashcards()
      .filter((card) => card.tipo !== "concepto")
      .map((card) => ({ id: card.id, prompt: card.espanol }))
      .filter(({ prompt }) => /[\u3400-\u9fff]/u.test(prompt));

    expect(reversePrompts).toEqual([]);
  });

  it("does not include expressions that have not been introduced", () => {
    const content = loadFlashcards()
      .flatMap((card) => Object.values(card))
      .join("\n");

    expect(content).not.toMatch(
      /请问|qǐngwèn|qingwen|hěn gāoxìng rènshi dàjiā|很高兴认识大家/i,
    );
    expect(loadFlashcards().find((card) => card.id === "FC079")).toMatchObject({
      hanzi: "大家好！我叫Dani。",
      pinyin: "Dàjiā hǎo! Wǒ jiào Dani.",
      espanol: "¡Hola a todos! Me llamo Dani.",
    });
  });

  it("rejects duplicate IDs", () => {
    const row =
      "FC001,palabra,saludos,你好,nǐ hǎo,hola,Un saludo.,你好！,Nǐ hǎo!,Hola.,1,saludo,";
    expect(() => parseFlashcardsCsv(`${header}\n${row}\n${row}\n`)).toThrow(
      "ID de tarjeta duplicado",
    );
  });

  it("rejects a malformed schema", () => {
    const row = "FC001,otro,saludos,你好,nǐ hǎo,hola,x,x,x,x,1,x,";
    expect(() => parseFlashcardsCsv(`${header}\n${row}\n`)).toThrow("Tarjeta inválida");
  });
});
