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
  CardPack,
  Filters,
  Flashcard,
  SessionTally,
  ProgressStatus,
  StudyUnit,
  StudyView,
  PackIdByCardId,
} from "../types";
import {
  createStudyUnits,
  matchesFilters,
  packOpeningThresholdReached,
  progressForStudyUnits,
  shuffle,
  unitBelongsToView,
  visibleUnits,
} from "../lib/study";
import { plural, topicLabel } from "../lib/labels";
import { useProgressSync } from "../hooks/useProgressSync";
import { StudyCard } from "./StudyCard";
import { CardPackDialogs } from "./CardPackDialogs";
import { CardPackBooster } from "./CardPackBooster";

interface FlashcardAppProps {
  cards: Flashcard[];
  packs: CardPack[];
  packIdByCardId: PackIdByCardId;
}

const VIEW_LABELS: Record<StudyView, string> = {
  study: "Estudiar",
  discover: "Descubrir",
  mastered: "Dominadas",
  favorites: "Favoritas",
};

const PACK_OPENING_DURATION_MS = 850;
const PACK_TRIGGER_OPENING_DURATION_MS = 160;

const TYPE_LABELS: Record<CardType, string> = {
  palabra: "Palabra",
  frase: "Frase",
  concepto: "Concepto",
};

const EMPTY_FILTERS: Filters = { query: "", topic: "all", type: "all" };
const EMPTY_TALLY: SessionTally = { primary: 0, secondary: 0, skipped: 0 };

function reducedMotionRequested(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "Tú";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join("");
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

export default function FlashcardApp({
  cards,
  packs,
  packIdByCardId,
}: FlashcardAppProps) {
  const orderedPackIds = useMemo(() => packs.map((pack) => pack.id), [packs]);
  const units = useMemo(() => createStudyUnits(cards), [cards]);
  const topics = useMemo(
    () => [...new Set(cards.map((card) => card.tema))].sort((a, b) => a.localeCompare(b, "es")),
    [cards],
  );
  const {
    progress,
    favorites,
    openPackIds,
    ready,
    storageAvailable,
    user,
    syncState,
    firebaseConfigured,
    firebaseReady,
    notice,
    resetting,
    setStatus,
    setFavorite,
    openPack,
    resetStudy,
    signIn,
    signOut,
    retry,
    clearNotice,
  } = useProgressSync({ orderedPackIds, packIdByCardId });
  const openPackIdSet = useMemo(() => new Set(openPackIds), [openPackIds]);

  const [activeView, setActiveView] = useState<StudyView>("discover");
  const [initializedOwner, setInitializedOwner] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [packsOpen, setPacksOpen] = useState(false);
  const [packTriggerOpening, setPackTriggerOpening] = useState(false);
  const [packToConfirm, setPackToConfirm] = useState<CardPack | null>(null);
  const [packOpening, setPackOpening] = useState(false);
  const [openedOutsideDiscover, setOpenedOutsideDiscover] = useState<CardPack | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [queue, setQueue] = useState<StudyUnit[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [tally, setTally] = useState<SessionTally>(EMPTY_TALLY);
  const [sessionNonce, setSessionNonce] = useState(0);
  const [queueContext, setQueueContext] = useState<string | null>(null);
  const previousOpenPackIdsRef = useRef(openPackIds);

  const searchRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLHeadingElement>(null);
  const answerRef = useRef<HTMLElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const loginButtonRef = useRef<HTMLButtonElement>(null);
  const filterDialogRef = useRef<HTMLElement>(null);
  const loginDialogRef = useRef<HTMLElement>(null);
  const helpDialogRef = useRef<HTMLElement>(null);
  const packsDialogRef = useRef<HTMLElement>(null);
  const packConfirmDialogRef = useRef<HTMLElement>(null);
  const resetDialogRef = useRef<HTMLElement>(null);
  const helpTriggerRef = useRef<HTMLButtonElement>(null);
  const studyProgress = useMemo(
    () => progressForStudyUnits(cards, progress),
    [cards, progress],
  );
  const packUnitCounts = useMemo(
    () =>
      Object.fromEntries(
        packs.map((pack) => [
          pack.id,
          units.filter((unit) => packIdByCardId[unit.cardId] === pack.id).length,
        ]),
      ),
    [packIdByCardId, packs, units],
  );
  const openUnitCount = useMemo(
    () =>
      units.filter((unit) => openPackIdSet.has(packIdByCardId[unit.cardId])).length,
    [openPackIdSet, packIdByCardId, units],
  );
  const suggestedPack = useMemo(
    () =>
      packs.find((pack) => !openPackIdSet.has(pack.id)) ?? null,
    [openPackIdSet, packs],
  );
  const suggestionEligible = useMemo(
    () =>
      suggestedPack !== null &&
      packOpeningThresholdReached(
        units,
        openPackIdSet,
        packIdByCardId,
        studyProgress,
      ),
    [openPackIdSet, packIdByCardId, studyProgress, suggestedPack, units],
  );

  const counts = useMemo(() => {
    const filtered = units.filter((unit) => matchesFilters(unit.card, filters));
    return {
      study: filtered.filter((unit) =>
        unitBelongsToView(unit, "study", studyProgress),
      ).length,
      discover: filtered.filter((unit) =>
        unitBelongsToView(unit, "discover", studyProgress) &&
        openPackIdSet.has(packIdByCardId[unit.cardId]),
      ).length,
      mastered: filtered.filter((unit) =>
        unitBelongsToView(unit, "mastered", studyProgress),
      ).length,
      favorites: filtered.filter((unit) =>
        unitBelongsToView(unit, "favorites", studyProgress, favorites),
      ).length,
    };
  }, [favorites, filters, openPackIdSet, packIdByCardId, studyProgress, units]);

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
      visibleUnits(
        units,
        activeView,
        studyProgress,
        filters,
        favorites,
        openPackIdSet,
        packIdByCardId,
      ),
    );
    setQueue(nextQueue);
    setQueueIndex(0);
    setRevealed(false);
    setCompleted(false);
    setTally(EMPTY_TALLY);
    setQueueContext(desiredQueueContext);
  }, [desiredQueueContext, ready, units, viewInitialized]);

  useEffect(() => {
    const previous = new Set(previousOpenPackIdsRef.current);
    previousOpenPackIdsRef.current = openPackIds;
    const newlyOpened = new Set(openPackIds.filter((packId) => !previous.has(packId)));
    if (
      newlyOpened.size === 0 ||
      activeView !== "discover" ||
      !queueReady
    ) {
      return;
    }

    setQueue((existingQueue) => {
      const existingKeys = new Set(existingQueue.map((unit) => unit.key));
      const additions = shuffle(
        units.filter(
          (unit) =>
            newlyOpened.has(packIdByCardId[unit.cardId]) &&
            !existingKeys.has(unit.key) &&
            unitBelongsToView(unit, "discover", studyProgress) &&
            matchesFilters(unit.card, filters),
        ),
      );
      if (additions.length === 0) return existingQueue;
      if (completed) {
        setQueueIndex(existingQueue.length);
        setCompleted(false);
        setRevealed(false);
      }
      return [...existingQueue, ...additions];
    });
  }, [
    activeView,
    completed,
    filters,
    openPackIds,
    packIdByCardId,
    queueReady,
    studyProgress,
    units,
  ]);

  useEffect(() => {
    if (revealed) answerRef.current?.focus();
  }, [revealed]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(clearNotice, 6000);
    return () => window.clearTimeout(timeout);
  }, [clearNotice, notice]);

  useEffect(() => {
    const dialog = packToConfirm
      ? packConfirmDialogRef.current
      : resetConfirmOpen
        ? resetDialogRef.current
        : packsOpen
          ? packsDialogRef.current
          : helpOpen
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
  }, [filterSheetOpen, helpOpen, loginOpen, packToConfirm, packsOpen, resetConfirmOpen]);

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
        if (packToConfirm && !packOpening) setPackToConfirm(null);
        else if (resetConfirmOpen) setResetConfirmOpen(false);
        else if (packsOpen) setPacksOpen(false);
        else if (helpOpen) closeHelp();
        else if (filterSheetOpen) closeFilterSheet();
        else if (loginOpen) closeLogin();
        else if (accountOpen) setAccountOpen(false);
        return;
      }
      if (
        filterSheetOpen ||
        helpOpen ||
        loginOpen ||
        accountOpen ||
        packsOpen ||
        packToConfirm ||
        resetConfirmOpen
      ) return;
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
    packToConfirm,
    packOpening,
    packsOpen,
    revealed,
    resetConfirmOpen,
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

  const requestOpenPack = (pack: CardPack) => {
    setPacksOpen(false);
    setPackOpening(false);
    setPackToConfirm(pack);
  };

  const confirmOpenPack = () => {
    if (!packToConfirm || packOpening) return;
    setPackOpening(true);
  };

  const requestPacksFromTrigger = () => {
    if (packTriggerOpening) return;
    setOpenedOutsideDiscover(null);
    if (reducedMotionRequested()) {
      setPacksOpen(true);
      return;
    }
    setPackTriggerOpening(true);
  };

  useEffect(() => {
    if (!packTriggerOpening) return;
    const timeout = window.setTimeout(() => {
      setPackTriggerOpening(false);
      setPacksOpen(true);
    }, PACK_TRIGGER_OPENING_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [packTriggerOpening]);

  useEffect(() => {
    if (!packOpening || !packToConfirm) return;
    const timeout = window.setTimeout(() => {
      openPack(packToConfirm.id);
      if (activeView !== "discover") {
        setOpenedOutsideDiscover(packToConfirm);
        setPacksOpen(true);
      }
      setPackOpening(false);
      setPackToConfirm(null);
    }, reducedMotionRequested() ? 0 : PACK_OPENING_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [activeView, openPack, packOpening, packToConfirm]);

  const confirmReset = async () => {
    if (await resetStudy()) {
      setResetConfirmOpen(false);
      setPacksOpen(false);
      setAccountOpen(false);
      setSessionNonce((value) => value + 1);
    }
  };

  if (!ready || !viewInitialized) {
    return (
      <div className="app-shell loading-shell" aria-live="polite">
        <div className="loading-brand skeleton" />
        <div className="loading-progress skeleton" />
        <div className="loading-card skeleton" />
        <p>Preparando tus cartas…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Yuwenke, inicio">
          <img
            className="brand-mark"
            src={`${import.meta.env.BASE_URL}yuwenke-mark.png`}
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
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountOpen(false);
                      setResetConfirmOpen(true);
                    }}
                  >
                    Restablecer estudio
                  </button>
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
            Estás estudiando como invitado. Tu progreso, favoritas y packs se guardan en
            este dispositivo.
          </p>
          <button type="button" className="text-button" onClick={() => setLoginOpen(true)}>
            Sincronizar con Google
          </button>
        </aside>
      ) : null}

      {!storageAvailable ? (
        <div className="inline-alert" role="status">
          Tu progreso, favoritas y packs no se guardarán en este dispositivo.
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
          <span className="sr-only">Buscar en las cartas</span>
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
          className={`button pack-trigger${packTriggerOpening ? " is-opening" : ""}`}
          aria-haspopup="dialog"
          aria-expanded={packsOpen}
          disabled={packTriggerOpening}
          onClick={requestPacksFromTrigger}
        >
          Packs
        </button>
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
            <p>{plural(openUnitCount, "carta")}</p>
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

        <section className="session-panel" aria-label={`${VIEW_LABELS[activeView]} cartas`}>
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
                    Carta {queueIndex + 1} de {queue.length}
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
              suggestedPack={
                activeView === "discover" && suggestionEligible
                  ? suggestedPack
                  : null
              }
              suggestedPackUnitCount={
                suggestedPack ? packUnitCounts[suggestedPack.id] ?? 0 : 0
              }
              onSuggestPack={(pack) => requestOpenPack(pack)}
              onOpenPacks={() => setPacksOpen(true)}
            />
          ) : (
            <EmptyState
              view={activeView}
              filtered={hasFilters}
              learningCount={counts.study}
              onClear={resetFilters}
              onChangeView={changeView}
              onOpenPacks={() => setPacksOpen(true)}
            />
          )}
        </section>
      </main>

      <CardPackDialogs
        packs={packs}
        packUnitCounts={packUnitCounts}
        openPackIds={openPackIdSet}
        panelOpen={packsOpen}
        packToConfirm={packToConfirm}
        packOpening={packOpening}
        openedOutsideDiscover={openedOutsideDiscover}
        resetOpen={resetConfirmOpen}
        resetting={resetting}
        authenticated={user !== null}
        panelRef={packsDialogRef}
        packConfirmRef={packConfirmDialogRef}
        resetRef={resetDialogRef}
        onClosePanel={() => setPacksOpen(false)}
        onRequestOpen={requestOpenPack}
        onCancelOpen={() => {
          if (!packOpening) setPackToConfirm(null);
        }}
        onConfirmOpen={confirmOpenPack}
        onGoToDiscover={() => {
          setPacksOpen(false);
          changeView("discover");
        }}
        onRequestReset={() => {
          setPacksOpen(false);
          setResetConfirmOpen(true);
        }}
        onCancelReset={() => setResetConfirmOpen(false)}
        onConfirmReset={() => void confirmReset()}
      />

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
              <h2 id="filter-title">Filtrar cartas</h2>
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
                  Mira cartas nuevas y decide si quieres añadirlas a aprendizaje,
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
                  Marca una carta con la estrella para tener sus cartas
                  siempre disponibles en una cola personal.
                </p>
              </li>
              <li>
                <strong>Packs</strong>
                <p>
                  Abre cualquier colección cuando quieras para añadir material nuevo
                  a Descubrir. Los packs abiertos permanecen disponibles.
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
                sesión con Google, tus estados, favoritas y packs también se sincronizan
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
              favoritas y packs guardados aquí se conservarán al sincronizar.
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
          ? `Carta ${queueIndex + 1} de ${queue.length}`
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
  onOpenPacks: () => void;
}

function EmptyState({
  view,
  filtered,
  learningCount,
  onClear,
  onChangeView,
  onOpenPacks,
}: EmptyStateProps) {
  if (filtered) {
    return (
      <div className="empty-state">
        <span aria-hidden="true">空</span>
        <h2>No hay cartas que coincidan con estos filtros.</h2>
        <button type="button" className="button button-primary" onClick={onClear}>Limpiar filtros</button>
      </div>
    );
  }
  if (view === "study") {
    return (
      <div className="empty-state">
        <span aria-hidden="true">学</span>
        <h2>Aún no tienes cartas en aprendizaje.</h2>
        <p>Clasifica algunas cartas para empezar a practicar.</p>
        <button type="button" className="button button-primary" onClick={() => onChangeView("discover")}>Ir a Descubrir</button>
      </div>
    );
  }
  if (view === "discover") {
    return (
      <div className="empty-state">
        <span aria-hidden="true">完</span>
        <h2>Ya has clasificado todas las cartas.</h2>
        <div className="empty-actions">
          {learningCount > 0 ? (
            <button type="button" className="button button-primary" onClick={() => onChangeView("study")}>Ir a Estudiar</button>
          ) : null}
          <button type="button" className="button button-secondary" onClick={() => onChangeView("mastered")}>Ver dominadas</button>
          <button type="button" className="text-button" onClick={onOpenPacks}>Ver todos los packs</button>
        </div>
      </div>
    );
  }
  if (view === "favorites") {
    return (
      <div className="empty-state">
        <span aria-hidden="true">★</span>
        <h2>Aún no tienes cartas favoritas.</h2>
        <p>Usa la estrella de cualquier carta para añadirla a esta cola.</p>
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
      <h2>Aún no has marcado ninguna carta como dominada.</h2>
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
  suggestedPack: CardPack | null;
  suggestedPackUnitCount: number;
  onSuggestPack: (pack: CardPack) => void;
  onOpenPacks: () => void;
}

function SessionSummary({
  view,
  tally,
  onRestart,
  onChangeView,
  learningCount,
  discoverRemaining,
  suggestedPack,
  suggestedPackUnitCount,
  onSuggestPack,
  onOpenPacks,
}: SessionSummaryProps) {
  const title =
    view === "study"
      ? "Sesión completada"
      : view === "discover"
        ? "Selección completada"
        : view === "favorites"
          ? "Repaso de favoritas completado"
          : "Revisión completada";
  const secondaryView: StudyView =
    view === "study"
      ? "discover"
      : view === "discover"
        ? "study"
        : learningCount > 0
          ? "study"
          : "discover";
  const secondaryLabel =
    secondaryView === "study"
      ? "Ir a Estudiar"
      : "Ir a Descubrir";

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
                ? "carta favorita practicada"
                : "cartas favoritas practicadas"}
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
            "carta sigue sin clasificar",
            "cartas siguen sin clasificar",
          )}
          .
        </p>
      ) : null}
      {view === "discover" && suggestedPack ? (
        <article className="pack-suggestion">
          <CardPackBooster
            pack={suggestedPack}
            unitCount={suggestedPackUnitCount}
            compact
          />
          <div className="pack-suggestion__copy">
            <p className="eyebrow">Siguiente sugerencia</p>
            <h3>{suggestedPack.title}</h3>
            <p>{suggestedPack.description}</p>
            <div className="summary-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={() => onSuggestPack(suggestedPack)}
              >
                Abrir «{suggestedPack.title}»
              </button>
              <button type="button" className="text-button" onClick={onOpenPacks}>
                Ver todos los packs
              </button>
            </div>
          </div>
        </article>
      ) : null}
      <div className="summary-actions">
        {view !== "discover" || discoverRemaining > 0 ? (
          <button type="button" className="button button-primary" onClick={onRestart}>
            {view === "study"
              ? "Nueva sesión"
              : view === "discover"
                ? `Volver a las que saltaste (${discoverRemaining})`
                : view === "favorites"
                  ? "Repasar de nuevo"
                  : "Revisar de nuevo"}
          </button>
        ) : null}
        <button
          type="button"
          className="button button-secondary"
          onClick={() => onChangeView(secondaryView)}
        >
          {secondaryLabel}
        </button>
      </div>
    </div>
  );
}
