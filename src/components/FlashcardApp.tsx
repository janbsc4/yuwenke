import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import type {
  CardType,
  Filters,
  Flashcard,
  SessionTally,
  ProgressStatus,
  StudyUnit,
  StudyView,
} from "../types";
import {
  createStudyUnits,
  matchesFilters,
  progressForStudyUnits,
  shuffle,
  unitBelongsToView,
  visibleUnits,
} from "../lib/study";
import { topicLabel } from "../lib/labels";
import { useProgressSync } from "../hooks/useProgressSync";
import { StudyCard } from "./StudyCard";

interface FlashcardAppProps {
  cards: Flashcard[];
}

const VIEW_LABELS: Record<StudyView, string> = {
  study: "Estudiar",
  discover: "Descubrir",
  mastered: "Dominadas",
  favorites: "Favoritas",
};

const TYPE_LABELS: Record<CardType, string> = {
  palabra: "Palabra",
  frase: "Frase",
  concepto: "Concepto",
};

const EMPTY_FILTERS: Filters = { query: "", topic: "all", type: "all" };
const EMPTY_TALLY: SessionTally = { primary: 0, secondary: 0, skipped: 0 };

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "Tú";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join("");
}

function plural(value: number, singular: string, pluralForm = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

function readPreference(key: string): string | null {
  try {
    return window.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writePreference(key: string, value: string): void {
  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // Preferences are optional; progress storage reports its own failures.
  }
}

function primaryDecisionLabel(
  view: StudyView,
  status: ProgressStatus | undefined,
): string {
  if (view === "study") return "Seguir aprendiendo";
  if (view === "discover") return "Añadir a aprendizaje";
  if (view === "mastered" || status === "known") return "Sigue dominada";
  return status === "learning" ? "Seguir aprendiendo" : "Añadir a aprendizaje";
}

function secondaryDecisionLabel(
  view: StudyView,
  status: ProgressStatus | undefined,
): string {
  if (view === "mastered" || (view === "favorites" && status === "known")) {
    return "Volver a aprendizaje";
  }
  return "Ya la sé";
}

export default function FlashcardApp({ cards }: FlashcardAppProps) {
  const units = useMemo(() => createStudyUnits(cards), [cards]);
  const topics = useMemo(
    () => [...new Set(cards.map((card) => card.tema))].sort((a, b) => a.localeCompare(b, "es")),
    [cards],
  );
  const {
    progress,
    favorites,
    ready,
    storageAvailable,
    user,
    syncState,
    firebaseConfigured,
    firebaseReady,
    notice,
    setStatus,
    setFavorite,
    signIn,
    signOut,
    retry,
    clearNotice,
  } = useProgressSync();

  const [activeView, setActiveView] = useState<StudyView>("discover");
  const [initializedOwner, setInitializedOwner] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [queue, setQueue] = useState<StudyUnit[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [tally, setTally] = useState<SessionTally>(EMPTY_TALLY);
  const [sessionNonce, setSessionNonce] = useState(0);
  const [queueContext, setQueueContext] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLHeadingElement>(null);
  const answerRef = useRef<HTMLElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const loginButtonRef = useRef<HTMLButtonElement>(null);
  const filterDialogRef = useRef<HTMLElement>(null);
  const loginDialogRef = useRef<HTMLElement>(null);
  const helpDialogRef = useRef<HTMLElement>(null);
  const helpTriggerRef = useRef<HTMLButtonElement>(null);
  const studyProgress = useMemo(
    () => progressForStudyUnits(cards, progress),
    [cards, progress],
  );

  const counts = useMemo(() => {
    const filtered = units.filter((unit) => matchesFilters(unit.card, filters));
    return {
      study: filtered.filter((unit) =>
        unitBelongsToView(unit, "study", studyProgress),
      ).length,
      discover: filtered.filter((unit) =>
        unitBelongsToView(unit, "discover", studyProgress),
      ).length,
      mastered: filtered.filter((unit) =>
        unitBelongsToView(unit, "mastered", studyProgress),
      ).length,
      favorites: filtered.filter((unit) =>
        unitBelongsToView(unit, "favorites", studyProgress, favorites),
      ).length,
    };
  }, [favorites, filters, studyProgress, units]);

  const hasFilters = filters.query.trim() !== "" || filters.topic !== "all" || filters.type !== "all";
  const filterCount = Number(filters.topic !== "all") + Number(filters.type !== "all");
  const current = queue[queueIndex];
  const currentStatus = current ? studyProgress[current.key]?.status : undefined;
  const currentFavorite = current
    ? favorites[current.cardId]?.favorite === true
    : false;
  const ownerKey = user?.uid ?? "guest";
  const viewInitialized = initializedOwner === ownerKey;
  const desiredQueueContext = useMemo(
    () =>
      JSON.stringify([
        activeView,
        filters.query,
        filters.topic,
        filters.type,
        ownerKey,
        sessionNonce,
      ]),
    [activeView, filters, ownerKey, sessionNonce],
  );
  const queueReady = queueContext === desiredQueueContext;

  useEffect(() => {
    if (!ready || viewInitialized) return;
    const stored = readPreference("yuwenke:last-view:v1") as StudyView | null;
    const candidate = stored && counts[stored] > 0 ? stored : null;
    const initial =
      counts.study > 0
        ? "study"
        : candidate ??
          (counts.discover > 0
            ? "discover"
            : counts.favorites > 0
              ? "favorites"
              : "mastered");
    setActiveView(initial);
    setInitializedOwner(ownerKey);
  }, [counts, ownerKey, ready, viewInitialized]);

  useEffect(() => {
    if (!ready || !viewInitialized) return;
    writePreference("yuwenke:last-view:v1", activeView);
    const nextQueue = shuffle(
      visibleUnits(units, activeView, studyProgress, filters, favorites),
    );
    setQueue(nextQueue);
    setQueueIndex(0);
    setRevealed(false);
    setCompleted(false);
    setTally(EMPTY_TALLY);
    setQueueContext(desiredQueueContext);
  }, [desiredQueueContext, ready, units, viewInitialized]);

  useEffect(() => {
    if (revealed) answerRef.current?.focus();
  }, [revealed]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(clearNotice, 6000);
    return () => window.clearTimeout(timeout);
  }, [clearNotice, notice]);

  useEffect(() => {
    const dialog = helpOpen
      ? helpDialogRef.current
      : loginOpen
        ? loginDialogRef.current
        : filterSheetOpen
          ? filterDialogRef.current
          : null;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    );
    focusable[0]?.focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", trapFocus);
    return () => dialog.removeEventListener("keydown", trapFocus);
  }, [filterSheetOpen, helpOpen, loginOpen]);

  const closeFilterSheet = useCallback(() => {
    setFilterSheetOpen(false);
    window.setTimeout(() => filterButtonRef.current?.focus(), 0);
  }, []);

  const closeLogin = useCallback(() => {
    setLoginOpen(false);
    window.setTimeout(() => loginButtonRef.current?.focus(), 0);
  }, []);

  const openHelp = useCallback((trigger: HTMLButtonElement) => {
    helpTriggerRef.current = trigger;
    setFilterSheetOpen(false);
    setHelpOpen(true);
  }, []);

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    window.setTimeout(() => {
      const trigger = helpTriggerRef.current;
      if (trigger?.isConnected) trigger.focus();
      else filterButtonRef.current?.focus();
    }, 0);
  }, []);

  const advance = useCallback(() => {
    let nextIndex = queueIndex + 1;
    while (
      nextIndex < queue.length &&
      !unitBelongsToView(
        queue[nextIndex],
        activeView,
        studyProgress,
        favorites,
      )
    ) {
      nextIndex += 1;
    }

    if (nextIndex >= queue.length) {
      setCompleted(true);
      setRevealed(false);
      return;
    }

    setQueueIndex(nextIndex);
    setRevealed(false);
    window.setTimeout(() => promptRef.current?.focus(), 0);
  }, [activeView, favorites, queue, queueIndex, studyProgress]);

  useEffect(() => {
    if (!queueReady || completed || !current) return;
    if (
      unitBelongsToView(current, activeView, studyProgress, favorites)
    ) {
      return;
    }
    if (activeView === "favorites" && counts.favorites === 0) {
      setQueue([]);
      setQueueIndex(0);
      setRevealed(false);
      setCompleted(false);
      return;
    }
    advance();
  }, [
    activeView,
    advance,
    completed,
    counts.favorites,
    current,
    favorites,
    queueReady,
    studyProgress,
  ]);

  const choosePrimary = useCallback(() => {
    if (!current || !revealed) return;
    const status =
      activeView === "mastered" ||
      (activeView === "favorites" && currentStatus === "known")
        ? "known"
        : "learning";
    setStatus(current.cardId, current.direction, status);
    setTally((value) => ({ ...value, primary: value.primary + 1 }));
    advance();
  }, [activeView, advance, current, currentStatus, revealed, setStatus]);

  const chooseSecondary = useCallback(() => {
    if (!current || !revealed) return;
    const status =
      activeView === "mastered" ||
      (activeView === "favorites" && currentStatus === "known")
        ? "learning"
        : "known";
    setStatus(current.cardId, current.direction, status);
    setTally((value) => ({ ...value, secondary: value.secondary + 1 }));
    advance();
  }, [activeView, advance, current, currentStatus, revealed, setStatus]);

  const skip = useCallback(() => {
    if (!current || activeView !== "discover") return;
    setTally((value) => ({ ...value, skipped: value.skipped + 1 }));
    advance();
  }, [activeView, advance, current]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField =
        target instanceof Element &&
        target.matches("input, select, textarea, button, [contenteditable='true']");
      if (event.key === "Escape") {
        if (helpOpen) closeHelp();
        else if (filterSheetOpen) closeFilterSheet();
        else if (loginOpen) closeLogin();
        else if (accountOpen) setAccountOpen(false);
        return;
      }
      if (filterSheetOpen || helpOpen || loginOpen || accountOpen) return;
      if (event.key === "/" && !inField) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (inField || completed || !current) return;
      if (event.code === "Space" && !revealed) {
        event.preventDefault();
        setRevealed(true);
      } else if (event.key === "1" && revealed) {
        choosePrimary();
      } else if (event.key === "2" && revealed) {
        chooseSecondary();
      } else if (event.key === "3" && activeView === "discover") {
        skip();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    accountOpen,
    activeView,
    choosePrimary,
    chooseSecondary,
    closeFilterSheet,
    closeHelp,
    closeLogin,
    completed,
    current,
    filterSheetOpen,
    helpOpen,
    loginOpen,
    revealed,
    skip,
  ]);

  const changeQuery = (event: ChangeEvent<HTMLInputElement>) => {
    setFilters((value) => ({ ...value, query: event.target.value }));
  };

  const resetFilters = () => setFilters(EMPTY_FILTERS);

  const changeView = (view: StudyView) => {
    setActiveView(view);
    setAccountOpen(false);
  };

  const startNewSession = () => setSessionNonce((value) => value + 1);

  if (!ready || !viewInitialized) {
    return (
      <div className="app-shell loading-shell" aria-live="polite">
        <div className="loading-brand skeleton" />
        <div className="loading-progress skeleton" />
        <div className="loading-card skeleton" />
        <p>Preparando tus tarjetas…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Yuwenke, inicio">
          <img
            className="brand-mark"
            src={`${import.meta.env.BASE_URL}yuwenke-mark.svg`}
            alt=""
            width="48"
            height="48"
          />
          <span>
            <strong>Yuwenke</strong>
            <small>Aprende Mucho Chino</small>
          </span>
        </a>

        <div className="account-area">
          <span className={`sync-label sync-${syncState}`}>
            {user
              ? syncState === "syncing"
                ? "Sincronizando…"
                : syncState === "synced"
                  ? "Sincronizado"
                  : syncState === "offline"
                    ? "Sin conexión · cambios pendientes"
                    : syncState === "error"
                      ? "No se pudo sincronizar"
                      : "Guardado local"
              : "Solo en este dispositivo"}
          </span>
          {syncState === "error" && user ? (
            <button className="text-button" type="button" onClick={() => void retry()}>
              Reintentar
            </button>
          ) : null}
          {user ? (
            <div className="account-menu-wrap">
              <button
                type="button"
                className="avatar-button"
                aria-label="Abrir menú de cuenta"
                aria-expanded={accountOpen}
                onClick={() => setAccountOpen((value) => !value)}
              >
                {initials(user.displayName, user.email)}
              </button>
              {accountOpen ? (
                <div className="account-menu" role="menu">
                  <strong>{user.displayName || "Tu cuenta"}</strong>
                  <span>{user.email}</span>
                  <button type="button" role="menuitem" onClick={() => void signOut()}>
                    Cerrar sesión
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              className="button button-small button-ink"
              onClick={() => setLoginOpen(true)}
              ref={loginButtonRef}
              title={firebaseConfigured ? undefined : "La sincronización aún no está configurada"}
            >
              Iniciar sesión
            </button>
          )}
        </div>
      </header>

      <nav className="view-tabs" aria-label="Modos de estudio">
        {(Object.keys(VIEW_LABELS) as StudyView[]).map((view) => (
          <button
            type="button"
            key={view}
            className={view === activeView ? "is-active" : ""}
            aria-current={view === activeView ? "page" : undefined}
            onClick={() => changeView(view)}
          >
            <span>{VIEW_LABELS[view]}</span>
            <span className="count-pill">{counts[view]}</span>
          </button>
        ))}
      </nav>

      {!user ? (
        <aside className="guest-note">
          <p>
            Estás estudiando como invitado. Tu progreso y favoritas se guardan en
            este dispositivo.
          </p>
          <button type="button" className="text-button" onClick={() => setLoginOpen(true)}>
            Sincronizar con Google
          </button>
        </aside>
      ) : null}

      {!storageAvailable ? (
        <div className="inline-alert" role="status">
          Tu progreso y favoritas no se guardarán en este dispositivo.
        </div>
      ) : null}

      {notice ? (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button type="button" aria-label="Cerrar aviso" onClick={clearNotice}>
            ×
          </button>
        </div>
      ) : null}

      <div className="search-row">
        <label className="search-field">
          <span className="sr-only">Buscar en las tarjetas</span>
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="Busca caracteres, pinyin o español…"
            value={filters.query}
            onChange={changeQuery}
            ref={searchRef}
          />
          {filters.query ? (
            <button
              type="button"
              aria-label="Borrar búsqueda"
              onClick={() => setFilters((value) => ({ ...value, query: "" }))}
            >
              ×
            </button>
          ) : null}
        </label>
        <button
          type="button"
          className="button filter-trigger"
          onClick={() => setFilterSheetOpen(true)}
          ref={filterButtonRef}
        >
          {filterCount > 0 ? `Filtros · ${filterCount}` : "Filtros"}
        </button>
      </div>

      <main className="study-layout">
        <aside className="filter-panel" aria-label="Filtros">
          <div className="panel-heading">
            <p className="eyebrow">Tu colección</p>
            <p>{plural(units.length, "práctica", "prácticas")}</p>
          </div>
          <label>
            Tema
            <select
              value={filters.topic}
              onChange={(event) => setFilters((value) => ({ ...value, topic: event.target.value }))}
            >
              <option value="all">Todos los temas</option>
              {topics.map((topic) => (
                <option value={topic} key={topic}>
                  {topicLabel(topic)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo
            <select
              value={filters.type}
              onChange={(event) =>
                setFilters((value) => ({ ...value, type: event.target.value as Filters["type"] }))
              }
            >
              <option value="all">Todos los tipos</option>
              {(Object.keys(TYPE_LABELS) as CardType[]).map((type) => (
                <option value={type} key={type}>
                  {TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          {hasFilters ? (
            <button type="button" className="text-button align-left" onClick={resetFilters}>
              Limpiar filtros
            </button>
          ) : null}
          <div className="direction-legend">
            <span>中 → ES</span>
            <span>ES → 中</span>
            <button
              type="button"
              className="text-button how-it-works"
              onClick={(event) => openHelp(event.currentTarget)}
            >
              ¿Cómo funciona?
            </button>
          </div>
        </aside>

        <section className="session-panel" aria-label={`${VIEW_LABELS[activeView]} tarjetas`}>
          {!queueReady ? (
            <div className="queue-loading" aria-live="polite">
              <div className="loading-progress skeleton" />
              <div className="loading-card skeleton" />
              <p>Preparando esta cola…</p>
            </div>
          ) : current && !completed ? (
            <>
              <div className="session-progress" aria-live="polite">
                <div>
                  <span>
                    Tarjeta {queueIndex + 1} de {queue.length}
                  </span>
                  <span className="direction-badge">
                    {current.card.tipo === "concepto"
                      ? "Concepto · Español"
                      : current.direction === "hanzi-es"
                        ? "Chino → Español"
                        : "Español → Chino"}
                  </span>
                </div>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label="Progreso de la sesión"
                  aria-valuemin={0}
                  aria-valuemax={queue.length}
                  aria-valuenow={queueIndex + 1}
                >
                  <span style={{ width: `${((queueIndex + 1) / queue.length) * 100}%` }} />
                </div>
              </div>

              <StudyCard
                unit={current}
                revealed={revealed}
                favorite={currentFavorite}
                onToggleFavorite={() =>
                  setFavorite(current.cardId, !currentFavorite)
                }
                promptRef={promptRef}
                ref={answerRef}
              />

              <div className="decision-area">
                {!revealed ? (
                  <button type="button" className="button button-primary reveal-button" onClick={() => setRevealed(true)}>
                    Mostrar respuesta <kbd>Espacio</kbd>
                  </button>
                ) : (
                  <div className="decision-buttons">
                    <button type="button" className="button button-primary" onClick={choosePrimary}>
                      {primaryDecisionLabel(activeView, currentStatus)}
                      <kbd>1</kbd>
                    </button>
                    <button type="button" className="button button-secondary" onClick={chooseSecondary}>
                      {secondaryDecisionLabel(activeView, currentStatus)}
                      <kbd>2</kbd>
                    </button>
                  </div>
                )}
                {activeView === "discover" ? (
                  <button type="button" className="skip-button" onClick={skip}>
                    Saltar <kbd>3</kbd>
                  </button>
                ) : null}
              </div>
            </>
          ) : completed ? (
            <SessionSummary
              view={activeView}
              tally={tally}
              onRestart={startNewSession}
              onChangeView={changeView}
              learningCount={counts.study}
              discoverRemaining={counts.discover}
            />
          ) : (
            <EmptyState
              view={activeView}
              filtered={hasFilters}
              learningCount={counts.study}
              onClear={resetFilters}
              onChangeView={changeView}
            />
          )}
        </section>
      </main>

      {filterSheetOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeFilterSheet}>
          <section
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="filter-title"
            ref={filterDialogRef}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <h2 id="filter-title">Filtrar tarjetas</h2>
              <button type="button" aria-label="Cerrar filtros" onClick={closeFilterSheet}>×</button>
            </div>
            <label>
              Tema
              <select
                value={filters.topic}
                onChange={(event) => setFilters((value) => ({ ...value, topic: event.target.value }))}
              >
                <option value="all">Todos los temas</option>
                {topics.map((topic) => (
                  <option value={topic} key={topic}>{topicLabel(topic)}</option>
                ))}
              </select>
            </label>
            <label>
              Tipo
              <select
                value={filters.type}
                onChange={(event) =>
                  setFilters((value) => ({ ...value, type: event.target.value as Filters["type"] }))
                }
              >
                <option value="all">Todos los tipos</option>
                {(Object.keys(TYPE_LABELS) as CardType[]).map((type) => (
                  <option value={type} key={type}>{TYPE_LABELS[type]}</option>
                ))}
              </select>
            </label>
            <button type="button" className="button button-primary" onClick={closeFilterSheet}>
              Aplicar filtros
            </button>
            <button type="button" className="text-button" onClick={resetFilters}>
              Limpiar filtros
            </button>
            <div className="direction-legend sheet-direction-legend">
              <span>中 → ES</span>
              <span>ES → 中</span>
              <button
                type="button"
                className="text-button how-it-works"
                onClick={(event) => openHelp(event.currentTarget)}
              >
                ¿Cómo funciona?
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {helpOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeHelp}>
          <section
            className="help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            ref={helpDialogRef}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <h2 id="help-title">Cómo funciona Yuwenke</h2>
              <button type="button" aria-label="Cerrar explicación" onClick={closeHelp}>×</button>
            </div>

            <ol className="help-steps">
              <li>
                <strong>Descubrir</strong>
                <p>
                  Mira tarjetas nuevas y decide si quieres añadirlas a aprendizaje,
                  marcarlas como dominadas o saltarlas por ahora.
                </p>
              </li>
              <li>
                <strong>Estudiar</strong>
                <p>
                  Practica lo que estás aprendiendo. Después de ver la respuesta,
                  mantenlo en estudio o pásalo a Dominadas.
                </p>
              </li>
              <li>
                <strong>Dominadas</strong>
                <p>
                  Repasa lo que ya sabes y devuelve a Estudiar cualquier ficha que
                  quieras reforzar.
                </p>
              </li>
              <li>
                <strong>Favoritas</strong>
                <p>
                  Marca una tarjeta con la estrella para tener sus prácticas
                  siempre disponibles en una cola personal.
                </p>
              </li>
            </ol>

            <div className="help-details">
              <p>
                Las palabras y frases se practican por separado en chino → español
                y español → chino. Los conceptos plantean una sola pregunta en
                español para recordar la regla. La búsqueda y los filtros solo
                cambian qué fichas ves en la cola actual.
              </p>
              <p>
                Los nombres propios se muestran en{" "}
                <span className="proper-name">lila</span> en caracteres chinos,
                pinyin y español.
              </p>
              <p>
                Como invitado, el progreso se guarda en este dispositivo. Si inicias
                sesión con Google, tus estados y favoritas también se sincronizan
                entre dispositivos.
              </p>
            </div>
          </section>
        </div>
      ) : null}

      {loginOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeLogin}>
          <section
            className="login-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-title"
            ref={loginDialogRef}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-mark" lang="zh-Hans" aria-hidden="true">记</div>
            <h2 id="login-title">Guarda tu progreso</h2>
            <p>
              Inicia sesión para continuar en otros dispositivos. El progreso y las
              favoritas guardados aquí se conservarán al sincronizar.
            </p>
            {firebaseConfigured ? (
              <button
                type="button"
                className="button button-primary google-button"
                disabled={!firebaseReady}
                onClick={() => {
                  void signIn();
                  setLoginOpen(false);
                }}
              >
                <span aria-hidden="true">G</span>{" "}
                {firebaseReady ? "Continuar con Google" : "Preparando Google…"}
              </button>
            ) : (
              <p className="config-note">
                La sincronización todavía no está configurada. Puedes seguir estudiando en este dispositivo.
              </p>
            )}
            <button type="button" className="text-button" onClick={closeLogin}>Ahora no</button>
          </section>
        </div>
      ) : null}

      <div className="sr-only" aria-live="polite">
        {queueReady && current && !completed
          ? `Tarjeta ${queueIndex + 1} de ${queue.length}`
          : ""}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  view: StudyView;
  filtered: boolean;
  learningCount: number;
  onClear: () => void;
  onChangeView: (view: StudyView) => void;
}

function EmptyState({ view, filtered, learningCount, onClear, onChangeView }: EmptyStateProps) {
  if (filtered) {
    return (
      <div className="empty-state">
        <span aria-hidden="true">空</span>
        <h2>No hay tarjetas que coincidan con estos filtros.</h2>
        <button type="button" className="button button-primary" onClick={onClear}>Limpiar filtros</button>
      </div>
    );
  }
  if (view === "study") {
    return (
      <div className="empty-state">
        <span aria-hidden="true">学</span>
        <h2>Aún no tienes tarjetas en aprendizaje.</h2>
        <p>Clasifica algunas tarjetas para empezar a practicar.</p>
        <button type="button" className="button button-primary" onClick={() => onChangeView("discover")}>Ir a Descubrir</button>
      </div>
    );
  }
  if (view === "discover") {
    return (
      <div className="empty-state">
        <span aria-hidden="true">完</span>
        <h2>Ya has clasificado todas las tarjetas.</h2>
        <div className="empty-actions">
          {learningCount > 0 ? (
            <button type="button" className="button button-primary" onClick={() => onChangeView("study")}>Ir a Estudiar</button>
          ) : null}
          <button type="button" className="button button-secondary" onClick={() => onChangeView("mastered")}>Ver dominadas</button>
        </div>
      </div>
    );
  }
  if (view === "favorites") {
    return (
      <div className="empty-state">
        <span aria-hidden="true">★</span>
        <h2>Aún no tienes tarjetas favoritas.</h2>
        <p>Usa la estrella de cualquier tarjeta para añadirla a esta cola.</p>
        <button
          type="button"
          className="button button-primary"
          onClick={() => onChangeView("discover")}
        >
          Ir a Descubrir
        </button>
      </div>
    );
  }
  return (
    <div className="empty-state">
      <span aria-hidden="true">熟</span>
      <h2>Aún no has marcado ninguna tarjeta como dominada.</h2>
      <button type="button" className="button button-primary" onClick={() => onChangeView("discover")}>Ir a Descubrir</button>
    </div>
  );
}

interface SessionSummaryProps {
  view: StudyView;
  tally: SessionTally;
  onRestart: () => void;
  onChangeView: (view: StudyView) => void;
  learningCount: number;
  discoverRemaining: number;
}

function SessionSummary({
  view,
  tally,
  onRestart,
  onChangeView,
  learningCount,
  discoverRemaining,
}: SessionSummaryProps) {
  const title =
    view === "study"
      ? "Sesión completada"
      : view === "discover"
        ? "Selección completada"
        : view === "favorites"
          ? "Repaso de favoritas completado"
          : "Revisión completada";
  return (
    <div className="summary-card">
      <span className="summary-mark" lang="zh-Hans" aria-hidden="true">好</span>
      <p className="eyebrow">Buen trabajo</p>
      <h2>{title}</h2>
      <div className="summary-stats">
        {view === "study" ? (
          <>
            <p><strong>{tally.primary}</strong><span>{tally.primary === 1 ? "sigue en aprendizaje" : "siguen en aprendizaje"}</span></p>
            <p><strong>{tally.secondary}</strong><span>{tally.secondary === 1 ? "pasó a Dominadas" : "pasaron a Dominadas"}</span></p>
          </>
        ) : view === "discover" ? (
          <>
            <p><strong>{tally.primary}</strong><span>{tally.primary === 1 ? "añadida a aprendizaje" : "añadidas a aprendizaje"}</span></p>
            <p><strong>{tally.secondary}</strong><span>{tally.secondary === 1 ? "marcada como dominada" : "marcadas como dominadas"}</span></p>
            <p><strong>{tally.skipped}</strong><span>{tally.skipped === 1 ? "saltada" : "saltadas"}</span></p>
          </>
        ) : view === "favorites" ? (
          <p>
            <strong>{tally.primary + tally.secondary}</strong>
            <span>
              {tally.primary + tally.secondary === 1
                ? "favorita practicada"
                : "favoritas practicadas"}
            </span>
          </p>
        ) : (
          <>
            <p><strong>{tally.primary}</strong><span>{tally.primary === 1 ? "sigue dominada" : "siguen dominadas"}</span></p>
            <p><strong>{tally.secondary}</strong><span>{tally.secondary === 1 ? "volvió a aprendizaje" : "volvieron a aprendizaje"}</span></p>
          </>
        )}
      </div>
      {view === "discover" && discoverRemaining > 0 ? (
        <p className="summary-remaining">
          {plural(
            discoverRemaining,
            "práctica sigue sin clasificar",
            "prácticas siguen sin clasificar",
          )}
          .
        </p>
      ) : null}
      <div className="summary-actions">
        {view !== "discover" || discoverRemaining > 0 ? (
          <button type="button" className="button button-primary" onClick={onRestart}>
            {view === "study"
              ? "Nueva sesión"
              : view === "discover"
                ? `Seguir descubriendo (${discoverRemaining})`
                : view === "favorites"
                  ? "Repasar de nuevo"
                  : "Revisar de nuevo"}
          </button>
        ) : null}
        {learningCount > 0 ? (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onChangeView("study")}
          >
            Ir a Estudiar
          </button>
        ) : view === "discover" && discoverRemaining === 0 ? (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onChangeView("mastered")}
          >
            Ver dominadas
          </button>
        ) : (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onChangeView("discover")}
          >
            Ir a Descubrir
          </button>
        )}
      </div>
    </div>
  );
}
