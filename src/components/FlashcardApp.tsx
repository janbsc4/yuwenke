import {
  lazy,
  Suspense,
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
  Locale,
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
  reshuffleStudyQueueAfterPackOpening,
  shuffle,
  unitBelongsToView,
  visibleUnits,
} from "../lib/study";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  homeUrl,
  LOCALE_STORAGE_KEY,
  localeUrl,
  localized,
  parseLocaleFromPath,
} from "../lib/locale";
import { applyLocaleMetadata } from "../lib/documentMetadata";
import { messages, topicDisplayLabel, type Messages } from "../lib/messages";
import {
  chineseVoiceOptions,
  isSpeechMuted,
  preferredVoiceUri,
  setPreferredVoice,
  setSpeechMuted,
  speakChinese,
  subscribeToVoices,
  type ChineseVoiceOption,
} from "../lib/speech";
import { useProgressSync } from "../hooks/useProgressSync";
import { StudyCard } from "./StudyCard";
import { CardPackDialogs } from "./CardPackDialogs";
import { CardPackBooster } from "./CardPackBooster";

interface FlashcardAppProps {
  cards: Flashcard[];
  packs: CardPack[];
  packIdByCardId: PackIdByCardId;
  initialLocale?: Locale;
}

const Conversation = lazy(() => import("./Conversation"));

const PACK_OPENING_DURATION_MS = 1050;
const PACK_TRIGGER_OPENING_DURATION_MS = 160;

const EMPTY_FILTERS: Filters = { query: "", topic: "all", type: "all" };
const EMPTY_TALLY: SessionTally = { primary: 0, secondary: 0, skipped: 0 };
const VOICE_SAMPLE_TEXT = "你好，很高兴认识你。";

function reducedMotionRequested(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function initials(
  name: string | null,
  email: string | null,
  fallback: string,
): string {
  const source = name?.trim() || email?.split("@")[0] || fallback;
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
  m: Messages,
  view: StudyView,
  status: ProgressStatus | undefined,
): string {
  if (view === "study") return m.decisions.keepLearning;
  if (view === "mastered" || status === "known") return m.decisions.staysMastered;
  return status === "learning" ? m.decisions.keepLearning : m.decisions.addToLearning;
}

function secondaryDecisionLabel(
  m: Messages,
  view: StudyView,
  status: ProgressStatus | undefined,
): string {
  if (view === "mastered" || (view === "favorites" && status === "known")) {
    return m.decisions.backToLearning;
  }
  return m.decisions.alreadyKnow;
}

export default function FlashcardApp({
  cards,
  packs,
  packIdByCardId,
  initialLocale = DEFAULT_LOCALE,
}: FlashcardAppProps) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const m = messages[locale];
  const orderedPackIds = useMemo(() => packs.map((pack) => pack.id), [packs]);
  const packTitleById = useMemo(
    () =>
      Object.fromEntries(
        packs.map((pack) => [pack.id, localized(pack.title, locale)]),
      ),
    [packs, locale],
  );
  const units = useMemo(() => createStudyUnits(cards), [cards]);
  const topics = useMemo(
    () => [...new Set(cards.map((card) => card.tema))].sort((a, b) =>
      topicDisplayLabel(locale, a).localeCompare(topicDisplayLabel(locale, b), locale),
    ),
    [cards, locale],
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
  } = useProgressSync({ cards, orderedPackIds, packIdByCardId });
  const openPackIdSet = useMemo(() => new Set(openPackIds), [openPackIds]);

  const [chatOpen, setChatOpen] = useState(false);
  const [activeView, setActiveView] = useState<StudyView>("study");
  const [initializedOwner, setInitializedOwner] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceOptions, setVoiceOptions] = useState<ChineseVoiceOption[]>(
    () => chineseVoiceOptions(),
  );
  const [preferredVoice, setPreferredVoiceState] = useState(() => preferredVoiceUri());
  const [speechMuted, setSpeechMutedState] = useState(() => isSpeechMuted());
  const [voiceInstructionsOpen, setVoiceInstructionsOpen] = useState(false);
  const [packsOpen, setPacksOpen] = useState(false);
  const [packTriggerOpening, setPackTriggerOpening] = useState(false);
  const [packToConfirm, setPackToConfirm] = useState<CardPack | null>(null);
  const [packOpening, setPackOpening] = useState(false);
  const [openedOutsideStudy, setOpenedOutsideStudy] = useState<CardPack | null>(null);
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
  const voiceButtonRef = useRef<HTMLButtonElement>(null);
  const filterDialogRef = useRef<HTMLElement>(null);
  const loginDialogRef = useRef<HTMLElement>(null);
  const helpDialogRef = useRef<HTMLElement>(null);
  const voiceDialogRef = useRef<HTMLElement>(null);
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
    const filtered = units.filter((unit) => matchesFilters(unit.card, filters, locale));
    return {
      study: visibleUnits(units, "study", studyProgress, filters, favorites, openPackIdSet, packIdByCardId, locale).length,
      mastered: filtered.filter((unit) =>
        unitBelongsToView(unit, "mastered", studyProgress),
      ).length,
      favorites: filtered.filter((unit) =>
        unitBelongsToView(unit, "favorites", studyProgress, favorites),
      ).length,
    };
  }, [favorites, filters, locale, openPackIdSet, packIdByCardId, studyProgress, units]);

  const hasFilters = filters.query.trim() !== "" || filters.topic !== "all" || filters.type !== "all";
  const filterCount = Number(filters.topic !== "all") + Number(filters.type !== "all");
  const current = queue[queueIndex];
  const currentStatus = current ? studyProgress[current.key]?.status : undefined;
  const currentFavorite = current
    ? favorites[current.cardId]?.favorite ?? false
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
    applyLocaleMetadata(locale);
  }, [locale]);

  useEffect(() => subscribeToVoices(() => setVoiceOptions(chineseVoiceOptions())), []);

  useEffect(() => {
    const syncConversationLink = () => setChatOpen(window.location.hash === "#conversation");
    // Read the landing link after hydration; the static page has no URL fragment.
    syncConversationLink();
    window.addEventListener("hashchange", syncConversationLink);
    return () => window.removeEventListener("hashchange", syncConversationLink);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const fromPath = parseLocaleFromPath(window.location.pathname);
      if (
        fromPath &&
        fromPath !== locale &&
        SUPPORTED_LOCALES.includes(fromPath)
      ) {
        setLocale(fromPath);
        writePreference(LOCALE_STORAGE_KEY, fromPath);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [locale]);

  useEffect(() => {
    if (!ready || viewInitialized) return;
    const stored = readPreference("yuwenke:last-view:v1");
    const savedView = stored === "discover" ? "study" : stored;
    const candidate = savedView && Object.hasOwn(counts, savedView) && counts[savedView as StudyView] > 0
      ? savedView as StudyView : null;
    const initial = candidate ?? "study";
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- one-time
       hydration of the persisted view after the dataset becomes ready. */
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
        locale,
      ),
    );
    /* eslint-disable react-hooks/set-state-in-effect -- the queue is derived
       from a randomized shuffle, so it must be built outside render and reset
       whenever the underlying dataset or visible units change. */
    setQueue(nextQueue);
    setQueueIndex(0);
    setRevealed(false);
    setCompleted(false);
    setTally(EMPTY_TALLY);
    setQueueContext(desiredQueueContext);
    /* eslint-enable react-hooks/set-state-in-effect */
    // The remaining inputs (progress, favorites, filters, locale) are
    // deliberately excluded: they change constantly during a session and are
    // repaired incrementally by the effects below, which keep the current
    // card, revealed state, and queue order instead of reshuffling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desiredQueueContext, ready, units, viewInitialized]);

  useEffect(() => {
    const previous = new Set(previousOpenPackIdsRef.current);
    previousOpenPackIdsRef.current = openPackIds;
    const newlyOpened = new Set(openPackIds.filter((packId) => !previous.has(packId)));
    if (
      newlyOpened.size === 0 ||
      activeView !== "study" ||
      !queueReady
    ) {
      return;
    }

    setQueue((existingQueue) => {
      const existingKeys = new Set(existingQueue.map((unit) => unit.key));
      const additions = units.filter(
        (unit) =>
          newlyOpened.has(packIdByCardId[unit.cardId]) &&
          !existingKeys.has(unit.key) &&
          unitBelongsToView(unit, "study", studyProgress) &&
          matchesFilters(unit.card, filters, locale),
      );
      if (additions.length === 0) return existingQueue;
      if (completed) {
        setQueueIndex(existingQueue.length);
        setCompleted(false);
        setRevealed(false);
      }
      return reshuffleStudyQueueAfterPackOpening(
        existingQueue,
        queueIndex,
        additions,
      );
    });
  }, [
    activeView,
    completed,
    filters,
    locale,
    openPackIds,
    packIdByCardId,
    queueIndex,
    queueReady,
    studyProgress,
    units,
  ]);

  useEffect(() => {
    if (revealed) answerRef.current?.focus();
  }, [revealed]);

  const modalOpen = Boolean(
    filterSheetOpen || helpOpen || loginOpen || packToConfirm || packsOpen || resetConfirmOpen || voiceOpen,
  );

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(clearNotice, 6000);
    return () => window.clearTimeout(timeout);
  }, [clearNotice, notice]);

  useEffect(() => {
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [modalOpen]);

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
        : voiceOpen
          ? voiceDialogRef.current
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
  }, [filterSheetOpen, helpOpen, loginOpen, packToConfirm, packsOpen, resetConfirmOpen, voiceOpen]);

  const closeFilterSheet = useCallback(() => {
    setFilterSheetOpen(false);
    window.setTimeout(() => filterButtonRef.current?.focus(), 0);
  }, []);

  const closeLogin = useCallback(() => {
    setLoginOpen(false);
    window.setTimeout(() => loginButtonRef.current?.focus(), 0);
  }, []);

  const closeVoice = useCallback(() => {
    setVoiceOpen(false);
    setVoiceInstructionsOpen(false);
    window.setTimeout(() => voiceButtonRef.current?.focus(), 0);
  }, []);

  const changeSpeechMuted = useCallback((muted: boolean) => {
    setSpeechMuted(muted);
    setSpeechMutedState(muted);
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

  const changeLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      setLocale(next);
      writePreference(LOCALE_STORAGE_KEY, next);
      window.history.pushState(null, "", `${localeUrl(next)}${chatOpen ? "#conversation" : ""}`);
    },
    [locale, chatOpen],
  );

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
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- reactive
         repair: the favorites queue just became empty, so clear it. */
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
    if (!current || activeView !== "study") return;
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
        else if (voiceOpen) closeVoice();
        else if (packsOpen) setPacksOpen(false);
        else if (helpOpen) closeHelp();
        else if (filterSheetOpen) closeFilterSheet();
        else if (loginOpen) closeLogin();
        else if (accountOpen) setAccountOpen(false);
        return;
      }
      if (
        chatOpen ||
        filterSheetOpen ||
        helpOpen ||
        loginOpen ||
        voiceOpen ||
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
      } else if (event.key === "3" && activeView === "study") {
        skip();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    accountOpen,
    activeView,
    chatOpen,
    choosePrimary,
    chooseSecondary,
    closeFilterSheet,
    closeHelp,
    closeLogin,
    closeVoice,
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
    voiceOpen,
  ]);

  const changeQuery = (event: ChangeEvent<HTMLInputElement>) => {
    setFilters((value) => ({ ...value, query: event.target.value }));
  };

  const clearQuery = () => {
    setFilters((value) => ({ ...value, query: "" }));
    searchRef.current?.focus();
  };

  const resetFilters = () => setFilters(EMPTY_FILTERS);

  const changeView = (view: StudyView) => {
    setChatOpen(false);
    if (window.location.hash === "#conversation") {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
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
    setOpenedOutsideStudy(null);
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
      if (activeView !== "study") {
        setOpenedOutsideStudy(packToConfirm);
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
        <p>{m.session.loading}</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href={homeUrl()} aria-label={m.brand.homeAria}>
          <img
            className="brand-mark"
            src={`${import.meta.env.BASE_URL}yuwenke-mark.png`}
            alt=""
            width="48"
            height="48"
          />
          <span>
            <strong>Yuwenke</strong>
            <small>{m.brand.tagline}</small>
          </span>
        </a>

        <div className="header-tools">
          <div className="account-area">
            <span className={`sync-label sync-${syncState}`}>
              {user
                ? syncState === "syncing"
                  ? m.sync.syncing
                  : syncState === "synced"
                    ? m.sync.synced
                    : syncState === "offline"
                      ? m.sync.offline
                      : syncState === "error"
                        ? m.sync.error
                        : m.sync.local
                : m.sync.guest}
            </span>
            {syncState === "error" && user ? (
              <button className="text-button" type="button" onClick={() => void retry()}>
                {m.sync.retry}
              </button>
            ) : null}
            {user ? (
              <div className="account-menu-wrap">
                <button
                  type="button"
                  className="avatar-button"
                  aria-label={m.account.menuAria}
                  aria-expanded={accountOpen}
                  onClick={() => setAccountOpen((value) => !value)}
                >
                  {initials(user.displayName, user.email, m.account.initialsFallback)}
                </button>
                {accountOpen ? (
                  <div className="account-menu" role="menu">
                    <strong>{user.displayName || m.account.yourAccount}</strong>
                    <span>{user.email}</span>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountOpen(false);
                        setResetConfirmOpen(true);
                      }}
                    >
                      {m.account.resetStudy}
                    </button>
                    <button type="button" role="menuitem" onClick={() => void signOut()}>
                      {m.account.signOut}
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
                title={firebaseConfigured ? undefined : m.account.syncUnavailableTitle}
              >
                {m.account.signIn}
              </button>
            )}
          </div>
          <button
            type="button"
            className="voice-trigger"
            aria-label={m.voice.trigger}
            aria-haspopup="dialog"
            aria-expanded={voiceOpen}
            ref={voiceButtonRef}
            onClick={() => setVoiceOpen(true)}
          >
            <span aria-hidden="true">{speechMuted ? "🔇" : "🗣"}</span>
          </button>
          {SUPPORTED_LOCALES.length > 1 ? (
            <div
              className="locale-switcher"
              role="group"
              aria-label={m.localeSwitcher.aria}
            >
              {SUPPORTED_LOCALES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={option === locale ? "is-active" : ""}
                  aria-pressed={option === locale}
                  onClick={() => changeLocale(option)}
                >
                  {m.localeSwitcher.label[option]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <nav className="view-tabs" aria-label={m.viewsAria}>
        {(Object.keys(m.views) as StudyView[]).map((view) => (
          <button
            type="button"
            key={view}
            className={!chatOpen && view === activeView ? "is-active" : ""}
            aria-current={!chatOpen && view === activeView ? "page" : undefined}
            onClick={() => changeView(view)}
          >
            <span>{m.views[view]}</span>
            <span className="count-pill">{counts[view]}</span>
          </button>
        ))}
        <button type="button" className={chatOpen ? "is-active" : ""} aria-current={chatOpen ? "page" : undefined} onClick={() => setChatOpen(true)}>
          <span>{locale === "es" ? "Conversa" : "Converse"}</span>
        </button>
      </nav>

      {!user ? (
        <aside className="guest-note">
          <p>{m.guestNote.body}</p>
          <button type="button" className="text-button" onClick={() => setLoginOpen(true)}>
            {m.guestNote.cta}
          </button>
        </aside>
      ) : null}

      {!storageAvailable ? (
        <div className="inline-alert" role="status">
          {m.storageWarning}
        </div>
      ) : null}

      {notice ? (
        <div className="toast" role="status">
          <span>{m.notices[notice]}</span>
          <button type="button" aria-label={m.toastCloseAria} onClick={clearNotice}>
            ×
          </button>
        </div>
      ) : null}

      {chatOpen && <Suspense fallback={<p role="status">{locale === "es" ? "Cargando…" : "Loading…"}</p>}>
        <Conversation
          key={`${user?.uid ?? "guest"}:${locale}`}
          cards={cards}
          progress={studyProgress}
          locale={locale}
          owner={user?.uid ?? null}
          muted={speechMuted}
          configured={firebaseConfigured && import.meta.env.PUBLIC_CHAT_ENABLED === "true" && Boolean(import.meta.env.PUBLIC_CHAT_API_URL)}
          onSignIn={() => setLoginOpen(true)}
          onReviewCard={(id) => {
            const card = cards.find((item) => item.id === id);
            if (!card) return;
            const cardUnits = units.filter((unit) => unit.cardId === id);
            changeView(cardUnits.some((unit) => studyProgress[unit.key]?.status === "learning") ? "study" : "mastered");
            setFilters({ ...EMPTY_FILTERS, query: card.hanzi });
          }}
        />
      </Suspense>}
      <div hidden={chatOpen}>
      <div className="search-row">
        <div className="search-field">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input
            type="text"
            role="searchbox"
            aria-label={m.search.aria}
            placeholder={m.search.placeholder}
            value={filters.query}
            onChange={changeQuery}
            ref={searchRef}
          />
          {filters.query ? (
            <button
              type="button"
              aria-label={m.search.clearAria}
              onClick={clearQuery}
            >
              ×
            </button>
          ) : null}
        </div>
        <PacksButton
          open={packsOpen}
          opening={packTriggerOpening}
          onClick={requestPacksFromTrigger}
          m={m}
        />
        <button
          type="button"
          className="button filter-trigger"
          onClick={() => setFilterSheetOpen(true)}
          ref={filterButtonRef}
        >
          {filterCount > 0 ? m.filters.triggerWithCount(filterCount) : m.filters.trigger}
        </button>
      </div>

      <main className="study-layout">
        <aside className="filter-panel" aria-label={m.filters.panelAria}>
          <div className="panel-heading">
            <p className="eyebrow">{m.filters.collectionEyebrow}</p>
            <p>{m.filters.cardCount(openUnitCount)}</p>
          </div>
          <label>
            {m.filters.topicLabel}
            <select
              value={filters.topic}
              onChange={(event) => setFilters((value) => ({ ...value, topic: event.target.value }))}
            >
              <option value="all">{m.filters.allTopics}</option>
              {topics.map((topic) => (
                <option value={topic} key={topic}>
                  {topicDisplayLabel(locale, topic)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {m.filters.typeLabel}
            <select
              value={filters.type}
              onChange={(event) =>
                setFilters((value) => ({ ...value, type: event.target.value as Filters["type"] }))
              }
            >
              <option value="all">{m.filters.allTypes}</option>
              {(Object.keys(m.cardTypes) as CardType[]).map((type) => (
                <option value={type} key={type}>
                  {m.cardTypes[type]}
                </option>
              ))}
            </select>
          </label>
          {hasFilters ? (
            <button type="button" className="text-button align-left" onClick={resetFilters}>
              {m.filters.clear}
            </button>
          ) : null}
          <div className="direction-legend">
            <span>{m.directions.legendToMeaning}</span>
            <span>{m.directions.legendToHanzi}</span>
            <button
              type="button"
              className="text-button how-it-works"
              onClick={(event) => openHelp(event.currentTarget)}
            >
              {m.help.trigger}
            </button>
          </div>
        </aside>

        <section className="session-panel" aria-label={m.session.panelAria(m.views[activeView])}>
          {!queueReady ? (
            <div className="queue-loading" aria-live="polite">
              <div className="loading-progress skeleton" />
              <div className="loading-card skeleton" />
              <p>{m.session.queueLoading}</p>
            </div>
          ) : current && !completed ? (
            <>
              <div className="session-progress" aria-live="polite">
                <div>
                  <span>
                    {m.session.progressLabel(queueIndex + 1, queue.length)}
                  </span>
                  <span className="direction-badge">
                    {current.card.tipo === "concepto"
                      ? m.directions.concept
                      : current.direction === "hanzi-meaning"
                        ? m.directions.toMeaning
                        : m.directions.toHanzi}
                  </span>
                </div>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label={m.session.progressAria}
                  aria-valuemin={0}
                  aria-valuemax={queue.length}
                  aria-valuenow={queueIndex + 1}
                >
                  <span style={{ width: `${((queueIndex + 1) / queue.length) * 100}%` }} />
                </div>
              </div>

              <StudyCard
                unit={current}
                packTitle={packTitleById[packIdByCardId[current.cardId]]}
                revealed={revealed}
                favorite={currentFavorite}
                muted={speechMuted}
                onToggleFavorite={() =>
                  setFavorite(current.cardId, !currentFavorite)
                }
                promptRef={promptRef}
                ref={answerRef}
                m={m}
                locale={locale}
              />

              <div className="decision-area">
                {!revealed ? (
                  <button type="button" className="button button-primary reveal-button" onClick={() => setRevealed(true)}>
                    {m.session.reveal} <kbd>{m.session.spaceKey}</kbd>
                  </button>
                ) : (
                  <div className="decision-buttons">
                    <button type="button" className="button button-primary" onClick={choosePrimary}>
                      {primaryDecisionLabel(m, activeView, currentStatus)}
                      <kbd>1</kbd>
                    </button>
                    <button type="button" className="button button-secondary" onClick={chooseSecondary}>
                      {secondaryDecisionLabel(m, activeView, currentStatus)}
                      <kbd>2</kbd>
                    </button>
                  </div>
                )}
                {activeView === "study" ? (
                  <button type="button" className="skip-button" onClick={skip}>
                    {m.session.skip} <kbd>3</kbd>
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
              studyRemaining={counts.study}
              suggestedPack={
                activeView === "study" && suggestionEligible
                  ? suggestedPack
                  : null
              }
              suggestedPackUnitCount={
                suggestedPack ? packUnitCounts[suggestedPack.id] ?? 0 : 0
              }
              onSuggestPack={(pack) => requestOpenPack(pack)}
              packsOpen={packsOpen}
              packsOpening={packTriggerOpening}
              onOpenPacks={requestPacksFromTrigger}
              m={m}
              locale={locale}
            />
          ) : (
            <EmptyState
              view={activeView}
              filtered={hasFilters}
              onClear={resetFilters}
              onChangeView={changeView}
              packsOpen={packsOpen}
              packsOpening={packTriggerOpening}
              onOpenPacks={requestPacksFromTrigger}
              m={m}
            />
          )}
        </section>
      </main>
      </div>

      <CardPackDialogs
        packs={packs}
        packUnitCounts={packUnitCounts}
        openPackIds={openPackIdSet}
        panelOpen={packsOpen}
        packToConfirm={packToConfirm}
        packOpening={packOpening}
        openedOutsideStudy={openedOutsideStudy}
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
        onGoToStudy={() => {
          setPacksOpen(false);
          changeView("study");
        }}
        onRequestReset={() => {
          setPacksOpen(false);
          setResetConfirmOpen(true);
        }}
        onCancelReset={() => setResetConfirmOpen(false)}
        onConfirmReset={() => void confirmReset()}
        m={m}
        locale={locale}
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
              <h2 id="filter-title">{m.filters.sheetTitle}</h2>
              <button type="button" aria-label={m.filters.sheetCloseAria} onClick={closeFilterSheet}>×</button>
            </div>
            <label>
              {m.filters.topicLabel}
              <select
                value={filters.topic}
                onChange={(event) => setFilters((value) => ({ ...value, topic: event.target.value }))}
              >
                <option value="all">{m.filters.allTopics}</option>
                {topics.map((topic) => (
                  <option value={topic} key={topic}>{topicDisplayLabel(locale, topic)}</option>
                ))}
              </select>
            </label>
            <label>
              {m.filters.typeLabel}
              <select
                value={filters.type}
                onChange={(event) =>
                  setFilters((value) => ({ ...value, type: event.target.value as Filters["type"] }))
                }
              >
                <option value="all">{m.filters.allTypes}</option>
                {(Object.keys(m.cardTypes) as CardType[]).map((type) => (
                  <option value={type} key={type}>{m.cardTypes[type]}</option>
                ))}
              </select>
            </label>
            <button type="button" className="button button-primary" onClick={closeFilterSheet}>
              {m.filters.apply}
            </button>
            <button type="button" className="text-button" onClick={resetFilters}>
              {m.filters.clear}
            </button>
            <div className="direction-legend sheet-direction-legend">
              <span>{m.directions.legendToMeaning}</span>
              <span>{m.directions.legendToHanzi}</span>
              <button
                type="button"
                className="text-button how-it-works"
                onClick={(event) => openHelp(event.currentTarget)}
              >
                {m.help.trigger}
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
              <h2 id="help-title">{m.help.title}</h2>
              <button type="button" aria-label={m.help.closeAria} onClick={closeHelp}>×</button>
            </div>

            <ol className="help-steps">
              {Object.values(m.help.steps).map((step) => (
                <li key={step.title}>
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>

            <div className="help-details">
              <p>{m.help.detailsFlow}</p>
              <p>
                {m.help.properNames.before}
                <span className="proper-name">{m.help.properNames.highlight}</span>
                {m.help.properNames.after}
              </p>
              <p>{m.help.detailsAccount}</p>
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
            <h2 id="login-title">{m.login.title}</h2>
            <p>{m.login.body}</p>
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
                {firebaseReady ? m.login.googleReady : m.login.googlePreparing}
              </button>
            ) : (
              <p className="config-note">{m.login.configNote}</p>
            )}
            <button type="button" className="text-button" onClick={closeLogin}>{m.login.notNow}</button>
          </section>
        </div>
      ) : null}

      {voiceOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeVoice}>
          <section
            className="voice-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="voice-title"
            ref={voiceDialogRef}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <h2 id="voice-title">{m.voice.title}</h2>
              <button type="button" aria-label={m.voice.closeAria} onClick={closeVoice}>×</button>
            </div>
            <label className="voice-mute">
              <input
                type="checkbox"
                checked={speechMuted}
                onChange={(event) => changeSpeechMuted(event.target.checked)}
              />
              <span>{m.voice.muteToggle}</span>
            </label>
            {voiceOptions.length > 0 ? (
              <label className="voice-select-label">
                {m.voice.label}
                <select
                  value={preferredVoice}
                  onChange={(event) => {
                    const uri = event.target.value;
                    setPreferredVoice(uri || null);
                    setPreferredVoiceState(uri);
                    speakChinese(VOICE_SAMPLE_TEXT);
                  }}
                >
                  <option value="">{m.voice.defaultOption}</option>
                  {voiceOptions.map((option) => (
                    <option key={option.uri} value={option.uri}>
                      {option.name} ({option.lang})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="voice-empty">{m.voice.empty}</p>
            )}
            <button
              type="button"
              className="text-button"
              aria-expanded={voiceInstructionsOpen}
              onClick={() => setVoiceInstructionsOpen((value) => !value)}
            >
              {m.voice.instructionsToggle}
            </button>
            {voiceInstructionsOpen ? (
              <div className="voice-instructions">
                <h3>{m.voice.instructionsTitle}</h3>
                {m.voice.instructions.map(({ platform, body }) => (
                  <div key={platform} className="voice-instruction">
                    <strong>{platform}</strong>
                    <p>{body}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      <div className="sr-only" aria-live="polite" hidden={chatOpen}>
        {queueReady && current && !completed
          ? m.session.progressLabel(queueIndex + 1, queue.length)
          : ""}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  view: StudyView;
  filtered: boolean;
  onClear: () => void;
  onChangeView: (view: StudyView) => void;
  packsOpen: boolean;
  packsOpening: boolean;
  onOpenPacks: () => void;
  m: Messages;
}

interface PacksButtonProps {
  open: boolean;
  opening: boolean;
  onClick: () => void;
  m: Messages;
}

function PacksButton({ open, opening, onClick, m }: PacksButtonProps) {
  return (
    <button
      type="button"
      className={`button pack-trigger${opening ? " is-opening" : ""}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      disabled={opening}
      onClick={onClick}
    >
      {m.packs.button}
    </button>
  );
}

function EmptyState({
  view,
  filtered,
  onClear,
  onChangeView,
  packsOpen,
  packsOpening,
  onOpenPacks,
  m,
}: EmptyStateProps) {
  if (filtered) {
    return (
      <div className="empty-state">
        <span aria-hidden="true">空</span>
        <h2>{m.empty.filteredTitle}</h2>
        <button type="button" className="button button-primary" onClick={onClear}>{m.filters.clear}</button>
      </div>
    );
  }
  if (view === "study") {
    return (
      <div className="empty-state">
        <span aria-hidden="true">完</span>
        <h2>{m.empty.studyTitle}</h2>
        <p>{m.empty.studyBody}</p>
        <div className="empty-actions">
          <button type="button" className="button button-secondary" onClick={() => onChangeView("mastered")}>{m.empty.viewMastered}</button>
          <PacksButton open={packsOpen} opening={packsOpening} onClick={onOpenPacks} m={m} />
        </div>
      </div>
    );
  }
  if (view === "favorites") {
    return (
      <div className="empty-state">
        <span aria-hidden="true">★</span>
        <h2>{m.empty.favoritesTitle}</h2>
        <p>{m.empty.favoritesBody}</p>
        <button
          type="button"
          className="button button-primary"
          onClick={() => onChangeView("study")}
        >
          {m.nav.goToStudy}
        </button>
      </div>
    );
  }
  return (
    <div className="empty-state">
      <span aria-hidden="true">熟</span>
      <h2>{m.empty.masteredTitle}</h2>
      <button type="button" className="button button-primary" onClick={() => onChangeView("study")}>{m.nav.goToStudy}</button>
    </div>
  );
}

interface SessionSummaryProps {
  view: StudyView;
  tally: SessionTally;
  onRestart: () => void;
  onChangeView: (view: StudyView) => void;
  studyRemaining: number;
  suggestedPack: CardPack | null;
  suggestedPackUnitCount: number;
  onSuggestPack: (pack: CardPack) => void;
  packsOpen: boolean;
  packsOpening: boolean;
  onOpenPacks: () => void;
  m: Messages;
  locale: Locale;
}

function SessionSummary({
  view,
  tally,
  onRestart,
  onChangeView,
  studyRemaining,
  suggestedPack,
  suggestedPackUnitCount,
  onSuggestPack,
  packsOpen,
  packsOpening,
  onOpenPacks,
  m,
  locale,
}: SessionSummaryProps) {
  const secondaryView: StudyView = view === "study" ? "mastered" : "study";
  const secondaryLabel = view === "study" ? m.empty.viewMastered : m.nav.goToStudy;

  return (
    <div className="summary-card">
      <span className="summary-mark" lang="zh-Hans" aria-hidden="true">好</span>
      <p className="eyebrow">{m.summary.eyebrow}</p>
      <h2>{m.summary.title(view)}</h2>
      <div className="summary-stats">
        {view === "study" ? (
          <>
            <p><strong>{tally.primary}</strong><span>{m.summary.studyPrimary(tally.primary)}</span></p>
            <p><strong>{tally.secondary}</strong><span>{m.summary.studySecondary(tally.secondary)}</span></p>
            <p><strong>{tally.skipped}</strong><span>{m.summary.skipped(tally.skipped)}</span></p>
          </>
        ) : view === "favorites" ? (
          <p>
            <strong>{tally.primary + tally.secondary}</strong>
            <span>{m.summary.favoritesPracticed(tally.primary + tally.secondary)}</span>
          </p>
        ) : (
          <>
            <p><strong>{tally.primary}</strong><span>{m.summary.masteredPrimary(tally.primary)}</span></p>
            <p><strong>{tally.secondary}</strong><span>{m.summary.masteredSecondary(tally.secondary)}</span></p>
          </>
        )}
      </div>
      {view === "study" && studyRemaining > 0 ? (
        <p className="summary-remaining">
          {m.summary.studyRemaining(studyRemaining)}.
        </p>
      ) : null}
      {view === "study" && suggestedPack ? (
        <article className="pack-suggestion">
          <CardPackBooster
            pack={suggestedPack}
            unitCount={suggestedPackUnitCount}
            compact
            m={m}
            locale={locale}
          />
          <div className="pack-suggestion__copy">
            <p className="eyebrow">{m.summary.suggestionEyebrow}</p>
            <h3>{localized(suggestedPack.title, locale)}</h3>
            <p>{localized(suggestedPack.description, locale)}</p>
            <div className="summary-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={() => onSuggestPack(suggestedPack)}
              >
                {m.summary.openPack(localized(suggestedPack.title, locale))}
              </button>
              <PacksButton open={packsOpen} opening={packsOpening} onClick={onOpenPacks} m={m} />
            </div>
          </div>
        </article>
      ) : null}
      <div className="summary-actions">
        {view !== "study" || studyRemaining > 0 ? (
          <button type="button" className="button button-primary" onClick={onRestart}>
            {m.summary.restart(view)}
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
