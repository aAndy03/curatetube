// Server-only: Lovable AI Gateway client with strict JSON output + slug validation.
import type { TaxonomySnapshot } from "./taxonomy-snapshot.server";
import type { AiJobType, VideoContext } from "./prompt.server";
import { buildSystemPrompt, buildUserMessage } from "./prompt.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type GatewayResult = {
  ok: true;
  results: Array<{ slug: string; confidence: number; rank?: number }>;
  unknown_slugs: string[];
  prompt_tokens: number;
  completion_tokens: number;
  model: string;
} | {
  ok: false;
  error: "malformed_output" | "taxonomy_mismatch" | "context_exceeded" | "rate_limited" | "credits_exhausted" | "gateway_error";
  status?: number;
  message: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  model: string;
};

type GatewayMessage = { role: "system" | "user" | "assistant"; content: string };

export async function callGateway(args: {
  jobType: AiJobType;
  model: string;
  snapshot: TaxonomySnapshot;
  videoContext: VideoContext;
  priorMessages?: GatewayMessage[];
  maxCategories: number;
  minSecondary: number;
}): Promise<GatewayResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "gateway_error", message: "LOVABLE_API_KEY missing", model: args.model };
  }

  const system = buildSystemPrompt(args.jobType, args.snapshot, {
    maxCategories: args.maxCategories,
    minSecondary: args.minSecondary,
  });
  const user = buildUserMessage(args.videoContext);

  const messages: GatewayMessage[] = [
    { role: "system", content: system },
    ...(args.priorMessages ?? []),
    { role: "user", content: user },
  ];

  let res: Response;
  try {
    res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        messages,
        response_format: { type: "json_object" },
      }),
    });
  } catch (e) {
    return { ok: false, error: "gateway_error", message: String(e), model: args.model };
  }

  if (res.status === 429) {
    return { ok: false, error: "rate_limited", status: 429, message: "Gateway rate limit", model: args.model };
  }
  if (res.status === 402) {
    return { ok: false, error: "credits_exhausted", status: 402, message: "Lovable AI credits exhausted", model: args.model };
  }
  if (res.status === 400) {
    const text = await res.text().catch(() => "");
    if (/context|token|length/i.test(text)) {
      return { ok: false, error: "context_exceeded", status: 400, message: text.slice(0, 500), model: args.model };
    }
    return { ok: false, error: "gateway_error", status: 400, message: text.slice(0, 500), model: args.model };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: "gateway_error", status: res.status, message: text.slice(0, 500), model: args.model };
  }

  type ChatCompletion = {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const json = (await res.json().catch(() => null)) as ChatCompletion | null;
  const content = json?.choices?.[0]?.message?.content;
  const prompt_tokens = json?.usage?.prompt_tokens ?? 0;
  const completion_tokens = json?.usage?.completion_tokens ?? 0;

  if (!content) {
    return { ok: false, error: "malformed_output", message: "no content", prompt_tokens, completion_tokens, model: args.model };
  }

  let parsed: { video_id?: string; results?: Array<{ slug?: string; confidence?: number; rank?: number }> };
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, error: "malformed_output", message: "invalid JSON", prompt_tokens, completion_tokens, model: args.model };
  }

  if (parsed.video_id && parsed.video_id !== args.videoContext.video_id) {
    return { ok: false, error: "malformed_output", message: "video_id mismatch", prompt_tokens, completion_tokens, model: args.model };
  }
  if (!Array.isArray(parsed.results)) {
    return { ok: false, error: "malformed_output", message: "results not array", prompt_tokens, completion_tokens, model: args.model };
  }

  // Pick the right slug set for validation
  const validSet =
    args.jobType === "categorise" ? args.snapshot.category_slugs : args.snapshot.tag_slugs;

  const accepted: Array<{ slug: string; confidence: number; rank?: number }> = [];
  const unknown: string[] = [];
  for (const r of parsed.results) {
    if (!r?.slug || typeof r.slug !== "string") continue;
    const confidence = typeof r.confidence === "number" ? Math.max(0, Math.min(1, r.confidence)) : 0;
    if (!validSet.has(r.slug)) {
      unknown.push(r.slug);
      continue;
    }
    accepted.push({
      slug: r.slug,
      confidence,
      rank: typeof r.rank === "number" ? r.rank : undefined,
    });
  }

  const total = accepted.length + unknown.length;
  if (total > 0 && unknown.length / total > 0.5) {
    return {
      ok: false,
      error: "taxonomy_mismatch",
      message: `>50% unknown slugs (${unknown.length}/${total})`,
      prompt_tokens,
      completion_tokens,
      model: args.model,
    };
  }

  return {
    ok: true,
    results: accepted,
    unknown_slugs: unknown,
    prompt_tokens,
    completion_tokens,
    model: args.model,
  };
}
