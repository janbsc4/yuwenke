import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(path, "utf8");
const brand = readSource("src/styles/brand.css");
const app = readSource("src/styles/global.css");
const landing = readSource("src/styles/landing.css");

function declarations(css: string, selector: string): string {
  return css.match(new RegExp(`(?:^|\\n)\\.${selector}\\s*\\{([^}]+)\\}`))?.[1] ?? "";
}

describe("shared visual identity", () => {
  it.each([
    ["study app", app],
    ["landing page", landing],
  ])("loads the shared fonts and palette in the %s without redefining them", (_name, css) => {
    expect(css.trimStart()).toMatch(/^@import "\.\/brand\.css";/);
    expect(css).not.toContain("@font-face");
    const tokens = [...brand.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]);
    expect(tokens).toContain("--font-ui");
    expect(tokens).toContain("--jade");
    for (const token of tokens) {
      expect(css, `${token} must be defined only in brand.css`).not.toMatch(new RegExp(`${token}\\s*:`));
    }
  });

  it("uses the app UI font for landing headings without loading a second Latin font", () => {
    const headings = landing.match(/h1, h2\s*\{([^}]+)\}/)?.[1];
    expect(headings).toContain("font-family: var(--font-ui)");
    expect(headings).toContain("font-weight: 700");
    expect(landing).not.toContain("--font-display");
    expect(readSource("src/pages/index.astro")).not.toMatch(/Young Serif|young-serif/);
  });

  it("uses matching primary and ink button colors, including hover states", () => {
    for (const [appSelector, landingSelector, token] of [
      ["button-primary", "lp-button-primary", "--jade"],
      ["button-primary:hover", "lp-button-primary:hover", "--jade-dark"],
      ["button-ink", "lp-button-ink", "--ink"],
      ["button-ink:hover", "lp-button-ink:hover", "--ink-hover"],
    ]) {
      const background = `background: var(${token})`;
      expect(declarations(app, appSelector)).toContain(background);
      expect(declarations(landing, landingSelector)).toContain(background);
    }
  });

  it("uses the same pack tints and needs-work feedback color as the app", () => {
    for (const token of ["--cinnabar-soft", "--jade-soft", "--amber-soft", "--proper-name-soft"]) {
      expect(app).toContain(`--pack-soft: var(${token})`);
      expect(landing).toContain(`--pack-paper: var(${token})`);
    }
    expect(readSource("src/styles/conversation.css")).toContain("--assessment-color: var(--assessment-needs-work)");
    expect(declarations(landing, "lp-naturalness summary")).toContain("color: var(--assessment-needs-work)");
  });
});
