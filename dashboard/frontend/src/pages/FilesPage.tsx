import { useCallback, useEffect, useRef, useState } from "react";
import { Folder, FolderOpen } from "lucide-react";
import { PageShell } from "@/shell/PageShell";
import { EmptyState } from "@/components/empty-state";
import { FileTypeIcon } from "@/components/file-type-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, downloadUrl } from "@/lib/api";
import { formatBytes, formatRelative } from "@/lib/format";
import type { FileEntry, FileFolder } from "@/types/api-contract";

const sections: { key: FileFolder; title: string }[] = [
  { key: "input", title: "input/" },
  { key: "output", title: "output/" },
  { key: "reports", title: "reports/" },
];

export function FilesPage() {
  const [data, setData] = useState<Record<FileFolder, FileEntry[] | null>>({
    input: null,
    output: null,
    reports: null,
  });
  const [err, setErr] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [input, output, reports] = await Promise.all([
        api.listFilesInFolder("input"),
        api.listFilesInFolder("output"),
        api.listFilesInFolder("reports"),
      ]);
      setData({ input, output, reports });
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
      await api.uploadToInput(f);
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
      const res = await api.deleteFile(pendingDelete);
      if (!res.ok) throw new Error(await res.text());
      setPendingDelete(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const loading = data.input === null;

  if (loading && err)
    return (
      <div className="mx-auto max-w-7xl rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive">
        {err}
      </div>
    );

  if (loading)
    return (
      <div className="mx-auto max-w-7xl text-sm text-muted-foreground animate-pulse">Loading…</div>
    );

  return (
    <PageShell
      title="Files"
      description="GET /api/files?folder=input|output|reports. Upload uses POST /api/files/upload (input/ only). Deletes use DELETE /api/files — protected paths blocked on the server."
      actions={
        <>
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            onChange={onUpload}
            disabled={uploading}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? "Uploading…" : "Upload to input/"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {err && (
          <div className="text-sm text-destructive border border-destructive/40 rounded-lg p-3">
            {err}
          </div>
        )}

        <div className="grid gap-4">
          {sections.map((s) => (
            <Card key={s.key} className="overflow-hidden">
              <CardHeader className="flex flex-row items-center gap-2 border-b border-border py-4">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base font-medium">{s.title}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data[s.key]!.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      icon={Folder}
                      title="No files"
                      description={`Nothing in ${s.title} yet.`}
                    />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Name
                        </TableHead>
                        <TableHead className="px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Type
                        </TableHead>
                        <TableHead className="px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Size
                        </TableHead>
                        <TableHead className="px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Modified
                        </TableHead>
                        <TableHead className="px-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data[s.key]!.map((row) => (
                        <TableRow key={row.path}>
                          <TableCell className="px-4 font-mono text-xs">{row.name}</TableCell>
                          <TableCell className="px-4">
                            <span className="inline-flex items-center gap-2">
                              {row.isDir ? (
                                <Folder className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <FileTypeIcon ext={row.extension} />
                              )}
                              {row.isDir ? "dir" : row.extension}
                            </span>
                          </TableCell>
                          <TableCell className="px-4">{formatBytes(row.size)}</TableCell>
                          <TableCell className="px-4 whitespace-nowrap text-muted-foreground">
                            <span title={row.modified}>{formatRelative(row.modified)}</span>
                          </TableCell>
                          <TableCell className="space-x-3 whitespace-nowrap px-4 text-right">
                            <a
                              href={downloadUrl(row.path)}
                              className="text-primary text-sm font-medium hover:underline"
                            >
                              Download
                            </a>
                            <button
                              type="button"
                              className="text-destructive text-sm hover:underline"
                              onClick={() => setPendingDelete(row.path)}
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
          ))}
        </div>

        {pendingDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <Card className="max-w-md w-full p-6 shadow-lg">
              <h2 className="font-semibold text-lg">Delete file?</h2>
              <p className="text-sm mt-2 break-all text-muted-foreground">{pendingDelete}</p>
              <p className="text-xs mt-2 text-warning">
                Folders, AGENTS.md, playbooks, and .venv cannot be removed from this UI.
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
