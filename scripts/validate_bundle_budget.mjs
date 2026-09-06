import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export const FLASHCARD_APP_MAX_GZIP_BYTES = 20 * 1024;

export async function assertFlashcardAppBundleBudget(
  distDirectory = resolve("dist"),
  maximumBytes = FLASHCARD_APP_MAX_GZIP_BYTES,
) {
  const assetsDirectory = resolve(distDirectory, "_astro");
  const entries = await readdir(assetsDirectory, { withFileTypes: true });
  const chunks = entries
    .filter((entry) => entry.isFile() && /^FlashcardApp\..+\.js$/.test(entry.name))
    .map((entry) => entry.name);

  if (chunks.length !== 1) {
    throw new Error(
      `Se esperaba exactamente un chunk eager de FlashcardApp; encontrados: ${chunks.length}.`,
    );
  }

  const chunk = await readFile(resolve(assetsDirectory, chunks[0]));
  const gzipBytes = gzipSync(chunk).byteLength;
  if (gzipBytes > maximumBytes) {
    throw new Error(
      `El chunk eager ${chunks[0]} ocupa ${gzipBytes} bytes gzip; ` +
        `el máximo permitido es ${maximumBytes}.`,
    );
  }

  return { fileName: chunks[0], gzipBytes, maximumBytes };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const result = await assertFlashcardAppBundleBudget();
  console.log(
    `Presupuesto del chunk eager validado: ${result.gzipBytes}/${result.maximumBytes} bytes gzip.`,
  );
}
