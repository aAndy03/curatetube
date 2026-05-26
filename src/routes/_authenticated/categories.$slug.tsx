import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, FolderTree, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";

import { listVideosByCategorySlug } from "@/lib/library.functions";
import {
  listPinnedCategories,
  pinCategory,
  unpinCategory,
} from "@/lib/category-feed.functions";
import { VideoCard, type VideoCardData } from "@/components/video-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const categoryQuery = (slug: string) =>
  queryOptions({
    queryKey: ["category", slug],
    queryFn: () => listVideosByCategorySlug({ data: { slug, limit: 60 } }),
    staleTime: 5 * 60 * 1000,
  });

const clamp = (s: string, max: number) =>
  s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;

export const Route = createFileRoute("/_authenticated/categories/$slug")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(categoryQuery(params.slug)),
  head: ({ loaderData, params }) => {
    const cat = loaderData?.category;
    const name = cat?.name ?? params.slug;
    const title = clamp(`${name} — Curated videos on CurateTube`, 60);
    const desc = cat?.description
      ? clamp(cat.description.replace(/\s+/g, " ").trim(), 160)
      : clamp(`Browse community-curated YouTube videos in the ${name} category on CurateTube.`, 160);
    const url = `https://curatetube.lovable.app/categories/${params.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
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
  const pinsFn = useServerFn(listPinnedCategories);
  const pinFn = useServerFn(pinCategory);
  const unpinFn = useServerFn(unpinCategory);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["category", slug],
    queryFn: () => fn({ data: { slug, limit: 60 } }),
    staleTime: 5 * 60 * 1000,
  });
  const { data: pinsData } = useQuery({
    queryKey: ["pinned-categories"],
    queryFn: () => pinsFn(),
    staleTime: 60_000,
  });

  if (!isLoading && data && !data.category) throw notFound();

  const categoryId = data?.category?.id as string | undefined;
  const isPinned = Boolean(
    categoryId && pinsData?.pinned.some((p) => p.category.id === categoryId),
  );

  const pin = useMutation({
    mutationFn: () => pinFn({ data: { categoryId: categoryId! } }),
    onSuccess: () => {
      toast.success("Pinned to your feed");
      qc.invalidateQueries({ queryKey: ["pinned-categories"] });
      qc.invalidateQueries({ queryKey: ["category-feed"] });
      qc.invalidateQueries({ queryKey: ["my-sections"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const unpin = useMutation({
    mutationFn: () => unpinFn({ data: { categoryId: categoryId! } }),
    onSuccess: () => {
      toast.success("Unpinned");
      qc.invalidateQueries({ queryKey: ["pinned-categories"] });
      qc.invalidateQueries({ queryKey: ["category-feed"] });
      qc.invalidateQueries({ queryKey: ["my-sections"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="space-y-2">
        <Link
          to="/categories"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> All categories
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <FolderTree className="h-5 w-5" />
              {data?.category?.name ?? slug}
            </h1>
            {data?.category?.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{data.category.description}</p>
            ) : null}
          </div>
          {categoryId ? (
            <Button
              variant={isPinned ? "outline" : "default"}
              size="sm"
              onClick={() => (isPinned ? unpin.mutate() : pin.mutate())}
              disabled={pin.isPending || unpin.isPending}
            >
              {isPinned ? (
                <>
                  <PinOff className="mr-1 h-4 w-4" /> Unpin from feed
                </>
              ) : (
                <>
                  <Pin className="mr-1 h-4 w-4" /> Pin to feed
                </>
              )}
            </Button>
          ) : null}
        </div>
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
