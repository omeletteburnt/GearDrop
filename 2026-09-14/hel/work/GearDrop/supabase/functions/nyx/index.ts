// Supabase Edge Function: Nyx, GearDrop's AI assistant.
// Talks to any OpenAI-compatible API; defaults to Groq (free tier).
//
// Secrets (Dashboard > Edge Functions > Secrets):
//   AI_API_KEY    API key for an OpenAI-compatible provider (Groq: gsk_...)
//   AI_BASE_URL   optional, defaults to https://api.groq.com/openai/v1
//   AI_MODEL      optional, defaults to openai/gpt-oss-120b
//   AI_FALLBACK_MODEL  optional, used when the main model is rate-limited;
//                 defaults to openai/gpt-oss-20b ("none" to disable)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided
// automatically. Keep "Verify JWT" ON: only signed-in users can ask.
import { createClient } from "npm:@supabase/supabase-js@2";
import { cleanCitations, DAILY_LIMIT, getListing, MAX_TEXT, sanitizeCatalog, sanitizeHistory, searchListings, systemPrompt, TOOLS, type Mode, type SearchArgs } from "./logic.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

function runTool(catalog: ReturnType<typeof sanitizeCatalog>, call: ToolCall): unknown {
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(call.function.arguments || "{}"); } catch { return { error: "Invalid arguments" }; }
  if (call.function.name === "search_listings") return searchListings(catalog, args as SearchArgs);
  if (call.function.name === "get_listing") return getListing(catalog, Number(args.id));
  return { error: "Unknown tool" };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Who is asking (the JWT is also checked by the platform).
  const asUser = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: "Sign in to ask Nyx." }, 401);

  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, MAX_TEXT) : "";
  if (!question) return json({ error: "Type a question for Nyx." }, 400);
  const mode: Mode = body?.mode === "listing" || body?.mode === "compare" ? body.mode : "general";
  const catalog = sanitizeCatalog(body?.catalog);
  const focus = (Array.isArray(body?.focusIds) ? body.focusIds : []).slice(0, 2).map((id: unknown) => catalog.find(x => x.id === Number(id))).filter(Boolean);
  const history = sanitizeHistory(body?.history);

  // Daily limit, counted server-side. The usage row is written before calling
  // the AI so parallel requests can't slip past the limit.
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin.from("nyx_usage").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("asked_at", since);
  if (countError || count === null) {
    console.error("Usage check failed", countError);
    return json({ error: "Nyx is being set up. Please try again later." }, 503);
  }
  if (count >= DAILY_LIMIT) return json({ error: `You've used all ${DAILY_LIMIT} Nyx questions for today. Try again tomorrow!`, remaining: 0 }, 429);
  // Fail closed: never answer a question that wasn't counted.
  const { error: usageError } = await admin.from("nyx_usage").insert({ user_id: user.id, mode });
  if (usageError) {
    console.error("Usage insert failed", usageError);
    return json({ error: "Nyx is being set up. Please try again later." }, 503);
  }
  const remaining = Math.max(0, DAILY_LIMIT - count - 1);

  const messages: Message[] = [
    { role: "system", content: systemPrompt(mode, focus) },
    ...history.map((t): Message => t.role === "user" ? { role: "user", content: t.text } : { role: "assistant", content: t.text }),
    { role: "user", content: question },
  ];
  const baseUrl = (env("AI_BASE_URL") || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
  const fallback = env("AI_FALLBACK_MODEL") || "openai/gpt-oss-20b";
  // If the main model is rate-limited (free tiers have small per-minute
  // caps), the rest of the question is answered by the fallback model.
  const models = [env("AI_MODEL") || "openai/gpt-oss-120b", ...(fallback === "none" ? [] : [fallback])].filter((m, i, all) => all.indexOf(m) === i);
  let modelIndex = 0;
  const model = () => models[modelIndex];

  if (!env("AI_API_KEY")) {
    console.error("AI_API_KEY secret is not set");
    return json({ error: "Nyx is being set up. Please try again later.", remaining }, 503);
  }

  try {
    // Tool loop: the model may search listings a few times before answering.
    for (let step = 0; step < 5; step++) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env("AI_API_KEY")}` },
        body: JSON.stringify({ model: model(), messages, tools: TOOLS, temperature: 0.4, max_tokens: 1000 }),
        signal: AbortSignal.timeout(25_000), // never let a slow provider hang the request
      });
      if (res.status === 429 && modelIndex < models.length - 1) {
        console.warn("Rate-limited on", model(), "- falling back to", models[modelIndex + 1]);
        modelIndex++; step--;
        continue;
      }
      if (!res.ok) {
        console.error("AI provider error", res.status, (await res.text()).slice(0, 500), "url:", baseUrl, "model:", model());
        return json({ error: res.status === 429 ? "Nyx is very busy right now. Please try again in a minute." : "Nyx couldn't answer right now. Please try again.", remaining }, 502);
      }
      const data = await res.json();
      const msg = data?.choices?.[0]?.message;
      const calls: ToolCall[] = Array.isArray(msg?.tool_calls) ? msg.tool_calls : [];
      if (!calls.length) {
        const answer = typeof msg?.content === "string" ? msg.content.trim() : "";
        if (!answer) return json({ error: "Nyx couldn't answer that. Try rephrasing your question.", remaining }, 502);
        return json({ answer: cleanCitations(answer, catalog), remaining });
      }
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
      for (const call of calls) messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(runTool(catalog, call)) });
    }
    return json({ error: "Nyx got stuck on that one. Try a simpler question.", remaining }, 502);
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    console.error(timedOut ? "AI provider timed out after 25s" : "Nyx failed", e, "url:", baseUrl, "model:", model());
    return json({ error: timedOut ? "Nyx took too long to answer. Please try again." : "Nyx couldn't answer right now. Please try again.", remaining }, 502);
  }
});
