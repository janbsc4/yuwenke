import { Fragment, forwardRef, useEffect, type RefObject } from "react";

import type { Locale, StudyUnit } from "../types";
import { localizedCardContent } from "../lib/locale";
import type { Messages } from "../lib/messages";
import { highlightProperNames } from "../lib/properNames";
import { speakChinese } from "../lib/speech";

interface StudyCardProps {
  unit: StudyUnit;
  packTitle: string;
  revealed: boolean;
  favorite: boolean;
  muted: boolean;
  onToggleFavorite: () => void;
  promptRef: RefObject<HTMLHeadingElement | null>;
  m: Messages;
  locale: Locale;
}

interface HighlightedTextProps {
  text: string;
  properNames: string;
}

export function HighlightedText({ text, properNames }: HighlightedTextProps) {
  return (
    <>
      {highlightProperNames(text, properNames).map((segment, index) =>
        segment.properName ? (
          <span className="proper-name" key={`${index}-${segment.text}`}>
            {segment.text}
          </span>
        ) : (
          <Fragment key={`${index}-${segment.text}`}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}

export const StudyCard = forwardRef<HTMLElement, StudyCardProps>(function StudyCard(
  { unit, packTitle, revealed, favorite, muted, onToggleFavorite, promptRef, m, locale },
  answerRef,
) {
  const { card, direction } = unit;
  const content = localizedCardContent(card, locale);
  const conceptCard = card.tipo === "concepto";
  const hanziPrompt = !conceptCard && direction === "hanzi-meaning";
  const hanziAnswer = !conceptCard && direction === "meaning-hanzi";
  const promptText = conceptCard
    ? content.meaning
    : hanziPrompt
      ? card.hanzi
      : content.meaning;
  const answerText = conceptCard
    ? content.explanation
    : hanziPrompt
      ? content.meaning
      : card.hanzi;

  useEffect(() => {
    if (revealed && !conceptCard && !muted) speakChinese(card.hanzi);
    // unit.key guards against re-revealing a different card with identical hanzi;
    // muted is intentionally excluded so unmuting mid-card does not replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, unit.key]);

  return (
    <article className={`study-card ${revealed ? "is-revealed" : ""}`}>
      <button
        type="button"
        className={`favorite-button ${favorite ? "is-favorite" : ""}`}
        aria-label={favorite ? m.card.favoriteRemove : m.card.favoriteAdd}
        aria-pressed={favorite}
        onClick={onToggleFavorite}
      >
        <span aria-hidden="true">{favorite ? "★" : "☆"}</span>
      </button>
      <div className="card-prompt">
        <p className="eyebrow">{m.card.promptEyebrow}</p>
        <h2
          className={hanziPrompt ? "prompt-hanzi" : "prompt-spanish"}
          lang={hanziPrompt ? "zh-Hans" : locale}
          ref={promptRef}
          tabIndex={-1}
        >
          <HighlightedText
            text={promptText}
            properNames={card.nombres_propios}
          />
        </h2>
      </div>

      {revealed ? (
        <section className="card-answer" ref={answerRef} tabIndex={-1} aria-labelledby="answer-title">
          <div className="answer-heading">
            <h3 className="eyebrow" id="answer-title">
              {m.card.answerTitle}
            </h3>
            <p className="card-reference">
              {card.id} · {packTitle}
            </p>
          </div>
          <p
            className={hanziAnswer ? "answer-hanzi" : "answer-spanish"}
            lang={hanziAnswer ? "zh-Hans" : locale}
          >
            <HighlightedText
              text={answerText}
              properNames={card.nombres_propios}
            />
          </p>

          {!muted && !conceptCard ? (
            <button
              type="button"
              className="speak-button"
              aria-label={m.card.speak}
              onClick={() => speakChinese(card.hanzi)}
            >
              <span aria-hidden="true">🔊</span>
            </button>
          ) : null}

          {!conceptCard ? (
            <dl className="answer-details">
              <div>
                <dt>{m.card.pinyin}</dt>
                <dd lang="zh-Latn">
                  <HighlightedText text={card.pinyin} properNames={card.nombres_propios} />
                </dd>
              </div>
              <div>
                <dt>{m.card.explanation}</dt>
                <dd lang={locale}>
                  <HighlightedText text={content.explanation} properNames={card.nombres_propios} />
                </dd>
              </div>
            </dl>
          ) : null}

          <div className="example-block">
            <h3>{m.card.example}</h3>
            <p className="example-hanzi" lang="zh-Hans">
              <HighlightedText text={card.ejemplo_hanzi} properNames={card.nombres_propios} />
            </p>
            <p lang="zh-Latn">
              <HighlightedText text={card.ejemplo_pinyin} properNames={card.nombres_propios} />
            </p>
            <p lang={locale}>
              <HighlightedText text={content.example} properNames={card.nombres_propios} />
            </p>
          </div>
        </section>
      ) : null}
    </article>
  );
});
