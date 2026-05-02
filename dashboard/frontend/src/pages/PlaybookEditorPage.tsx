import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageShell } from "../shell/PageShell";
import { apiClient, saveMarkdownFromResponse } from "../lib/api-client";

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
        const t = await apiClient.getPlaybook(decoded);
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
      const res = await apiClient.savePlaybook(decoded, { content: text });
      const j = await saveMarkdownFromResponse(res);
      setMsg(j.backup ? `Saved. Backup: playbooks/${j.backup}` : "Saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (!decoded) return null;

  return (
    <PageShell
      title={decoded}
      description={
        <button
          type="button"
          className="text-sky-600 dark:text-sky-400 hover:underline text-sm"
          onClick={() => navigate("/playbooks")}
        >
          ← Back to playbooks
        </button>
      }
    >
      <div className="flex justify-end max-w-5xl">
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
        className="w-full min-h-[520px] max-w-5xl rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm p-4 focus:outline-none focus:ring-2 focus:ring-sky-500"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
    </PageShell>
  );
}
