import { useCallback, useEffect, useState } from "react";
import { del, downloadUrl, getJson } from "../lib/api";
import { formatBytes, formatLocalTime } from "../lib/format";

type FileRow = {
  name: string;
  path: string;
  size: number;
  modified: string;
  extension: string;
};

type ListResponse = {
  input: FileRow[];
  output: FileRow[];
  reports: FileRow[];
};

const sections = [
  { key: "input" as const, title: "input/" },
  { key: "output" as const, title: "output/" },
  { key: "reports" as const, title: "reports/" },
];

export function FilesPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await getJson<ListResponse>("/api/files/list");
      setData(r);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUpload(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = "";
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/files/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      const res = await del(`/api/files?path=${encodeURIComponent(pendingDelete)}`);
      if (!res.ok) throw new Error(await res.text());
      setPendingDelete(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (!data && err)
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4">
        {err}
      </div>
    );

  if (!data) return <div className="text-slate-500">Loading…</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Files</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Browse workspace files. Upload goes to <code className="text-xs">input/</code> only.
          </p>
        </div>
        <div>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800">
            <input
              type="file"
              className="hidden"
              onChange={onUpload}
              disabled={uploading}
            />
            {uploading ? "Uploading…" : "Upload to input/"}
          </label>
        </div>
      </div>

      {err && (
        <div className="text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 rounded-lg p-3">
          {err}
        </div>
      )}

      {sections.map((s) => (
        <section key={s.key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 font-medium">
            {s.title}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Size</th>
                  <th className="px-4 py-2">Modified</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data[s.key].length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-slate-500 text-center">
                      No files
                    </td>
                  </tr>
                )}
                {data[s.key].map((row) => (
                  <tr
                    key={row.path}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="px-4 py-2 font-mono text-xs">{row.name}</td>
                    <td className="px-4 py-2">{row.extension}</td>
                    <td className="px-4 py-2">{formatBytes(row.size)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {formatLocalTime(row.modified)}
                    </td>
                    <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                      <a
                        href={downloadUrl(row.path)}
                        className="text-sky-600 dark:text-sky-400 hover:underline"
                      >
                        Download
                      </a>
                      <button
                        type="button"
                        className="text-red-600 dark:text-red-400 hover:underline"
                        onClick={() => setPendingDelete(row.path)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-md w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-lg">
            <h2 className="font-semibold">Delete file?</h2>
            <p className="text-sm mt-2 break-all text-slate-600 dark:text-slate-300">
              {pendingDelete}
            </p>
            <p className="text-xs mt-2 text-amber-700 dark:text-amber-300">
              Folders and <code>.venv</code> cannot be removed from this UI.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600"
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm bg-red-600 text-white hover:bg-red-700"
                onClick={() => void confirmDelete()}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
