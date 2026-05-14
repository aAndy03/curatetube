import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flag } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { hasReportedVideo, submitReport } from "@/lib/reports.functions";
import { cn } from "@/lib/utils";

const MAX = 1500;
const MIN = 5;

export function ReportButton({
  videoId,
  size = "sm",
  className,
}: {
  videoId: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const qc = useQueryClient();
  const checkFn = useServerFn(hasReportedVideo);
  const submitFn = useServerFn(submitReport);

  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const q = useQuery({
    queryKey: ["report-status", videoId],
    queryFn: () => checkFn({ data: { videoId } }),
    staleTime: 30 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: () => submitFn({ data: { videoId, reasonText: text.trim() } }),
    onSuccess: () => {
      toast.success("Report submitted. Thanks for flagging.");
      setOpen(false);
      setText("");
      qc.invalidateQueries({ queryKey: ["report-status", videoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reported = q.data?.reported;

  // Critical: preventDefault stops parent <Link> navigation, stopPropagation
  // stops the click bubbling. This stays controlled instead of using
  // PopoverTrigger so defaultPrevented clicks inside VideoCard links still open.
  const handleTriggerClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!reported) setOpen((o) => !o);
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const trigger = (
    <Button
      ref={triggerRef}
      type="button"
      size="icon"
      variant={reported ? "default" : open ? "default" : "ghost"}
      className={cn(size === "sm" ? "h-7 w-7" : "h-9 w-9", "shrink-0", className)}
      disabled={reported}
      onClick={handleTriggerClick}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={reported ? "Already reported" : "Report this video"}
      aria-pressed={open}
    >
      <Flag className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </Button>
  );

  if (reported) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{trigger}</span>
        </TooltipTrigger>
        <TooltipContent>Already reported</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>{trigger}</PopoverAnchor>
      <PopoverContent
        className="w-80 space-y-2"
        onClick={stop}
        onPointerDown={stop}
        onMouseDown={stop}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          window.requestAnimationFrame(() => textareaRef.current?.focus());
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (triggerRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
      >
        <div className="space-y-1">
          <p className="text-sm font-medium">Report this video</p>
          <p className="text-xs text-muted-foreground">
            Tell moderators what's wrong. Be specific.
          </p>
        </div>
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX))}
          placeholder={`Reason (${MIN}–${MAX} characters)…`}
          rows={4}
          autoFocus
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {text.trim().length} / {MAX}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={(e) => {
                stop(e);
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={(e) => {
                stop(e);
                mutation.mutate();
              }}
              disabled={text.trim().length < MIN || mutation.isPending}
            >
              {mutation.isPending ? "Sending…" : "Submit"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
