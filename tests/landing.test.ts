import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { initLandingPage } from "../src/lib/landing";
import { LOCALE_STORAGE_KEY } from "../src/lib/locale";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.dataset.lang = "en";
  document.head.innerHTML = '<meta name="description" content="Español" data-content-es="Español" data-content-en="English">';
  document.body.innerHTML = `
    <button data-set-lang="es" aria-pressed="true">ES</button>
    <button data-set-lang="en" aria-pressed="false">EN</button>
    <div data-demo-placeholder>Think first</div>
    <div id="demo-answer" hidden>You</div>
    <button data-demo-reveal disabled aria-expanded="false" aria-controls="demo-answer">
      <span data-reveal-label>Show answer</span>
      <span data-reset-label hidden>Try again</span>
    </button>`;
  initLandingPage();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lang");
  document.documentElement.lang = "en";
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

const element = (selector: string) => document.querySelector<HTMLElement>(selector)!;

describe("landing page", () => {
  it("honors the language resolved before paint, including metadata and pressed state", () => {
    expect(document.documentElement.lang).toBe("en");
    expect(element('[data-set-lang="en"]')).toHaveAttribute("aria-pressed", "true");
    expect(element('[data-set-lang="es"]')).toHaveAttribute("aria-pressed", "false");
    expect(element('meta[name="description"]')).toHaveAttribute("content", "English");
  });

  it("switches the page language and saves the same preference used by the app", () => {
    element('[data-set-lang="es"]').click();
    expect(document.documentElement.lang).toBe("es");
    expect(document.documentElement.dataset.lang).toBe("es");
    expect(element('[data-set-lang="es"]')).toHaveAttribute("aria-pressed", "true");
    expect(element('[data-set-lang="en"]')).toHaveAttribute("aria-pressed", "false");
    expect(element('meta[name="description"]')).toHaveAttribute("content", "Español");
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("es");
  });

  it("switches languages even when guest storage is blocked", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
    element('[data-set-lang="es"]').click();
    expect(document.documentElement.lang).toBe("es");
    expect(element('meta[name="description"]')).toHaveAttribute("content", "Español");
  });

  it("reveals and resets the real sample answer with matching accessible state", () => {
    const button = element("[data-demo-reveal]");
    expect(button).not.toBeDisabled();
    button.click();
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(element("#demo-answer").hidden).toBe(false);
    expect(element("[data-demo-placeholder]").hidden).toBe(true);
    expect(element("[data-reveal-label]").hidden).toBe(true);
    expect(element("[data-reset-label]").hidden).toBe(false);
    button.click();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(element("#demo-answer").hidden).toBe(true);
    expect(element("[data-demo-placeholder]").hidden).toBe(false);
    expect(element("[data-reveal-label]").hidden).toBe(false);
    expect(element("[data-reset-label]").hidden).toBe(true);
  });

  it("keeps the preview out of saved study state, even across a language switch", () => {
    expect(window.localStorage.length).toBe(0);
    element("[data-demo-reveal]").click();
    expect(window.localStorage.length).toBe(0);
    element('[data-set-lang="es"]').click();
    expect(element("#demo-answer").hidden).toBe(false);
    expect(element("[data-demo-reveal]")).toHaveAttribute("aria-expanded", "true");
    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.key(0)).toBe(LOCALE_STORAGE_KEY);
  });
});
