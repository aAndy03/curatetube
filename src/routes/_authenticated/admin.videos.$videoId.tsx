import * as React from "react";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Brain, Check, ShieldAlert, Sparkles, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/lib/use-permissions";
import {
  getVideoDetail,
  getAiResultsForVideo,
  dispatchAdminSingleAiJob,
  acceptAiResult,
  rejectAiResult,
  type AiJobType,
} from "@/lib/admin-video-detail.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/videos/$videoId")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Video — CurateTube Admin" }] }),
  component: AdminVideoDetailPage,
});

function formatDuration(s: number | null | undefined) {
  if (!s || s <= 0) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function confidenceColor(c: number) {
  if (c >= 0.8) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  if (c >= 0.5) return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";
}

const JOB_TYPE_LABEL: Record<AiJobType, string> = {
  categorise: "Categories",
  tag_primary: "Primary tags",
  tag_secondary: "Secondary tags",
  tag_rest: "All tags",
};

function AdminVideoDetailPage() {
  const { videoId } = Route.useParams();
  const { data: perms } = usePermissions();
  const qc = useQueryClient();
  const canManage = perms?.isOwner || perms?.has("library.manage");

  const fetchDetail = useServerFn(getVideoDetail);
  const fetchAi = useServerFn(getAiResultsForVideo);
  const dispatchJob = useServerFn(dispatchAdminSingleAiJob);
  const accept = useServerFn(acceptAiResult);
  const reject = useServerFn(rejectAiResult);

  const detailQ = useQuery({
    queryKey: ["admin-video-detail", videoId],
    enabled: !!canManage,
    queryFn: () => fetchDetail({ data: { video_id: videoId } }),
  });

  const aiQ = useQuery({
    queryKey: ["admin-video-ai", videoId],
    enabled: !!canManage,
    queryFn: () => fetchAi({ data: { video_id: videoId } }),
    refetchInterval: (q) => {
      const active = q.state.data?.activeJobs?.length ?? 0;
      return active > 0 ? 5000 : false;
    },
  });

  const dispatch = useMutation({
    mutationFn: (job_type: AiJobType) => dispatchJob({ data: { video_id: videoId, job_type } }),
    onSuccess: (r) => {
      toast.success(r.deduped ? "Job already queued" : "AI job dispatched");
      qc.invalidateQueries({ queryKey: ["admin-video-ai", videoId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const acceptM = useMutation({
    mutationFn: (result_id: string) => accept({ data: { result_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-video-ai", videoId] });
      qc.invalidateQueries({ queryKey: ["admin-video-detail", videoId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const rejectM = useMutation({
    mutationFn: (result_id: string) => reject({ data: { result_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-video-ai", videoId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (perms && !canManage) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto h-6 w-6 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-medium">No access</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You need <code>library.manage</code> to view this page.
        </p>
      </div>
    );
  }

  if (detailQ.isLoading || !detailQ.data) {
    return <Skeleton className="h-[60vh] w-full" />;
  }

  const v = detailQ.data.video;
  const categories = detailQ.data.categories;
  const tags = detailQ.data.tags;
  const aiResults = aiQ.data?.results ?? [];
  const activeJobs = aiQ.data?.activeJobs ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/videos">
            <ArrowLeft className="mr-1 h-4 w-4" /> All videos
          </Link>
        </Button>
        <Badge variant="outline" className="text-xs">
          {v.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: player + stats */}
        <section className="lg:col-span-5 space-y-3">
          <div className="aspect-video w-full overflow-hidden rounded-xl border bg-black">
            <iframe
              title={v.title}
              src={`https://www.youtube.com/embed/${v.youtube_id}`}
              className="h-full w-full"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <div className="rounded-xl border bg-card p-4">
            <h1 className="text-lg font-semibold leading-tight">{v.title}</h1>
            {v.creator ? (
              <Link
                to="/creators/$id"
                params={{ id: v.creator.id }}
                className="mt-1 inline-block text-sm text-muted-foreground hover:underline"
              >
                {v.creator.title}
              </Link>
            ) : null}
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Stat label="Duration" value={formatDuration(v.duration_seconds)} />
              <Stat label="Submissions" value={v.submission_count.toLocaleString()} />
              <Stat label="Suggests" value={v.suggest_count.toLocaleString()} />
              <Stat label="In-app likes" value={v.app_like_count.toLocaleString()} />
            </dl>
            {categories.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Categories
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {categories.map((c) => (
                    <Badge key={c.id} variant="secondary">
                      {c.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {tags.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Tags
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {tags.map((t) =>
                    t.tag ? (
                      <Badge
                        key={t.tag.id}
                        variant={t.tag.is_platform_tag ? "default" : "outline"}
                        className="text-xs"
                      >
                        {t.tag.name}
                      </Badge>
                    ) : null,
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {/* Centre: AI metadata block */}
        <section className="lg:col-span-3 space-y-3">
          <div className="rounded-xl border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Brain className="h-4 w-4" /> AI metadata
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Stat
                label="Categorised"
                value={v.ai_categorised_at ? new Date(v.ai_categorised_at).toLocaleString() : "Never"}
              />
              <Stat label="Categorise model" value={v.ai_categorisation_model ?? "—"} />
              <Stat
                label="Tagged"
                value={v.ai_tagged_at ? new Date(v.ai_tagged_at).toLocaleString() : "Never"}
              />
              <Stat label="Tag model" value={v.ai_tagging_model ?? "—"} />
              <Stat
                label="Avg confidence"
                value={
                  v.ai_confidence_avg != null
                    ? (v.ai_confidence_avg * 100).toFixed(0) + "%"
                    : "—"
                }
              />
              <Stat label="Review status" value={v.ai_review_status} />
            </dl>
          </div>

          {activeJobs.length > 0 ? (
            <div className="rounded-xl border bg-card p-4">
              <h3 className="text-sm font-semibold">Active AI jobs</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {activeJobs.map((j) => (
                  <li
                    key={j.id}
                    className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1"
                  >
                    <span>
                      {JOB_TYPE_LABEL[j.job_type as AiJobType]}{" "}
                      <span className="text-muted-foreground">· {j.scope}</span>
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {j.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {/* Right: AI panel */}
        <section className="lg:col-span-4">
          <div className="rounded-xl border bg-card">
            <div className="border-b p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4" /> AI suggestions
              </h2>
            </div>
            <Tabs defaultValue="categorise" className="w-full">
              <TabsList className="mx-4 mt-3 grid w-[calc(100%-2rem)] grid-cols-4">
                <TabsTrigger value="categorise">Cats</TabsTrigger>
                <TabsTrigger value="tag_primary">Primary</TabsTrigger>
                <TabsTrigger value="tag_secondary">Secondary</TabsTrigger>
                <TabsTrigger value="tag_rest">All</TabsTrigger>
              </TabsList>
              {(["categorise", "tag_primary", "tag_secondary", "tag_rest"] as AiJobType[]).map(
                (jt) => (
                  <TabsContent key={jt} value={jt} className="p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {JOB_TYPE_LABEL[jt]} suggestions
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={dispatch.isPending}
                        onClick={() => dispatch.mutate(jt)}
                      >
                        <Sparkles className="mr-1 h-3.5 w-3.5" />
                        Request AI
                      </Button>
                    </div>
                    <ResultList
                      results={aiResults.filter((r) => r.result_type === jt)}
                      onAccept={(id) => acceptM.mutate(id)}
                      onReject={(id) => rejectM.mutate(id)}
                      acceptingId={acceptM.isPending ? acceptM.variables : null}
                      rejectingId={rejectM.isPending ? rejectM.variables : null}
                    />
                  </TabsContent>
                ),
              )}
            </Tabs>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

type AiResult = {
  id: string;
  entity_name: string;
  confidence: number;
  was_accepted: boolean | null;
  rejection_reason: string | null;
};

function ResultList({
  results,
  onAccept,
  onReject,
  acceptingId,
  rejectingId,
}: {
  results: AiResult[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  acceptingId: string | null | undefined;
  rejectingId: string | null | undefined;
}) {
  if (results.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No suggestions yet. Click "Request AI" to generate.
      </p>
    );
  }
  const sorted = [...results].sort((a, b) => b.confidence - a.confidence);
  return (
    <ul className="space-y-1.5">
      {sorted.map((r) => {
        const accepted = r.was_accepted === true;
        const rejected = r.was_accepted === false;
        return (
          <li
            key={r.id}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm",
              confidenceColor(r.confidence),
              accepted && "ring-1 ring-emerald-500/40",
              rejected && "opacity-50",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.entity_name}</p>
              <p className="text-xs opacity-80">{(r.confidence * 100).toFixed(0)}% confidence</p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant={accepted ? "default" : "ghost"}
                className="h-7 w-7"
                disabled={acceptingId === r.id}
                onClick={() => onAccept(r.id)}
                title="Accept"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant={rejected ? "destructive" : "ghost"}
                className="h-7 w-7"
                disabled={rejectingId === r.id}
                onClick={() => onReject(r.id)}
                title="Reject"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
