import * as React from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, X, Loader2, Eye, Users, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { listSubmissionQueue, moderateSubmission } from "@/lib/library.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
// Resizable temporarily replaced with CSS grid; revisit when ResizablePanelGroup typing is fixed.
import { ScrollArea } from "@/components/ui/scroll-area";
import { AspectRatio } from "@/components/ui/aspect-ratio";

export const Route = createFileRoute("/_authenticated/moderation")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Moderation queue — CurateTube" }] }),
  component: ModerationPage,
});

type Submission = Awaited<ReturnType<typeof listSubmissionQueue>>["submissions"][number];

function ModerationPage() {
  const fetchQueue = useServerFn(listSubmissionQueue);
  const moderateFn = useServerFn(moderateSubmission);
  const qc = useQueryClient();
  const [status, setStatus] = React.useState<"pending" | "approved" | "rejected">("pending");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["mod-queue", status],
    queryFn: () => fetchQueue({ data: { status } }),
  });

  const submissions = (data?.submissions ?? []) as Submission[];
  const selected = submissions.find((s) => s.id === selectedId) ?? submissions[0] ?? null;

  React.useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const decide = useMutation({
    mutationFn: async (decision: "approve" | "reject") => {
      if (!selected) throw new Error("Nothing selected");
      return moderateFn({
        data: { submissionId: selected.id, decision, reason: reason.trim() || undefined },
      });
    },
    onSuccess: (_, decision) => {
      toast.success(`Submission ${decision === "approve" ? "approved" : "rejected"}`);
      setReason("");
      qc.invalidateQueries({ queryKey: ["mod-queue"] });
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] w-full max-w-7xl flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Moderation</h1>
          <p className="text-sm text-muted-foreground">Review submissions side-by-side.</p>
        </div>
        <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1 rounded-lg border bg-card">
        <ResizablePanel defaultSize={36} minSize={25}>
          <ScrollArea className="h-full">
            <div className="divide-y">
              {isLoading ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : submissions.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Nothing to review.
                </p>
              ) : (
                submissions.map((s) => {
                  const v = s.video;
                  const active = s.id === selected?.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className={`flex w-full items-start gap-3 p-3 text-left transition ${
                        active ? "bg-accent" : "hover:bg-muted/40"
                      }`}
                    >
                      {v?.thumbnail_url ? (
                        <img
                          src={v.thumbnail_url}
                          alt=""
                          className="h-14 w-24 flex-shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="h-14 w-24 flex-shrink-0 rounded bg-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium">
                          {v?.title ?? s.youtube_url}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          {v?.creator ? <span>{v.creator.title}</span> : null}
                          {v ? (
                            <span className="inline-flex items-center gap-0.5">
                              <Users className="h-3 w-3" /> {v.submission_count}
                            </span>
                          ) : null}
                          {s.anonymous ? (
                            <Badge variant="outline" className="h-4 px-1 text-[10px]">
                              anon
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={64} minSize={40}>
          <ScrollArea className="h-full">
            {selected ? (
              <DetailPane
                submission={selected}
                reason={reason}
                onReasonChange={setReason}
                onDecide={(d) => decide.mutate(d)}
                pending={decide.isPending}
                readOnly={status !== "pending"}
              />
            ) : (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Select a submission to review.
              </div>
            )}
          </ScrollArea>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function DetailPane({
  submission,
  reason,
  onReasonChange,
  onDecide,
  pending,
  readOnly,
}: {
  submission: Submission;
  reason: string;
  onReasonChange: (v: string) => void;
  onDecide: (d: "approve" | "reject") => void;
  pending: boolean;
  readOnly: boolean;
}) {
  const v = submission.video;
  return (
    <div className="space-y-4 p-5">
      {submission.youtube_id ? (
        <div className="overflow-hidden rounded-md border bg-black">
          <AspectRatio ratio={16 / 9}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${submission.youtube_id}`}
              allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
              title={v?.title ?? "Preview"}
            />
          </AspectRatio>
        </div>
      ) : (
        <div className="rounded-md border bg-muted p-4 text-sm">
          Could not parse a YouTube ID for this submission.
          <p className="mt-1 break-all font-mono text-xs">{submission.youtube_url}</p>
        </div>
      )}

      <header className="space-y-1">
        <h2 className="text-lg font-semibold leading-snug">
          {v?.title ?? submission.youtube_url}
        </h2>
        {v?.creator ? (
          <p className="text-sm text-muted-foreground">{v.creator.title}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
          {v ? (
            <>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" /> {v.submission_count} submitters
              </span>
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> {v.suggest_count} suggests
              </span>
            </>
          ) : null}
          <a
            href={submission.youtube_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
          >
            <Eye className="h-3 w-3" /> Open original
          </a>
        </div>
      </header>

      {submission.note ? (
        <div className="rounded-md border bg-card p-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Submitter note
          </p>
          <p className="mt-1 whitespace-pre-line">{submission.note}</p>
        </div>
      ) : null}

      {(submission.content_warnings ?? []).length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Warnings:
          </span>
          {submission.content_warnings.map((w) => (
            <Badge key={w} variant="outline">{w}</Badge>
          ))}
        </div>
      ) : null}

      {!readOnly ? (
        <div className="space-y-2 rounded-md border bg-card p-3">
          <label className="text-xs uppercase tracking-wide text-muted-foreground">
            Decision reason (optional)
          </label>
          <Textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={2}
            placeholder="Shared with the submitter on rejection."
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => onDecide("reject")}
              disabled={pending}
            >
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-1 h-4 w-4" />}
              Reject
            </Button>
            <Button onClick={() => onDecide("approve")} disabled={pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
              Approve
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
