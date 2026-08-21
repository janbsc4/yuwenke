export function plural(
  value: number,
  singular: string,
  pluralForm = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}
