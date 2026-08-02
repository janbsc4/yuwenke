import type { RefObject } from "react";

import { plural } from "../lib/labels";
import type { CardPack } from "../types";

interface CardPackDialogsProps {
  packs: CardPack[];
  packUnitCounts: Record<string, number>;
  openPackIds: ReadonlySet<string>;
  panelOpen: boolean;
  packToConfirm: CardPack | null;
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
                <p className="eyebrow">Tu recorrido</p>
                <h2 id="packs-title">Packs de tarjetas</h2>
              </div>
              <button type="button" aria-label="Cerrar packs" onClick={onClosePanel}>×</button>
            </div>
            <p className="packs-intro">
              Abre cualquier pack cuando quieras. Los packs ya abiertos no se cierran.
            </p>
            {openedOutsideDiscover ? (
              <div className="pack-opened-notice" role="status">
                <p>«{openedOutsideDiscover.title}» ya está abierto.</p>
                <button type="button" className="button button-primary" onClick={onGoToDiscover}>
                  Ir a Descubrir
                </button>
              </div>
            ) : null}
            <div className="pack-list">
              {packs.map((pack) => {
                const isOpen = openPackIds.has(pack.id);
                return (
                  <article className={`pack-card ${isOpen ? "is-open" : ""}`} key={pack.id}>
                    <div>
                      <span className="pack-status">{isOpen ? "Abierto" : "Sin abrir"}</span>
                      <h3>{pack.title}</h3>
                      <p>{pack.description}</p>
                      <small>{plural(packUnitCounts[pack.id] ?? 0, "práctica")}</small>
                    </div>
                    {!isOpen ? (
                      <button
                        type="button"
                        className="button button-secondary"
                        aria-label={`Abrir ${pack.title}`}
                        onClick={() => onRequestOpen(pack)}
                      >
                        Abrir
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
            <div className="packs-footer">
              <button type="button" className="text-button destructive-text" onClick={onRequestReset}>
                Restablecer estudio
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {packToConfirm ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={onCancelOpen}>
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="open-pack-title"
            ref={packConfirmRef}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Abrir pack</p>
            <h2 id="open-pack-title">Abrir {packToConfirm.title}</h2>
            <p>
              Sus {plural(packUnitCounts[packToConfirm.id] ?? 0, "práctica")} nuevas
              estarán disponibles en Descubrir. Este pack no se podrá cerrar por separado.
            </p>
            <div className="confirm-actions">
              <button type="button" className="button button-primary" onClick={onConfirmOpen}>
                Abrir «{packToConfirm.title}»
              </button>
              <button type="button" className="button button-secondary" onClick={onCancelOpen}>
                Cancelar
              </button>
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
