import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listCreators } from "@/lib/library.functions";
import { listCreatorsByCategory } from "@/lib/creator-categories.functions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/creators/")({
  head: () => ({ meta: [{ title: "Creators — CurateTube" }] }),
  component: CreatorsPage,
});

type View = "all" | "by-category";

function CreatorsPage() {
  const [view, setView] = React.useState<View>("all");
  const list = useServerFn(listCreators);
  const byCategoryFn = useServerFn(listCreatorsByCategory);

  const allQ = useQuery({
    queryKey: ["creators"],
    queryFn: () => list({ data: { limit: 60 } }),
    enabled: view === "all",
    staleTime: 5 * 60_000,
  });

  const catQ = useQuery({
    queryKey: ["creators-by-category"],
    queryFn: () => byCategoryFn({ data: { perCategory: 24 } }),
    enabled: view === "by-category",
    staleTime: 5 * 60_000,
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Creators</h1>
          <p className="text-sm text-muted-foreground">
            Channels added to the library through approved submissions.
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as View)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="all">All creators</ToggleGroupItem>
          <ToggleGroupItem value="by-category">By category</ToggleGroupItem>
        </ToggleGroup>
      </header>

      {view === "all" ? <AllCreatorsView query={allQ} /> : <ByCategoryView query={catQ} />}
    </div>
  );
}

function AllCreatorsView({
  query,
}: {
  query: ReturnType<typeof useQuery<Awaited<ReturnType<ReturnType<typeof useServerFn<typeof listCreators>>>>>>;
}) {
  if (query.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }
  const creators = query.data?.creators ?? [];
  if (creators.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        No creators yet — submit a video to add the first one.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {creators.map((c) => (
        <CreatorCard
          key={c.id}
          id={c.id}
          title={c.title}
          handle={c.handle ?? null}
          thumbnail_url={c.thumbnail_url ?? null}
          subscriber_count={c.subscriber_count ?? null}
        />
      ))}
    </div>
  );
}

function ByCategoryView({
  query,
}: {
  query: ReturnType<typeof useQuery<Awaited<ReturnType<ReturnType<typeof useServerFn<typeof listCreatorsByCategory>>>>>>;
}) {
  if (query.isLoading) {
    return (
      <div className="space-y-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="h-28 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  const groups = query.data?.groups ?? [];
  if (groups.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        No category data yet — once videos are tagged with categories they'll appear here.
      </p>
    );
  }
  return (
    <div className="space-y-10">
      {groups.map((g) => (
        <section key={g.category.id} className="space-y-3">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              <Link
                to="/categories/$slug"
                params={{ slug: g.category.slug }}
                className="underline-offset-4 hover:underline"
              >
                {g.category.name}
              </Link>
            </h2>
            <Badge variant="outline" className="text-[10px]">
              {g.creators.length} creator{g.creators.length === 1 ? "" : "s"}
            </Badge>
          </header>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {g.creators.map((c) => (
              <CreatorCard
                key={`${g.category.id}-${c.id}`}
                id={c.id}
                title={c.title}
                handle={c.handle}
                thumbnail_url={c.thumbnail_url}
                subscriber_count={c.subscriber_count}
                videosInCategory={c.videos_in_category}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function CreatorCard(props: {
  id: string;
  title: string;
  handle: string | null;
  thumbnail_url: string | null;
  subscriber_count: number | null;
  videosInCategory?: number;
}) {
  return (
    <Link
      to="/creators/$id"
      params={{ id: props.id }}
      className="group flex items-center gap-3 rounded-lg border bg-card p-3 transition hover:border-foreground/30"
    >
      <Avatar className="h-12 w-12">
        {props.thumbnail_url ? <AvatarImage src={props.thumbnail_url} alt="" /> : null}
        <AvatarFallback>{props.title.slice(0, 2)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{props.title}</p>
        {props.handle ? (
          <p className="truncate text-xs text-muted-foreground">{props.handle}</p>
        ) : null}
        {props.subscriber_count ? (
          <p className="text-[11px] text-muted-foreground">
            {Intl.NumberFormat("en", { notation: "compact" }).format(props.subscriber_count)} subs
            {props.videosInCategory ? ` · ${props.videosInCategory} in cat.` : ""}
          </p>
        ) : props.videosInCategory ? (
          <p className="text-[11px] text-muted-foreground">
            {props.videosInCategory} video{props.videosInCategory === 1 ? "" : "s"} here
          </p>
        ) : null}
      </div>
    </Link>
  );
}
