import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listCreators } from "@/lib/library.functions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/creators/")({
  head: () => ({ meta: [{ title: "Creators — CurateTube" }] }),
  component: CreatorsPage,
});

function CreatorsPage() {
  const list = useServerFn(listCreators);
  const { data, isLoading } = useQuery({
    queryKey: ["creators"],
    queryFn: () => list({ data: { limit: 60 } }),
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Creators</h1>
        <p className="text-sm text-muted-foreground">
          Channels added to the library through approved submissions.
        </p>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (data?.creators.length ?? 0) === 0 ? (
        <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No creators yet — submit a video to add the first one.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {data!.creators.map((c) => (
            <Link
              key={c.id}
              to="/creators/$id"
              params={{ id: c.id }}
              className="group flex items-center gap-3 rounded-lg border bg-card p-3 transition hover:border-foreground/30"
            >
              <Avatar className="h-12 w-12">
                {c.thumbnail_url ? <AvatarImage src={c.thumbnail_url} alt="" /> : null}
                <AvatarFallback>{c.title.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.title}</p>
                {c.handle ? (
                  <p className="truncate text-xs text-muted-foreground">{c.handle}</p>
                ) : null}
                {c.subscriber_count ? (
                  <p className="text-[11px] text-muted-foreground">
                    {Intl.NumberFormat("en", { notation: "compact" }).format(c.subscriber_count)}{" "}
                    subscribers
                  </p>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
