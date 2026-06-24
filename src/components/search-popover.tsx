import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Loader2, Film, Users, Tag as TagIcon, ArrowRight } from "lucide-react";

import { searchAll } from "@/lib/search.functions";
import { cn } from "@/lib/utils";

/**
 * Header search input. Debounced 200ms, opens a dropdown with three
 * sections (videos / creators / tags) backed by `searchAll`. Enter
 * navigates to `/search?q=…` for the full results page.
 */
export function SearchPopover() {
  const [value, setValue] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), 200);
    return () => clearTimeout(t);
  }, [value]);

  React.useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const fn = useServerFn(searchAll);
  const enabled = debounced.length >= 2;
  const query = useQuery({
    queryKey: ["search", debounced],
    queryFn: () =>
      fn({ data: { q: debounced, videoLimit: 6, creatorLimit: 4, tagLimit: 5 } }),
    enabled,
    staleTime: 60_000,
  });

  function go(to: string) {
    setOpen(false);
    setValue("");
    navigate({ to });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    setOpen(false);
    navigate({ to: "/search", search: { q } });
  }

  const data = enabled ? query.data : undefined;
  const hasAny =
    !!data && (data.videos.length || data.creators.length || data.tags.length);

  return (
    <div ref={rootRef} className="relative w-full max-w-md">
      <form onSubmit={onSubmit}>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={value}
          placeholder="Search videos, creators, tags…"
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => value.trim().length >= 2 && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          className="h-9 w-full rounded-md border bg-card pl-8 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Search"
        />
        {query.isFetching && enabled ? (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </form>

      {open && enabled ? (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-[70vh] overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
          {!data && query.isLoading ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">Searching…</p>
          ) : !hasAny ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              No matches for &ldquo;{debounced}&rdquo;.
            </p>
          ) : (
            <>
              {data.videos.length > 0 ? (
                <Section icon={<Film className="h-3 w-3" />} title="Videos">
                  {data.videos.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(`/v/${v.id}`)}
                      className={ROW}
                    >
                      {v.thumbnail_url ? (
                        <img
                          src={v.thumbnail_url}
                          alt=""
                          loading="lazy"
                          className="h-9 w-16 flex-none rounded object-cover"
                        />
                      ) : (
                        <div className="h-9 w-16 flex-none rounded bg-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{v.title}</p>
                        {v.creator_title ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {v.creator_title}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </Section>
              ) : null}

              {data.creators.length > 0 ? (
                <Section icon={<Users className="h-3 w-3" />} title="Creators">
                  {data.creators.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(`/creators/${c.id}`)}
                      className={ROW}
                    >
                      {c.thumbnail_url ? (
                        <img
                          src={c.thumbnail_url}
                          alt=""
                          loading="lazy"
                          className="h-8 w-8 flex-none rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 flex-none rounded-full bg-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.video_count} video{c.video_count === 1 ? "" : "s"}
                          {c.handle ? ` · ${c.handle}` : ""}
                        </p>
                      </div>
                    </button>
                  ))}
                </Section>
              ) : null}

              {data.tags.length > 0 ? (
                <Section icon={<TagIcon className="h-3 w-3" />} title="Tags">
                  {data.tags.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(`/tags/${t.slug}`)}
                      className={cn(ROW, "items-center")}
                    >
                      <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">{t.name}</span>
                    </button>
                  ))}
                </Section>
              ) : null}

              <Link
                to="/search"
                search={{ q: debounced }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  setValue("");
                }}
                className="mt-1 flex w-full items-center justify-between rounded px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <span>See all results for &ldquo;{debounced}&rdquo;</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

const ROW =
  "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground";

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon} {title}
      </div>
      {children}
    </div>
  );
}
