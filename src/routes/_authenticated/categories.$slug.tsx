import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import * as React from "react";
import {
  queryOptions,
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, FolderTree, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";

import { listVideosByCategorySlug } from "@/lib/library.functions";
import {
  listPinnedCategories,
  pinCategory,
  unpinCategory,
} from "@/lib/category-feed.functions";
import { type VideoCardData } from "@/components/video-card";
import { InfiniteVideoGrid } from "@/components/infinite-video-grid";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SignInGate } from "@/components/sign-in-gate";
import { useAuth } from "@/lib/auth-context";

const PAGE_SIZE = 24;

const categoryLoaderQuery = (slug: string) =>
  queryOptions({
    queryKey: ["category", slug, "head", "all"],
    queryFn: () =>
      listVideosByCategorySlug({ data: { slug, limit: PAGE_SIZE, cursor: 0, scope: "all" } }),
    staleTime: 5 * 60_000,
  });

const clamp = (s: string, max: number) =>
  s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;

export const Route = createFileRoute("/_authenticated/categories/$slug")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(categoryLoaderQuery(params.slug)),
  head: ({ loaderData, params }) => {
    const cat = loaderData?.category;
    const name = cat?.name ?? params.slug;
    const title = clamp(`${name} — Curated videos on CurateTube`, 60);
    const desc = cat?.description
      ? clamp(cat.description.replace(/\s+/g, " ").trim(), 160)
      : clamp(
          `Browse community-curated YouTube videos in the ${name} category on CurateTube.`,
          160,
        );
    const url = `https://curatetube.lovable.app/categories/${params.slug}`;
    const image = loaderData?.coverThumbnail ?? undefined;
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
    ];
    if (image) {
      meta.push({ property: "og:image", content: image });
      meta.push({ name: "twitter:card", content: "summary_large_image" });
      meta.push({ name: "twitter:image", content: image });
    }
    return {
      meta,
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
  const { user } = useAuth();
  const signedIn = !!user;
  const [scope, setScope] = React.useState<"all" | "direct">("all");

  const query = useInfiniteQuery({
    queryKey: ["category", slug, "infinite", scope],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fn({ data: { slug, limit: PAGE_SIZE, cursor: pageParam as number, scope } }),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 5 * 60_000,
  });

  const head = query.data?.pages[0];
  if (!query.isLoading && head && !head.category) throw notFound();

  const { data: pinsData } = useQuery({
    queryKey: ["pinned-categories", user?.id ?? null],
    enabled: signedIn,
    queryFn: () => pinsFn(),
    staleTime: 60_000,
  });

  const categoryId = head?.category?.id as string | undefined;
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

  const videos = React.useMemo(
    () => (query.data?.pages.flatMap((p) => p.videos) ?? []) as VideoCardData[],
    [query.data],
  );
  const breadcrumb = head?.breadcrumb ?? [];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="space-y-2">
        <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Link to="/categories" className="hover:text-foreground">
            <span className="inline-flex items-center gap-1">
              <ChevronLeft className="h-3.5 w-3.5" /> All categories
            </span>
          </Link>
          {breadcrumb.map((b) => (
            <React.Fragment key={b.id}>
              <ChevronRight className="h-3 w-3" />
              <Link
                to="/categories/$slug"
                params={{ slug: b.slug }}
                className="hover:text-foreground"
              >
                {b.name}
              </Link>
            </React.Fragment>
          ))}
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <FolderTree className="h-5 w-5" />
              {head?.category?.name ?? slug}
            </h1>
            {head?.category?.description ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {head.category.description}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <ToggleGroup
              type="single"
              size="sm"
              value={scope}
              onValueChange={(v) => v && setScope(v as "all" | "direct")}
              aria-label="Scope"
            >
              <ToggleGroupItem value="all">Incl. sub-categories</ToggleGroupItem>
              <ToggleGroupItem value="direct">Direct only</ToggleGroupItem>
            </ToggleGroup>
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
        </div>
      </header>

      <InfiniteVideoGrid
        videos={videos}
        isLoading={query.isLoading}
        isFetchingNextPage={query.isFetchingNextPage}
        hasNextPage={Boolean(query.hasNextPage)}
        onLoadMore={() => query.fetchNextPage()}
        emptyMessage="No videos in this category yet."
      />
    </div>
  );
}
