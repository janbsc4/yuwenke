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

  it("removes marketing eyebrows while keeping the sample card's actual prompt label", () => {
    const page = readSource("src/pages/index.astro");
    expect(page).not.toContain("lp-eyebrow");
    expect(landing).not.toContain("lp-eyebrow");
    expect(page).toContain('class="lp-demo-label"');
    expect(page).toContain("messages.es.card.promptEyebrow");
    expect(page).toContain("messages.en.card.promptEyebrow");
  });

  it("shares a visible jade keyboard ring across interactive controls", () => {
    expect(brand).toContain("--focus: var(--jade)");
    const rule = brand.match(/:where\(([^)]+)\):focus-visible\s*\{([^}]+)\}/);
    for (const control of ["button", "a", "input", "select", "textarea", "summary", "[tabindex]"]) {
      expect(rule?.[1].split(", ")).toContain(control);
    }
    expect(rule?.[2]).toContain("outline: 2px solid var(--focus)");
    expect(rule?.[2]).toContain("outline-offset: 3px");
    expect(brand).not.toContain("outline: none");
    expect(landing).toContain(".lp-chat-answer summary:focus-visible { outline-color: var(--surface)");
    expect(readSource("src/styles/conversation.css")).toContain(".chat-learner summary:focus-visible");
    expect(app).toMatch(/\.card-prompt h2\[tabindex="-1"\]:focus,\s*\.card-answer\[tabindex="-1"\]:focus\s*\{\s*outline: none;/);
  });

  it("keeps the focus ring above 3:1 contrast on the app's light surfaces", () => {
    function luminance(token: string): number {
      const hex = brand.match(new RegExp(`${token}: #([a-f0-9]{6});`))?.[1];
      expect(hex, `${token} must have an explicit color`).toBeDefined();
      const channels = [0, 2, 4].map((offset) => {
        const value = Number.parseInt(hex!.slice(offset, offset + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    }
    const ring = luminance("--jade");
    for (const token of ["--paper", "--surface", "--surface-warm", "--jade-soft"]) {
      const background = luminance(token);
      const contrast = (Math.max(ring, background) + 0.05) / (Math.min(ring, background) + 0.05);
      expect(contrast, `focus ring contrast against ${token}`).toBeGreaterThanOrEqual(3);
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
