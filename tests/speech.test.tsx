import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messages } from "../src/lib/messages";
import type { Flashcard, StudyUnit } from "../src/types";

class FakeUtterance {
  lang = "";
  voice: SpeechSynthesisVoice | null = null;

  constructor(public text: string) {}
}

function fakeVoice(lang: string): SpeechSynthesisVoice {
  return {
    default: false,
    lang,
    localService: true,
    name: lang,
    voiceURI: lang,
  };
}

type SpeechStub = {
  getVoices: ReturnType<typeof vi.fn<() => SpeechSynthesisVoice[]>>;
  cancel: ReturnType<typeof vi.fn>;
  speak: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
};

function stubSpeechApi(voices: SpeechSynthesisVoice[]): SpeechStub {
  const stub: SpeechStub = {
    getVoices: vi.fn(() => voices),
    cancel: vi.fn(),
    speak: vi.fn(),
    addEventListener: vi.fn(),
  };
  Object.defineProperty(globalThis, "speechSynthesis", {
    configurable: true,
    value: stub,
  });
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
    configurable: true,
    value: FakeUtterance,
  });
  return stub;
}

function removeSpeechApi() {
  delete (globalThis as { speechSynthesis?: unknown }).speechSynthesis;
  delete (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
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

describe("speakChinese", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(removeSpeechApi);

  it("speaks with the zh-CN voice when the device has one", async () => {
    const speech = stubSpeechApi([fakeVoice("zh-TW"), fakeVoice("zh-CN")]);
    const { speakChinese } = await import("../src/lib/speech");

    speakChinese("你好");

    expect(speech.cancel).toHaveBeenCalledTimes(1);
    const utterance = speech.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.text).toBe("你好");
    expect(utterance.lang).toBe("zh-CN");
    expect(utterance.voice?.lang).toBe("zh-CN");
  });

  it("falls back to any Chinese voice when no zh-CN voice exists", async () => {
    const speech = stubSpeechApi([fakeVoice("zh-HK")]);
    const { speakChinese } = await import("../src/lib/speech");

    speakChinese("你好");

    const utterance = speech.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.voice?.lang).toBe("zh-HK");
  });

  it("still speaks with the lang hint when the device has no Chinese voice", async () => {
    const speech = stubSpeechApi([fakeVoice("en-US")]);
    const { speakChinese } = await import("../src/lib/speech");

    speakChinese("你好");

    const utterance = speech.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.lang).toBe("zh-CN");
    expect(utterance.voice).toBeNull();
  });

  it("does nothing when speech synthesis is unavailable", async () => {
    removeSpeechApi();
    const { speakChinese } = await import("../src/lib/speech");

    expect(() => speakChinese("你好")).not.toThrow();
  });
});

describe("StudyCard pronunciation", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(removeSpeechApi);

  async function renderStudyCard(direction: StudyUnit["direction"], revealed: boolean) {
    const { StudyCard } = await import("../src/components/StudyCard");
    const tipo = direction === "concept" ? "concepto" : "palabra";
    const unit: StudyUnit = {
      key: `FC001:${direction}`,
      cardId: card.id,
      direction,
      card: { ...card, tipo },
    };
    render(
      <StudyCard
        unit={unit}
        packTitle="Primeros pasos"
        revealed={revealed}
        favorite={false}
        onToggleFavorite={() => {}}
        promptRef={{ current: null }}
        m={messages.es}
        locale="es"
      />,
    );
  }

  it("shows no button on the question side", async () => {
    stubSpeechApi([fakeVoice("zh-CN")]);
    await renderStudyCard("hanzi-meaning", false);

    expect(screen.queryByRole("button", { name: "Escuchar pronunciación" })).not.toBeInTheDocument();
  });

  it("auto-plays the hanzi when the answer side is revealed", async () => {
    const speech = stubSpeechApi([fakeVoice("zh-CN")]);
    await renderStudyCard("meaning-hanzi", true);

    expect(speech.speak.mock.calls[0][0].text).toBe("你好");
  });

  it("also auto-plays the hanzi when the meaning answer is revealed", async () => {
    const speech = stubSpeechApi([fakeVoice("zh-CN")]);
    await renderStudyCard("hanzi-meaning", true);

    expect(speech.speak.mock.calls[0][0].text).toBe("你好");
  });

  it("speaks again when the answer-side button is pressed", async () => {
    const speech = stubSpeechApi([fakeVoice("zh-CN")]);
    await renderStudyCard("meaning-hanzi", true);

    await userEvent.click(screen.getByRole("button", { name: "Escuchar pronunciación" }));

    expect(speech.speak).toHaveBeenCalledTimes(2);
    expect(speech.speak.mock.calls[1][0].text).toBe("你好");
  });

  it("offers the button on the meaning answer too", async () => {
    const speech = stubSpeechApi([fakeVoice("zh-CN")]);
    await renderStudyCard("hanzi-meaning", true);

    await userEvent.click(screen.getByRole("button", { name: "Escuchar pronunciación" }));

    expect(speech.speak.mock.calls[speech.speak.mock.calls.length - 1][0].text).toBe("你好");
  });

  it("hides the button and never speaks on concept cards", async () => {
    const speech = stubSpeechApi([fakeVoice("zh-CN")]);
    await renderStudyCard("concept", true);

    expect(screen.queryByRole("button", { name: "Escuchar pronunciación" })).not.toBeInTheDocument();
    expect(speech.speak).not.toHaveBeenCalled();
  });
});
