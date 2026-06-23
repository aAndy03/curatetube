import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

/**
 * Wraps any action trigger and, for unauthenticated users, intercepts the
 * click to surface an inline "Sign in to {action}" Popover with two CTAs.
 * Preserves the browsing context — never redirects, never opens a modal.
 *
 * Usage:
 *   <SignInGate action="like this video">
 *     <Button onClick={doLike}>Like</Button>
 *   </SignInGate>
 *
 * When the user IS signed in, the child renders as-is and clicks pass through.
 */
export function SignInGate({
  action,
  signedIn,
  children,
}: {
  action: string;
  signedIn: boolean;
  children: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
}) {
  const [open, setOpen] = React.useState(false);

  if (signedIn) return children;

  // Wrap child so the click is captured before its own handler fires.
  const trigger = React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    },
  });

  const redirect =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="center">
        <p className="text-sm font-medium">Sign in to {action}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Your activity stays with your account across devices.
        </p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="default" asChild className="flex-1">
            <Link to="/login" search={{ redirect }}>
              Sign in
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild className="flex-1">
            <Link to="/login" search={{ mode: "signup", redirect }}>
              Sign up
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
