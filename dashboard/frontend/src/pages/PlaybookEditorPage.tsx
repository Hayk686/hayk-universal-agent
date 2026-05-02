import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getText, putJson } from "../lib/api";

export function PlaybookEditorPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const decoded = name ? decodeURIComponent(name) : "";

  useEffect(() => {
    if (!decoded) return;
    (async () => {
      try {
        const t = await getText(`/api/playbooks/${encodeURIComponent(decoded)}`);
        setText(t);
        setErr(null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [decoded]);

  async function save() {
    setMsg(null);
    setErr(null);
    try {
      const res = await putJson(`/api/playbooks/${encodeURIComponent(decoded)}`, {
        content: text,
      });
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as { backup?: string };
      setMsg(j.backup ? `Saved. Backup: playbooks/${j.backup}` : "Saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (!decoded) return null;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <button
            type="button"
            className="text-sm text-sky-600 dark:text-sky-400 hover:underline"
            onClick={() => navigate("/playbooks")}
          >
            ← Back to playbooks
          </button>
          <h1 className="text-2xl font-semibold mt-2 font-mono break-all">{decoded}</h1>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          className="rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-4 py-2 text-sm font-medium"
        >
          Save
        </button>
      </div>
      {err && <div className="text-sm text-red-600">{err}</div>}
      {msg && <div className="text-sm text-emerald-700 dark:text-emerald-300">{msg}</div>}
      <textarea
        className="w-full min-h-[520px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm p-4 focus:outline-none focus:ring-2 focus:ring-sky-500"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}
