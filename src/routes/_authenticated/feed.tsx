import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";

import { adoptTemplate, listMySections, type FeedSection } from "@/lib/sections.functions";
import { enqueue } from "@/lib/action-queue";
import { FeedSectionView } from "@/components/feed-section";
import { CategoryFeedRails } from "@/components/category-feed-rails";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/lib/use-permissions";
import { useSubmitSheet } from "@/lib/use-submit-sheet";

export const Route = createFileRoute("/_authenticated/feed")({
  head: () => ({ meta: [{ title: "Home — CurateTube" }] }),
  component: FeedPage,
});

function FeedPage() {
  const listFn = useServerFn(listMySections);
  const adoptFn = useServerFn(adoptTemplate);
  const qc = useQueryClient();
  const { data: perms } = usePermissions();
  const { setOpen } = useSubmitSheet();
  const canSubmit = perms?.has("submission.create");

  const sectionsQ = useQuery({
    queryKey: ["my-sections"],
    queryFn: () => listFn(),
  });

  const adopt = useMutation({
    mutationFn: (templateId: string) => adoptFn({ data: { templateId } }),
    onSuccess: () => {
      toast.success("Section added");
      qc.invalidateQueries({ queryKey: ["my-sections"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sections = sectionsQ.data?.sections ?? [];
  const templates = sectionsQ.data?.templates ?? [];

  const move = (id: string, dir: -1 | 1) => {
    const ids = sections.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    // Optimistic local reorder
    const reordered = ids
      .map((sid) => sections.find((s) => s.id === sid))
      .filter(Boolean) as FeedSection[];
    qc.setQueryData<{ sections: FeedSection[]; templates: FeedSection[] } | undefined>(
      ["my-sections"],
      (prev) => (prev ? { ...prev, sections: reordered } : prev),
    );
    void enqueue({ type: "feed_reorder", orderedIds: ids });
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
          <p className="text-sm text-muted-foreground">
            Build your own feed by stacking sections. Reorder, resize, and pick what fills each one.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-1 size-4" /> Add section
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>From templates</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {templates.length === 0 ? (
                <DropdownMenuItem disabled>No templates available</DropdownMenuItem>
              ) : (
                templates.map((t) => (
                  <DropdownMenuItem
                    key={t.id}
                    onClick={() => adopt.mutate(t.id)}
                  >
                    <Wrench className="mr-2 size-3.5" />
                    {t.name}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {canSubmit ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-1 size-4" /> Submit
            </Button>
          ) : null}
        </div>
      </header>

      {sectionsQ.isLoading ? (
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="aspect-video" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : sections.length === 0 ? (
        <section className="rounded-xl border bg-card p-10 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-medium">Your feed is empty</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Add a section from a template above to start filling your home page. You can edit, reorder, and remove sections any time.
          </p>
          {templates.length > 0 ? (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {templates.map((t) => (
                <Button key={t.id} variant="outline" onClick={() => adopt.mutate(t.id)}>
                  <Plus className="mr-1 size-4" />
                  {t.name}
                </Button>
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <div className="space-y-10">
          {sections.map((s, i) => (
            <FeedSectionView
              key={s.id}
              section={s}
              index={i}
              total={sections.length}
              onMove={(dir) => move(s.id, dir)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
