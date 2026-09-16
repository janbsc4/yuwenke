const CHINESE_LANG = /^zh([_-]|$)|^cmn/i;

let cachedVoice: SpeechSynthesisVoice | null | undefined;

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const chinese = voices.filter((voice) => CHINESE_LANG.test(voice.lang));
  if (chinese.length === 0) return null;
  return (
    chinese.find((voice) => /^zh[-_]CN$|^cmn[-_]Hans$/i.test(voice.lang)) ??
    chinese.find((voice) => /Hans/i.test(voice.lang)) ??
    chinese.find((voice) => voice.localService) ??
    chinese[0]
  );
}

function resolveVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  if (cachedVoice === undefined) {
    cachedVoice = pickVoice(speechSynthesis.getVoices());
    if (cachedVoice === null && speechSynthesis.getVoices().length === 0) {
      speechSynthesis.addEventListener("voiceschanged", () => {
        cachedVoice = pickVoice(speechSynthesis.getVoices());
      }, { once: true });
    }
  }
  return cachedVoice === undefined ? null : cachedVoice;
}

export function speakChinese(text: string): void {
  if (typeof speechSynthesis === "undefined" || text.length === 0) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  const voice = resolveVoice();
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}
