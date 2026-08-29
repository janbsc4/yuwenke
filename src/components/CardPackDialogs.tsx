import type { RefObject } from "react";

import { localized } from "../lib/locale";
import type { Messages } from "../lib/messages";
import type { CardPack, Locale } from "../types";
import { CardPackBooster } from "./CardPackBooster";

interface CardPackDialogsProps {
  packs: CardPack[];
  packUnitCounts: Record<string, number>;
  openPackIds: ReadonlySet<string>;
  panelOpen: boolean;
  packToConfirm: CardPack | null;
  packOpening: boolean;
  openedOutsideDiscover: CardPack | null;
  resetOpen: boolean;
  resetting: boolean;
  authenticated: boolean;
  panelRef: RefObject<HTMLElement | null>;
  packConfirmRef: RefObject<HTMLElement | null>;
  resetRef: RefObject<HTMLElement | null>;
  onClosePanel: () => void;
  onRequestOpen: (pack: CardPack) => void;
  onCancelOpen: () => void;
  onConfirmOpen: () => void;
  onGoToDiscover: () => void;
  onRequestReset: () => void;
  onCancelReset: () => void;
  onConfirmReset: () => void;
  m: Messages;
  locale: Locale;
}

export function CardPackDialogs({
  packs,
  packUnitCounts,
  openPackIds,
  panelOpen,
  packToConfirm,
  packOpening,
  openedOutsideDiscover,
  resetOpen,
  resetting,
  authenticated,
  panelRef,
  packConfirmRef,
  resetRef,
  onClosePanel,
  onRequestOpen,
  onCancelOpen,
  onConfirmOpen,
  onGoToDiscover,
  onRequestReset,
  onCancelReset,
  onConfirmReset,
  m,
  locale,
}: CardPackDialogsProps) {
  const unopenedPacks = packs.filter((pack) => !openPackIds.has(pack.id));
  const openedPacks = packs.filter((pack) => openPackIds.has(pack.id));

  return (
    <>
      {panelOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={onClosePanel}>
          <section
            className="packs-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="packs-title"
            ref={panelRef}
            onMouseDown={(event) => { event.stopPropagation(); }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{m.packs.panelEyebrow}</p>
                <h2 id="packs-title">{m.packs.panelTitle}</h2>
              </div>
              <button type="button" aria-label={m.packs.closeAria} onClick={onClosePanel}>×</button>
            </div>
            <p className="packs-intro">{m.packs.intro}</p>
            {openedOutsideDiscover ? (
              <div className="pack-opened-notice" role="status">
                <p>{m.packs.openedNotice(localized(openedOutsideDiscover.title, locale))}</p>
                <button type="button" className="button button-primary" onClick={onGoToDiscover}>
                  {m.packs.goToDiscover}
                </button>
              </div>
            ) : null}
            {unopenedPacks.length > 0 ? (
              <section className="pack-shelf" aria-labelledby="unopened-packs-title">
                <div className="pack-shelf__heading">
                  <h3 id="unopened-packs-title">{m.packs.unopenedTitle}</h3>
                  <span>{unopenedPacks.length}</span>
                </div>
                <div className="pack-grid">
                  {unopenedPacks.map((pack) => {
                    const unitCount = packUnitCounts[pack.id] ?? 0;
                    return (
                      <article className="pack-choice" key={pack.id}>
                        <button
                          type="button"
                          className="pack-choice__booster"
                          aria-label={m.packs.openAria(
                            localized(pack.title, locale),
                            unitCount,
                            localized(pack.description, locale),
                          )}
                          onClick={() => { onRequestOpen(pack); }}
                        >
                          <CardPackBooster pack={pack} unitCount={unitCount} m={m} locale={locale} />
                        </button>
                        <div className="pack-choice__details">
                          <span className="pack-status">{m.packs.unopenedStatus}</span>
                          <h4>{localized(pack.title, locale)}</h4>
                          <p>{localized(pack.description, locale)}</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}
            <section className="pack-shelf" aria-labelledby="opened-packs-title">
              <div className="pack-shelf__heading">
                <h3 id="opened-packs-title">{m.packs.openedTitle}</h3>
                <span>{openedPacks.length}</span>
              </div>
              <div className="pack-grid">
                {openedPacks.map((pack) => {
                  const unitCount = packUnitCounts[pack.id] ?? 0;
                  return (
                    <article
                      className="pack-choice pack-choice--opened"
                      aria-label={m.packs.openedAria(
                        localized(pack.title, locale),
                        unitCount,
                        localized(pack.description, locale),
                      )}
                      key={pack.id}
                    >
                      <CardPackBooster pack={pack} unitCount={unitCount} state="opened" m={m} locale={locale} />
                      <div className="pack-choice__details">
                        <span className="pack-status">{m.packs.openedStatus}</span>
                        <h4>{localized(pack.title, locale)}</h4>
                        <p>{localized(pack.description, locale)}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
            <div className="packs-footer">
              <button type="button" className="text-button destructive-text" onClick={onRequestReset}>
                {m.account.resetStudy}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {packToConfirm ? (
        <div
          className="modal-backdrop pack-confirm-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (!packOpening) onCancelOpen();
          }}
        >
          <section
            className="confirm-dialog pack-opening-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="open-pack-title"
            aria-busy={packOpening}
            ref={packConfirmRef}
            onMouseDown={(event) => { event.stopPropagation(); }}
          >
            <div className="pack-opening-stage">
              <CardPackBooster
                pack={packToConfirm}
                unitCount={packUnitCounts[packToConfirm.id] ?? 0}
                state={packOpening ? "opening" : "sealed"}
                m={m}
                locale={locale}
              />
            </div>
            <div className="pack-opening-copy">
              <p className="eyebrow">
                {packOpening ? m.packs.confirmEyebrowOpening : m.packs.confirmEyebrowReady}
              </p>
              <h2 id="open-pack-title">
                {m.packs.confirmTitle(localized(packToConfirm.title, locale))}
              </h2>
              <p>{m.packs.confirmBody(packUnitCounts[packToConfirm.id] ?? 0)}</p>
              <p className="sr-only" role="status" aria-live="polite">
                {packOpening
                  ? m.packs.confirmBusy(localized(packToConfirm.title, locale))
                  : ""}
              </p>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={packOpening}
                  onClick={onConfirmOpen}
                >
                  {packOpening
                    ? m.packs.opening
                    : m.packs.confirmOpen(localized(packToConfirm.title, locale))}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={packOpening}
                  onClick={onCancelOpen}
                >
                  {m.packs.cancel}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {resetOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (!resetting) onCancelReset();
          }}
        >
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            ref={resetRef}
            onMouseDown={(event) => { event.stopPropagation(); }}
          >
            <p className="eyebrow">{m.packs.resetEyebrow}</p>
            <h2 id="reset-title">{m.account.resetStudy}</h2>
            <p>
              {m.packs.resetDescription(
                localized(packs[0].title, locale),
                authenticated,
              )}
            </p>
            {authenticated ? <p>{m.packs.resetServerNote}</p> : null}
            <div className="confirm-actions">
              <button
                type="button"
                className="button button-danger"
                disabled={resetting}
                onClick={onConfirmReset}
              >
                {resetting ? m.packs.resetting : m.packs.resetConfirm}
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={resetting}
                onClick={onCancelReset}
              >
                {m.packs.cancel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
