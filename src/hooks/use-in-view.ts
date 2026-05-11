import * as React from "react";

/**
 * Calls `onInView` whenever the returned ref's element scrolls into view.
 * Used as an Intersection-Observer sentinel for infinite pagination.
 */
export function useInView(
  onInView: () => void,
  options: { rootMargin?: string; enabled?: boolean } = {},
) {
  const { rootMargin = "200px", enabled = true } = options;
  const ref = React.useRef<HTMLDivElement | null>(null);
  const cb = React.useRef(onInView);
  cb.current = onInView;

  React.useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) cb.current();
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, rootMargin]);

  return ref;
}
