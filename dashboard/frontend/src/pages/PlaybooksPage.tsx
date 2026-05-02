import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Plus } from "lucide-react";
import { PageShell } from "@/shell/PageShell";
import { EmptyState } from "@/components/empty-state";
import { FileTypeIcon } from "@/components/file-type-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, okFromResponse } from "@/lib/api";
import { formatBytes, formatRelative } from "@/lib/format";
import type { FileEntry } from "@/types/api-contract";

export function PlaybooksPage() {
  const [rows, setRows] = useState<FileEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function load() {
    try {
      const r = await api.listPlaybooks();
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
      await api.createPlaybook({ name });
      setNewName("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      const res = await api.deletePlaybook(pendingDelete);
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
      description="GET /api/playbooks · edit via GET/PUT /api/playbooks/{name}. POST creates a new file; DELETE removes one playbook."
      actions={
        <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-4">
            <Plus className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-medium">New playbook</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <label htmlFor="pb-new" className="text-xs text-muted-foreground">
                Filename (.md)
              </label>
              <Input
                id="pb-new"
                placeholder="e.g. onboarding.md"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <Button type="button" onClick={() => void create()}>
              Create
            </Button>
          </CardContent>
        </Card>

        {err && (
          <div className="text-sm text-destructive border border-destructive/40 rounded-lg p-3">
            {err}
          </div>
        )}

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center gap-2 border-b border-border py-4">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-medium">All playbooks</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={BookOpen}
                  title="No playbooks yet"
                  description="Create a new .md file above to get started."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="px-4 text-xs font-medium uppercase text-muted-foreground">
                      Name
                    </TableHead>
                    <TableHead className="px-4 text-xs font-medium uppercase text-muted-foreground">
                      Type
                    </TableHead>
                    <TableHead className="px-4 text-xs font-medium uppercase text-muted-foreground">
                      Size
                    </TableHead>
                    <TableHead className="px-4 text-xs font-medium uppercase text-muted-foreground">
                      Modified
                    </TableHead>
                    <TableHead className="px-4 text-right text-xs font-medium uppercase text-muted-foreground">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.path}>
                      <TableCell className="px-4 font-mono text-xs">{row.name}</TableCell>
                      <TableCell className="px-4">
                        <span className="inline-flex items-center gap-2">
                          <FileTypeIcon ext={row.extension} />
                          {row.extension}
                        </span>
                      </TableCell>
                      <TableCell className="px-4">{formatBytes(row.size)}</TableCell>
                      <TableCell className="px-4 whitespace-nowrap text-muted-foreground">
                        <span title={row.modified}>{formatRelative(row.modified)}</span>
                      </TableCell>
                      <TableCell className="space-x-3 whitespace-nowrap px-4 text-right">
                        <Link
                          to={`/playbooks/${encodeURIComponent(row.name)}`}
                          className="text-primary text-sm font-medium hover:underline"
                        >
                          Open
                        </Link>
                        <button
                          type="button"
                          className="text-destructive text-sm hover:underline"
                          onClick={() => setPendingDelete(row.name)}
                        >
                          Delete
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {pendingDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <Card className="max-w-md w-full p-6 shadow-lg">
              <h2 className="font-semibold text-lg">Delete playbook?</h2>
              <p className="text-sm mt-2 font-mono break-all text-muted-foreground">
                {pendingDelete}
              </p>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button variant="outline" type="button" onClick={() => setPendingDelete(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" type="button" onClick={() => void confirmDelete()}>
                  Delete
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </PageShell>
  );
}
