import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FolderTree } from "lucide-react";

import { listCategoriesWithStats } from "@/lib/library.functions";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/categories")({
  head: () => ({
    meta: [
      { title: "Categories — CurateTube" },
      {
        name: "description",
        content: "Browse the curated library by category.",
      },
    ],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const fn = useServerFn(listCategoriesWithStats);
  const { data, isLoading } = useQuery({
    queryKey: ["categories-browse"],
    queryFn: () => fn(),
    staleTime: 30 * 60 * 1000,
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <FolderTree className="h-5 w-5" /> Categories
        </h1>
        <p className="text-sm text-muted-foreground">
          Tap a category to see all approved videos inside it.
        </p>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : (data?.categories.length ?? 0) === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <FolderTree className="mx-auto h-6 w-6 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-medium">No categories yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Once moderators tag videos with categories, they'll show up here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data!.categories.map((c) => (
            <Link
              key={c.id}
              to="/categories/$slug"
              params={{ slug: c.slug }}
              className="group flex flex-col overflow-hidden rounded-xl border bg-card transition hover:border-foreground/30"
            >
              <div className="grid h-28 grid-cols-2 gap-px bg-border">
                {c.thumbnails.length === 0 ? (
                  <div className="col-span-2 flex items-center justify-center bg-muted/40 text-xs text-muted-foreground">
                    No videos yet
                  </div>
                ) : (
                  Array.from({ length: 4 }).map((_, i) => {
                    const t = c.thumbnails[i];
                    return (
                      <div key={i} className="bg-muted/40">
                        {t ? (
                          <img
                            src={t}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.video_count} {c.video_count === 1 ? "video" : "videos"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
