export const NEUTRAL_STUDY_DIRECTIONS = ["hanzi-meaning", "meaning-hanzi"] as const;
export const LEGACY_DIRECTIONS = ["hanzi-es", "es-hanzi"] as const;
export const CONCEPT_DIRECTION = "concept";

export type Locale = "es" | "en";
export type NeutralDirection =
  | (typeof NEUTRAL_STUDY_DIRECTIONS)[number]
  | typeof CONCEPT_DIRECTION;
export type StudyDirection = NeutralDirection | (typeof LEGACY_DIRECTIONS)[number];
export type ProgressStatus = "learning" | "known";
export type StudyView = "study" | "discover" | "mastered" | "favorites";
export type CardType = "palabra" | "frase" | "concepto";

export interface LocalizedText {
  es: string;
  en: string;
}

export interface Flashcard {
  id: string;
  tipo: CardType;
  tema: string;
  hanzi: string;
  pinyin: string;
  espanol: string;
  explicacion: string;
  ejemplo_hanzi: string;
  ejemplo_pinyin: string;
  ejemplo_espanol: string;
  pagina: string;
  etiquetas: string;
  nombres_propios: string;
  ingles: string;
  explicacion_ingles: string;
  ejemplo_ingles: string;
  etiquetas_ingles: string;
}

export interface StudyUnit {
  key: string;
  cardId: string;
  direction: NeutralDirection;
  card: Flashcard;
}

export interface CardPack {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  mark: string;
  theme: "cinnabar" | "jade" | "amber" | "lilac";
}

export type PackIdByCardId = Record<string, string>;

export interface CardPackState {
  openPackIds: string[];
  clientUpdatedAt: number;
  serverUpdatedAt: number | null;
  resetAt: number;
  schemaVersion: 1;
}

export interface ProgressEntry {
  cardId: string;
  direction: StudyDirection;
  status: ProgressStatus;
  clientUpdatedAt: number;
  serverUpdatedAt: number | null;
  resetAt?: number;
  schemaVersion: 1 | 2;
}

export type ProgressMap = Record<string, ProgressEntry>;

export interface FavoriteEntry {
  cardId: string;
  favorite: boolean;
  clientUpdatedAt: number;
  serverUpdatedAt: number | null;
  resetAt?: number;
  schemaVersion: 1 | 2;
}

export type FavoriteMap = Record<string, FavoriteEntry>;

export interface Filters {
  query: string;
  topic: string;
  type: CardType | "all";
}

export interface SessionTally {
  primary: number;
  secondary: number;
  skipped: number;
}
