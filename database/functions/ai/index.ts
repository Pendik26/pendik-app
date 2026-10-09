// POST /functions/v1/ai/explain and /functions/v1/ai/chat: "Explain this" and Alfond, for
// signed-in students on the roster. Secrets: AI_BASE_URL, AI_API_KEY, AI_MODEL (comma-separated
// fallbacks), AI_DAILY_LIMIT (default 30), APP_ORIGINS.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { aiConfigFromEnv, answerAi } from "../_shared/ai.ts";
import { allowedOrigins, corsHeaders, jsonError, withHeaders } from "../_shared/http.ts";

const config = aiConfigFromEnv(Deno.env.toObject());
const origins = allowedOrigins(Deno.env.get("APP_ORIGINS"));
// Supabase sets these for every function.
const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request) => {
  const cors = corsHeaders(request.headers.get("origin"), origins);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return jsonError(405, "Use POST.", cors);

  const kind = new URL(request.url).pathname.split("/").pop();
  if (kind !== "explain" && kind !== "chat") return jsonError(404, "Not found.", cors);
  if (!config) return jsonError(503, "AI isn't switched on for this site.", cors);

  // The gateway has already checked the token's signature (verify_jwt); this says whose it is.
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return jsonError(401, "Sign in to use the AI.", cors);
  const userId = data.user.id;
  const { data: profile } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!profile) return jsonError(403, "This account isn't on the class roster.", cors);

  const response = await answerAi(kind, await request.text(), config, {
    take: async (limit) => {
      const { data: left, error: takeError } = await admin.rpc("ai_take", { p_user_id: userId, p_daily_limit: limit });
      if (takeError) throw takeError;
      return left as number;
    },
    refund: async () => {
      await admin.rpc("ai_refund", { p_user_id: userId });
    },
  });
  return withHeaders(response, cors);
});
