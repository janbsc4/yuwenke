import { Fragment, forwardRef, type RefObject } from "react";

import type { StudyUnit } from "../types";
import { highlightProperNames } from "../lib/properNames";

interface StudyCardProps {
  unit: StudyUnit;
  revealed: boolean;
  favorite: boolean;
  onToggleFavorite: () => void;
  promptRef: RefObject<HTMLHeadingElement | null>;
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
  { unit, revealed, favorite, onToggleFavorite, promptRef },
  answerRef,
) {
  const { card, direction } = unit;
  const conceptCard = card.tipo === "concepto";
  const hanziPrompt = !conceptCard && direction === "hanzi-es";
  const hanziAnswer = !conceptCard && direction === "es-hanzi";
  const promptText = conceptCard
    ? card.espanol
    : hanziPrompt
      ? card.hanzi
      : card.espanol;
  const answerText = conceptCard
    ? card.explicacion
    : hanziPrompt
      ? card.espanol
      : card.hanzi;

  return (
    <article className={`study-card ${revealed ? "is-revealed" : ""}`}>
      <button
        type="button"
        className={`favorite-button ${favorite ? "is-favorite" : ""}`}
        aria-label={
          favorite ? "Quitar carta de favoritas" : "Añadir carta a favoritas"
        }
        aria-pressed={favorite}
        onClick={onToggleFavorite}
      >
        <span aria-hidden="true">{favorite ? "★" : "☆"}</span>
      </button>
      <div className="card-prompt">
        <p className="eyebrow">Tu pregunta</p>
        <h2
          className={hanziPrompt ? "prompt-hanzi" : "prompt-spanish"}
          lang={hanziPrompt ? "zh-Hans" : "es"}
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
          <h3 className="eyebrow" id="answer-title">
            Respuesta
          </h3>
          <p
            className={hanziAnswer ? "answer-hanzi" : "answer-spanish"}
            lang={hanziAnswer ? "zh-Hans" : "es"}
          >
            <HighlightedText
              text={answerText}
              properNames={card.nombres_propios}
            />
          </p>

          {!conceptCard ? (
            <dl className="answer-details">
              <div>
                <dt>Pinyin</dt>
                <dd lang="zh-Latn">
                  <HighlightedText text={card.pinyin} properNames={card.nombres_propios} />
                </dd>
              </div>
              <div>
                <dt>Explicación</dt>
                <dd lang="es">
                  <HighlightedText text={card.explicacion} properNames={card.nombres_propios} />
                </dd>
              </div>
            </dl>
          ) : null}

          <div className="example-block">
            <h3>Ejemplo</h3>
            <p className="example-hanzi" lang="zh-Hans">
              <HighlightedText text={card.ejemplo_hanzi} properNames={card.nombres_propios} />
            </p>
            <p lang="zh-Latn">
              <HighlightedText text={card.ejemplo_pinyin} properNames={card.nombres_propios} />
            </p>
            <p lang="es">
              <HighlightedText text={card.ejemplo_espanol} properNames={card.nombres_propios} />
            </p>
          </div>
        </section>
      ) : null}
    </article>
  );
});
