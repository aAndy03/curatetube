import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAuditLog, revealAuditActor } from "@/lib/admin.functions";
import { usePermissions } from "@/lib/use-permissions";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight, Eye } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({ meta: [{ title: "Audit log — CurateTube" }] }),
  component: AuditPage,
});

function AuditPage() {
  const { data: perms } = usePermissions();
  const fetchAudit = useServerFn(listAuditLog);
  const reveal = useServerFn(revealAuditActor);
  const [visibility, setVisibility] = React.useState<string>("");

  const q = useQuery({
    queryKey: ["audit", visibility],
    queryFn: () =>
      fetchAudit({
        data: visibility
          ? { visibility: visibility as "internal" | "staff" | "public" }
          : {},
      }),
    enabled: !!perms?.has("audit.view"),
  });

  if (!perms) return <Skeleton className="h-32 w-full" />;
  if (!perms.has("audit.view")) {
    return (
      <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
        You need the <code>audit.view</code> permission.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Append-only history of moderation, role, and account actions.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {(["", "internal", "staff", "public"] as const).map((v) => (
          <Button
            key={v}
            variant={visibility === v ? "default" : "outline"}
            size="sm"
            onClick={() => setVisibility(v)}
          >
            {v || "All"}
          </Button>
        ))}
      </div>

      <div className="space-y-1">
        {q.isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))
          : (q.data?.entries ?? []).map((e) => (
              <Collapsible
                key={e.id}
                className="rounded-md border bg-card text-sm"
              >
                <CollapsibleTrigger className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/40">
                  <ChevronRight className="h-3.5 w-3.5 transition-transform data-[state=open]:rotate-90" />
                  <span className="w-44 shrink-0 font-mono text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    {e.visibility}
                  </Badge>
                  <span className="shrink-0 font-medium">{e.action}</span>
                  <span className="truncate text-muted-foreground">
                    {e.actor_display_snapshot}
                    {e.target_type ? ` → ${e.target_type}` : ""}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t p-3">
                  <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Actor ID</dt>
                    <dd className="font-mono">{e.actor_id ?? "—"}</dd>
                    <dt className="text-muted-foreground">Target</dt>
                    <dd className="font-mono">
                      {e.target_type}/{e.target_id ?? "—"}
                    </dd>
                    {e.before ? (
                      <>
                        <dt className="text-muted-foreground">Before</dt>
                        <dd>
                          <pre className="overflow-x-auto rounded bg-muted p-2">
                            {JSON.stringify(e.before, null, 2)}
                          </pre>
                        </dd>
                      </>
                    ) : null}
                    {e.after ? (
                      <>
                        <dt className="text-muted-foreground">After</dt>
                        <dd>
                          <pre className="overflow-x-auto rounded bg-muted p-2">
                            {JSON.stringify(e.after, null, 2)}
                          </pre>
                        </dd>
                      </>
                    ) : null}
                  </dl>
                  {perms.has("audit.view_identity") && e.actor_id ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={async () => {
                        try {
                          const r = await reveal({
                            data: { actorId: e.actor_id! },
                          });
                          toast.success(
                            `Identity: ${r.profile?.display_name ?? r.profile?.username ?? "Unknown"}`,
                          );
                        } catch (err) {
                          toast.error((err as Error).message);
                        }
                      }}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" /> Reveal identity
                    </Button>
                  ) : null}
                </CollapsibleContent>
              </Collapsible>
            ))}
        {q.data && q.data.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries.</p>
        ) : null}
      </div>
    </div>
  );
}
