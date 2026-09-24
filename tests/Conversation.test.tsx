import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Conversation from "../src/components/Conversation";
import { sendConversation } from "../src/lib/chatClient";
import { readConversation, saveConversation } from "../src/lib/conversation";
import { loadFlashcards } from "../src/data/loadFlashcards";
import type { ChatResponse } from "../shared/chat";
import { speakChinese } from "../src/lib/speech";

vi.mock("../src/lib/chatClient", () => ({ sendConversation: vi.fn() }));
vi.mock("../src/lib/speech", () => ({
  speakChinese: vi.fn(),
  speechSupported: () => true,
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
  vi.mocked(sendConversation).mockResolvedValue(response);
});

it("lets a guest reach sign-in without making an inference request", async () => {
  render(<Conversation {...props} owner={null} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Sign in to practice" }),
  );
  expect(props.onSignIn).toHaveBeenCalledOnce();
  expect(sendConversation).not.toHaveBeenCalled();
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
  await userEvent.click(screen.getByText("Pinyin", { selector: "summary" }));
  expect(screen.getByText("Nǐ hǎo ma?")).toBeVisible();
  expect(sendConversation).toHaveBeenCalledOnce();
  expect(readConversation("alice", "en").turns).toHaveLength(1);
  expect(readConversation("alice", "en").model).toBe("mimo-v2.6-flash");
  expect(screen.getByText("29 messages left today")).toBeVisible();
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
  ["en", "mostly_natural", "Naturalness: Mostly natural", "Put 喜欢 before 喝."],
  ["es", "needs_work", "Naturalidad: Por mejorar", "Coloca 喜欢 antes de 喝."],
  ["en", "natural", "Naturalness: Natural", "Your word order sounds natural."],
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
  expect(screen.queryByText(/^Naturalness:/)).not.toBeInTheDocument();
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
