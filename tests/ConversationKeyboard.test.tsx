import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Conversation from "../src/components/Conversation";
import { sendConversation } from "../src/lib/chatClient";
import { saveConversation } from "../src/lib/conversation";
import type { ChatResponse } from "../shared/chat";

vi.mock("../src/lib/chatClient", () => ({
  sendConversation: vi.fn(),
  guestMessagesRemaining: () => 3,
}));

const response: ChatResponse = {
  model: "mimo-v2.6-flash", remaining: 29, targetCardIds: [],
  reply: {
    chinese: "你好！", pinyin: "Nǐ hǎo!", meaning: "Hello!",
    feedback: "", hint: "你好。", practicedCardIds: [],
  },
};

beforeEach(() => {
  vi.mocked(sendConversation).mockReset().mockResolvedValue(response);
  saveConversation("alice", "en", {
    version: 1, sessionId: crypto.randomUUID(), topic: "",
    turns: [{ user: "你好", reply: response.reply }], targetCardIds: [],
  });
});

function renderComposer() {
  render(<Conversation cards={[]} progress={{}} locale="en" owner="alice"
    configured onSignIn={vi.fn()} onReviewCard={vi.fn()} />);
  return screen.getByRole("textbox", { name: "Your reply" });
}

it("sends the draft on Enter and clears the composer after the reply", async () => {
  const user = userEvent.setup();
  const input = renderComposer();
  await user.type(input, "我很好");
  await user.keyboard("{Enter}");
  await waitFor(() => expect(sendConversation).toHaveBeenCalledOnce());
  expect(vi.mocked(sendConversation).mock.calls[0][0].messages.at(-1))
    .toEqual({ role: "user", content: "我很好" });
  await waitFor(() => expect(input).toHaveValue(""));
});

it("inserts a new line on Shift+Enter and sends the multiline draft on Enter", async () => {
  const user = userEvent.setup();
  const input = renderComposer();
  await user.type(input, "你好");
  await user.keyboard("{Shift>}{Enter}{/Shift}");
  await user.type(input, "我很好");
  expect(input).toHaveValue("你好\n我很好");
  expect(sendConversation).not.toHaveBeenCalled();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(sendConversation).toHaveBeenCalledOnce());
  expect(vi.mocked(sendConversation).mock.calls[0][0].messages.at(-1))
    .toEqual({ role: "user", content: "你好\n我很好" });
});

it.each([
  { isComposing: true, keyCode: 13 },
  { isComposing: false, keyCode: 229 },
])("lets the IME confirm a character before Enter can send (%j)", async (composition) => {
  const user = userEvent.setup();
  const input = renderComposer();
  await user.type(input, "ni");
  fireEvent.compositionStart(input);
  expect(fireEvent.keyDown(input, { key: "Enter", ...composition })).toBe(true);
  expect(sendConversation).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "你" } });
  fireEvent.compositionEnd(input);
  await user.keyboard("{Enter}");
  await waitFor(() => expect(sendConversation).toHaveBeenCalledOnce());
  expect(vi.mocked(sendConversation).mock.calls[0][0].messages.at(-1))
    .toEqual({ role: "user", content: "你" });
});
