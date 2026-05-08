import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getRecommendationSettings,
  setRecommendationWeights,
} from "@/lib/admin.functions";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { usePermissions } from "@/lib/use-permissions";

export const Route = createFileRoute("/_authenticated/admin/recommendations")({
  head: () => ({ meta: [{ title: "Recommendation weights — CurateTube" }] }),
  component: RecsPage,
});

const LABELS: Record<string, string> = {
  recency: "Recency",
  approval_freshness: "Approval freshness",
  editorial_boost: "Editorial boost",
  suggest_count: "Suggest count",
  leaderboard_presence: "Leaderboard presence",
  in_app_trending: "In-app trending",
  diversity_penalty: "Diversity penalty",
  user_affinity: "User affinity",
};

function RecsPage() {
  const { data: perms } = usePermissions();
  const fetchFn = useServerFn(getRecommendationSettings);
  const saveFn = useServerFn(setRecommendationWeights);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["recommendation-weights"],
    queryFn: () => fetchFn(),
  });
  const [local, setLocal] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    if (q.data?.weights) setLocal(q.data.weights);
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { weights: local } }),
    onSuccess: () => {
      toast.success("Weights saved");
      qc.invalidateQueries({ queryKey: ["recommendation-weights"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canEdit = perms?.has("settings.edit");

  if (q.isLoading) return <Skeleton className="h-72 w-full" />;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold">Recommendation weights</h1>
        <p className="text-sm text-muted-foreground">
          Tune the personalised feed scorer. Changes take effect on next refresh.
        </p>
      </header>

      <div className="space-y-5 rounded-md border bg-card p-5">
        {Object.keys(LABELS).map((k) => {
          const v = local[k] ?? 1;
          return (
            <div key={k} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span>{LABELS[k]}</span>
                <span className="font-mono text-muted-foreground">
                  {v.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[v]}
                min={0}
                max={3}
                step={0.05}
                disabled={!canEdit}
                onValueChange={(val) =>
                  setLocal((p) => ({ ...p, [k]: val[0] }))
                }
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button
          disabled={!canEdit || save.isPending}
          onClick={() => save.mutate()}
        >
          Save weights
        </Button>
      </div>
    </div>
  );
}
