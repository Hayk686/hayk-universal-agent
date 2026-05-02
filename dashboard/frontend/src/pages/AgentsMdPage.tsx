import { useEffect, useState } from "react";
import { getText, putJson } from "../lib/api";

export function AgentsMdPage() {
  const [text, setText] = useState("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const t = await getText("/api/agents-md");
        setText(t);
        setErr(null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSavedMsg(null);
    setErr(null);
    try {
      const res = await putJson("/api/agents-md", { content: text });
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as { backup?: string };
      setSavedMsg(
        j.backup
          ? `Saved. Backup: ${j.backup}`
          : "Saved (new file, no previous backup).",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) return <div className="text-slate-500">Loading…</div>;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">AGENTS.md</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            A dated backup is created before each save when the file already exists.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          className="rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          Save
        </button>
      </div>
      {err && (
        <div className="text-sm text-red-600 dark:text-red-400">{err}</div>
      )}
      {savedMsg && (
        <div className="text-sm text-emerald-700 dark:text-emerald-300">{savedMsg}</div>
      )}
      <textarea
        className="w-full min-h-[480px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm p-4 focus:outline-none focus:ring-2 focus:ring-sky-500"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}
