import type { ReactNode } from "react";

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_URL_PUNCTUATION_RE = /[),.;:!?]+$/;

export function LinkifiedText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const end = start + raw.length;
    const trailing = raw.match(TRAILING_URL_PUNCTUATION_RE)?.[0] ?? "";
    const label = trailing ? raw.slice(0, -trailing.length) : raw;
    const href = label.startsWith("www.") ? `https://${label}` : label;

    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }

    nodes.push(
      <a
        key={`${start}-${label}`}
        className="break-all font-medium text-[var(--chat-link)] underline decoration-[var(--chat-link)]/30 underline-offset-[3px] transition hover:decoration-[var(--chat-link)]/60"
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        {label}
      </a>,
    );

    if (trailing) {
      nodes.push(trailing);
    }

    lastIndex = end;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return <>{nodes.length ? nodes : text}</>;
}
