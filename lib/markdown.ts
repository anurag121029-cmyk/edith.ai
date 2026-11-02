/**
 * Lightweight, dependency-free markdown rendering for assistant messages.
 * Safe by construction: all user/model text is HTML-escaped FIRST, and the
 * only tags ever emitted are the ones this module inserts itself
 * (p, h3, h4, ul, ol, li, strong, em, code, pre, span.math, div.math-block).
 *
 * Supported: fenced code blocks, inline code, headings (#-###), bold,
 * italic, unordered and ordered lists, paragraphs, and maths:
 *   - inline  $...$  -> <span class="math"> (styled, monospace, highlighted)
 *   - block   $$...$$ -> <div class="math-block"> (centred panel)
 *
 * Maths is STYLED, not typeset: KaTeX/MathJax is deliberately NOT included
 * (no extra dependency, no font assets, no layout engine), so fractions,
 * roots and matrices render as readable plain notation inside the styled
 * panel — e.g. $\frac{1}{2}$ shows literally as \frac{1}{2}. Do not claim
 * KaTeX anywhere in the app or README for this renderer.
 *
 * Safety notes: $...$ is only recognised when the opening $ is NOT
 * followed by a digit or whitespace (so "$5 and $10" stays as currency
 * text) and the closing $ is NOT followed by a digit. Maths inside fenced
 * code blocks is never interpreted, and $ inside inline code is protected
 * by the code-span extraction in renderInline.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const INLINE_MATH = /\$(?![\d\s])([^$\n]{1,200}?)(?<![\s$])\$(?!\d)/g;

function renderInline(escaped: string): string {
  // Inline code first so * / _ / $ inside code are not treated as markup.
  const codeSpans: string[] = [];
  let out = escaped.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    codeSpans.push(`<code>${code}</code>`);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^\w])_([^_\n]+)_/g, "$1<em>$2</em>");
  out = out.replace(INLINE_MATH, (_m, math: string) =>
    math.trim() ? `<span class="math">${math}</span>` : _m,
  );
  out = out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codeSpans[Number(i)] || "");
  return out;
}

export function renderMarkdownToHtml(md: string): string {
  const parts = md.split("```");
  const html: string[] = [];
  for (let pi = 0; pi < parts.length; pi++) {
    const part = parts[pi];
    if (pi % 2 === 1) {
      // Fenced code block: strip an optional language tag on the first line.
      const firstNl = part.indexOf("\n");
      const body = firstNl >= 0 ? part.slice(firstNl + 1) : part;
      html.push(`<pre><code>${escapeHtml(body.replace(/\n$/, ""))}</code></pre>`);
      continue;
    }
    // Non-code segment: split out block maths first, then line-parse the
    // remaining text exactly as before.
    const segments = part.split(/\$\$([\s\S]+?)\$\$/g);
    for (let si = 0; si < segments.length; si++) {
      if (si % 2 === 1) {
        const math = segments[si].trim();
        if (math) html.push(`<div class="math-block">${escapeHtml(math)}</div>`);
        continue;
      }
      const lines = segments[si].split("\n");
      let listTag: "ul" | "ol" | null = null;
      const closeList = () => {
        if (listTag) {
          html.push(`</${listTag}>`);
          listTag = null;
        }
      };
      for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        const trimmed = line.trim();
        const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
        const ulItem = trimmed.match(/^[-*]\s+(.+)$/);
        const olItem = trimmed.match(/^\d+\.\s+(.+)$/);
        if (heading) {
          closeList();
          const tag = heading[1].length === 1 ? "h3" : "h4";
          html.push(`<${tag}>${renderInline(escapeHtml(heading[2]))}</${tag}>`);
        } else if (ulItem) {
          if (listTag !== "ul") {
            closeList();
            html.push("<ul>");
            listTag = "ul";
          }
          html.push(`<li>${renderInline(escapeHtml(ulItem[1]))}</li>`);
        } else if (olItem) {
          if (listTag !== "ol") {
            closeList();
            html.push("<ol>");
            listTag = "ol";
          }
          html.push(`<li>${renderInline(escapeHtml(olItem[1]))}</li>`);
        } else if (!trimmed) {
          closeList();
        } else {
          closeList();
          html.push(`<p>${renderInline(escapeHtml(trimmed))}</p>`);
        }
      }
      closeList();
    }
  }
  return html.join("\n");
}
