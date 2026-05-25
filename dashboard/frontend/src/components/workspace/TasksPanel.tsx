import { useCallback, useEffect, useState } from "react";
import { Check, Clock, ListTodo, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { formatLocalTime, formatRelative } from "@/lib/format";
import type { TaskResponse } from "@/types/api-contract";
import { usePolicyConfirmation } from "@/hooks/usePolicyConfirmation";
import { PanelShell } from "./PanelShell";

const STATUS_TONE: Record<string, "default" | "secondary" | "outline"> = {
  pending: "default",
  in_progress: "secondary",
  done: "outline",
  snoozed: "secondary",
  cancelled: "outline",
};

export function TasksPanel() {
  const { requestWithConfirmation, policyConfirmModal } = usePolicyConfirmation();
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listTasks(
        showDone ? { includeSnoozed: true } : { status: "pending", includeSnoozed: true },
      );
      setTasks(
        data.tasks.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [showDone]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setSubmitting("create");
    try {
      await requestWithConfirmation((token) =>
        api.createTask({ title }, token ? { policyConfirmationToken: token } : undefined),
      );
      setNewTitle("");
      await load();
    } catch {
      /* modal handles policy cancel */
    } finally {
      setSubmitting(null);
    }
  };

  const handleDone = async (taskId: string) => {
    setSubmitting(taskId);
    try {
      await requestWithConfirmation((token) =>
        api.doneTask(taskId, token ? { policyConfirmationToken: token } : undefined),
      );
      await load();
    } catch {
      /* cancelled */
    } finally {
      setSubmitting(null);
    }
  };

  const handleSnooze = async (taskId: string, minutes: number) => {
    setSubmitting(`${taskId}-snooze`);
    try {
      await requestWithConfirmation((token) =>
        api.snoozeTask(taskId, { minutes }, token ? { policyConfirmationToken: token } : undefined),
      );
      await load();
    } catch {
      /* cancelled */
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <>
      {policyConfirmModal}
      <PanelShell
        title="Tasks"
        description="Daily tasks from server-backed store"
        icon={ListTodo}
        loading={loading}
        error={error}
        action={
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Show done</span>
            <Switch checked={showDone} onCheckedChange={setShowDone} />
          </label>
        }
      >
        {!loading && !error ? (
          <div className="space-y-4">
            <form className="flex gap-2" onSubmit={(e) => void handleCreate(e)}>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Add a task…"
                className="h-9 rounded-lg border-border/60 bg-background/50"
                disabled={submitting === "create"}
              />
              <Button
                type="submit"
                size="sm"
                className="h-9 shrink-0 gap-1 rounded-lg px-3"
                disabled={!newTitle.trim() || submitting === "create"}
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </form>

            {tasks.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No {showDone ? "" : "pending "}tasks yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {tasks.map((task) => {
                  const busy = submitting === task.id || submitting === `${task.id}-snooze`;
                  return (
                    <li
                      key={task.id}
                      className="rounded-lg border border-border/40 bg-background/25 px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p
                              className={`text-sm font-medium ${
                                task.status === "done" ? "text-muted-foreground line-through" : "text-foreground"
                              }`}
                            >
                              {task.title}
                            </p>
                            <Badge variant={STATUS_TONE[task.status] ?? "outline"} className="text-[10px] capitalize">
                              {task.status.replace("_", " ")}
                            </Badge>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                            {task.dueAt ? (
                              <span className="inline-flex items-center gap-0.5">
                                <Clock className="h-3 w-3" />
                                Due {formatLocalTime(task.dueAt)}
                              </span>
                            ) : null}
                            {task.snoozedUntil ? (
                              <span>Snoozed until {formatRelative(task.snoozedUntil)}</span>
                            ) : null}
                            <span>Updated {formatRelative(task.updatedAt)}</span>
                          </div>
                        </div>
                        {task.status !== "done" ? (
                          <div className="flex shrink-0 flex-col gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 rounded-md px-2 text-[11px]"
                              disabled={busy}
                              onClick={() => void handleDone(task.id)}
                            >
                              <Check className="h-3 w-3" />
                              Done
                            </Button>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1.5 text-[10px]"
                                disabled={busy}
                                onClick={() => void handleSnooze(task.id, 60)}
                              >
                                1h
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1.5 text-[10px]"
                                disabled={busy}
                                onClick={() => void handleSnooze(task.id, 1440)}
                              >
                                1d
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </PanelShell>
    </>
  );
}
