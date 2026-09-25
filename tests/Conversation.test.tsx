import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Conversation from "../src/components/Conversation";
import { sendConversation } from "../src/lib/chatClient";
import { readConversation, saveConversation } from "../src/lib/conversation";
import { loadFlashcards } from "../src/data/loadFlashcards";
import type { ChatResponse } from "../shared/chat";
import { speakChinese, speechSupported } from "../src/lib/speech";

vi.mock("../src/lib/chatClient", () => ({
  sendConversation: vi.fn(),
  guestMessagesRemaining: () => 3,
}));
vi.mock("../src/lib/speech", () => ({
  speakChinese: vi.fn(),
  speechSupported: vi.fn(() => true),
  chatAutoplayEnabled: () => window.localStorage.getItem("yuwenke:chat-autoplay:v1") === "1",
  setChatAutoplayEnabled: (enabled: boolean) => {
    if (enabled) window.localStorage.setItem("yuwenke:chat-autoplay:v1", "1");
    else window.localStorage.removeItem("yuwenke:chat-autoplay:v1");
  },
}));
const cards = loadFlashcards();
const response: ChatResponse = {
  model: "mimo-v2.6-flash",
  reply: {
    chinese: "你好吗？",
    pinyin: "Nǐ hǎo ma?",
    meaning: "How are you?",
    feedback: "",
    hint: "我很好。Wǒ hěn hǎo. I’m well.",
    practicedCardIds: [],
  },
  targetCardIds: [cards[0].id],
  remaining: 29,
};
const props = {
  cards,
  progress: {},
  locale: "en" as const,
  owner: "alice",
  configured: true,
  onSignIn: vi.fn(),
  onReviewCard: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(speechSupported).mockReturnValue(true);
  vi.mocked(sendConversation).mockResolvedValue(response);
});

it("autoplays only new Léi replies when enabled and remembers the choice", async () => {
  saveConversation("alice", "en", {
    version: 1, sessionId: crypto.randomUUID(), topic: "",
    turns: [{ user: "你好", reply: response.reply }], targetCardIds: [],
  });
  const view = render(<Conversation {...props} />);
  const autoplay = screen.getByRole("button", { name: "Autoplay replies" });
  expect(autoplay).toHaveAttribute("aria-pressed", "false");
  expect(speakChinese).not.toHaveBeenCalled();
  await userEvent.click(autoplay);
  expect(autoplay).toHaveAttribute("aria-pressed", "true");
  expect(speakChinese).not.toHaveBeenCalled();
  await userEvent.type(screen.getByRole("textbox", { name: "Your reply" }), "我很好");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(speakChinese).toHaveBeenCalledExactlyOnceWith("你好吗？"));
  view.unmount();
  render(<Conversation {...props} />);
  expect(screen.getByRole("button", { name: "Autoplay replies" })).toHaveAttribute("aria-pressed", "true");
  expect(speakChinese).toHaveBeenCalledTimes(1);
});

it("keeps autoplay silent when muted or speech is unavailable", async () => {
  window.localStorage.setItem("yuwenke:chat-autoplay:v1", "1");
  saveConversation("alice", "en", {
    version: 1, sessionId: crypto.randomUUID(), topic: "",
    turns: [{ user: "你好", reply: response.reply }], targetCardIds: [],
  });
  const view = render(<Conversation {...props} muted />);
  expect(screen.getByRole("button", { name: "Autoplay replies" })).toBeDisabled();
  await userEvent.type(screen.getByRole("textbox"), "我很好");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(sendConversation).toHaveBeenCalledOnce());
  expect(speakChinese).not.toHaveBeenCalled();
  view.unmount();
  vi.mocked(speechSupported).mockReturnValue(false);
  render(<Conversation {...props} />);
  expect(screen.getByRole("button", { name: "Autoplay replies" })).toBeDisabled();
  expect(speakChinese).not.toHaveBeenCalled();
});

it.each(["en", "es"] as const)("explains pinyin keyboard setup in %s", async (locale) => {
  render(<Conversation {...props} locale={locale} />);
  const help = screen.getByRole("button", { name: locale === "en" ? "Set up a Chinese keyboard" : "Configurar un teclado chino" });
  expect(help).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(help);
  expect(help).toHaveAttribute("aria-expanded", "true");
  for (const platform of ["Windows", "Mac", "iPhone / iPad", "Android (Gboard)"]) {
    expect(screen.getByRole("heading", { name: platform })).toBeVisible();
  }
  expect(screen.getAllByRole("link", { name: locale === "en" ? "Official guide" : "Guía oficial" })).toHaveLength(4);
});

it("gives a guest three messages before asking for sign-in", async () => {
  vi.mocked(sendConversation)
    .mockResolvedValueOnce({ ...response, remaining: 2 })
    .mockResolvedValueOnce({ ...response, remaining: 1 })
    .mockResolvedValueOnce({ ...response, remaining: 0 });
  render(<Conversation {...props} owner={null} />);
  expect(screen.getByText("3 free messages left")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Start a conversation" }));
  expect(await screen.findByText("2 free messages left")).toBeVisible();
  for (const [message, remaining] of [["你好", 1], ["我喝茶", 0]] as const) {
    await userEvent.type(screen.getByRole("textbox", { name: "Your reply" }), message);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(`${remaining} free messages left`)).toBeVisible();
  }
  expect(screen.getByRole("textbox", { name: "Your reply" })).toBeDisabled();
  expect(sendConversation).toHaveBeenCalledTimes(3);
  await userEvent.click(
    screen.getByRole("button", { name: "Sign in to practice" }),
  );
  expect(props.onSignIn).toHaveBeenCalledOnce();
  expect(readConversation("guest", "en").turns).toHaveLength(3);
});

it("starts a conversation, reveals assistance without more inference, and saves the reply", async () => {
  render(<Conversation {...props} />);
  expect(screen.getByText("MiMo-V2.6-Flash")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Start a conversation" }),
  );
  expect(await screen.findByText("你好吗？")).toBeVisible();
  expect(speakChinese).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Listen" }));
  expect(speakChinese).toHaveBeenCalledWith("你好吗？");
  await userEvent.click(screen.getByRole("button", { name: "Meaning" }));
  expect(screen.getByText("How are you?")).toBeVisible();
  expect(screen.getByRole("button", { name: "Meaning" })).toHaveAttribute("aria-expanded", "true");
  await userEvent.click(screen.getByRole("button", { name: "Help me reply" }));
  expect(screen.getByText("我很好。Wǒ hěn hǎo. I’m well.")).toBeVisible();
  expect(screen.queryByText("How are you?")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Meaning" })).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(screen.getByRole("button", { name: "Show pinyin" }));
  expect(await screen.findByRole("button", { name: "Hide pinyin" })).toHaveAttribute("aria-expanded", "true");
  const annotated = await screen.findByText("nǐ", { selector: "rt" });
  expect(annotated).toBeVisible();
  expect(annotated.closest("ruby")).toHaveTextContent("你nǐ");
  expect(screen.getByText("hǎo", { selector: "rt" }).closest("ruby")).toHaveTextContent("好hǎo");
  expect(screen.getByText("ma", { selector: "rt" }).closest("ruby")).toHaveTextContent("吗ma");
  expect(sendConversation).toHaveBeenCalledOnce();
  expect(readConversation("alice", "en").turns).toHaveLength(1);
  expect(readConversation("alice", "en").model).toBe("mimo-v2.6-flash");
  expect(screen.getByText("29 messages left today")).toBeVisible();
});

it("scrolls newly opened help into the transcript viewport", async () => {
  saveConversation("alice", "en", {
    version: 1, sessionId: crypto.randomUUID(), topic: "",
    turns: [{ user: "你好", reply: response.reply }], targetCardIds: [],
  });
  render(<Conversation {...props} />);
  const transcript = screen.getByRole("log");
  const geometry = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      return (this === transcript
        ? { top: 0, bottom: 200, height: 200 }
        : { top: 180, bottom: 270, height: 90 }) as DOMRect;
    });
  await userEvent.click(screen.getByRole("button", { name: "Meaning" }));
  expect(transcript.scrollTop).toBe(82);
  geometry.mockRestore();
});

it("displays the backend-selected model and preserves it with history", async () => {
  vi.mocked(sendConversation).mockResolvedValue({
    ...response,
    model: "glm-5.2",
  });
  const view = render(<Conversation {...props} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Start a conversation" }),
  );
  expect(await screen.findByText("glm-5.2")).toBeVisible();
  expect(screen.queryByText("MiMo-V2.6-Flash")).not.toBeInTheDocument();
  view.unmount();
  render(<Conversation {...props} />);
  expect(screen.getByText("glm-5.2")).toBeVisible();
});

it.each([
  ["en", "mostly_natural", "Mostly natural", "Put 喜欢 before 喝."],
  ["es", "needs_work", "Por mejorar", "Coloca 喜欢 antes de 喝."],
  ["en", "natural", "Natural", "Your word order sounds natural."],
] as const)("expands %s %s feedback beneath the learner's answer without inference", async (locale, level, label, explanation) => {
  const betterChinese = level === "natural" ? "" : "我喜欢喝茶。";
  saveConversation("alice", locale, {
    version: 1,
    sessionId: crypto.randomUUID(),
    topic: "",
    turns: [{
      user: level === "natural" ? "我喜欢喝茶。" : "我喝喜欢茶。",
      reply: {
        ...response.reply,
        naturalness: { level, explanation, betterChinese },
      },
    }],
    targetCardIds: [],
  });
  render(<Conversation {...props} locale={locale} />);
  const summary = screen.getByText(label).closest("summary")!;
  expect(summary.closest(".chat-turn")?.firstElementChild).toHaveClass("chat-user");
  expect(screen.getByText(explanation)).not.toBeVisible();
  await userEvent.click(summary);
  expect(screen.getByText(explanation)).toBeVisible();
  if (betterChinese) expect(screen.getByText(betterChinese)).toBeVisible();
  else expect(screen.queryByText("A more natural sentence")).not.toBeInTheDocument();
  expect(sendConversation).not.toHaveBeenCalled();
});

it.each([
  ["en", "Your answer sounds natural in this conversation."],
  ["es", "Tu respuesta suena natural en esta conversación."],
] as const)("shows %s feedback in the selected language when the model replies in Chinese", async (locale, fallback) => {
  saveConversation("alice", locale, {
    version: 1, sessionId: crypto.randomUUID(), topic: "",
    turns: [{
      user: "我喝牛奶",
      reply: {
        ...response.reply,
        naturalness: {
          level: "natural",
          explanation: "你的回答简短、正确、自然，完全符合对话。",
          betterChinese: "",
        },
      },
    }],
    targetCardIds: [],
  });
  render(<Conversation {...props} locale={locale} />);
  await userEvent.click(screen.getByText("Natural"));
  expect(screen.getByText(fallback)).toBeVisible();
  expect(screen.queryByText("你的回答简短、正确、自然，完全符合对话。")).not.toBeInTheDocument();
});

it.each([undefined, null])("keeps history without an assessment ungraded (%s)", (naturalness) => {
  saveConversation("alice", "en", {
    version: 1,
    sessionId: crypto.randomUUID(),
    topic: "",
    turns: [{ user: "Hello", reply: { ...response.reply, naturalness } }],
    targetCardIds: [],
  });
  render(<Conversation {...props} />);
  expect(screen.getByText("Hello")).toBeVisible();
  expect(screen.queryByText("Natural")).not.toBeInTheDocument();
});

it("uses one provider session for a conversation and a new one after clearing", async () => {
  render(<Conversation {...props} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Start a conversation" }),
  );
  await screen.findByRole("textbox");
  const firstId = vi.mocked(sendConversation).mock.calls[0][0].sessionId;
  await userEvent.type(screen.getByRole("textbox"), "你好");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(""));
  expect(vi.mocked(sendConversation).mock.calls[1][0].sessionId).toBe(firstId);
  await userEvent.click(
    screen.getByRole("button", { name: "New conversation" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Delete conversation" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Start a conversation" }),
  );
  await screen.findByRole("textbox");
  expect(vi.mocked(sendConversation).mock.calls[2][0].sessionId).not.toBe(
    firstId,
  );
});

it("preserves the draft and prior turns after an exhausted quota", async () => {
  saveConversation("alice", "en", {
    version: 1,
    sessionId: crypto.randomUUID(),
    topic: "",
    turns: [{ user: "Hello", reply: response.reply }],
    targetCardIds: [],
  });
  vi.mocked(sendConversation).mockRejectedValue({
    code: "chat/resource-exhausted",
  });
  render(<Conversation {...props} />);
  await userEvent.type(
    screen.getByRole("textbox", { name: "Your reply" }),
    "你好",
  );
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("allowance");
  expect(screen.getByRole("textbox")).toHaveValue("你好");
  expect(readConversation("alice", "en").turns).toHaveLength(1);
});

it.each([
  { code: "chat/deadline-exceeded" },
  new DOMException("Timeout", "TimeoutError"),
])("explains a timeout and keeps the learner's draft", async (cause) => {
  saveConversation("alice", "en", {
    version: 1, sessionId: crypto.randomUUID(), topic: "",
    turns: [{ user: "Hello", reply: response.reply }], targetCardIds: [],
  });
  vi.mocked(sendConversation).mockRejectedValue(cause);
  render(<Conversation {...props} />);
  await userEvent.type(screen.getByRole("textbox"), "我喝咖啡！");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("took too long");
  expect(screen.getByRole("textbox")).toHaveValue("我喝咖啡！");
  expect(sendConversation).toHaveBeenCalledOnce();
});

it("does not write a late reply after switching accounts", async () => {
  let resolve!: (value: ChatResponse) => void;
  vi.mocked(sendConversation).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = render(<Conversation {...props} key="alice" />);
  await userEvent.click(
    screen.getByRole("button", { name: "Start a conversation" }),
  );
  view.rerender(<Conversation {...props} owner="bob" key="bob" />);
  resolve(response);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Start a conversation" }),
    ).toBeEnabled(),
  );
  expect(screen.queryByText("你好吗？")).not.toBeInTheDocument();
  expect(readConversation("bob", "en").turns).toHaveLength(0);
});

it("confirms deletion and removes persisted history", async () => {
  saveConversation("alice", "en", {
    version: 1,
    sessionId: crypto.randomUUID(),
    topic: "",
    turns: [{ user: "Hello", reply: response.reply }],
    targetCardIds: [],
  });
  render(<Conversation {...props} />);
  await userEvent.click(
    screen.getByRole("button", { name: "New conversation" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Delete conversation" }),
  );
  expect(screen.queryByText("你好吗？")).not.toBeInTheDocument();
  expect(readConversation("alice", "en").turns).toHaveLength(0);
});

it("shows an unavailable state in Spanish when the backend is disabled", () => {
  render(<Conversation {...props} locale="es" configured={false} />);
  expect(
    screen.getByText(/La conversación aún no está disponible/),
  ).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("prevents duplicate requests while a reply is pending", async () => {
  vi.mocked(sendConversation).mockImplementation(() => new Promise(() => {}));
  render(<Conversation {...props} />);
  const start = screen.getByRole("button", { name: "Start a conversation" });
  fireEvent.click(start);
  fireEvent.click(start);
  await waitFor(() => expect(sendConversation).toHaveBeenCalledOnce());
});
