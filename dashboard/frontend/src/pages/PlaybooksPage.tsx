import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../shell/PageShell";
import { apiClient, okFromResponse } from "../lib/api-client";
import { formatBytes, formatLocalTime } from "../lib/format";
import type { FileEntry } from "../types/api-contract";

export function PlaybooksPage() {
  const [rows, setRows] = useState<FileEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function load() {
    try {
      const r = await apiClient.listPlaybooks();
      setRows(r);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setErr(null);
    const name = newName.trim();
    if (!name.endsWith(".md")) {
      setErr("Name must end with .md");
      return;
    }
    try {
      await apiClient.createPlaybook({ name });
      setNewName("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      const res = await apiClient.deletePlaybook(pendingDelete);
      await okFromResponse(res);
      setPendingDelete(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <PageShell
      title="Playbooks"
      description="Markdown in playbooks/ with timestamped backups on save. API: /api/playbooks — see docs/api-contract.md."
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1">
            <label className="text-xs text-slate-500 block mb-1">New playbook (.md)</label>
            <input
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm"
              value={newName}
              placeholder="e.g. onboarding.md"
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => void create()}
            className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Create
          </button>
        </div>

        {err && (
          <div className="text-sm text-red-600 dark:text-red-400">{err}</div>
        )}

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Size</th>
                <th className="px-4 py-2">Modified</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    No playbooks yet
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.path} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2 font-mono text-xs">{row.name}</td>
                  <td className="px-4 py-2">{formatBytes(row.size)}</td>
                  <td className="px-4 py-2">{formatLocalTime(row.modified)}</td>
                  <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                    <Link
                      to={`/playbooks/${encodeURIComponent(row.name)}`}
                      className="text-sky-600 dark:text-sky-400 hover:underline"
                    >
                      Open
                    </Link>
                    <button
                      type="button"
                      className="text-red-600 dark:text-red-400 hover:underline"
                      onClick={() => setPendingDelete(row.name)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pendingDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-w-md w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-lg">
              <h2 className="font-semibold">Delete playbook?</h2>
              <p className="text-sm mt-2 font-mono break-all">{pendingDelete}</p>
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
                  className="rounded-lg px-3 py-1.5 text-sm bg-red-600 text-white"
                  onClick={() => void confirmDelete()}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
