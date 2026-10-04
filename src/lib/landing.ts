import { LOCALE_STORAGE_KEY } from "./locale";

/** Enhance the static landing page without loading the study app or its state. */
export function initLandingPage(): void {
  const root = document.documentElement;
  const toggles = document.querySelectorAll<HTMLButtonElement>("[data-set-lang]");
  const syncLanguage = () => {
    const locale = root.dataset.lang === "en" ? "en" : "es";
    root.lang = locale;
    for (const button of toggles) {
      button.setAttribute("aria-pressed", String(button.dataset.setLang === locale));
    }
    for (const meta of document.querySelectorAll<HTMLMetaElement>("meta[data-content-es][data-content-en]")) {
      meta.content = (locale === "en" ? meta.dataset.contentEn : meta.dataset.contentEs) ?? meta.content;
    }
  };
  syncLanguage();
  for (const button of toggles) {
    button.addEventListener("click", () => {
      const locale = button.dataset.setLang === "en" ? "en" : "es";
      root.dataset.lang = locale;
      syncLanguage();
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
      } catch {
        // Language switching must also work when browser storage is blocked.
      }
    });
  }

  const reveal = document.querySelector<HTMLButtonElement>("[data-demo-reveal]");
  const answer = document.getElementById("demo-answer");
  const placeholder = document.querySelector<HTMLElement>("[data-demo-placeholder]");
  const revealLabel = document.querySelector<HTMLElement>("[data-reveal-label]");
  const resetLabel = document.querySelector<HTMLElement>("[data-reset-label]");
  if (reveal && answer && placeholder && revealLabel && resetLabel) {
    reveal.disabled = false;
    reveal.addEventListener("click", () => {
      const expanded = reveal.getAttribute("aria-expanded") !== "true";
      reveal.setAttribute("aria-expanded", String(expanded));
      answer.hidden = !expanded;
      placeholder.hidden = expanded;
      revealLabel.hidden = expanded;
      resetLabel.hidden = !expanded;
    });
  }
}
