import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function assertDeployedChatCatalog(apiUrl, expected, fetchImpl = globalThis.fetch) {
  const url = new URL(apiUrl);
  url.pathname = "/catalog-version";
  url.search = "";
  url.hash = "";
  const response = await fetchImpl(url, { signal: globalThis.AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error(
      `Léi catalog check returned HTTP ${response.status}. Run npm run deploy:chat before deploying Pages.`,
    );
  }
  const actual = await response.json();
  if (actual?.sha256 !== expected.sha256 || actual?.cardCount !== expected.cardCount) {
    throw new Error(
      `Léi catalog mismatch: expected ${expected.cardCount} cards (${expected.sha256}), ` +
      `received ${actual?.cardCount} cards (${actual?.sha256}). Run npm run deploy:chat before deploying Pages.`,
    );
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  if (process.env.PUBLIC_CHAT_ENABLED !== "true") {
    console.log("Skipped deployed Léi catalog check: Converse is disabled.");
  } else {
    if (!process.env.PUBLIC_CHAT_API_URL) throw new Error("PUBLIC_CHAT_API_URL is required when Converse is enabled.");
    const expected = JSON.parse(await readFile(new URL("../worker/generated/catalog-version.json", import.meta.url), "utf8"));
    await assertDeployedChatCatalog(process.env.PUBLIC_CHAT_API_URL, expected);
    console.log(`Deployed Léi catalog matches all ${expected.cardCount} source cards.`);
  }
}
