import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  serverFns: {
    // Attach the Supabase access token to every client-side server-fn call so
    // `requireSupabaseAuth` middleware can authenticate the request.
    fetch: async (input, init) => {
      if (typeof window === "undefined") {
        return fetch(input as RequestInfo, init);
      }
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const headers = new Headers(init?.headers ?? {});
      if (token && !headers.has("authorization")) {
        headers.set("authorization", `Bearer ${token}`);
      }
      return fetch(input as RequestInfo, { ...init, headers });
    },
  },
}));
