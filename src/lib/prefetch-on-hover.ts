// Phase 6 Step 1 — Hover-prefetch helper.
// Returns the handler pair to attach to any link/card so the router preloads
// the target route's loader/data after a 50ms hover (cancelled if the user
// leaves before the threshold). Used by VideoCard, creator badges, admin
// row links.
import * as React from "react";
import { useRouter, type RegisteredRouter } from "@tanstack/react-router";

type AnyTo = Parameters<RegisteredRouter["preloadRoute"]>[0]["to"];

export function usePrefetchOnHover<T extends AnyTo>(
  to: T,
  params?: Record<string, unknown>,
  delayMs = 50,
) {
  const router = useRouter();
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = React.useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const onMouseEnter = React.useCallback(() => {
    cancel();
    timer.current = setTimeout(() => {
      router
        .preloadRoute({ to, params } as Parameters<typeof router.preloadRoute>[0])
        .catch(() => {
          /* preload failures are non-fatal */
        });
    }, delayMs);
  }, [router, to, params, delayMs, cancel]);

  const onFocus = onMouseEnter;
  const onMouseLeave = cancel;
  const onBlur = cancel;

  React.useEffect(() => cancel, [cancel]);

  return { onMouseEnter, onMouseLeave, onFocus, onBlur };
}
