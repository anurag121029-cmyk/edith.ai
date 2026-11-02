/**
 * Pure helpers for the server PDF route (app/api/report-pdf/route.ts).
 * Kept dependency-free and unit-tested: the pdf-lib font object is only
 * needed at generation time, so wrapping takes a width function.
 */

/** Helvetica (WinAnsi) cannot encode every Unicode character; replace
 * anything outside the printable Latin-1 range with "?" rather than
 * letting pdf-lib throw on an unencodable glyph. */
export function sanitizeForPdf(text: string): string {
  return text.replace(/[^\x20-\x7E\u00A0-\u00FF\n]/gu, "?");
}

/** Greedy word wrap: returns lines that each fit within maxWidth. */
export function wrapText(
  text: string,
  measure: (line: string) => number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate) <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}
