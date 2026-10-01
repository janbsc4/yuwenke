import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HOME_SCREEN_HINT_DISMISSED_KEY, initHomeScreenHint } from "../src/lib/homeScreen";

const iPhoneSafari = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1";
const iPadSafari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15";
const androidChrome = "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36";

describe("mobile Home Screen suggestion", () => {
  let hint: HTMLElement;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    document.documentElement.lang = "en";
    document.body.innerHTML = `<aside hidden>
      <div data-home-screen-platform="safari" hidden>
        <div data-home-screen-lang="es" hidden>Añadir a pantalla de inicio</div>
        <div data-home-screen-lang="en" hidden>Add to Home Screen</div>
      </div>
      <div data-home-screen-platform="android" hidden>
        <div data-home-screen-lang="es" hidden><button data-home-screen-install>Instalar Yuwenke</button></div>
        <div data-home-screen-lang="en" hidden><button data-home-screen-install>Install Yuwenke</button></div>
      </div>
      <button type="button" data-home-screen-dismiss></button>
    </aside>`;
    hint = document.querySelector("aside")!;
    vi.stubGlobal("navigator", { userAgent: iPhoneSafari, maxTouchPoints: 1, standalone: false });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    [iPhoneSafari, 1],
    [iPhoneSafari.replace("iPhone", "iPad"), 5],
    [iPadSafari, 5],
  ])("offers instructions in Safari on Apple touch devices (%s)", (userAgent, maxTouchPoints) => {
    vi.stubGlobal("navigator", { userAgent, maxTouchPoints });
    cleanup = initHomeScreenHint(hint);
    expect(hint.hidden).toBe(false);
    expect(hint.querySelector<HTMLElement>('[data-home-screen-lang="en"]')!.hidden).toBe(false);
  });

  it.each([
    [iPadSafari, 0],
    [iPhoneSafari.replace("Version/26.0", "CriOS/140.0"), 1],
    [iPhoneSafari.replace("Version/26.0", "FxiOS/140.0"), 1],
    ["Mozilla/5.0 (Linux; Android) Chrome/140.0 Safari/537.36", 5],
    ["Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148", 1],
  ])("stays hidden outside mobile Safari (%s)", (userAgent, maxTouchPoints) => {
    vi.stubGlobal("navigator", { userAgent, maxTouchPoints });
    cleanup = initHomeScreenHint(hint);
    expect(hint.hidden).toBe(true);
  });

  it.each(["apple", "display-mode"])("stays hidden in an installed app detected by %s", (mode) => {
    if (mode === "apple") {
      vi.stubGlobal("navigator", { userAgent: iPhoneSafari, standalone: true });
    } else {
      vi.stubGlobal("matchMedia", () => ({ matches: true }));
    }
    cleanup = initHomeScreenHint(hint);
    expect(hint.hidden).toBe(true);
  });

  it("updates the copy and dismissal label when the learner switches language", async () => {
    cleanup = initHomeScreenHint(hint);
    document.documentElement.lang = "es";
    await Promise.resolve();
    expect(hint.querySelector<HTMLElement>('[data-home-screen-lang="es"]')!.hidden).toBe(false);
    expect(hint.querySelector<HTMLElement>('[data-home-screen-lang="en"]')!.hidden).toBe(true);
    expect(hint.querySelector("[data-home-screen-dismiss]")).toHaveAttribute("aria-label", "Cerrar sugerencia");
  });

  it("remembers dismissal on later visits", () => {
    cleanup = initHomeScreenHint(hint);
    hint.querySelector<HTMLButtonElement>("[data-home-screen-dismiss]")!.click();
    expect(hint.hidden).toBe(true);
    expect(window.localStorage.getItem(HOME_SCREEN_HINT_DISMISSED_KEY)).toBe("1");
    cleanup?.();
    cleanup = initHomeScreenHint(hint);
    expect(hint.hidden).toBe(true);
  });

  it("can be shown and dismissed when Safari blocks storage", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
    cleanup = initHomeScreenHint(hint);
    expect(hint.hidden).toBe(false);
    expect(() => hint.querySelector<HTMLButtonElement>("[data-home-screen-dismiss]")!.click()).not.toThrow();
    expect(hint.hidden).toBe(true);
  });

  function installEvent(outcome: "accepted" | "dismissed" = "accepted") {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    const prompt = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
    return { event, prompt };
  }

  function androidHint() {
    vi.stubGlobal("navigator", { userAgent: androidChrome, maxTouchPoints: 5 });
    cleanup = initHomeScreenHint(hint);
  }

  function installButton() {
    return hint.querySelector<HTMLButtonElement>('[data-home-screen-lang="en"] [data-home-screen-install]')!;
  }

  it("offers Android installation only after Chrome reports that it is available", async () => {
    androidHint();
    expect(hint.hidden).toBe(true);
    const { event, prompt } = installEvent();
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(hint.hidden).toBe(false);
    expect(hint.querySelector<HTMLElement>('[data-home-screen-platform="safari"]')!.hidden).toBe(true);
    expect(hint.querySelector<HTMLElement>('[data-home-screen-platform="android"]')!.hidden).toBe(false);
    expect(prompt).not.toHaveBeenCalled();
    installButton().click();
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    expect(hint.hidden).toBe(true);
    installButton().click();
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it.each([
    androidChrome.replace("Chrome/", "EdgA/"),
    `${androidChrome} SamsungBrowser/28.0`,
    androidChrome.replace("Pixel 9)", "Pixel 9; wv)"),
    androidChrome.replace("Linux; Android 16; Pixel 9", "X11; Linux x86_64"),
    iPhoneSafari.replace("Version/26.0", "CriOS/140.0"),
  ])("ignores installation events outside Android Chrome (%s)", (userAgent) => {
    vi.stubGlobal("navigator", { userAgent, maxTouchPoints: 5 });
    cleanup = initHomeScreenHint(hint);
    window.dispatchEvent(installEvent().event);
    expect(hint.hidden).toBe(true);
  });

  it("keeps Android installation hidden inside an installed app", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    androidHint();
    window.dispatchEvent(installEvent().event);
    expect(hint.hidden).toBe(true);
  });

  it("hides Android installation after the browser reports completion", () => {
    androidHint();
    const { event, prompt } = installEvent();
    window.dispatchEvent(event);
    window.dispatchEvent(new Event("appinstalled"));
    window.dispatchEvent(installEvent().event);
    expect(hint.hidden).toBe(true);
    installButton().click();
    expect(prompt).not.toHaveBeenCalled();
  });

  it("remembers a dismissal of the native Android install dialog", async () => {
    androidHint();
    window.dispatchEvent(installEvent("dismissed").event);
    installButton().click();
    await vi.waitFor(() => expect(window.localStorage.getItem(HOME_SCREEN_HINT_DISMISSED_KEY)).toBe("1"));
    window.dispatchEvent(installEvent().event);
    expect(hint.hidden).toBe(true);
    cleanup?.();
    androidHint();
    window.dispatchEvent(installEvent().event);
    expect(hint.hidden).toBe(true);
  });

  it("can retry a failed native dialog after a fresh Chrome readiness event", async () => {
    androidHint();
    const { event, prompt } = installEvent();
    prompt.mockRejectedValue(new Error("No install dialog available"));
    window.dispatchEvent(event);
    installButton().click();
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    expect(hint.hidden).toBe(true);
    const retry = installEvent();
    window.dispatchEvent(retry.event);
    expect(hint.hidden).toBe(false);
    installButton().click();
    await vi.waitFor(() => expect(retry.prompt).toHaveBeenCalledTimes(1));
  });
});
