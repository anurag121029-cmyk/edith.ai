import { describe, it, expect } from "vitest";
import { renderMarkdownToHtml, escapeHtml } from "../lib/markdown";
import { formatMemoryContext } from "../lib/logic";

describe("renderMarkdownToHtml", () => {
  it("escapes HTML so injected tags cannot execute", () => {
    const out = renderMarkdownToHtml('<script>alert("x")</script> hello');
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });
  it("renders headings, bold, italic, lists and inline code", () => {
    const out = renderMarkdownToHtml("# Title\n**bold** and *italic* and `code`\n- one\n- two\n1. first\n2. second");
    expect(out).toContain("<h3>Title</h3>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
    expect(out).toContain("<code>code</code>");
    expect(out).toContain("<ul>");
    expect(out).toContain("<ol>");
  });
  it("renders fenced code blocks without interpreting markdown inside", () => {
    const out = renderMarkdownToHtml("```js\nconst x = '**not bold**';\n```");
    expect(out).toContain("<pre><code>");
    expect(out).not.toContain("<strong>not bold</strong>");
  });
  it("leaves equations as plain text (no maths typesetting claimed)", () => {
    const out = renderMarkdownToHtml("The solution is x^2 + 2x + 1 = 0.");
    expect(out).toContain("x^2 + 2x + 1 = 0");
    expect(out).not.toContain("katex");
    expect(out).not.toContain("math");
  });
});

describe("formatMemoryContext", () => {
  const mems = [
    { title: "Exam project", content: "Final year project on databases, due in May", category: "goal", created_at: "2026-10-20T00:00:00Z" },
    { title: "Cooking", content: "pasta recipes", category: "preference", created_at: "2026-10-21T00:00:00Z" },
  ];
  it("returns only relevant memories, capped and labelled", () => {
    const { used, context } = formatMemoryContext(mems, "databases project");
    expect(used.map((m) => m.title)).toEqual(["Exam project"]);
    expect(context).toContain("User-approved saved memories");
    expect(context).toContain("databases");
  });
  it("returns empty context when nothing matches", () => {
    const { used, context } = formatMemoryContext(mems, "quantum zebras");
    expect(used).toHaveLength(0);
    expect(context).toBe("");
  });
  it("caps items and truncates long content", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      title: `run ${i}`, content: "x".repeat(500), category: "", created_at: "2026-10-20T00:00:00Z",
    }));
    const { used, context } = formatMemoryContext(many, "run", 5, 300);
    expect(used).toHaveLength(5);
    expect(context.length).toBeLessThan(5 * 320 + 200);
  });
});
