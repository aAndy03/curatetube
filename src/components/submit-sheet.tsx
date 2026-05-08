import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, X, CheckCircle2, AlertCircle, Copy } from "lucide-react";
import { toast } from "sonner";

import { submitVideos, type SubmitResultItem } from "@/lib/library.functions";
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

export function SubmitSheet({ open, onOpenChange }: SubmitSheetProps) {
  const submitFn = useServerFn(submitVideos);
  const [urls, setUrls] = React.useState<string[]>([""]);
  const [note, setNote] = React.useState("");
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [warningInput, setWarningInput] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");
  const [anonymous, setAnonymous] = React.useState(false);
  const [results, setResults] = React.useState<SubmitResultItem[] | null>(null);

  const reset = () => {
    setUrls([""]);
    setNote("");
    setWarnings([]);
    setTags([]);
    setAnonymous(false);
    setResults(null);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const cleaned = urls.map((u) => u.trim()).filter(Boolean);
      if (cleaned.length === 0) throw new Error("Add at least one URL.");
      return submitFn({
        data: {
          urls: cleaned,
          note: note.trim() || undefined,
          contentWarnings: warnings,
          suggestedTags: tags,
          anonymous,
        },
      });
    },
    onSuccess: (r) => {
      setResults(r.results);
      const ok = r.results.filter((x) => x.status === "pending").length;
      const dup = r.results.filter((x) => x.status === "duplicate").length;
      const bad = r.results.filter((x) => x.status === "invalid").length;
      toast.success(
        `${ok} queued · ${dup} already in library · ${bad} invalid`,
      );
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Submission failed");
    },
  });

  const addUrl = () => setUrls((u) => [...u, ""]);
  const removeUrl = (idx: number) =>
    setUrls((u) => (u.length === 1 ? [""] : u.filter((_, i) => i !== idx)));
  const setUrlAt = (idx: number, v: string) =>
    setUrls((u) => u.map((x, i) => (i === idx ? v : x)));

  const addChip = (
    raw: string,
    list: string[],
    setList: (v: string[]) => void,
    setInput: (v: string) => void,
  ) => {
    const v = raw.trim().replace(/^#/, "");
    if (!v) return;
    if (list.includes(v)) return;
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
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-6 px-6 py-5">
            {!results ? (
              <>
                <div className="space-y-2">
                  <Label>YouTube URLs</Label>
                  <div className="space-y-2">
                    {urls.map((u, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          value={u}
                          onChange={(e) => setUrlAt(i, e.target.value)}
                          placeholder="https://youtube.com/watch?v=…"
                          className="font-mono text-sm"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeUrl(i)}
                          aria-label="Remove URL"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
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

                <div className="space-y-2">
                  <Label>Suggested tags (optional)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <Badge
                        key={t}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => setTags((xs) => xs.filter((x) => x !== t))}
                      >
                        #{t} <X className="ml-1 h-3 w-3" />
                      </Badge>
                    ))}
                  </div>
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addChip(tagInput, tags, setTags, setTagInput);
                      }
                    }}
                    placeholder="Type and press Enter"
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
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Submission results</p>
                <ul className="space-y-2">
                  {results.map((r, i) => (
                    <li
                      key={i}
                      className="rounded-md border p-3 text-sm"
                    >
                      <div className="flex items-start gap-2">
                        {r.status === "pending" ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 text-foreground" />
                        ) : r.status === "duplicate" ? (
                          <Copy className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        ) : (
                          <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {r.title ?? r.url}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {r.status === "pending"
                              ? "Queued for review"
                              : r.status === "duplicate"
                                ? `Already in library — submission count now ${r.submissionCount ?? "?"}`
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
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
