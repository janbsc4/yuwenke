import type {
  CardType,
  Locale,
  StudyView,
} from "../types";

function plural(
  value: number,
  singular: string,
  pluralForm = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

/**
 * Notice keys let the sync hook stay locale-agnostic: it reports which notice
 * happened and the interface renders the active locale's wording.
 */
export type NoticeKey =
  | "syncCompleted"
  | "willSyncWhenOnline"
  | "syncStartFailed"
  | "syncPrepareFailed"
  | "syncPreparing"
  | "localResetDone"
  | "resetNeedsConnection"
  | "accountResetDone"
  | "accountResetFailed"
  | "signInFailed"
  | "signedOut";

interface HelpStep {
  title: string;
  body: string;
}

/**
 * Every learner-facing string in the application. Both locales implement the
 * same `Messages` shape, so TypeScript rejects mismatched dictionary keys and
 * components never branch on locale for copy.
 */
export interface Messages {
  metadata: {
    description: string;
    socialDescription: string;
    ogLocale: string;
    ogImageAlt: string;
    noscript: string;
  };
  brand: {
    tagline: string;
    homeAria: string;
  };
  localeSwitcher: {
    aria: string;
    label: Record<Locale, string>;
  };
  sync: {
    syncing: string;
    synced: string;
    offline: string;
    error: string;
    local: string;
    guest: string;
    retry: string;
  };
  account: {
    signIn: string;
    menuAria: string;
    yourAccount: string;
    resetStudy: string;
    signOut: string;
    syncUnavailableTitle: string;
    initialsFallback: string;
  };
  views: Record<StudyView, string>;
  viewsAria: string;
  cardTypes: Record<CardType, string>;
  topics: Record<string, string>;
  nav: {
    goToStudy: string;
  };
  guestNote: {
    body: string;
    cta: string;
  };
  storageWarning: string;
  toastCloseAria: string;
  search: {
    aria: string;
    placeholder: string;
    clearAria: string;
  };
  filters: {
    trigger: string;
    triggerWithCount: (count: number) => string;
    panelAria: string;
    collectionEyebrow: string;
    cardCount: (count: number) => string;
    topicLabel: string;
    allTopics: string;
    typeLabel: string;
    allTypes: string;
    clear: string;
    sheetTitle: string;
    sheetCloseAria: string;
    apply: string;
  };
  directions: {
    toMeaning: string;
    toHanzi: string;
    concept: string;
    legendToMeaning: string;
    legendToHanzi: string;
  };
  session: {
    loading: string;
    queueLoading: string;
    progressLabel: (index: number, total: number) => string;
    progressAria: string;
    panelAria: (viewLabel: string) => string;
    reveal: string;
    spaceKey: string;
    skip: string;
  };
  decisions: {
    keepLearning: string;
    addToLearning: string;
    staysMastered: string;
    backToLearning: string;
    alreadyKnow: string;
  };
  card: {
    promptEyebrow: string;
    answerTitle: string;
    pinyin: string;
    explanation: string;
    example: string;
    favoriteAdd: string;
    favoriteRemove: string;
    speak: string;
  };
  voice: {
    trigger: string;
    title: string;
    closeAria: string;
    label: string;
    defaultOption: string;
    muteToggle: string;
    empty: string;
    instructionsToggle: string;
    instructionsTitle: string;
    instructions: { platform: string; body: string }[];
  };
  empty: {
    filteredTitle: string;
    studyTitle: string;
    studyBody: string;
    viewMastered: string;
    favoritesTitle: string;
    favoritesBody: string;
    masteredTitle: string;
  };
  summary: {
    eyebrow: string;
    title: (view: StudyView) => string;
    studyPrimary: (count: number) => string;
    studySecondary: (count: number) => string;
    skipped: (count: number) => string;
    favoritesPracticed: (count: number) => string;
    masteredPrimary: (count: number) => string;
    masteredSecondary: (count: number) => string;
    studyRemaining: (count: number) => string;
    suggestionEyebrow: string;
    openPack: (title: string) => string;
    restart: (view: StudyView) => string;
  };
  help: {
    trigger: string;
    title: string;
    closeAria: string;
    steps: Record<StudyView | "packs", HelpStep>;
    detailsFlow: string;
    properNames: { before: string; highlight: string; after: string };
    detailsAccount: string;
  };
  packs: {
    button: string;
    panelEyebrow: string;
    panelTitle: string;
    closeAria: string;
    intro: string;
    openedNotice: (title: string) => string;
    goToStudy: string;
    unopenedTitle: string;
    openedTitle: string;
    unopenedStatus: string;
    openedStatus: string;
    openedStamp: string;
    cardCount: (count: number) => string;
    openAria: (title: string, count: number, description: string) => string;
    openedAria: (title: string, count: number, description: string) => string;
    confirmEyebrowReady: string;
    confirmEyebrowOpening: string;
    confirmTitle: (title: string) => string;
    confirmBody: (count: number) => string;
    confirmBusy: (title: string) => string;
    confirmOpen: (title: string) => string;
    opening: string;
    cancel: string;
    resetEyebrow: string;
    resetDescription: (firstPackTitle: string, authenticated: boolean) => string;
    resetServerNote: string;
    resetConfirm: string;
    resetting: string;
  };
  login: {
    title: string;
    body: string;
    googleReady: string;
    googlePreparing: string;
    configNote: string;
    notNow: string;
  };
  notices: Record<NoticeKey, string>;
}

const es: Messages = {
  metadata: {
    description:
      "Aprende mandarín con cartas y practica tus palabras con Léi, tu compañero de conversación con IA. Con pinyin y explicaciones en español.",
    socialDescription:
      "De las cartas a la conversación: practica mandarín con tus palabras y la ayuda de Léi.",
    ogLocale: "es_ES",
    ogImageAlt: "Yuwenke, cartas de mandarín y español",
    noscript: "Necesitas activar JavaScript para usar las cartas.",
  },
  brand: {
    tagline: "Aprende Mucho Chino",
    homeAria: "Yuwenke, inicio",
  },
  localeSwitcher: {
    aria: "Idioma",
    label: { es: "ES", en: "EN" },
  },
  sync: {
    syncing: "Sincronizando…",
    synced: "Sincronizado",
    offline: "Sin conexión · cambios pendientes",
    error: "No se pudo sincronizar",
    local: "Guardado local",
    guest: "Solo en este dispositivo",
    retry: "Reintentar",
  },
  account: {
    signIn: "Iniciar sesión",
    menuAria: "Abrir menú de cuenta",
    yourAccount: "Tu cuenta",
    resetStudy: "Restablecer estudio",
    signOut: "Cerrar sesión",
    syncUnavailableTitle: "La sincronización aún no está configurada",
    initialsFallback: "Tú",
  },
  views: {
    study: "Estudiar",
    mastered: "Dominadas",
    favorites: "Favoritas",
  },
  viewsAria: "Modos de estudio",
  cardTypes: {
    palabra: "Palabra",
    frase: "Frase",
    concepto: "Concepto",
  },
  topics: {
    acciones: "Acciones",
    clasificadores: "Clasificadores",
    comida: "Comida",
    lugares: "Lugares",
    movimiento: "Movimiento",
    numeros: "Números",
    personas: "Personas",
    rutina: "Rutina",
    basico: "Básico",
    bebidas: "Bebidas",
    caracteres: "Caracteres",
    cultura: "Cultura",
    descripcion: "Descripción",
    familia: "Familia",
    gramatica: "Gramática",
    nombres: "Nombres",
    paises: "Países",
    preguntas: "Preguntas",
    presentaciones: "Presentaciones",
    pronombres: "Pronombres",
    pronunciacion: "Pronunciación",
    puntuacion: "Puntuación",
    radicales: "Radicales",
    saludos: "Saludos",
    tiempo: "Tiempo",
  },
  nav: {
    goToStudy: "Ir a Estudiar",
  },
  guestNote: {
    body:
      "Estás estudiando como invitado. Tu progreso, favoritas y packs se guardan en este dispositivo.",
    cta: "Sincronizar con Google",
  },
  storageWarning:
    "Tu progreso, favoritas y packs no se guardarán en este dispositivo.",
  toastCloseAria: "Cerrar aviso",
  search: {
    aria: "Buscar en las cartas",
    placeholder: "Busca caracteres, pinyin o español…",
    clearAria: "Borrar búsqueda",
  },
  filters: {
    trigger: "Filtros",
    triggerWithCount: (count) => `Filtros · ${count}`,
    panelAria: "Filtros",
    collectionEyebrow: "Tu colección",
    cardCount: (count) => plural(count, "carta"),
    topicLabel: "Tema",
    allTopics: "Todos los temas",
    typeLabel: "Tipo",
    allTypes: "Todos los tipos",
    clear: "Limpiar filtros",
    sheetTitle: "Filtrar cartas",
    sheetCloseAria: "Cerrar filtros",
    apply: "Aplicar filtros",
  },
  directions: {
    toMeaning: "Chino → Español",
    toHanzi: "Español → Chino",
    concept: "Concepto · Español",
    legendToMeaning: "中 → ES",
    legendToHanzi: "ES → 中",
  },
  session: {
    loading: "Preparando tus cartas…",
    queueLoading: "Preparando esta cola…",
    progressLabel: (index, total) => `Carta ${index} de ${total}`,
    progressAria: "Progreso de la sesión",
    panelAria: (viewLabel) => `${viewLabel} cartas`,
    reveal: "Mostrar respuesta",
    spaceKey: "Espacio",
    skip: "Saltar",
  },
  decisions: {
    keepLearning: "Seguir aprendiendo",
    addToLearning: "Añadir a aprendizaje",
    staysMastered: "Sigue dominada",
    backToLearning: "Volver a aprendizaje",
    alreadyKnow: "Ya la sé",
  },
  card: {
    promptEyebrow: "Tu pregunta",
    answerTitle: "Respuesta",
    pinyin: "Pinyin",
    explanation: "Explicación",
    example: "Ejemplo",
    favoriteAdd: "Añadir carta a favoritas",
    favoriteRemove: "Quitar carta de favoritas",
    speak: "Escuchar pronunciación",
  },
  voice: {
    trigger: "Elegir voz de pronunciación",
    title: "Voz de pronunciación",
    closeAria: "Cerrar ajustes de voz",
    label: "Voz china",
    defaultOption: "Voz del sistema",
    muteToggle: "Silenciar pronunciación",
    empty: "Este dispositivo todavía no tiene voces chinas instaladas.",
    instructionsToggle: "¿Cómo consigo más voces?",
    instructionsTitle: "Conseguir voces chinas",
    instructions: [
      {
        platform: "macOS",
        body:
          "Ajustes del Sistema → Accesibilidad → Contenido hablado → Voz del sistema → Gestionar voces… → Chino (China continental). Ahí puedes descargar las voces mejoradas o premium, más naturales.",
      },
      {
        platform: "iPhone / iPad",
        body:
          "Ajustes → Accesibilidad → Lectura y voz → Voces → Chino. Elige la variante de China continental, abre una voz y toca el botón de descarga. En versiones anteriores, busca Contenido hablado en lugar de Lectura y voz. Cuando termine la descarga, vuelve a abrir Yuwenke y elige la voz en Voz de pronunciación → Voz china. Yuwenke solo muestra las voces que el navegador pone a su disposición; algunas voces descargadas pueden no aparecer.",
      },
      {
        platform: "Windows",
        body:
          "Configuración → Hora e idioma → Voz → Añadir voces → chino (simplificado, China).",
      },
      {
        platform: "Android",
        body:
          "Configuración → Sistema → Salida de texto a voz → motor de Google → instalar datos de voz para chino (simplificado).",
      },
    ],
  },
  empty: {
    filteredTitle: "No hay cartas que coincidan con estos filtros.",
    studyTitle: "No quedan cartas por estudiar en tus packs abiertos.",
    studyBody: "Abre otro pack o repasa tus cartas dominadas.",
    viewMastered: "Ver dominadas",
    favoritesTitle: "Aún no tienes cartas favoritas.",
    favoritesBody: "Usa la estrella de cualquier carta para añadirla a esta cola.",
    masteredTitle: "Aún no has marcado ninguna carta como dominada.",
  },
  summary: {
    eyebrow: "Buen trabajo",
    title: (view) =>
      view === "study"
        ? "Sesión completada"
        : view === "favorites"
          ? "Repaso de favoritas completado"
          : "Revisión completada",
    studyPrimary: (count) =>
      count === 1 ? "sigue en aprendizaje" : "siguen en aprendizaje",
    studySecondary: (count) =>
      count === 1 ? "pasó a Dominadas" : "pasaron a Dominadas",
    skipped: (count) => (count === 1 ? "saltada" : "saltadas"),
    favoritesPracticed: (count) =>
      count === 1 ? "carta favorita practicada" : "cartas favoritas practicadas",
    masteredPrimary: (count) =>
      count === 1 ? "sigue dominada" : "siguen dominadas",
    masteredSecondary: (count) =>
      count === 1 ? "volvió a aprendizaje" : "volvieron a aprendizaje",
    studyRemaining: (count) =>
      plural(count, "carta disponible para seguir estudiando", "cartas disponibles para seguir estudiando"),
    suggestionEyebrow: "Siguiente sugerencia",
    openPack: (title) => `Abrir «${title}»`,
    restart: (view) =>
      view === "study"
        ? "Nueva sesión"
        : view === "favorites"
          ? "Repasar de nuevo"
          : "Revisar de nuevo",
  },
  help: {
    trigger: "¿Cómo funciona?",
    title: "Cómo funciona Yuwenke",
    closeAria: "Cerrar explicación",
    steps: {
      study: {
        title: "Estudiar",
        body:
          "Practica cartas nuevas de tus packs abiertos junto con las que estás aprendiendo. Revela la respuesta, sigue aprendiendo, márcala como dominada o sáltala por ahora.",
      },
      mastered: {
        title: "Dominadas",
        body:
          "Repasa lo que ya sabes y devuelve a Estudiar cualquier ficha que quieras reforzar.",
      },
      favorites: {
        title: "Favoritas",
        body:
          "Marca una carta con la estrella para tener sus cartas siempre disponibles en una cola personal.",
      },
      packs: {
        title: "Packs",
        body:
          "Abre cualquier colección cuando quieras para añadir material nuevo a Estudiar. Los packs abiertos permanecen disponibles.",
      },
    },
    detailsFlow:
      "Las palabras y frases se practican por separado en chino → español y español → chino. Los conceptos plantean una sola pregunta en español para recordar la regla. La búsqueda y los filtros solo cambian qué fichas ves en la cola actual.",
    properNames: {
      before: "Los nombres propios se muestran en ",
      highlight: "lila",
      after: " en caracteres chinos, pinyin y español.",
    },
    detailsAccount:
      "Como invitado, el progreso se guarda en este dispositivo. Si inicias sesión con Google, tus estados, favoritas y packs también se sincronizan entre dispositivos.",
  },
  packs: {
    button: "Packs",
    panelEyebrow: "Elige tu próximo pack",
    panelTitle: "Packs de cartas",
    closeAria: "Cerrar packs",
    intro:
      "Elige cualquier pack para añadir sus cartas a Estudiar. Una vez abierto, permanecerá en tu colección.",
    openedNotice: (title) => `«${title}» ya está abierto.`,
    goToStudy: "Ir a Estudiar",
    unopenedTitle: "Por abrir",
    openedTitle: "Abiertos",
    unopenedStatus: "Sin abrir",
    openedStatus: "Abierto",
    openedStamp: "Abierto",
    cardCount: (count) => plural(count, "carta"),
    openAria: (title, count, description) =>
      `Abrir ${title}: ${plural(count, "carta")}. ${description}`,
    openedAria: (title, count, description) =>
      `${title}, abierto: ${plural(count, "carta")}. ${description}`,
    confirmEyebrowReady: "Listo para abrir",
    confirmEyebrowOpening: "Abriendo pack",
    confirmTitle: (title) => `Abrir ${title}`,
    confirmBody: (count) =>
      `Sus ${plural(count, "carta")} nuevas estarán disponibles en Estudiar. Este pack no se podrá cerrar por separado.`,
    confirmBusy: (title) => `Abriendo ${title}…`,
    confirmOpen: (title) => `Abrir «${title}»`,
    opening: "Abriendo…",
    cancel: "Cancelar",
    resetEyebrow: "Acción destructiva",
    resetDescription: (firstPackTitle, authenticated) =>
      `Se borrarán el progreso y las favoritas, y solo quedará abierto «${firstPackTitle}». Tus preferencias ${authenticated ? "y tu sesión" : "de interfaz"} se conservarán.`,
    resetServerNote:
      "Necesitamos confirmación del servidor antes de borrar los datos locales.",
    resetConfirm: "Borrar progreso y restablecer",
    resetting: "Restableciendo…",
  },
  login: {
    title: "Guarda tu progreso",
    body:
      "Inicia sesión para continuar en otros dispositivos. El progreso y las favoritas y packs guardados aquí se conservarán al sincronizar.",
    googleReady: "Continuar con Google",
    googlePreparing: "Preparando Google…",
    configNote:
      "La sincronización todavía no está configurada. Puedes seguir estudiando en este dispositivo.",
    notNow: "Ahora no",
  },
  notices: {
    syncCompleted: "Progreso, favoritas y packs sincronizados.",
    willSyncWhenOnline: "Guardaremos este cambio cuando vuelva la conexión.",
    syncStartFailed:
      "No se pudo iniciar la sincronización. Tu progreso local sigue a salvo.",
    syncPrepareFailed:
      "No se pudo preparar la sincronización. Tu progreso local sigue a salvo.",
    syncPreparing:
      "La sincronización se está preparando. Inténtalo de nuevo en un momento.",
    localResetDone: "Tu progreso se ha restablecido en este dispositivo.",
    resetNeedsConnection:
      "Necesitas conexión para restablecer una cuenta sincronizada.",
    accountResetDone: "Tu cuenta se ha restablecido.",
    accountResetFailed:
      "No se pudo confirmar el restablecimiento. No hemos borrado tus datos locales.",
    signInFailed: "No se pudo iniciar sesión. Tu progreso local sigue a salvo.",
    signedOut: "Sesión cerrada. Ahora estudias como invitado.",
  },
};

const en: Messages = {
  metadata: {
    description:
      "Learn Mandarin with flashcards and practice your words with Léi, your AI conversation partner. With pinyin and explanations in English.",
    socialDescription:
      "From flashcards to conversation: practice Mandarin with your words and help from Léi.",
    ogLocale: "en_US",
    ogImageAlt: "Yuwenke, Mandarin and English flashcards",
    noscript: "You need to enable JavaScript to use the flashcards.",
  },
  brand: {
    tagline: "Learn Lots of Chinese",
    homeAria: "Yuwenke, home",
  },
  localeSwitcher: {
    aria: "Language",
    label: { es: "ES", en: "EN" },
  },
  sync: {
    syncing: "Syncing…",
    synced: "Synced",
    offline: "Offline · changes pending",
    error: "Couldn't sync",
    local: "Saved locally",
    guest: "Only on this device",
    retry: "Retry",
  },
  account: {
    signIn: "Sign in",
    menuAria: "Open account menu",
    yourAccount: "Your account",
    resetStudy: "Reset study",
    signOut: "Sign out",
    syncUnavailableTitle: "Sync isn't configured yet",
    initialsFallback: "You",
  },
  views: {
    study: "Study",
    mastered: "Mastered",
    favorites: "Favorites",
  },
  viewsAria: "Study modes",
  cardTypes: {
    palabra: "Word",
    frase: "Phrase",
    concepto: "Concept",
  },
  topics: {
    acciones: "Actions",
    clasificadores: "Measure words",
    comida: "Food",
    lugares: "Places",
    movimiento: "Movement",
    numeros: "Numbers",
    personas: "People",
    rutina: "Routine",
    basico: "Basics",
    bebidas: "Drinks",
    caracteres: "Characters",
    cultura: "Culture",
    descripcion: "Description",
    familia: "Family",
    gramatica: "Grammar",
    nombres: "Names",
    paises: "Countries",
    preguntas: "Questions",
    presentaciones: "Introductions",
    pronombres: "Pronouns",
    pronunciacion: "Pronunciation",
    puntuacion: "Punctuation",
    radicales: "Radicals",
    saludos: "Greetings",
    tiempo: "Time",
  },
  nav: {
    goToStudy: "Go to Study",
  },
  guestNote: {
    body:
      "You're studying as a guest. Your progress, favorites, and packs are saved on this device.",
    cta: "Sync with Google",
  },
  storageWarning:
    "Your progress, favorites, and packs won't be saved on this device.",
  toastCloseAria: "Close notice",
  search: {
    aria: "Search the cards",
    placeholder: "Search characters, pinyin, or English…",
    clearAria: "Clear search",
  },
  filters: {
    trigger: "Filters",
    triggerWithCount: (count) => `Filters · ${count}`,
    panelAria: "Filters",
    collectionEyebrow: "Your collection",
    cardCount: (count) => plural(count, "card"),
    topicLabel: "Topic",
    allTopics: "All topics",
    typeLabel: "Type",
    allTypes: "All types",
    clear: "Clear filters",
    sheetTitle: "Filter cards",
    sheetCloseAria: "Close filters",
    apply: "Apply filters",
  },
  directions: {
    toMeaning: "Chinese → English",
    toHanzi: "English → Chinese",
    concept: "Concept · English",
    legendToMeaning: "中 → EN",
    legendToHanzi: "EN → 中",
  },
  session: {
    loading: "Preparing your cards…",
    queueLoading: "Preparing this queue…",
    progressLabel: (index, total) => `Card ${index} of ${total}`,
    progressAria: "Session progress",
    panelAria: (viewLabel) => `${viewLabel} cards`,
    reveal: "Show answer",
    spaceKey: "Space",
    skip: "Skip",
  },
  decisions: {
    keepLearning: "Keep learning",
    addToLearning: "Add to learning",
    staysMastered: "Keep as mastered",
    backToLearning: "Back to learning",
    alreadyKnow: "I know this",
  },
  card: {
    promptEyebrow: "Your question",
    answerTitle: "Answer",
    pinyin: "Pinyin",
    explanation: "Explanation",
    example: "Example",
    favoriteAdd: "Add card to favorites",
    favoriteRemove: "Remove card from favorites",
    speak: "Listen to pronunciation",
  },
  voice: {
    trigger: "Choose pronunciation voice",
    title: "Pronunciation voice",
    closeAria: "Close voice settings",
    label: "Chinese voice",
    defaultOption: "System voice",
    muteToggle: "Mute pronunciation",
    empty: "This device has no Chinese voices installed yet.",
    instructionsToggle: "How do I get more voices?",
    instructionsTitle: "Getting Chinese voices",
    instructions: [
      {
        platform: "macOS",
        body:
          "System Settings → Accessibility → Spoken Content → System Voice → Manage Voices… → Chinese (China Mainland). You can download Enhanced or Premium voices there, which sound more natural.",
      },
      {
        platform: "iPhone / iPad",
        body:
          "Settings → Accessibility → Read & Speak → Voices → Chinese. Choose the China mainland variety, open a voice, and tap the download button. On older versions, look for Spoken Content instead of Read & Speak. Once the download finishes, reopen Yuwenke and select the voice under Pronunciation voice → Chinese voice. Yuwenke only lists voices made available by your browser; some downloaded voices may not appear.",
      },
      {
        platform: "Windows",
        body:
          "Settings → Time & Language → Speech → Add voices → Chinese (Simplified, China).",
      },
      {
        platform: "Android",
        body:
          "Settings → System → Text-to-speech output → Google engine → install voice data for Chinese (Simplified).",
      },
    ],
  },
  empty: {
    filteredTitle: "No cards match these filters.",
    studyTitle: "No cards left to study in your open packs.",
    studyBody: "Open another pack or review your mastered cards.",
    viewMastered: "View mastered",
    favoritesTitle: "No favorite cards yet.",
    favoritesBody: "Use the star on any card to add it to this queue.",
    masteredTitle: "You haven't marked any card as mastered yet.",
  },
  summary: {
    eyebrow: "Nice work",
    title: (view) =>
      view === "study"
        ? "Study session complete"
        : view === "favorites"
          ? "Favorites review complete"
          : "Review complete",
    studyPrimary: () => "kept in learning",
    studySecondary: () => "moved to Mastered",
    skipped: () => "skipped",
    favoritesPracticed: (count) =>
      count === 1 ? "favorite card practiced" : "favorite cards practiced",
    masteredPrimary: () => "stayed mastered",
    masteredSecondary: () => "returned to learning",
    studyRemaining: (count) =>
      plural(count, "card available to keep studying", "cards available to keep studying"),
    suggestionEyebrow: "Next suggestion",
    openPack: (title) => `Open “${title}”`,
    restart: (view) =>
      view === "study"
        ? "New session"
        : view === "favorites"
          ? "Practice again"
          : "Review again",
  },
  help: {
    trigger: "How does it work?",
    title: "How Yuwenke works",
    closeAria: "Close explanation",
    steps: {
      study: {
        title: "Study",
        body:
          "Practice new cards from your open packs alongside cards you are learning. Reveal the answer, keep learning, mark it as mastered, or skip it for now.",
      },
      mastered: {
        title: "Mastered",
        body:
          "Review what you already know and send any card you want to reinforce back to Study.",
      },
      favorites: {
        title: "Favorites",
        body:
          "Mark a card with the star to keep its cards always available in a personal queue.",
      },
      packs: {
        title: "Packs",
        body:
          "Open any collection whenever you want to add new material to Study. Opened packs stay available.",
      },
    },
    detailsFlow:
      "Words and phrases are practiced separately in Chinese → English and English → Chinese. Concepts ask a single question in English to recall the rule. Search and filters only change which cards you see in the current queue.",
    properNames: {
      before: "Proper names appear in ",
      highlight: "lilac",
      after: " in Chinese characters, pinyin, and English.",
    },
    detailsAccount:
      "As a guest, progress is saved on this device. If you sign in with Google, your statuses, favorites, and packs also sync across devices.",
  },
  packs: {
    button: "Packs",
    panelEyebrow: "Choose your next pack",
    panelTitle: "Card packs",
    closeAria: "Close packs",
    intro:
      "Choose any pack to add its cards to Study. Once opened, it stays in your collection.",
    openedNotice: (title) => `“${title}” is now open.`,
    goToStudy: "Go to Study",
    unopenedTitle: "To open",
    openedTitle: "Open",
    unopenedStatus: "Not opened",
    openedStatus: "Open",
    openedStamp: "Open",
    cardCount: (count) => plural(count, "card"),
    openAria: (title, count, description) =>
      `Open ${title}: ${plural(count, "card")}. ${description}`,
    openedAria: (title, count, description) =>
      `${title}, open: ${plural(count, "card")}. ${description}`,
    confirmEyebrowReady: "Ready to open",
    confirmEyebrowOpening: "Opening pack",
    confirmTitle: (title) => `Open ${title}`,
    confirmBody: (count) =>
      `Its ${plural(count, "new card", "new cards")} will be available in Study. This pack can't be closed separately.`,
    confirmBusy: (title) => `Opening ${title}…`,
    confirmOpen: (title) => `Open “${title}”`,
    opening: "Opening…",
    cancel: "Cancel",
    resetEyebrow: "Destructive action",
    resetDescription: (firstPackTitle, authenticated) =>
      `Progress and favorites will be deleted, and only “${firstPackTitle}” will stay open. Your ${authenticated ? "preferences and your session" : "interface preferences"} will be kept.`,
    resetServerNote:
      "We need confirmation from the server before deleting local data.",
    resetConfirm: "Delete progress and reset",
    resetting: "Resetting…",
  },
  login: {
    title: "Save your progress",
    body:
      "Sign in to continue on other devices. The progress, favorites, and packs saved here will be kept when you sync.",
    googleReady: "Continue with Google",
    googlePreparing: "Preparing Google…",
    configNote:
      "Sync isn't configured yet. You can keep studying on this device.",
    notNow: "Not now",
  },
  notices: {
    syncCompleted: "Progress, favorites, and packs synced.",
    willSyncWhenOnline: "We'll save this change when the connection is back.",
    syncStartFailed: "Couldn't start sync. Your local progress is still safe.",
    syncPrepareFailed: "Couldn't prepare sync. Your local progress is still safe.",
    syncPreparing: "Sync is still preparing. Try again in a moment.",
    localResetDone: "Your progress has been reset on this device.",
    resetNeedsConnection: "You need a connection to reset a synced account.",
    accountResetDone: "Your account has been reset.",
    accountResetFailed:
      "The reset couldn't be confirmed. We haven't deleted your local data.",
    signInFailed: "Couldn't sign in. Your local progress is still safe.",
    signedOut: "Signed out. You're now studying as a guest.",
  },
};

export const messages: Record<Locale, Messages> = { es, en };

export function topicDisplayLabel(locale: Locale, topic: string): string {
  return (
    messages[locale].topics[topic] ??
    topic.charAt(0).toLocaleUpperCase(locale) + topic.slice(1)
  );
}
