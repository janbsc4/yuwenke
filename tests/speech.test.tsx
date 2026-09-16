import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FlashcardApp from "../src/components/FlashcardApp";
import { messages } from "../src/lib/messages";
import type { Flashcard, StudyUnit } from "../src/types";

class FakeUtterance {
  lang = "";
  voice: SpeechSynthesisVoice | null = null;

  constructor(public text: string) {}
}

function fakeVoice(lang: string, uri: string = lang): SpeechSynthesisVoice {
  return {
    default: false,
    lang,
    localService: true,
    name: lang,
    voiceURI: uri,
  };
}

function namedVoice(name: string, lang: string, uri: string): SpeechSynthesisVoice {
  return {
    default: false,
    lang,
    localService: true,
    name,
    voiceURI: uri,
  };
}

type SpeechStub = {
  getVoices: ReturnType<typeof vi.fn<() => SpeechSynthesisVoice[]>>;
  cancel: ReturnType<typeof vi.fn>;
  speak: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  emitVoicesChanged: () => void;
};

function stubSpeechApi(voices: SpeechSynthesisVoice[]): SpeechStub {
  const handlers: ((event?: unknown) => void)[] = [];
  const stub: SpeechStub = {
    getVoices: vi.fn(() => voices),
    cancel: vi.fn(),
    speak: vi.fn(),
    addEventListener: vi.fn((type: string, handler: (event?: unknown) => void) => {
      if (type === "voiceschanged") handlers.push(handler);
    }),
    emitVoicesChanged: () => {
      for (const handler of handlers) handler();
    },
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

  it("stays silent while muted and speaks again when unmuted", async () => {
    const stub = stubSpeechApi([fakeVoice("zh-CN")]);
    const speech = await import("../src/lib/speech");

    speech.setSpeechMuted(true);
    expect(speech.isSpeechMuted()).toBe(true);
    speech.speakChinese("你好");
    expect(stub.speak).not.toHaveBeenCalled();

    speech.setSpeechMuted(false);
    speech.speakChinese("你好");
    expect(stub.speak).toHaveBeenCalledTimes(1);
  });

  it("uses the saved preferred voice when it still exists", async () => {
    const stub = stubSpeechApi([fakeVoice("zh-CN"), fakeVoice("zh-TW")]);
    const speech = await import("../src/lib/speech");

    speech.setPreferredVoice("zh-TW");
    speech.speakChinese("你好");

    const utterance = stub.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.voice?.lang).toBe("zh-TW");
  });

  it("falls back to auto-selection when the saved voice is gone", async () => {
    const stub = stubSpeechApi([fakeVoice("zh-CN"), fakeVoice("zh-TW")]);
    const speech = await import("../src/lib/speech");

    speech.setPreferredVoice("zh-HK");
    speech.speakChinese("你好");

    const utterance = stub.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.voice?.lang).toBe("zh-CN");
  });

  it("persists and clears the voice preference", async () => {
    stubSpeechApi([]);
    const speech = await import("../src/lib/speech");

    speech.setPreferredVoice("zh-TW");
    expect(speech.preferredVoiceUri()).toBe("zh-TW");
    speech.setPreferredVoice(null);
    expect(speech.preferredVoiceUri()).toBe("");
  });

  it("lists only Chinese voices with their identifiers", async () => {
    stubSpeechApi([fakeVoice("en-US"), fakeVoice("zh-CN"), fakeVoice("zh-TW")]);
    const speech = await import("../src/lib/speech");

    expect(speech.chineseVoiceOptions()).toEqual([
      { uri: "zh-CN", name: "zh-CN", lang: "zh-CN" },
      { uri: "zh-TW", name: "zh-TW", lang: "zh-TW" },
    ]);
  });

  it("deduplicates same-name voices, keeping the enhanced variant", async () => {
    stubSpeechApi([
      namedVoice("Meijia", "zh-TW", "com.apple.ttsbundle.Meijia-compact"),
      namedVoice("Meijia", "zh-TW", "com.apple.voice.enhanced.zh-TW.Meijia"),
    ]);
    const speech = await import("../src/lib/speech");

    expect(speech.chineseVoiceOptions()).toEqual([
      {
        uri: "com.apple.voice.enhanced.zh-TW.Meijia",
        name: "Meijia",
        lang: "zh-TW",
      },
    ]);
  });

  it("auto-picks the enhanced variant among same-name voices", async () => {
    const stub = stubSpeechApi([
      namedVoice("Tingting", "zh-CN", "com.apple.ttsbundle.Tingting-compact"),
      namedVoice("Tingting", "zh-CN", "com.apple.voice.enhanced.zh-CN.Tingting"),
    ]);
    const speech = await import("../src/lib/speech");

    speech.speakChinese("你好");

    const utterance = stub.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.voice?.voiceURI).toBe("com.apple.voice.enhanced.zh-CN.Tingting");
  });

  it("notifies subscribers when the voice list changes", async () => {
    const stub = stubSpeechApi([]);
    const speech = await import("../src/lib/speech");

    const seen: number[] = [];
    const unsubscribe = speech.subscribeToVoices(() => seen.push(speech.chineseVoiceOptions().length));
    expect(seen).toEqual([]);

    stub.getVoices.mockReturnValue([fakeVoice("zh-CN")]);
    stub.emitVoicesChanged();

    expect(seen).toEqual([1]);
    unsubscribe();
  });

  it("stops notifying after unsubscribe", async () => {
    const stub = stubSpeechApi([]);
    const speech = await import("../src/lib/speech");

    const seen: number[] = [];
    const unsubscribe = speech.subscribeToVoices(() => seen.push(speech.chineseVoiceOptions().length));
    unsubscribe();

    stub.emitVoicesChanged();
    expect(seen).toEqual([]);
  });
});

describe("StudyCard pronunciation", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(removeSpeechApi);

  async function renderStudyCard(direction: StudyUnit["direction"], revealed: boolean, muted = false) {
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
        muted={muted}
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

  it("hides the button and stays silent when muted", async () => {
    const speech = stubSpeechApi([fakeVoice("zh-CN")]);
    await renderStudyCard("meaning-hanzi", true, true);

    expect(screen.queryByRole("button", { name: "Escuchar pronunciación" })).not.toBeInTheDocument();
    expect(speech.speak).not.toHaveBeenCalled();
  });
});

describe("voice settings dialog", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(removeSpeechApi);

  async function renderApp() {
    await import("../src/components/FlashcardApp");
    const dialogCard: Flashcard = { ...card, ingles: "", explicacion_ingles: "", ejemplo_ingles: "", etiquetas_ingles: "" };
    render(
      <FlashcardApp
        cards={[dialogCard]}
        packs={[{
          id: "CP001",
          title: { es: "Cartas", en: "Cards" },
          description: { es: "Para practicar.", en: "For practice." },
          mark: "文",
          theme: "cinnabar",
        }]}
        packIdByCardId={{ [dialogCard.id]: "CP001" }}
      />,
    );
  }

  function voiceSelect() {
    return within(screen.getByRole("dialog")).getByRole("combobox");
  }

  it("lists the default option and every Chinese voice, saving the choice", async () => {
    const stub = stubSpeechApi([fakeVoice("zh-CN"), fakeVoice("zh-TW")]);
    await renderApp();

    await userEvent.click(screen.getByRole("button", { name: "Elegir voz de pronunciación" }));

    const select = voiceSelect();
    const optionLabels = [...within(select).getAllByRole("option")].map((option) => option.textContent);
    expect(optionLabels).toEqual([
      "Voz del sistema",
      "zh-CN (zh-CN)",
      "zh-TW (zh-TW)",
    ]);

    await userEvent.selectOptions(select, "zh-TW");

    expect(window.localStorage.getItem("yuwenke:tts-voice:v1")).toBe("zh-TW");
    expect(stub.speak).toHaveBeenCalled();
  });

  it("starts with the saved voice selected", async () => {
    stubSpeechApi([fakeVoice("zh-CN"), fakeVoice("zh-TW")]);
    window.localStorage.setItem("yuwenke:tts-voice:v1", "zh-TW");
    await renderApp();

    await userEvent.click(screen.getByRole("button", { name: "Elegir voz de pronunciación" }));

    expect(voiceSelect()).toHaveValue("zh-TW");
  });

  it("persists the mute checkbox and starts muted on the next load", async () => {
    stubSpeechApi([fakeVoice("zh-CN")]);
    await renderApp();

    await userEvent.click(screen.getByRole("button", { name: "Elegir voz de pronunciación" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Silenciar pronunciación" }));

    expect(window.localStorage.getItem("yuwenke:tts-muted:v1")).toBe("1");
  });

  it("starts with the checkbox checked when muting was saved", async () => {
    stubSpeechApi([fakeVoice("zh-CN")]);
    window.localStorage.setItem("yuwenke:tts-muted:v1", "1");
    await renderApp();

    await userEvent.click(screen.getByRole("button", { name: "Elegir voz de pronunciación" }));

    expect(screen.getByRole("checkbox", { name: "Silenciar pronunciación" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Elegir voz de pronunciación" })).toHaveTextContent("🔇");
  });

  it("shows getting-started instructions per platform", async () => {
    stubSpeechApi([]);
    await renderApp();

    await userEvent.click(screen.getByRole("button", { name: "Elegir voz de pronunciación" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Este dispositivo todavía no tiene voces chinas instaladas.")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "¿Cómo consigo más voces?" }));

    for (const platform of ["macOS", "iPhone / iPad", "Windows", "Android"]) {
      expect(within(dialog).getByText(platform)).toBeInTheDocument();
    }
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    stubSpeechApi([fakeVoice("zh-CN")]);
    await renderApp();

    const trigger = screen.getByRole("button", { name: "Elegir voz de pronunciación" });
    await userEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
