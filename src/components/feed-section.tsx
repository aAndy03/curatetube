import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  MoreHorizontal,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  type FeedSection as FeedSectionType,
  deleteSection,
  getSectionVideos,
  updateSection,
} from "@/lib/sections.functions";
import { VideoCard } from "@/components/video-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function FeedSectionView({
  section,
  index,
  total,
  onMove,
}: {
  section: FeedSectionType;
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
}) {
  const fetchVideos = useServerFn(getSectionVideos);
  const updateFn = useServerFn(updateSection);
  const deleteFn = useServerFn(deleteSection);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["section-videos", section.id, section.size, section.sort, section.source, section.filters],
    queryFn: () => fetchVideos({ data: { sectionId: section.id, offset: 0 } }),
    refetchInterval: section.refresh_minutes * 60_000,
  });

  const update = useMutation({
    mutationFn: (patch: Partial<FeedSectionType>) =>
      updateFn({ data: { id: section.id, patch: patch as never } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-sections"] });
      qc.invalidateQueries({ queryKey: ["section-videos", section.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { id: section.id } }),
    onSuccess: () => {
      toast.success("Section removed");
      qc.invalidateQueries({ queryKey: ["my-sections"] });
    },
  });

  const gridClass =
    section.layout === "row"
      ? "flex gap-4 overflow-x-auto pb-2 [&>*]:min-w-[260px] [&>*]:max-w-[260px]"
      : section.layout === "compact"
        ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6"
        : "grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  const filters = (section.filters ?? {}) as Record<string, unknown>;
  const isPinnedCategorySection =
    section.source === "recent_in_category" && typeof filters.pin_category_id === "string";
  const includeDescendants = filters.includeDescendants !== false;

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{section.name}</h2>
          <span className="text-xs text-muted-foreground">
            {labelForSource(section.source)} · {section.size} items
          </span>
          {isPinnedCategorySection ? (
            <ToggleGroup
              type="single"
              size="sm"
              value={includeDescendants ? "all" : "direct"}
              onValueChange={(value) => {
                if (!value) return;
                update.mutate({
                  filters: {
                    ...filters,
                    includeDescendants: value === "all",
                  },
                });
              }}
            >
              <ToggleGroupItem value="all" aria-label="Show all descendant videos">
                All
              </ToggleGroupItem>
              <ToggleGroupItem value="direct" aria-label="Show only direct videos">
                Direct
              </ToggleGroupItem>
            </ToggleGroup>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label="Move up"
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            aria-label="Move down"
          >
            <ArrowDown className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => q.refetch()}
            aria-label="Refresh"
          >
            <RefreshCw className={`size-4 ${q.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost">
                Edit
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3" align="end">
              <div className="space-y-1">
                <Label htmlFor={`name-${section.id}`}>Name</Label>
                <Input
                  id={`name-${section.id}`}
                  defaultValue={section.name}
                  onBlur={(e) => {
                    const v = e.currentTarget.value.trim();
                    if (v && v !== section.name) update.mutate({ name: v });
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label>Source</Label>
                <Select
                  value={section.source}
                  onValueChange={(v) => update.mutate({ source: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latest_approved">Latest approvals</SelectItem>
                    <SelectItem value="top_suggested">Most suggested</SelectItem>
                    <SelectItem value="top_submitted">Most submitted</SelectItem>
                    <SelectItem value="recent_in_category">By category</SelectItem>
                    <SelectItem value="by_creator">By creator</SelectItem>
                    <SelectItem value="random_pick">Random pick</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Sort</Label>
                  <Select
                    value={section.sort}
                    onValueChange={(v) => update.mutate({ sort: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">Recent</SelectItem>
                      <SelectItem value="suggest">Suggest</SelectItem>
                      <SelectItem value="submission">Submission</SelectItem>
                      <SelectItem value="random">Random</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Layout</Label>
                  <Select
                    value={section.layout}
                    onValueChange={(v) =>
                      update.mutate({ layout: v as FeedSectionType["layout"] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grid">Grid</SelectItem>
                      <SelectItem value="row">Row</SelectItem>
                      <SelectItem value="compact">Compact</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Size</Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    defaultValue={section.size}
                    onBlur={(e) => {
                      const n = Math.max(1, Math.min(60, Number(e.currentTarget.value)));
                      if (n !== section.size) update.mutate({ size: n });
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Refresh (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    defaultValue={section.refresh_minutes}
                    onBlur={(e) => {
                      const n = Math.max(1, Math.min(1440, Number(e.currentTarget.value)));
                      if (n !== section.refresh_minutes)
                        update.mutate({ refresh_minutes: n });
                    }}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="Section menu">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Section</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => update.mutate({ enabled: !section.enabled })}
              >
                {section.enabled ? "Disable" : "Enable"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => remove.mutate()}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 size-4" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {q.isLoading ? (
        <div className={gridClass}>
          {Array.from({ length: Math.min(section.size, 8) }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-video w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      ) : (q.data?.videos.length ?? 0) === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing matches this section yet.
        </div>
      ) : (
        <div className={gridClass}>
          {q.data!.videos.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      )}
    </section>
  );
}

function labelForSource(s: string) {
  switch (s) {
    case "latest_approved":
      return "Latest approvals";
    case "top_suggested":
      return "Most suggested";
    case "top_submitted":
      return "Most submitted";
    case "recent_in_category":
      return "By category";
    case "by_creator":
      return "By creator";
    case "leaderboard_tier":
      return "Leaderboard";
    case "random_pick":
      return "Random";
    default:
      return s;
  }
}
