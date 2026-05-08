import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, FolderTree } from "lucide-react";

import { listVideosByCategorySlug } from "@/lib/library.functions";
import { VideoCard, type VideoCardData } from "@/components/video-card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/categories/$slug")({
  head: () => ({
    meta: [{ title: "Category — CurateTube" }],
  }),
  component: CategoryDetailPage,
  notFoundComponent: () => (
    <div className="p-10 text-center text-sm text-muted-foreground">
      Category not found.
    </div>
  ),
});

function CategoryDetailPage() {
  const { slug } = Route.useParams();
  const fn = useServerFn(listVideosByCategorySlug);
  const { data, isLoading } = useQuery({
    queryKey: ["category", slug],
    queryFn: () => fn({ data: { slug, limit: 60 } }),
    staleTime: 5 * 60 * 1000,
  });

  if (!isLoading && data && !data.category) throw notFound();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="space-y-2">
        <Link
          to="/categories"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> All categories
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <FolderTree className="h-5 w-5" />
          {data?.category?.name ?? slug}
        </h1>
        {data?.category?.description ? (
          <p className="text-sm text-muted-foreground">{data.category.description}</p>
        ) : null}
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video w-full" />
          ))}
        </div>
      ) : (data?.videos.length ?? 0) === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          No videos in this category yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data!.videos.map((v) => (
            <VideoCard key={v.id} video={v as VideoCardData} />
          ))}
        </div>
      )}
    </div>
  );
}
