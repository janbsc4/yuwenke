export interface HighlightedSegment {
  text: string;
  properName: boolean;
}

const LATIN_TOKEN = /^[\p{Script=Latin}\p{Mark}\s'’-]+$/u;
const LATIN_LETTER = /[\p{Script=Latin}\p{Mark}]/u;

export function properNamesFor(value: string): string[] {
  return [...new Set(value.split(";").map((name) => name.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length);
}

function isLatinBoundary(text: string, index: number): boolean {
  const character = text[index];
  return character === undefined || !LATIN_LETTER.test(character);
}

function findToken(text: string, token: string, from: number): number {
  let index = text.indexOf(token, from);
  if (!LATIN_TOKEN.test(token)) return index;

  while (index >= 0) {
    const before = index - 1;
    const after = index + token.length;
    if (isLatinBoundary(text, before) && isLatinBoundary(text, after)) return index;
    index = text.indexOf(token, index + 1);
  }
  return -1;
}

export function highlightProperNames(
  text: string,
  annotation: string,
): HighlightedSegment[] {
  const names = properNamesFor(annotation);
  if (names.length === 0 || text.length === 0) {
    return [{ text, properName: false }];
  }

  const segments: HighlightedSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let nextIndex = -1;
    let nextName = "";

    for (const name of names) {
      const index = findToken(text, name, cursor);
      if (
        index >= 0 &&
        (nextIndex < 0 || index < nextIndex || (index === nextIndex && name.length > nextName.length))
      ) {
        nextIndex = index;
        nextName = name;
      }
    }

    if (nextIndex < 0) {
      segments.push({ text: text.slice(cursor), properName: false });
      break;
    }
    if (nextIndex > cursor) {
      segments.push({ text: text.slice(cursor, nextIndex), properName: false });
    }
    segments.push({ text: nextName, properName: true });
    cursor = nextIndex + nextName.length;
  }

  return segments;
}
