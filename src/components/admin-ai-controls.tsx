import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Brain, Sparkles, Pause, Play, X as XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import {
  dispatchBatchAiJobs,
  listAiSessions,
  listAiBatches,
  pauseAiBatch,
  resumeAiBatch,
  cancelAiBatch,
  runAiTickNow,
} from "@/lib/admin-ai.functions";


const TASKS = [
  { key: "categorise", label: "Categorise" },
  { key: "tag_primary", label: "Primary tags" },
  { key: "tag_secondary", label: "Secondary tags" },
  { key: "tag_rest", label: "Rest tags" },
] as const;

type Task = (typeof TASKS)[number]["key"];

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function BatchAiPopover({
  selectedIds,
  onDispatched,
}: {
  selectedIds: string[];
  onDispatched: () => void;
}) {
  const dispatch = useServerFn(dispatchBatchAiJobs);
  const [open, setOpen] = React.useState(false);
  const [tasks, setTasks] = React.useState<Set<Task>>(
    new Set(["categorise", "tag_primary"] as Task[]),
  );
  const [maxCats, setMaxCats] = React.useState(5);
  const [minSec, setMinSec] = React.useState(8);
  const [maxDur, setMaxDur] = React.useState<string>("600");

  const m = useMutation({
    mutationFn: () =>
      dispatch({
        data: {
          video_ids: selectedIds,
          task_types: Array.from(tasks),
          max_categories: maxCats,
          min_secondary_tags: minSec,
          max_duration_s: Number(maxDur),
        },
      }),
    onSuccess: (r) => {
      if (r.warning) toast.warning(r.warning);
      toast.success(`Queued ${r.jobs_created} AI jobs`);
      setOpen(false);
      onDispatched();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Dispatch failed"),
  });

  const toggleTask = (k: Task) => {
    const n = new Set(tasks);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setTasks(n);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="default">
          <Sparkles className="mr-1 h-3.5 w-3.5" /> Run AI on selected
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div>
          <p className="text-sm font-medium">AI tasks</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {TASKS.map((t) => (
              <label
                key={t.key}
                className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
              >
                <Checkbox
                  checked={tasks.has(t.key)}
                  onCheckedChange={() => toggleTask(t.key)}
                />
                {t.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs">Max categories: {maxCats}</Label>
          <Slider
            value={[maxCats]}
            min={1}
            max={10}
            step={1}
            onValueChange={(v) => setMaxCats(v[0])}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">
            Min secondary tags: {minSec}
          </Label>
          <Slider
            value={[minSec]}
            min={0}
            max={50}
            step={1}
            onValueChange={(v) => setMinSec(v[0])}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Max duration per job</Label>
          <Select value={maxDur} onValueChange={setMaxDur}>
            <SelectTrigger className="mt-1 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="120">2 min</SelectItem>
              <SelectItem value="300">5 min</SelectItem>
              <SelectItem value="600">10 min</SelectItem>
              <SelectItem value="1800">30 min</SelectItem>
              <SelectItem value="3600">1 h</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {selectedIds.length} videos × {tasks.size} tasks ={" "}
          {selectedIds.length * tasks.size} jobs
        </p>
        <Button
          size="sm"
          className="w-full"
          disabled={tasks.size === 0 || m.isPending}
          onClick={() => m.mutate()}
        >
          {m.isPending ? "Queuing…" : "Queue AI jobs"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function AiMonitorSheet() {
  const [open, setOpen] = React.useState(false);
  const fetchSessions = useServerFn(listAiSessions);
  const fetchBatches = useServerFn(listAiBatches);
  const pause = useServerFn(pauseAiBatch);
  const resume = useServerFn(resumeAiBatch);
  const cancel = useServerFn(cancelAiBatch);

  const batchesQ = useQuery({
    queryKey: ["ai-batches"],
    queryFn: () => fetchBatches(),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });

  const sessionsQ = useQuery({
    queryKey: ["ai-sessions"],
    queryFn: () => fetchSessions(),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });

  const hasActive = (batchesQ.data?.batches ?? []).some(
    (b) => b.counts.pending + b.counts.claimed + b.counts.running > 0,
  );

  // Adaptive: slow to 30s when nothing active
  React.useEffect(() => {
    if (!open) return;
    // re-fetch toggle: react-query refetchInterval handled above. This effect
    // is purely so React notices `hasActive` changes if needed.
  }, [open, hasActive]);

  const pauseM = useMutation({
    mutationFn: (batch_id: string) => pause({ data: { batch_id } }),
    onSuccess: () => {
      toast.success("Batch paused");
      batchesQ.refetch();
    },
  });
  const resumeM = useMutation({
    mutationFn: (batch_id: string) => resume({ data: { batch_id } }),
    onSuccess: () => {
      toast.success("Batch resumed");
      batchesQ.refetch();
    },
  });
  const cancelM = useMutation({
    mutationFn: (batch_id: string) => cancel({ data: { batch_id } }),
    onSuccess: () => {
      toast.success("Batch cancelled");
      batchesQ.refetch();
    },
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          title="AI background monitor"
          aria-label="AI background monitor"
        >
          <Brain className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>AI background monitor</SheetTitle>
          <SheetDescription>
            Live status of AI agent sessions and batch queue.
          </SheetDescription>
        </SheetHeader>

        <section className="mt-6">
          <h3 className="mb-2 text-sm font-semibold">Active sessions</h3>
          {sessionsQ.data && sessionsQ.data.sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No active sessions.</p>
          ) : null}
          <div className="space-y-2">
            {(sessionsQ.data?.sessions ?? []).map((s) => {
              const heartbeatAgeMs =
                Date.now() - new Date(s.last_heartbeat).getTime();
              const healthy = heartbeatAgeMs < 90_000;
              return (
                <div
                  key={s.id}
                  className="rounded-lg border bg-card p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      #{s.agent_index}
                    </span>
                    <Badge variant={healthy ? "secondary" : "destructive"}>
                      {healthy ? "Healthy" : "Stale"}
                    </Badge>
                  </div>
                  <p className="mt-1 font-medium">{s.model}</p>
                  <p className="text-muted-foreground">
                    scope: {s.scope} · {s.total_jobs_completed} jobs done
                  </p>
                  <p className="text-muted-foreground">
                    tokens: {s.total_prompt_tokens.toLocaleString()} in /{" "}
                    {s.total_completion_tokens.toLocaleString()} out
                  </p>
                  {s.current_job_title ? (
                    <p className="mt-1 line-clamp-1 text-muted-foreground">
                      → {s.current_job_title}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    started {relativeTime(s.session_started_at)} · heartbeat{" "}
                    {relativeTime(s.last_heartbeat)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-6">
          <h3 className="mb-2 text-sm font-semibold">Batch queue</h3>
          {batchesQ.data && batchesQ.data.batches.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No batches in the last 7 days.
            </p>
          ) : null}
          <div className="space-y-2">
            {(batchesQ.data?.batches ?? []).map((b) => {
              const inFlight =
                b.counts.pending + b.counts.claimed + b.counts.running;
              const isPaused = b.counts.paused > 0 && inFlight === 0;
              const isDone =
                inFlight === 0 && b.counts.paused === 0;
              return (
                <div
                  key={b.batch_id}
                  className="rounded-lg border bg-card p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {b.batch_id.slice(0, 8)}
                    </span>
                    <Badge variant="outline">{b.scope}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {b.task_types.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] text-muted-foreground">
                    <span>pending {b.counts.pending}</span>
                    <span>running {b.counts.running + b.counts.claimed}</span>
                    <span>paused {b.counts.paused}</span>
                    <span>done {b.counts.completed}</span>
                    <span>failed {b.counts.failed}</span>
                    <span>cancel {b.counts.cancelled}</span>
                  </div>
                  <p className="mt-1 text-[11px]">
                    {b.success_pct}% success · avg conf{" "}
                    {b.avg_confidence != null
                      ? b.avg_confidence.toFixed(2)
                      : "—"}{" "}
                    · started {relativeTime(b.first_created_at)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {inFlight > 0 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => pauseM.mutate(b.batch_id)}
                      >
                        <Pause className="mr-1 h-3 w-3" /> Pause
                      </Button>
                    ) : null}
                    {isPaused ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resumeM.mutate(b.batch_id)}
                      >
                        <Play className="mr-1 h-3 w-3" /> Resume
                      </Button>
                    ) : null}
                    {!isDone ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost">
                            <XIcon className="mr-1 h-3 w-3" /> Cancel
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel batch?</AlertDialogTitle>
                            <AlertDialogDescription>
                              All non-terminal jobs in this batch will be
                              cancelled. Completed results are preserved.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => cancelM.mutate(b.batch_id)}
                            >
                              Cancel batch
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </SheetContent>
    </Sheet>
  );
}
