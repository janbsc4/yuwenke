import type { RefObject } from "react";

import { plural } from "../lib/labels";
import type { CardPack } from "../types";
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
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Elige tu próximo pack</p>
                <h2 id="packs-title">Packs de cartas</h2>
              </div>
              <button type="button" aria-label="Cerrar packs" onClick={onClosePanel}>×</button>
            </div>
            <p className="packs-intro">
              Elige cualquier pack para añadir sus cartas a Descubrir. Una vez abierto,
              permanecerá en tu colección.
            </p>
            {openedOutsideDiscover ? (
              <div className="pack-opened-notice" role="status">
                <p>«{openedOutsideDiscover.title}» ya está abierto.</p>
                <button type="button" className="button button-primary" onClick={onGoToDiscover}>
                  Ir a Descubrir
                </button>
              </div>
            ) : null}
            {unopenedPacks.length > 0 ? (
              <section className="pack-shelf" aria-labelledby="unopened-packs-title">
                <div className="pack-shelf__heading">
                  <h3 id="unopened-packs-title">Por abrir</h3>
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
                          aria-label={`Abrir ${pack.title}: ${plural(unitCount, "carta")}. ${pack.description}`}
                          onClick={() => onRequestOpen(pack)}
                        >
                          <CardPackBooster pack={pack} unitCount={unitCount} />
                        </button>
                        <div className="pack-choice__details">
                          <span className="pack-status">Sin abrir</span>
                          <h4>{pack.title}</h4>
                          <p>{pack.description}</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}
            <section className="pack-shelf" aria-labelledby="opened-packs-title">
              <div className="pack-shelf__heading">
                <h3 id="opened-packs-title">Abiertos</h3>
                <span>{openedPacks.length}</span>
              </div>
              <div className="pack-grid">
                {openedPacks.map((pack) => {
                  const unitCount = packUnitCounts[pack.id] ?? 0;
                  return (
                    <article
                      className="pack-choice pack-choice--opened"
                      aria-label={`${pack.title}, abierto: ${plural(unitCount, "carta")}. ${pack.description}`}
                      key={pack.id}
                    >
                      <CardPackBooster pack={pack} unitCount={unitCount} state="opened" />
                      <div className="pack-choice__details">
                        <span className="pack-status">Abierto</span>
                        <h4>{pack.title}</h4>
                        <p>{pack.description}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
            <div className="packs-footer">
              <button type="button" className="text-button destructive-text" onClick={onRequestReset}>
                Restablecer estudio
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {packToConfirm ? (
        <div
          className="modal-backdrop pack-confirm-backdrop"
          role="presentation"
          onMouseDown={() => !packOpening && onCancelOpen()}
        >
          <section
            className="confirm-dialog pack-opening-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="open-pack-title"
            aria-busy={packOpening}
            ref={packConfirmRef}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="pack-opening-stage">
              <CardPackBooster
                pack={packToConfirm}
                unitCount={packUnitCounts[packToConfirm.id] ?? 0}
                state={packOpening ? "opening" : "sealed"}
              />
            </div>
            <div className="pack-opening-copy">
              <p className="eyebrow">{packOpening ? "Abriendo pack" : "Listo para abrir"}</p>
              <h2 id="open-pack-title">Abrir {packToConfirm.title}</h2>
              <p>
                Sus {plural(packUnitCounts[packToConfirm.id] ?? 0, "carta")} nuevas
                estarán disponibles en Descubrir. Este pack no se podrá cerrar por separado.
              </p>
              <p className="sr-only" role="status" aria-live="polite">
                {packOpening ? `Abriendo ${packToConfirm.title}…` : ""}
              </p>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={packOpening}
                  onClick={onConfirmOpen}
                >
                  {packOpening ? "Abriendo…" : `Abrir «${packToConfirm.title}»`}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={packOpening}
                  onClick={onCancelOpen}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {resetOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !resetting && onCancelReset()}>
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            ref={resetRef}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Acción destructiva</p>
            <h2 id="reset-title">Restablecer estudio</h2>
            <p>
              Se borrarán el progreso y las favoritas, y solo quedará abierto
              «{packs[0].title}». Tus preferencias {authenticated ? "y tu sesión" : "de interfaz"} se conservarán.
            </p>
            {authenticated ? <p>Necesitamos confirmación del servidor antes de borrar los datos locales.</p> : null}
            <div className="confirm-actions">
              <button
                type="button"
                className="button button-danger"
                disabled={resetting}
                onClick={onConfirmReset}
              >
                {resetting ? "Restableciendo…" : "Borrar progreso y restablecer"}
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={resetting}
                onClick={onCancelReset}
              >
                Cancelar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
