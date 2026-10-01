export const HOME_SCREEN_HINT_DISMISSED_KEY = "yuwenke:home-screen-hint-dismissed:v1";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Promote installation only where the browser and installed app share sign-in storage. */
export function initHomeScreenHint(element: HTMLElement): (() => void) | undefined {
  const isAndroidChrome = /Android/.test(navigator.userAgent) && /Chrome\//.test(navigator.userAgent) &&
    !/EdgA|OPR|SamsungBrowser|; wv\)/.test(navigator.userAgent);
  // iOS Home Screen apps isolate the localStorage used by Firebase sign-in.
  if (!isAndroidChrome || window.matchMedia?.("(display-mode: standalone)").matches) return;

  try {
    if (window.localStorage.getItem(HOME_SCREEN_HINT_DISMISSED_KEY) === "1") return;
  } catch {
    // Installation help still works when the browser blocks storage.
  }

  const dismissButton = element.querySelector<HTMLButtonElement>("[data-home-screen-dismiss]");
  const installButtons = element.querySelectorAll<HTMLButtonElement>("[data-home-screen-install]");
  const syncLanguage = () => {
    const locale = document.documentElement.lang === "es" ? "es" : "en";
    for (const copy of element.querySelectorAll<HTMLElement>("[data-home-screen-lang]")) {
      copy.hidden = copy.dataset.homeScreenLang !== locale;
    }
    dismissButton?.setAttribute(
      "aria-label",
      locale === "es" ? "Cerrar sugerencia" : "Dismiss suggestion",
    );
  };
  syncLanguage();
  const observer = new MutationObserver(syncLanguage);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  element.hidden = true;

  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  let dismissed = false;
  let installed = false;
  let installing = false;
  const dismiss = () => {
    dismissed = true;
    deferredPrompt = null;
    element.hidden = true;
    try {
      window.localStorage.setItem(HOME_SCREEN_HINT_DISMISSED_KEY, "1");
    } catch {
      // Dismiss for this page even when the preference cannot be saved.
    }
  };
  const installReady = (event: Event) => {
    event.preventDefault();
    if (dismissed || installed || installing) return;
    deferredPrompt = event as BeforeInstallPromptEvent;
    element.hidden = false;
  };
  const appInstalled = () => {
    installed = true;
    deferredPrompt = null;
    element.hidden = true;
  };
  const install = async () => {
    const prompt = deferredPrompt;
    if (!prompt) return;
    // Chrome's event can be used once, and the dialog must follow a user click.
    deferredPrompt = null;
    installing = true;
    element.hidden = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "dismissed") dismiss();
      else appInstalled();
    } catch {
      // Wait for a new readiness event if Chrome cannot open this dialog.
    } finally {
      installing = false;
    }
  };
  const requestInstall = () => { void install(); };
  dismissButton?.addEventListener("click", dismiss);
  window.addEventListener("beforeinstallprompt", installReady);
  window.addEventListener("appinstalled", appInstalled);
  for (const button of installButtons) button.addEventListener("click", requestInstall);
  return () => {
    observer.disconnect();
    dismissButton?.removeEventListener("click", dismiss);
    window.removeEventListener("beforeinstallprompt", installReady);
    window.removeEventListener("appinstalled", appInstalled);
    for (const button of installButtons) button.removeEventListener("click", requestInstall);
  };
}
