import { describe, it, expect, vi, afterEach } from "vitest";
import { parseTheme, themeFromStorage } from "../lib/theme";
import { sanitizeForPdf, wrapText } from "../lib/pdf";
import { memoryContextBlock } from "../lib/chatContext";
import {
  sendWeeklyReportEmail,
  emailNotConfiguredError,
  isEmailConfigured,
} from "../lib/email";

describe("theme", () => {
  it("defaults to dark for anything except 'light'", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("blue")).toBe("dark");
    expect(parseTheme(undefined)).toBe("dark");
  });
  it("reads localStorage, defaulting to dark when absent or broken", () => {
    expect(themeFromStorage({ getItem: () => "light" })).toBe("light");
    expect(themeFromStorage({ getItem: () => null })).toBe("dark");
    expect(themeFromStorage(null)).toBe("dark");
    expect(
      themeFromStorage({
        getItem: () => {
          throw new Error("denied");
        },
      }),
    ).toBe("dark");
  });
});

describe("pdf helpers", () => {
  it("replaces characters Helvetica cannot encode", () => {
    expect(sanitizeForPdf("café → smile 😀")).toBe("café ? smile ?");
    expect(sanitizeForPdf("plain text")).toBe("plain text");
  });
  it("wraps words so no line exceeds the measured width", () => {
    // measure = character count, max width 10.
    const lines = wrapText("one two three four five", (t) => t.length, 10);
    expect(lines).toEqual(["one two", "three four", "five"]);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(10);
  });
  it("keeps blank lines and over-long single words intact (no data loss)", () => {
    const lines = wrapText("a\n\nsupercalifragilistic", (t) => t.length, 5);
    expect(lines).toEqual(["a", "", "supercalifragilistic"]);
  });
});

describe("chat memory cap (shared by /api/chat and /api/chat/stream)", () => {
  it("caps at 5 items even when more are supplied", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ title: `t${i}`, content: `c${i}` }));
    const block = memoryContextBlock(many);
    expect(block.match(/^- /gm)).toHaveLength(5);
  });
  it("returns empty for non-array input", () => {
    expect(memoryContextBlock("nope")).toBe("");
    expect(memoryContextBlock(null)).toBe("");
  });
});

describe("email provider interface", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("reports not-configured and never calls a provider when EMAIL_PROVIDER is empty", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "");
    vi.stubEnv("RESEND_API_KEY", "");
    expect(isEmailConfigured()).toBe(false);
    const fetchImpl = vi.fn();
    const result = await sendWeeklyReportEmail({
      to: "test@example.com",
      weekStart: "2026-10-26",
      weekEnd: "2026-11-01",
      summary: "summary only",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    if (!result.ok) expect(result.error).toContain("not configured");
  });
  it("reports not-configured for an unknown provider", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "sendgrid");
    vi.stubEnv("RESEND_API_KEY", "x");
    expect(isEmailConfigured()).toBe(false);
    expect(emailNotConfiguredError()).toContain("sendgrid");
  });
  it("sends only the summary through Resend when configured (mocked fetch)", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    const result = await sendWeeklyReportEmail({
      to: "test@example.com",
      weekStart: "2026-10-26",
      weekEnd: "2026-11-01",
      summary: "week summary",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: true, provider: "resend" });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.text).toContain("week summary");
    expect(body.text).not.toContain("conversation");
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.resend.com/emails");
  });
  it("reports a provider failure honestly instead of claiming success", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_bad");
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "forbidden" });
    const result = await sendWeeklyReportEmail({
      to: "test@example.com",
      weekStart: "2026-10-26",
      weekEnd: "2026-11-01",
      summary: "s",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
  });
});
