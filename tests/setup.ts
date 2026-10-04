import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

if (typeof window !== "undefined") Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: new MemoryStorage(),
});

// jsdom does not implement modal dialogs or the browser's Escape default action.
if (typeof window !== "undefined") {
  const openers = new WeakMap<HTMLDialogElement, Element | null>();
  HTMLDialogElement.prototype.showModal = function () {
    openers.set(this, document.activeElement);
    this.open = true;
    this.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled])")?.focus();
  };
  HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    this.open = false;
    const opener = openers.get(this);
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
  };
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    const dialog = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].at(-1);
    if (dialog?.dispatchEvent(new Event("cancel", { cancelable: true }))) dialog.close();
  });
}

afterEach(() => {
  cleanup();
  if (typeof window !== "undefined") window.localStorage?.clear();
});
