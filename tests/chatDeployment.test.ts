// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { assertDeployedChatCatalog } from "../scripts/validate_chat_catalog.mjs";
import catalogVersion from "../worker/generated/catalog-version.json";

const apiUrl = "https://lei.example/conversation";
const catalog = readFileSync(new URL("../worker/generated/catalog.json", import.meta.url), "utf8");

it("fingerprints the exact catalog bundled into the Worker", () => {
  expect(catalogVersion).toEqual({
    sha256: createHash("sha256").update(catalog).digest("hex"),
    cardCount: (JSON.parse(catalog) as unknown[]).length,
  });
});

it("allows deployment when the live Worker matches every source card", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(catalogVersion));
  await expect(assertDeployedChatCatalog(apiUrl, catalogVersion, fetchMock)).resolves.toBeUndefined();
  expect(fetchMock.mock.calls[0][0]).toEqual(new URL("https://lei.example/catalog-version"));
  expect(fetchMock).toHaveBeenCalledOnce();
});

it.each([
  { ...catalogVersion, cardCount: catalogVersion.cardCount - 25 },
  { ...catalogVersion, sha256: "older-content-with-the-same-card-count" },
  null,
])("blocks Pages when the deployed catalog differs from the site (%j)", async (actual) => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(actual));
  await expect(assertDeployedChatCatalog(apiUrl, catalogVersion, fetchMock))
    .rejects.toThrow(`Léi catalog mismatch: expected ${catalogVersion.cardCount} cards`);
});

it("blocks deployment when an older Worker has no catalog-version endpoint", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
  await expect(assertDeployedChatCatalog(apiUrl, catalogVersion, fetchMock))
    .rejects.toThrow("HTTP 404. Run npm run deploy:chat before deploying Pages.");
});
