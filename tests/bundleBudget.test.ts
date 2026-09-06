import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach } from "vitest";

import { assertFlashcardAppBundleBudget } from "../scripts/validate_bundle_budget.mjs";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDist() {
  const root = await mkdtemp(join(tmpdir(), "yuwenke-bundle-budget-"));
  tempDirs.push(root);
  const assets = join(root, "_astro");
  await mkdir(assets, { recursive: true });
  return { root, assets };
}

describe("FlashcardApp bundle budget", () => {
  it("accepts one eager app chunk within the gzip ceiling", async () => {
    const { root, assets } = await tempDist();
    await writeFile(join(assets, "FlashcardApp.hash.js"), "export const answer = 42;");

    await expect(assertFlashcardAppBundleBudget(root, 1024)).resolves.toEqual(
      expect.objectContaining({ fileName: "FlashcardApp.hash.js", maximumBytes: 1024 }),
    );
  });

  it("rejects an eager app chunk above the gzip ceiling", async () => {
    const { root, assets } = await tempDist();
    await writeFile(join(assets, "FlashcardApp.hash.js"), "export const answer = 42;");

    await expect(assertFlashcardAppBundleBudget(root, 10)).rejects.toThrow(
      /bytes gzip.*máximo permitido es 10/,
    );
  });

  it("rejects missing or ambiguous eager app chunks", async () => {
    const { root, assets } = await tempDist();
    await expect(assertFlashcardAppBundleBudget(root)).rejects.toThrow(
      /exactamente un chunk eager.*encontrados: 0/,
    );

    await writeFile(join(assets, "FlashcardApp.one.js"), "one");
    await writeFile(join(assets, "FlashcardApp.two.js"), "two");
    await expect(assertFlashcardAppBundleBudget(root)).rejects.toThrow(
      /exactamente un chunk eager.*encontrados: 2/,
    );
  });
});
