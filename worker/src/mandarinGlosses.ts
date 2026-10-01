export interface MandarinGloss {
  hanzi: string;
  pinyin: string;
  meaning: string;
}

export function annotateMandarinReferences(text: string, glosses: MandarinGloss[]): string {
  const byHanzi = new Map(glosses.map((gloss) => [
    gloss.hanzi.replace(/^[^\p{Script=Han}]+|[^\p{Script=Han}]+$/gu, ""), gloss,
  ]));
  return text.replace(/(\p{Script=Han}+)([”»"']?)(\s*\([^()\p{Script=Han}]*\))?/gu,
    (original: string, hanzi: string, quote: string, parenthesis: string | undefined) => {
      const gloss = byHanzi.get(hanzi);
      if (!gloss) return original;
      const annotation = `${hanzi}${quote} (${gloss.pinyin} — ${gloss.meaning})`;
      if (!parenthesis) return annotation;
      // Replace an existing reading/gloss, but preserve unrelated explanatory parentheses.
      const content = parenthesis.trim().slice(1, -1).trim();
      const reading = content.split(/[—–]/)[0].trim();
      return reading.toLowerCase() === gloss.pinyin.toLowerCase() || content.toLowerCase() === gloss.meaning.toLowerCase()
        ? annotation
        : annotation + parenthesis;
    });
}
