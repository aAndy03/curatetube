import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, X, CheckCircle2, AlertCircle, Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { submitVideos, type SubmitResultItem } from "@/lib/library.functions";
import {
  getSubmitQuota,
  previewSubmission,
  type PreviewResult,
  type SuggestionChip,
} from "@/lib/submit.functions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SubmitSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type UrlRowState = {
  url: string;
  selectedCategoryIds: string[];
  selectedTagIds: string[];
};

function formatResetIn(iso: string | null): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "now";
  const d = Math.floor(diff / 86400_000);
  const h = Math.floor((diff % 86400_000) / 3600_000);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((diff % 3600_000) / 60_000);
  return `${h}h ${m}m`;
}

export function SubmitSheet({ open, onOpenChange }: SubmitSheetProps) {
  const submitFn = useServerFn(submitVideos);
  const quotaFn = useServerFn(getSubmitQuota);
  const [rows, setRows] = React.useState<UrlRowState[]>([
    { url: "", selectedCategoryIds: [], selectedTagIds: [] },
  ]);
  const [note, setNote] = React.useState("");
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [warningInput, setWarningInput] = React.useState("");
  const [anonymous, setAnonymous] = React.useState(false);
  const [results, setResults] = React.useState<SubmitResultItem[] | null>(null);

  const quotaQuery = useQuery({
    queryKey: ["submit-quota"],
    queryFn: () => quotaFn(),
    enabled: open,
    staleTime: 30_000,
  });

  const reset = () => {
    setRows([{ url: "", selectedCategoryIds: [], selectedTagIds: [] }]);
    setNote("");
    setWarnings([]);
    setAnonymous(false);
    setResults(null);
  };

  const cleanedUrls = rows.map((r) => r.url.trim()).filter(Boolean);
  const quota = quotaQuery.data;
  const overQuota =
    !!quota && !quota.unlimited && cleanedUrls.length > quota.remaining;

  const mutation = useMutation({
    mutationFn: async () => {
      if (cleanedUrls.length === 0) throw new Error("Add at least one URL.");
      return submitFn({
        data: {
          urls: cleanedUrls,
          note: note.trim() || undefined,
          contentWarnings: warnings,
          anonymous,
          perUrl: rows
            .filter((r) => r.url.trim())
            .map((r) => ({
              url: r.url.trim(),
              proposedCategoryIds: r.selectedCategoryIds,
              proposedTagIds: r.selectedTagIds,
            })),
        },
      });
    },
    onSuccess: (r) => {
      setResults(r.results);
      const ok = r.results.filter((x) => x.status === "pending").length;
      const dup = r.results.filter((x) => x.status === "duplicate").length;
      const bad = r.results.filter((x) => x.status === "invalid").length;
      toast.success(`${ok} queued · ${dup} already in library · ${bad} invalid`);
      quotaQuery.refetch();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Submission failed");
    },
  });

  const addUrl = () =>
    setRows((u) => [...u, { url: "", selectedCategoryIds: [], selectedTagIds: [] }]);
  const removeUrl = (idx: number) =>
    setRows((u) =>
      u.length === 1
        ? [{ url: "", selectedCategoryIds: [], selectedTagIds: [] }]
        : u.filter((_, i) => i !== idx),
    );
  const updateRow = (idx: number, patch: Partial<UrlRowState>) =>
    setRows((u) => u.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const addChip = (
    raw: string,
    list: string[],
    setList: (v: string[]) => void,
    setInput: (v: string) => void,
  ) => {
    const v = raw.trim().replace(/^#/, "");
    if (!v || list.includes(v)) return;
    setList([...list, v]);
    setInput("");
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>Submit videos</SheetTitle>
          <SheetDescription>
            Paste one or more YouTube URLs. We'll fetch metadata and queue them for review.
          </SheetDescription>
          {quota ? (
            quota.unlimited ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Unlimited submissions on your role.
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                <span className={overQuota ? "font-medium text-destructive" : ""}>
                  {quota.used} of {quota.limit} submits used this week
                </span>
                {quota.resets_at ? <> · resets in {formatResetIn(quota.resets_at)}</> : null}
              </p>
            )
          ) : null}
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-6 px-6 py-5">
            {!results ? (
              <>
                <div className="space-y-3">
                  <Label>YouTube URLs</Label>
                  {rows.map((row, i) => (
                    <UrlRow
                      key={i}
                      row={row}
                      onChange={(patch) => updateRow(i, patch)}
                      onRemove={() => removeUrl(i)}
                    />
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addUrl}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add another URL
                  </Button>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="note">Curator note (optional)</Label>
                  <Textarea
                    id="note"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Why is this worth adding?"
                    maxLength={2000}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Content warnings (optional)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {warnings.map((w) => (
                      <Badge
                        key={w}
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() => setWarnings((xs) => xs.filter((x) => x !== w))}
                      >
                        {w} <X className="ml-1 h-3 w-3" />
                      </Badge>
                    ))}
                  </div>
                  <Input
                    value={warningInput}
                    onChange={(e) => setWarningInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addChip(warningInput, warnings, setWarnings, setWarningInput);
                      }
                    }}
                    placeholder="Type and press Enter (e.g., violence, nsfw)"
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between rounded-md border p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="anon">Submit anonymously this time</Label>
                    <p className="text-xs text-muted-foreground">
                      Overrides your default audit identity for this submission only.
                    </p>
                  </div>
                  <Switch id="anon" checked={anonymous} onCheckedChange={setAnonymous} />
                </div>

                {overQuota ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                    You have {quota?.remaining} submit{quota?.remaining === 1 ? "" : "s"} left
                    this week but pasted {cleanedUrls.length} URLs. Remove some or wait for
                    the quota to reset.
                  </div>
                ) : null}
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Submission results</p>
                <ul className="space-y-2">
                  {results.map((r, i) => (
                    <li key={i} className="rounded-md border p-3 text-sm">
                      <div className="flex items-start gap-2">
                        {r.status === "pending" ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 text-foreground" />
                        ) : r.status === "duplicate" ? (
                          <Copy className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        ) : (
                          <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{r.title ?? r.url}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.status === "pending"
                              ? "Queued for review"
                              : r.status === "duplicate"
                                ? `Already in library — submission count now ${r.submissionCount ?? "?"}. Your suggested categories/tags were attached for moderator review.`
                                : (r.reason ?? "Invalid")}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <Button variant="outline" onClick={reset}>
                  Submit more
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        {!results ? (
          <div className="flex items-center justify-end gap-2 border-t bg-card px-6 py-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={
                mutation.isPending ||
                overQuota ||
                (!!quota && !quota.unlimited && quota.remaining === 0)
              }
            >
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function UrlRow({
  row,
  onChange,
  onRemove,
}: {
  row: UrlRowState;
  onChange: (patch: Partial<UrlRowState>) => void;
  onRemove: () => void;
}) {
  const previewFn = useServerFn(previewSubmission);
  const trimmed = row.url.trim();
  // Debounce: wait until user stops typing for 600ms before hitting preview.
  const [debounced, setDebounced] = React.useState(trimmed);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(trimmed), 600);
    return () => clearTimeout(t);
  }, [trimmed]);

  const enabled = debounced.length > 10;
  const { data: preview, isFetching } = useQuery<PreviewResult>({
    queryKey: ["submit-preview", debounced],
    queryFn: () => previewFn({ data: { url: debounced } }),
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: false,
  });

  // Auto-preselect suggestions the first time a preview lands for this URL.
  const lastAppliedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (preview?.status === "ok" && lastAppliedRef.current !== preview.youtubeId) {
      lastAppliedRef.current = preview.youtubeId ?? null;
      onChange({
        selectedCategoryIds: preview.suggestedCategories.map((c) => c.id),
        selectedTagIds: preview.suggestedTags.map((t) => t.id),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview?.youtubeId, preview?.status]);

  const toggle = (kind: "cat" | "tag", id: string) => {
    if (kind === "cat") {
      const has = row.selectedCategoryIds.includes(id);
      onChange({
        selectedCategoryIds: has
          ? row.selectedCategoryIds.filter((x) => x !== id)
          : [...row.selectedCategoryIds, id].slice(0, 5),
      });
    } else {
      const has = row.selectedTagIds.includes(id);
      onChange({
        selectedTagIds: has
          ? row.selectedTagIds.filter((x) => x !== id)
          : [...row.selectedTagIds, id].slice(0, 3),
      });
    }
  };

  return (
    <div className="space-y-2 rounded-md border bg-card/40 p-3">
      <div className="flex items-center gap-2">
        <Input
          value={row.url}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder="https://youtube.com/watch?v=…"
          className="font-mono text-sm"
        />
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Remove URL">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {enabled ? (
        isFetching && !preview ? (
          <p className="text-xs text-muted-foreground">
            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
            Fetching metadata…
          </p>
        ) : preview?.status === "invalid" ? (
          <p className="text-xs text-destructive">Could not parse a YouTube ID from URL.</p>
        ) : preview?.status === "not_found" ? (
          <p className="text-xs text-destructive">Video not found on YouTube.</p>
        ) : preview?.status === "ok" ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-start gap-3">
              {preview.thumbnailUrl ? (
                <img
                  src={preview.thumbnailUrl}
                  alt=""
                  className="h-12 w-20 flex-shrink-0 rounded object-cover"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-xs font-medium">{preview.title}</p>
                {preview.existingVideoId ? (
                  <p className="text-[11px] text-muted-foreground">
                    Already in library — your taxonomy will be attached as a suggestion.
                  </p>
                ) : null}
              </div>
            </div>

            <SuggestionPicker
              icon={<Sparkles className="h-3 w-3" />}
              label="Suggested categories"
              max={5}
              items={preview.suggestedCategories}
              selected={row.selectedCategoryIds}
              onToggle={(id) => toggle("cat", id)}
            />
            <SuggestionPicker
              label="Suggested primary tags"
              max={3}
              items={preview.suggestedTags}
              selected={row.selectedTagIds}
              onToggle={(id) => toggle("tag", id)}
            />
          </div>
        ) : null
      ) : null}
    </div>
  );
}

function SuggestionPicker({
  icon,
  label,
  items,
  selected,
  onToggle,
  max,
}: {
  icon?: React.ReactNode;
  label: string;
  items: SuggestionChip[];
  selected: string[];
  onToggle: (id: string) => void;
  max: number;
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label} <span className="normal-case opacity-70">({selected.length}/{max})</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => {
          const on = selected.includes(it.id);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onToggle(it.id)}
              className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
                on
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              }`}
            >
              {it.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
