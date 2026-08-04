import { loadFlashcards, parseFlashcardsCsv } from "../src/data/loadFlashcards";

const header =
  "id,tipo,tema,hanzi,pinyin,espanol,explicacion,ejemplo_hanzi,ejemplo_pinyin,ejemplo_espanol,pagina,etiquetas,nombres_propios";

describe("flashcard CSV", () => {
  it("loads and validates all class-note cards", () => {
    const cards = loadFlashcards();
    expect(cards).toHaveLength(205);
    expect(new Set(cards.map((card) => card.id)).size).toBe(205);
    expect(cards.map((card) => card.id)).toEqual(
      Array.from({ length: 205 }, (_, index) => `FC${String(index + 1).padStart(3, "0")}`),
    );
    expect(cards.every((card) => card.hanzi && card.pinyin && card.espanol)).toBe(true);
    expect(cards.find((card) => card.id === "FC089")?.pinyin).toBe("shuí / shéi");
    expect(cards.find((card) => card.id === "FC086")?.nombres_propios).toContain("张欣");
    expect(cards.slice(-5).map((card) => card.hanzi)).toEqual([
      "饺子",
      "薯条",
      "拉面",
      "帅哥",
      "美女",
    ]);
  });

  it("adds connectors, places, actions, and countries without duplicating 家", () => {
    const cards = loadFlashcards();

    expect(cards.filter((card) => card.hanzi === "家")).toHaveLength(1);
    expect(cards.find((card) => card.hanzi === "家")).toMatchObject({
      id: "FC046",
      ejemplo_hanzi: "我家",
      ejemplo_espanol: "mi casa / mi familia",
    });
    expect(cards.slice(158, 171).map((card) => card.hanzi)).toEqual([
      "和",
      "然后",
      "咖啡厅",
      "海滩",
      "餐厅",
      "饭店",
      "饭馆",
      "来",
      "做",
      "睡觉",
      "工作",
      "西班牙",
      "法国",
    ]);
    expect(cards.find((card) => card.hanzi === "和")?.explicacion).toContain(
      "no enlaza acciones completas",
    );
    expect(cards.find((card) => card.hanzi === "然后")?.explicacion).toContain(
      "presenta una acción posterior",
    );
    expect(cards.find((card) => card.id === "FC170")?.nombres_propios).toContain("España");
    expect(cards.find((card) => card.id === "FC171")?.nombres_propios).toContain("Francia");
  });

  it("adds the photographed movement, question, food, and drink material", () => {
    const cards = loadFlashcards();

    expect(cards.slice(171, 183).map((card) => card.hanzi)).toEqual([
      "去",
      "回",
      "奶茶店",
      "商店",
      "巴塞罗那",
      "哪里／哪儿",
      "我晚上回家。",
      "你好，他们什么时候来咖啡厅？",
      "她中午去餐厅，下午回家。",
      "我们下午去中国。",
      "他中午来餐厅。",
      "他和爸爸中午去咖啡厅。",
    ]);
    expect(cards.slice(183).map((card) => card.hanzi)).toEqual([
      "吃",
      "吃饭",
      "水",
      "橙汁",
      "啤酒",
      "瓶",
      "想要",
      "我想要一瓶啤酒。",
      "你吃什么？",
      "你什么时候吃饭？",
      "米饭",
      "面条",
      "面包",
      "披萨",
      "汉堡／汉堡包",
      "中国菜",
      "包子",
      "饺子",
      "薯条",
      "拉面",
      "帅哥",
      "美女",
    ]);
    expect(cards.find((card) => card.hanzi === "哪里／哪儿")?.pinyin).toBe("nǎlǐ / nǎr");
    expect(cards.find((card) => card.hanzi === "汉堡／汉堡包")?.pinyin).toBe(
      "hànbǎo / hànbǎobāo",
    );
    expect(cards.find((card) => card.hanzi === "米饭")?.espanol).toBe("arroz cocido");
    expect(cards.find((card) => card.hanzi === "拉面")?.explicacion).toContain(
      "fideos hechos estirando la masa",
    );
    expect(cards.find((card) => card.id === "FC176")?.nombres_propios).toContain("Barcelona");
  });

  it("contains an individual card for every number from zero to ten", () => {
    const numberCards = loadFlashcards().filter((card) => card.tema === "numeros");

    expect(numberCards.slice(0, 11).map((card) => card.hanzi)).toEqual([
      "零",
      "一",
      "二",
      "三",
      "四",
      "五",
      "六",
      "七",
      "八",
      "九",
      "十",
    ]);
    expect(numberCards.slice(11).map((card) => card.hanzi)).toEqual([
      "十一",
      "十五",
      "二十",
      "二十一",
      "三十五",
      "四十八",
      "六十七",
      "九十九",
    ]);
    expect(numberCards.find((card) => card.hanzi === "二")?.explicacion).toContain(
      "两 (liǎng)",
    );
  });

  it("expresses every concept as a direct Spanish question and answer", () => {
    const concepts = loadFlashcards().filter((card) => card.tipo === "concepto");

    expect(concepts).toHaveLength(24);
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
      espanol: "¿Para qué sirve el orden de los trazos (笔顺)?",
      ejemplo_hanzi: "十",
      ejemplo_espanol: "En 十, el trazo horizontal va antes que el vertical.",
    });
  });

  it("replaces character-structure drills with practical vocabulary", () => {
    const cards = loadFlashcards();

    expect(cards.slice(11, 18).map(({ id, tipo, hanzi, espanol }) => ({
      id,
      tipo,
      hanzi,
      espanol,
    }))).toEqual([
      { id: "FC012", tipo: "palabra", hanzi: "学生", espanol: "estudiante" },
      { id: "FC013", tipo: "palabra", hanzi: "最近", espanol: "últimamente / recientemente" },
      { id: "FC014", tipo: "frase", hanzi: "还行", espanol: "bastante bien / no está mal" },
      { id: "FC015", tipo: "palabra", hanzi: "这", espanol: "este / esta / esto" },
      { id: "FC016", tipo: "palabra", hanzi: "牛奶", espanol: "leche" },
      { id: "FC017", tipo: "palabra", hanzi: "喝", espanol: "beber" },
      { id: "FC018", tipo: "palabra", hanzi: "儿子", espanol: "hijo" },
    ]);
  });

  it("keeps study copy concise and avoids specialist memory jargon", () => {
    const cards = loadFlashcards();
    const content = cards.flatMap((card) => Object.values(card)).join("\n");

    expect(cards.filter((card) => card.explicacion.length > 110)).toEqual([]);
    expect(
      cards
        .filter((card) => card.tipo === "concepto")
        .filter((card) => card.espanol.length > 70),
    ).toEqual([]);
    expect(content).not.toMatch(/mnemotecnia/i);
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
