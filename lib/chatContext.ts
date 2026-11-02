/**
 * Server-side cap for client-supplied memories: at most 5 items, each
 * truncated, total context bounded. The client must only send the user's
 * own enabled, relevant memories; the server never trusts the client to
 * have capped them, and never receives (or sends to Gemini) the full
 * memory list or the full conversation history. Shared by /api/chat and
 * /api/chat/stream so both paths apply the identical cap.
 */
export function memoryContextBlock(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  const items = raw
    .filter((m): m is { title?: unknown; content?: unknown } => !!m && typeof m === "object")
    .slice(0, 5)
    .map((m) => `- ${String(m.title || "").slice(0, 100)}: ${String(m.content || "").slice(0, 300)}`)
    .filter((line) => line.length > 3);
  if (!items.length) return "";
  return `User-approved saved memories (use only if relevant; do not repeat them verbatim unless helpful):\n${items.join("\n")}\n\n`;
}

export function historyContextBlock(history: unknown): string {
  if (!Array.isArray(history)) return "";
  return history
    .slice(-10)
    .map(
      (h: { role?: string; content?: string }) =>
        `${h.role === "assistant" ? "EDITH" : "User"}: ${String(h.content || "").slice(0, 1000)}`,
    )
    .join("\n");
}
