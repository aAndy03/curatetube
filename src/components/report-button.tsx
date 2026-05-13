import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flag } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { hasReportedVideo, submitReport } from "@/lib/reports.functions";
import { cn } from "@/lib/utils";

const MAX = 1500;

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
  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const trigger = (
    <Button
      size="icon"
      variant={reported ? "default" : "ghost"}
      className={cn(size === "sm" ? "h-7 w-7" : "h-9 w-9", "shrink-0", className)}
      disabled={reported}
      onClick={stop}
      aria-label={reported ? "Already reported" : "Report"}
    >
      <Flag className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </Button>
  );

  if (reported) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent>Already reported</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Report this video</TooltipContent>
      </Tooltip>
      <PopoverContent
        className="w-80 space-y-2"
        onClick={stop}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="space-y-1">
          <p className="text-sm font-medium">Report this video</p>
          <p className="text-xs text-muted-foreground">
            Tell moderators what's wrong. Be specific.
          </p>
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX))}
          placeholder="Reason (5–1500 characters)…"
          rows={4}
          autoFocus
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {text.trim().length} / {MAX}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => mutation.mutate()}
              disabled={text.trim().length < 5 || mutation.isPending}
            >
              {mutation.isPending ? "Sending…" : "Submit"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
