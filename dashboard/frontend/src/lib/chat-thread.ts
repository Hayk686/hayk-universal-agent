import type { ChatMode, HistoryMsg } from "@/lib/chat-types";

export const POLICY_ACTION_WEB_SEND = "network web-send";

export function modeLabel(mode: ChatMode): string {
  if (mode === "web") return "Web";
  if (mode === "session") return "Session";
  return "Fast";
}

/** Human-readable badge for stored turn mode (user or assistant). */
export function formatTurnModeBadge(mode?: string): string | undefined {
  if (!mode) return undefined;
  if (mode === "oneshot" || mode === "fast") return "Fast";
  if (mode === "web-oneshot" || mode === "web-session" || mode === "web") return "Web";
  if (mode === "hermes-session" || mode === "session") return "Session";
  return mode;
}

/** Prefix prior turns so web/fast Hermes calls stay in one UI thread. */
export function buildMessageWithThreadContext(message: string, history: HistoryMsg[]): string {
  if (history.length === 0) return message;

  const recent = history.slice(-12);
  const lines = recent.map((m) => {
    const who = m.role === "user" ? "User" : "Assistant";
    const tag = m.mode ? ` [${m.mode}]` : "";
    const text = m.content.trim().replace(/\s+/g, " ").slice(0, 900);
    return `${who}${tag}: ${text}`;
  });

  return (
    "Continue the same conversation thread. Do not restart or ignore earlier turns.\n\n" +
    "Earlier turns:\n" +
    lines.join("\n\n") +
    "\n\n---\nCurrent user message:\n" +
    message
  );
}
