import { localized } from "../lib/locale";
import type { Messages } from "../lib/messages";
import type { CardPack, Locale } from "../types";

interface CardPackBoosterProps {
  pack: CardPack;
  unitCount: number;
  state?: "sealed" | "opening" | "opened";
  compact?: boolean;
  m: Messages;
  locale: Locale;
}

export function CardPackBooster({
  pack,
  unitCount,
  state = "sealed",
  compact = false,
  m,
  locale,
}: CardPackBoosterProps) {
  return (
    <span
      className={`booster-pack booster-pack--${state}${compact ? " booster-pack--compact" : ""}`}
      data-theme={pack.theme}
      aria-hidden="true"
    >
      <span className="booster-pack__cards">
        <span />
        <span />
        <span />
      </span>
      <span className="booster-pack__wrapper">
        <span className="booster-pack__crimp booster-pack__crimp--top" />
        <span className="booster-pack__edition">Yuwenke · {pack.id}</span>
        <span className="booster-pack__mark" lang="zh-Hans">{pack.mark}</span>
        <span className="booster-pack__title">{localized(pack.title, locale)}</span>
        <span className="booster-pack__count">{m.packs.cardCount(unitCount)}</span>
        <span className="booster-pack__seal">文</span>
        <span className="booster-pack__crimp booster-pack__crimp--bottom" />
        <span className="booster-pack__tear-strip" />
      </span>
      {state === "opened" ? (
        <span className="booster-pack__opened-stamp">{m.packs.openedStamp}</span>
      ) : null}
    </span>
  );
}
