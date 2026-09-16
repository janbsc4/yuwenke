const CHINESE_LANG = /^zh([_-]|$)|^cmn/i;
const VOICE_STORAGE_KEY = "yuwenke:tts-voice:v1";

/**
 * macOS lists every voice twice (compact and Enhanced/Premium variants share
 * one display name). The Web Speech API has no quality field, but the better
 * installs carry a hint in their voice URI.
 */
const QUALITY_HINT = /enhanced|premium|siri/i;

export interface ChineseVoiceOption {
  uri: string;
  name: string;
  lang: string;
}

type VoiceListener = () => void;

const listeners = new Set<VoiceListener>();
let voicesChangedWired = false;

export function speechSupported(): boolean {
  return typeof speechSynthesis !== "undefined";
}

function allVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === "undefined") return [];
  return speechSynthesis.getVoices();
}

function dedupeByName(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const bestByName = new Map<string, SpeechSynthesisVoice>();
  for (const voice of voices) {
    const current = bestByName.get(voice.name);
    if (
      current === undefined ||
      (QUALITY_HINT.test(voice.voiceURI) && !QUALITY_HINT.test(current.voiceURI))
    ) {
      bestByName.set(voice.name, voice);
    }
  }
  return [...bestByName.values()];
}

export function chineseVoiceOptions(): ChineseVoiceOption[] {
  return dedupeByName(
    allVoices().filter((voice) => CHINESE_LANG.test(voice.lang)),
  ).map((voice) => ({ uri: voice.voiceURI, name: voice.name, lang: voice.lang }));
}

/**
 * Voices load asynchronously in some browsers; subscribers re-read the list
 * whenever the engine signals that it changed.
 */
export function subscribeToVoices(listener: VoiceListener): () => void {
  if (typeof speechSynthesis === "undefined") return () => {};
  listeners.add(listener);
  if (!voicesChangedWired) {
    voicesChangedWired = true;
    speechSynthesis.addEventListener("voiceschanged", () => {
      for (const listener of listeners) listener();
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

export function preferredVoiceUri(): string {
  try {
    return window.localStorage.getItem(VOICE_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setPreferredVoice(uri: string | null): void {
  try {
    if (uri) window.localStorage.setItem(VOICE_STORAGE_KEY, uri);
    else window.localStorage.removeItem(VOICE_STORAGE_KEY);
  } catch {
    /* storage unavailable: the preference only lasts for this page load */
  }
}

function resolveVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const preferred = preferredVoiceUri();
  if (preferred) {
    const match = voices.find((voice) => voice.voiceURI === preferred);
    if (match) return match;
  }
  const chinese = dedupeByName(voices.filter((voice) => CHINESE_LANG.test(voice.lang)));
  if (chinese.length === 0) return null;
  return (
    chinese.find((voice) => /^zh[-_]CN$|^cmn[-_]Hans$/i.test(voice.lang)) ??
    chinese.find((voice) => /Hans/i.test(voice.lang)) ??
    chinese.find((voice) => voice.localService) ??
    chinese[0]
  );
}

export function speakChinese(text: string): void {
  if (typeof speechSynthesis === "undefined" || text.length === 0) return;
  const voices = allVoices();
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  const voice = resolveVoice(voices);
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}
