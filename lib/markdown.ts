/**
 * Lightweight, dependency-free markdown rendering for assistant messages.
 * Safe by construction: all user/model text is HTML-escaped FIRST, and the
 * only tags ever emitted are the ones this module inserts itself
 * (p, h3, h4, ul, ol, li, strong, em, code, pre).
 *
 * Supported: fenced code blocks, inline code, headings (#-###), bold,
 * italic, unordered and ordered lists, paragraphs.
 *
 * NOT supported (and not claimed): rendered maths typesetting (KaTeX/MathJax).
 * Equations stay as plain text inside paragraphs/code.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(escaped: string): string {
  // Inline code first so * / _ inside code are not treated as emphasis.
  const codeSpans: string[] = [];
  let out = escaped.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    codeSpans.push(`<code>${code}</code>`);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^\w])_([^_\n]+)_/g, "$1<em>$2</em>");
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
    // Non-code segment: line-by-line block parsing.
    const lines = part.split("\n");
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
  return html.join("\n");
}
