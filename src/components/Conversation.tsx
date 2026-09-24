import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import {
  CHAT_MAX_MESSAGE,
  DEFAULT_CHAT_MODEL,
  chatModelLabel,
} from "../../shared/chat";
import type { Flashcard, Locale, ProgressMap } from "../types";
import { guestMessagesRemaining, sendConversation } from "../lib/chatClient";
import { chatMessages } from "../lib/chatMessages";
import { topicDisplayLabel } from "../lib/messages";
import { speakChinese, speechSupported } from "../lib/speech";
import {
  conversationMessages,
  conversationProgress,
  readConversation,
  saveConversation,
} from "../lib/conversation";
import "../styles/conversation.css";

type PinyinReader = typeof import("pinyin-pro").pinyin;

function chineseWithPinyin(chinese: string, pinyin: PinyinReader) {
  const characters = Array.from(chinese);
  const readings = pinyin(chinese, { type: "array" });
  return characters.map((character, index) =>
    /\p{Script=Han}/u.test(character) ? (
      <ruby key={index} className="chat-ruby">
        {character}<rt lang="zh-Latn" aria-hidden="true">{readings[index]}</rt>
      </ruby>
    ) : (
      <span key={index}>{character}</span>
    ),
  );
}

function naturalnessExplanation(
  explanation: string,
  level: "natural" | "mostly_natural" | "needs_work",
  fallback: Record<"natural" | "mostly_natural" | "needs_work", string>,
) {
  const latinWords = explanation.match(/\p{Script=Latin}+/gu)?.length ?? 0;
  const hanziCount = explanation.match(/\p{Script=Han}/gu)?.length ?? 0;
  const latinCount = explanation.match(/\p{Script=Latin}/gu)?.length ?? 0;
  return hanziCount > 0 && (latinWords < 2 || hanziCount > latinCount)
    ? fallback[level]
    : explanation;
}

interface Props {
  cards: Flashcard[];
  progress: ProgressMap;
  locale: Locale;
  owner: string | null;
  configured: boolean;
  muted?: boolean;
  onSignIn: () => void;
  onReviewCard: (id: string) => void;
}

export default function Conversation({
  cards,
  progress,
  locale,
  owner,
  configured,
  muted = false,
  onSignIn,
  onReviewCard,
}: Props) {
  const m = chatMessages[locale];
  const ownerKey = owner ?? "guest";
  const listenUnavailable = !speechSupported() ? m.speechUnavailable : muted ? m.speechMuted : undefined;
  const [session, setSession] = useState(() =>
    readConversation(ownerKey, locale),
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageFailed, setStorageFailed] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(() =>
    owner ? null : guestMessagesRemaining(),
  );
  const [confirmClear, setConfirmClear] = useState(false);
  const [revealedPinyin, setRevealedPinyin] = useState<Set<number>>(new Set());
  const [pinyinReader, setPinyinReader] = useState<PinyinReader | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const sending = useRef(false);
  const snapshot = useMemo(
    () => conversationProgress(cards, progress),
    [cards, progress],
  );
  const topics = [
    ...new Set(
      cards
        .filter((card) => snapshot.some((entry) => entry.cardId === card.id))
        .map((card) => card.tema),
    ),
  ];
  const practiced = [
    ...new Set(session.turns.flatMap((turn) => turn.reply.practicedCardIds)),
  ];

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [session.turns.length, busy]);

  async function send(message: string) {
    const content = message.trim();
    if (!content || sending.current || (!owner && remaining === 0)) return;
    if (!navigator.onLine) {
      setError(m.offline);
      return;
    }
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await sendConversation({
        sessionId: session.sessionId,
        locale,
        topic: session.topic,
        progress: snapshot,
        messages: conversationMessages(session.turns, content),
      });
      if (!mounted.current) return;
      const next = {
        ...session,
        model: result.model,
        turns: [...session.turns, { user: content, reply: result.reply }].slice(
          -12,
        ),
        targetCardIds: result.targetCardIds,
      };
      setSession(next);
      setStorageFailed(!saveConversation(ownerKey, locale, next));
      setRemaining(result.remaining);
      setDraft("");
    } catch (cause) {
      if (!mounted.current) return;
      const timedOut =
        cause !== null &&
        typeof cause === "object" &&
        "name" in cause &&
        cause.name === "TimeoutError";
      const code =
        cause && typeof cause === "object" && "code" in cause ? cause.code : "";
      if (cause && typeof cause === "object" && "remaining" in cause &&
        typeof cause.remaining === "number" && Number.isSafeInteger(cause.remaining))
        setRemaining(cause.remaining);
      if (code === "chat/guest-exhausted") setRemaining(0);
      setError(
        !navigator.onLine
          ? m.offline
          : code === "chat/guest-exhausted"
            ? m.guestExhausted
            : timedOut || code === "chat/deadline-exceeded"
              ? m.timeout
              : code === "chat/resource-exhausted"
                ? m.quota
                : code === "chat/unauthenticated"
                  ? m.auth
                  : m.error,
      );
    } finally {
      sending.current = false;
      if (mounted.current) {
        setBusy(false);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
  }

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }

  function clear() {
    const empty = {
      version: 1 as const,
      sessionId: crypto.randomUUID(),
      model: session.model,
      topic: "",
      turns: [],
      targetCardIds: [],
    };
    setSession(empty);
    setStorageFailed(!saveConversation(ownerKey, locale, empty));
    setDraft("");
    setError("");
    setConfirmClear(false);
    setRevealedPinyin(new Set());
  }

  async function togglePinyin(index: number) {
    if (!revealedPinyin.has(index) && !pinyinReader) {
      const module = await import("pinyin-pro");
      if (!mounted.current) return;
      setPinyinReader(() => module.pinyin);
    }
    setRevealedPinyin((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function cardButtons(ids: string[]) {
    return cards
      .filter((card) => ids.includes(card.id))
      .map((card) => (
        <button
          className="chat-word"
          type="button"
          key={card.id}
          onClick={() => onReviewCard(card.id)}
        >
          <span lang="zh-CN">{card.hanzi}</span>
          <small>{card.pinyin}</small>
        </button>
      ));
  }

  return (
    <main className="conversation" aria-label={m.title}>
      <header className="chat-heading">
        <div className="chat-identity">
          <span className="chat-seal" lang="zh-CN" aria-hidden="true">
            雷
          </span>
          <div>
            <h1>{m.title}</h1>
            <p>{m.subtitle}</p>
            <p className="chat-model">
              {m.model}{" "}
              <span>{chatModelLabel(session.model ?? DEFAULT_CHAT_MODEL)}</span>
            </p>
          </div>
        </div>
        {session.turns.length > 0 && (
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => setConfirmClear(true)}
          >
            {m.newChat}
          </button>
        )}
      </header>
      {confirmClear && (
        <div className="chat-clear" role="group" aria-label={m.confirmClear}>
          <p>{m.confirmClear}</p>
          <button className="button button-small" type="button" onClick={clear}>
            {m.clear}
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => setConfirmClear(false)}
          >
            {m.cancel}
          </button>
        </div>
      )}
      {!configured ? (
        <p className="chat-intro">{m.unavailable}</p>
      ) : (
        <>
          {session.turns.length === 0 && (
            <div className="chat-intro">
              <p>{m.intro}</p>
              {!owner && <p>{m.guestIntro}</p>}
              {!snapshot.length && <p>{m.emptyProgress}</p>}
              <label className="chat-topic">
                {m.topic}
                <select
                  value={session.topic}
                  disabled={busy}
                  onChange={(event) =>
                    setSession({ ...session, topic: event.target.value })
                  }
                >
                  <option value="">{m.anyTopic}</option>
                  {topics.map((topic) => (
                    <option key={topic} value={topic}>
                      {topicDisplayLabel(locale, topic)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button button-ink"
                type="button"
                disabled={busy || (!owner && remaining === 0)}
                onClick={() => void send(m.startMessage)}
              >
                {m.start}
              </button>
            </div>
          )}
          {session.targetCardIds.length > 0 && (
            <aside className="chat-targets">
              <span>{m.targets}</span>
              <div>{cardButtons(session.targetCardIds)}</div>
            </aside>
          )}
          <div
            className="chat-transcript"
            role="log"
            aria-label={m.title}
            aria-live="polite"
            aria-relevant="additions"
          >
            {session.turns.map((turn, index) => (
              <div className="chat-turn" key={index}>
                <p className="chat-user" dir="auto">
                  {turn.user}
                </p>
                {turn.reply.naturalness && (
                  <details className="chat-naturalness" data-level={turn.reply.naturalness.level}>
                    <summary>
                      <span className="chat-naturalness-meter" aria-hidden="true">
                        <span /><span /><span />
                      </span>
                      <span>{m.naturalness}: {m.naturalnessLevels[turn.reply.naturalness.level]}</span>
                    </summary>
                    <p>{naturalnessExplanation(turn.reply.naturalness.explanation, turn.reply.naturalness.level, m.naturalnessFallback)}</p>
                    {turn.reply.naturalness.betterChinese && (
                      <div className="chat-better-sentence">
                        <strong>{m.betterSentence}</strong>
                        <p lang="zh-CN">{turn.reply.naturalness.betterChinese}</p>
                      </div>
                    )}
                  </details>
                )}
                <article className="chat-reply" aria-label="Léi">
                  <div className="chat-reply-heading">
                    <span className="chat-speaker">Léi</span>
                    <button
                      type="button"
                      className="chat-listen"
                      disabled={Boolean(listenUnavailable)}
                      title={listenUnavailable}
                      onClick={() => speakChinese(turn.reply.chinese)}
                    >
                      <span aria-hidden="true">🔊</span> {m.listen}
                    </button>
                  </div>
                  <p className="chat-chinese" lang="zh-CN">
                    {revealedPinyin.has(index) && pinyinReader
                      ? chineseWithPinyin(turn.reply.chinese, pinyinReader)
                      : turn.reply.chinese}
                  </p>
                  {turn.reply.feedback && !turn.reply.naturalness && (
                    <div className="chat-correction">
                      <strong>{m.correction}</strong>
                      <p>{turn.reply.feedback}</p>
                    </div>
                  )}
                  <div className="chat-aids">
                    <button
                      type="button"
                      className="chat-pinyin-toggle"
                      aria-expanded={revealedPinyin.has(index)}
                      onClick={() => void togglePinyin(index)}
                    >
                      {revealedPinyin.has(index) ? "▼" : "▶"} {m.pinyin}
                    </button>
                    <details>
                      <summary>{m.meaning}</summary>
                      <p>{turn.reply.meaning}</p>
                    </details>
                    <details>
                      <summary>{m.hint}</summary>
                      <p>{turn.reply.hint}</p>
                    </details>
                  </div>
                </article>
              </div>
            ))}
            {busy && (
              <p className="chat-pending" role="status">
                {m.thinking}
              </p>
            )}
            <div ref={endRef} />
          </div>
          {error && (
            <p className="inline-alert" role="alert">
              {error}
            </p>
          )}
          {session.turns.length > 0 && (
            <form className="chat-composer" onSubmit={submit}>
              <label className="sr-only" htmlFor="chat-reply">
                {m.input}
              </label>
              <textarea
                id="chat-reply"
                ref={inputRef}
                value={draft}
                maxLength={CHAT_MAX_MESSAGE}
                rows={2}
                disabled={busy || (!owner && remaining === 0)}
                placeholder={m.placeholder}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button
                className="button button-ink"
                type="submit"
                disabled={busy || !draft.trim() || (!owner && remaining === 0)}
              >
                {m.send}
              </button>
            </form>
          )}
          {remaining !== null && (
            <p className="chat-allowance">
              {remaining} {owner ? m.remaining : m.guestRemaining}
            </p>
          )}
          {!owner && remaining === 0 && (
            <div className="chat-intro">
              <p>{m.guestExhausted}</p>
              <button className="button button-ink" type="button" onClick={onSignIn}>
                {m.signIn}
              </button>
            </div>
          )}
          {practiced.length > 0 && (
            <details className="chat-recap">
              <summary>
                {m.recap} · {practiced.length}
              </summary>
              <p>{m.recapNote}</p>
              <div>{cardButtons(practiced)}</div>
            </details>
          )}
          {storageFailed && <p role="status">{m.savedError}</p>}
        </>
      )}
      <p className="chat-privacy">{m.privacy}</p>
    </main>
  );
}
