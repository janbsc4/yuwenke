import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Conversation from "../src/components/Conversation";
import { sendConversation } from "../src/lib/chatClient";
import { readConversation, saveConversation } from "../src/lib/conversation";
import { speakChinese } from "../src/lib/speech";
import type { ChatResponse } from "../shared/chat";

vi.mock("../src/lib/chatClient", () => ({ sendConversation: vi.fn(), guestMessagesRemaining: () => 3 }));
vi.mock("../src/lib/speech", () => ({
  speakChinese: vi.fn(), speechSupported: () => true,
  chatAutoplayEnabled: () => true, setChatAutoplayEnabled: vi.fn(),
}));
const practice: ChatResponse = {
  model: "glm-5.3-flash", remaining: 28, targetCardIds: [],
  reply: {
    kind: "conversation", chinese: "你喜欢喝茶吗？", pinyin: "Nǐ xǐhuān hē chá ma?",
    meaning: "Do you like tea?", feedback: "", naturalness: null, hint: "我喜欢喝茶。", practicedCardIds: [],
  },
};
const props = { cards: [], progress: {}, owner: "alice", configured: true, onSignIn: vi.fn(), onReviewCard: vi.fn() };

beforeEach(() => vi.clearAllMocks());

it.each([
  { locale: "en" as const, answer: "I can’t confirm whether 很高兴认识你 is in all your cards. It means ‘Nice to meet you’." },
  { locale: "es" as const, answer: "No puedo confirmar si 很高兴认识你 aparece en todas tus tarjetas. Significa ‘Encantado de conocerte’." },
])("shows and restores the $locale explanation directly without practice controls or Chinese audio", async ({ locale, answer }) => {
  const user = userEvent.setup();
  saveConversation("alice", locale, {
    version: 1, sessionId: crypto.randomUUID(), topic: "", targetCardIds: [],
    turns: [{ user: "你好", reply: practice.reply }],
  });
  const response: ChatResponse = { ...practice, reply: {
    kind: "explanation", explanation: answer, naturalness: null, practicedCardIds: [],
  } };
  vi.mocked(sendConversation).mockResolvedValueOnce(response).mockResolvedValueOnce(practice);
  const view = render(<Conversation {...props} locale={locale} />);
  await user.type(screen.getByRole("textbox"), "很高兴认识你: Is this in my cards?");
  await user.keyboard("{Enter}");
  const text = await screen.findByText(answer);
  expect(text).toHaveAttribute("lang", locale);
  const article = text.closest("article")!;
  expect(within(article).queryByRole("button")).not.toBeInTheDocument();
  expect(article.querySelector(".chat-chinese")).toBeNull();
  expect(article.closest(".chat-turn")!.querySelector(".chat-naturalness")).toBeNull();
  expect(speakChinese).not.toHaveBeenCalled();
  expect(readConversation("alice", locale).turns.at(-1)?.reply).toEqual(response.reply);

  view.unmount();
  render(<Conversation {...props} locale={locale} />);
  expect(screen.getByText(answer)).toBeVisible();
  expect(speakChinese).not.toHaveBeenCalled();
  await user.type(screen.getByRole("textbox"), "我喜欢喝茶。");
  await user.keyboard("{Enter}");
  await waitFor(() => expect(sendConversation).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(speakChinese).toHaveBeenCalledWith("你喜欢喝茶吗？"));
  const lastArticle = screen.getAllByRole("article").at(-1)!;
  expect(lastArticle.querySelector(".chat-chinese")).not.toBeNull();
  expect(within(lastArticle).getAllByRole("button")).toHaveLength(4);
  expect(vi.mocked(sendConversation).mock.calls[1][0].messages.at(-2))
    .toEqual({ role: "assistant", content: answer });
});
