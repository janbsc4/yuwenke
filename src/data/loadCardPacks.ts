import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Papa from "papaparse";
import { z } from "zod";

import type { CardPack, Flashcard, PackIdByCardId } from "../types";

const cardPackSchema = z.object({
  id: z.string().regex(/^CP\d{3}$/, "debe tener el formato CP001"),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  mark: z.string().trim().min(1).max(2),
  theme: z.enum(["cinnabar", "jade", "amber", "lilac"]),
});

export function parseCardPackCatalog(json: string): CardPack[] {
  let candidate: unknown;
  try {
    candidate = JSON.parse(json);
  } catch {
    throw new Error("El catálogo de packs no contiene JSON válido.");
  }

  const parsed = z.array(cardPackSchema).min(1).safeParse(candidate);
  if (!parsed.success) {
    throw new Error(`Catálogo de packs inválido: ${z.prettifyError(parsed.error)}`);
  }

  const ids = new Set<string>();
  for (const pack of parsed.data) {
    if (ids.has(pack.id)) throw new Error(`ID de pack duplicado: ${pack.id}`);
    ids.add(pack.id);
  }
  return parsed.data;
}

export function parseCardPackMembershipCsv(csv: string): PackIdByCardId {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
  });
  if (result.errors.length > 0) {
    throw new Error(`El CSV de membresías no se pudo analizar: ${result.errors[0].message}`);
  }
  if ((result.meta.fields ?? []).join(",") !== "card_id,pack_id") {
    throw new Error("El CSV de membresías debe contener solo card_id,pack_id.");
  }

  const memberships: PackIdByCardId = {};
  for (const [index, row] of result.data.entries()) {
    const parsed = z
      .object({
        card_id: z.string().regex(/^FC\d{3}$/),
        pack_id: z.string().regex(/^CP\d{3}$/),
      })
      .safeParse(row);
    if (!parsed.success) {
      throw new Error(`Membresía inválida en la fila ${index + 2}: ${z.prettifyError(parsed.error)}`);
    }
    if (memberships[parsed.data.card_id]) {
      throw new Error(`Membresía duplicada para la tarjeta ${parsed.data.card_id}`);
    }
    memberships[parsed.data.card_id] = parsed.data.pack_id;
  }
  return memberships;
}

export function validateCardPackData(
  packs: CardPack[],
  packIdByCardId: PackIdByCardId,
  cards: Flashcard[],
): void {
  const cardIds = new Set(cards.map((card) => card.id));
  const packIds = new Set(packs.map((pack) => pack.id));

  for (const card of cards) {
    if (!packIdByCardId[card.id]) throw new Error(`Falta la membresía de ${card.id}`);
  }
  for (const [cardId, packId] of Object.entries(packIdByCardId)) {
    if (!cardIds.has(cardId)) throw new Error(`Tarjeta desconocida ${cardId}`);
    if (!packIds.has(packId)) throw new Error(`Pack desconocido ${packId} para ${cardId}`);
  }
  for (const pack of packs) {
    if (!Object.values(packIdByCardId).includes(pack.id)) {
      throw new Error(`El pack ${pack.id} no contiene tarjetas`);
    }
  }
}

export function loadCardPackData(cards: Flashcard[]): {
  packs: CardPack[];
  packIdByCardId: PackIdByCardId;
} {
  const packs = parseCardPackCatalog(
    readFileSync(resolve(process.cwd(), "card_packs.json"), "utf8"),
  );
  const packIdByCardId = parseCardPackMembershipCsv(
    readFileSync(resolve(process.cwd(), "card_pack_membership.csv"), "utf8"),
  );
  validateCardPackData(packs, packIdByCardId, cards);
  return { packs, packIdByCardId };
}
