import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";

import {
  listReportedVideos,
  listReportsForVideo,
  updateReportStatus,
  type ReportedVideoSummary,
} from "@/lib/reports.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { usePermissions } from "@/lib/use-permissions";

type StatusFilter = "all" | "open" | "reviewed" | "dismissed";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({ meta: [{ title: "Reports — CurateTube" }] }),
  component: AdminReportsPage,
});

function statusBadge(status: string) {
  const map: Record<string, "default" | "secondary" | "outline"> = {
    open: "default",
    reviewed: "secondary",
    dismissed: "outline",
  };
  return (
    <Badge variant={map[status] ?? "secondary"} className="capitalize">
      {status}
    </Badge>
  );
}

function AdminReportsPage() {
  const { data: perms } = usePermissions();
  const canReview = perms?.has("report.review") || perms?.isOwner;

  const listFn = useServerFn(listReportedVideos);
  const detailFn = useServerFn(listReportsForVideo);
  const updateFn = useServerFn(updateReportStatus);
  const qc = useQueryClient();

  const [status, setStatus] = React.useState<StatusFilter>("open");
  const [selectedVideoId, setSelectedVideoId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [checked, setChecked] = React.useState<Set<string>>(new Set());

  const list = useQuery({
    queryKey: ["reported-videos", status],
    queryFn: () => listFn({ data: { status } }),
  });

  React.useEffect(() => {
    if (!selectedVideoId && list.data?.videos.length) {
      setSelectedVideoId(list.data.videos[0].video.id);
    }
  }, [list.data, selectedVideoId]);

  const detail = useQuery({
    queryKey: ["reports-for-video", selectedVideoId],
    queryFn: () => detailFn({ data: { videoId: selectedVideoId! } }),
    enabled: !!selectedVideoId,
  });

  const mutate = useMutation({
    mutationFn: (input: { ids: string[]; status: "open" | "reviewed" | "dismissed"; reviewNote?: string }) =>
      updateFn({ data: input }),
    onSuccess: (r) => {
      toast.success(`Updated ${r.count} report${r.count === 1 ? "" : "s"}`);
      setChecked(new Set());
      qc.invalidateQueries({ queryKey: ["reported-videos"] });
      qc.invalidateQueries({ queryKey: ["reports-for-video", selectedVideoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredReports = React.useMemo(() => {
    const rows = detail.data?.reports ?? [];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => r.reason_text.toLowerCase().includes(q));
  }, [detail.data, search]);

  const allChecked =
    filteredReports.length > 0 && filteredReports.every((r) => checked.has(r.id));

  function toggleAll(on: boolean) {
    setChecked(on ? new Set(filteredReports.map((r) => r.id)) : new Set());
  }

  function exportCsv(rows: typeof filteredReports) {
    const header = ["id", "video_id", "reporter", "status", "reason", "created_at", "review_note"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const reporter = reporterName(r.reporter);
      const cells = [
        r.id,
        r.video_id,
        reporter,
        r.status,
        `"${r.reason_text.replace(/"/g, '""')}"`,
        r.created_at,
        `"${(r.review_note ?? "").replace(/"/g, '""')}"`,
      ];
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reports-${selectedVideoId ?? "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto h-[calc(100vh-8rem)] w-full max-w-[1500px] space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Review user reports for videos. Status changes are immediate and audited.
          </p>
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </header>

      <ResizablePanelGroup
        direction="horizontal"
        className="rounded-lg border bg-card"
      >
        <ResizablePanel defaultSize={36} minSize={25}>
          <ScrollArea className="h-[calc(100vh-12rem)]">
            <div className="divide-y">
              {list.isLoading ? (
                <Skeleton className="m-3 h-24" />
              ) : (list.data?.videos.length ?? 0) === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No reports.</p>
              ) : (
                list.data!.videos.map((v) => (
                  <VideoRow
                    key={v.video.id}
                    item={v}
                    active={selectedVideoId === v.video.id}
                    onSelect={() => {
                      setSelectedVideoId(v.video.id);
                      setChecked(new Set());
                    }}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={64} minSize={40}>
          {!selectedVideoId ? (
            <p className="p-6 text-sm text-muted-foreground">
              Select a video to view its reports.
            </p>
          ) : (
            <div className="flex h-[calc(100vh-12rem)] flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b p-3">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search reason text…"
                  className="h-8 w-64"
                />
                <Button size="sm" variant="outline" asChild>
                  <Link to="/v/$id" params={{ id: selectedVideoId }}>
                    Open video <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!checked.size || !canReview || mutate.isPending}
                    onClick={() =>
                      mutate.mutate({ ids: Array.from(checked), status: "reviewed" })
                    }
                  >
                    Mark reviewed ({checked.size})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!checked.size || !canReview || mutate.isPending}
                    onClick={() =>
                      mutate.mutate({ ids: Array.from(checked), status: "dismissed" })
                    }
                  >
                    Dismiss ({checked.size})
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => exportCsv(filteredReports)}
                  >
                    Export CSV
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1">
                {detail.isLoading ? (
                  <Skeleton className="m-3 h-24" />
                ) : (
                  <div className="divide-y">
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={allChecked}
                        onCheckedChange={(v) => toggleAll(!!v)}
                      />
                      <span>{filteredReports.length} reports</span>
                    </div>
                    {filteredReports.map((r) => (
                      <ReportRow
                        key={r.id}
                        report={r}
                        canReview={!!canReview}
                        checked={checked.has(r.id)}
                        onCheck={(on) => {
                          setChecked((prev) => {
                            const next = new Set(prev);
                            if (on) next.add(r.id);
                            else next.delete(r.id);
                            return next;
                          });
                        }}
                        onSaveNote={(note) =>
                          mutate.mutate({
                            ids: [r.id],
                            status: r.status,
                            reviewNote: note,
                          })
                        }
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function VideoRow({
  item,
  active,
  onSelect,
}: {
  item: ReportedVideoSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full gap-3 p-3 text-left transition hover:bg-muted/60 ${
        active ? "bg-muted" : ""
      }`}
    >
      {item.video.thumbnail_url ? (
        <img
          src={item.video.thumbnail_url}
          alt=""
          className="h-14 w-24 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="h-14 w-24 shrink-0 rounded bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.video.title}</p>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant="default">{item.open} open</Badge>
          <span>{item.total} total</span>
          <span>· {format(new Date(item.last_report_at), "MMM d")}</span>
        </div>
      </div>
    </button>
  );
}

function reporterName(
  p: { display_name: string | null; username: string | null; audit_privacy_mode: string } | null,
) {
  if (!p) return "Unknown";
  if (p.audit_privacy_mode === "anonymous") return "Anonymous";
  return p.display_name ?? p.username ?? "Unknown";
}

function ReportRow({
  report,
  canReview,
  checked,
  onCheck,
  onSaveNote,
}: {
  report: {
    id: string;
    reason_text: string;
    status: string;
    created_at: string;
    review_note: string | null;
    reporter: { display_name: string | null; username: string | null; audit_privacy_mode: string } | null;
  };
  canReview: boolean;
  checked: boolean;
  onCheck: (on: boolean) => void;
  onSaveNote: (note: string) => void;
}) {
  const [note, setNote] = React.useState(report.review_note ?? "");
  const dirty = note !== (report.review_note ?? "");

  return (
    <div className="flex gap-3 p-3">
      <Checkbox checked={checked} onCheckedChange={(v) => onCheck(!!v)} className="mt-1" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {reporterName(report.reporter)}
          </span>
          <span>· {format(new Date(report.created_at), "PP p")}</span>
          {statusBadge(report.status)}
        </div>
        <p className="whitespace-pre-wrap text-sm">{report.reason_text}</p>
        {canReview ? (
          <div className="space-y-1">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Internal review note (optional)…"
              rows={2}
              className="text-xs"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={!dirty}
                onClick={() => onSaveNote(note)}
              >
                Save note
              </Button>
            </div>
          </div>
        ) : report.review_note ? (
          <p className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
            Note: {report.review_note}
          </p>
        ) : null}
      </div>
    </div>
  );
}
