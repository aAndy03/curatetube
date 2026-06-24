import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Search as SearchIcon, Film, Users, Tag as TagIcon } from "lucide-react";

import { searchAll } from "@/lib/search.functions";

const searchSchema = z.object({
  q: fallback(z.string().trim().max(80), "").default(""),
});

const clamp = (s: string, max: number) =>
  s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;

export const Route = createFileRoute("/_authenticated/search")({
  validateSearch: zodValidator(searchSchema),
  head: ({ match }) => {
    const q = (match.search as { q?: string }).q ?? "";
    const title = q
      ? clamp(`Search: ${q} — CurateTube`, 60)
      : "Search — CurateTube";
    const desc = q
      ? clamp(`Search results for "${q}" across community-curated YouTube videos, creators and tags on CurateTube.`, 160)
      : "Search community-curated YouTube videos, creators and tags on CurateTube.";
    const url = q
      ? `https://curatetube.lovable.app/search?q=${encodeURIComponent(q)}`
      : "https://curatetube.lovable.app/search";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { name: "robots", content: q ? "noindex,follow" : "index,follow" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: "https://curatetube.lovable.app/search" }],
    };
  },
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const [value, setValue] = React.useState(q);
  const [debounced, setDebounced] = React.useState(q);

  React.useEffect(() => setValue(q), [q]);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), 250);
    return () => clearTimeout(t);
  }, [value]);
  React.useEffect(() => {
    if (debounced === q) return;
    navigate({ search: { q: debounced }, replace: true });
  }, [debounced, q, navigate]);

  const fn = useServerFn(searchAll);
  const enabled = debounced.length >= 2;
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["search-page", debounced],
    queryFn: () =>
      fn({ data: { q: debounced, videoLimit: 24, creatorLimit: 12, tagLimit: 16 } }),
    enabled,
    staleTime: 60_000,
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <SearchIcon className="h-5 w-5" /> Search
        </h1>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Search videos, creators, tags…"
            className="h-11 w-full rounded-md border bg-card pl-9 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {!enabled ? (
          <p className="text-xs text-muted-foreground">Type at least 2 characters.</p>
        ) : isFetching ? (
          <p className="text-xs text-muted-foreground">Searching…</p>
        ) : data ? (
          <p className="text-xs text-muted-foreground">
            {data.videos.length} videos · {data.creators.length} creators · {data.tags.length} tags
          </p>
        ) : null}
      </header>

      {enabled && !isLoading && data ? (
        data.videos.length === 0 && data.creators.length === 0 && data.tags.length === 0 ? (
          <p className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">
            No matches for &ldquo;{debounced}&rdquo;.
          </p>
        ) : (
          <div className="space-y-8">
            {data.videos.length > 0 ? (
              <section>
                <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <Film className="h-3.5 w-3.5" /> Videos
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.videos.map((v) => (
                    <li key={v.id}>
                      <Link
                        to="/v/$id"
                        params={{ id: v.id }}
                        className="group block overflow-hidden rounded-md border bg-card transition hover:border-foreground/30"
                      >
                        <div className="aspect-video w-full overflow-hidden bg-muted">
                          {v.thumbnail_url ? (
                            <img
                              src={v.thumbnail_url}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover transition group-hover:scale-105"
                            />
                          ) : null}
                        </div>
                        <div className="p-2">
                          <p className="line-clamp-2 text-sm font-medium leading-snug">{v.title}</p>
                          {v.creator_title ? (
                            <p className="mt-1 truncate text-xs text-muted-foreground">{v.creator_title}</p>
                          ) : null}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {data.creators.length > 0 ? (
              <section>
                <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <Users className="h-3.5 w-3.5" /> Creators
                </h2>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.creators.map((c) => (
                    <li key={c.id}>
                      <Link
                        to="/creators/$id"
                        params={{ id: c.id }}
                        className="flex items-center gap-3 rounded-md border bg-card p-2 hover:border-foreground/30"
                      >
                        {c.thumbnail_url ? (
                          <img src={c.thumbnail_url} alt="" loading="lazy" className="h-10 w-10 flex-none rounded-full object-cover" />
                        ) : (
                          <div className="h-10 w-10 flex-none rounded-full bg-muted" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{c.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {c.video_count} video{c.video_count === 1 ? "" : "s"}
                            {c.handle ? ` · ${c.handle}` : ""}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {data.tags.length > 0 ? (
              <section>
                <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <TagIcon className="h-3.5 w-3.5" /> Tags
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {data.tags.map((t) => (
                    <Link
                      key={t.id}
                      to="/tags/$slug"
                      params={{ slug: t.slug }}
                      className="inline-flex items-center rounded border border-border bg-card px-2 py-1 text-xs hover:border-foreground/40"
                    >
                      {t.name}
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}
