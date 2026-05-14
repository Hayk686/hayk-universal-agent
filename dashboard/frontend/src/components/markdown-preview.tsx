function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string) {
  return escape(s)
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function render(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inCode = false;
  let inList = false;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p class="my-2 leading-relaxed">${inline(para.join(" "))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      flushPara();
      closeList();
      if (!inCode) {
        out.push(
          '<pre class="my-3 overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs"><code>',
        );
        inCode = true;
      } else {
        out.push("</code></pre>");
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      out.push(escape(line) + "\n");
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      closeList();
      const lvl = h[1].length;
      const sizes = ["text-2xl", "text-xl", "text-lg", "text-base", "text-sm", "text-xs"];
      out.push(
        `<h${lvl} class="mt-4 mb-2 font-semibold tracking-tight ${sizes[lvl - 1]}">${inline(h[2])}</h${lvl}>`,
      );
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      flushPara();
      if (!inList) {
        out.push('<ul class="my-2 list-disc space-y-1 pl-5">');
        inList = true;
      }
      out.push(`<li>${inline(line.replace(/^\s*-\s+/, ""))}</li>`);
      continue;
    }
    if (line.trim() === "") {
      flushPara();
      closeList();
      continue;
    }
    para.push(line);
  }
  flushPara();
  closeList();
  if (inCode) out.push("</code></pre>");
  return out.join("");
}

export function MarkdownPreview({ source }: { source: string }) {
  return (
    <div
      className="text-sm text-foreground"
      dangerouslySetInnerHTML={{ __html: render(source) }}
    />
  );
}
