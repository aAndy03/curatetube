import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

const KEY = "ct.consent.v1";

export function CookieConsent() {
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(KEY)) setShow(true);
  }, []);

  if (!show) return null;

  const decide = (value: "accept" | "reject") => {
    window.localStorage.setItem(KEY, value);
    setShow(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
        <p className="text-muted-foreground">
          We use only the cookies required to keep you signed in. No tracking, no
          ads. See our{" "}
          <Link to="/privacy" className="underline underline-offset-2">
            privacy policy
          </Link>
          .
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => decide("reject")}>
            Reject optional
          </Button>
          <Button size="sm" onClick={() => decide("accept")}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
