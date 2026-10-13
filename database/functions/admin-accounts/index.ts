// POST /functions/v1/admin-accounts, for admins: create accounts for roster students, lock or
// unlock an account, or reset its password to the first password. These need the service role,
// so they can't be database functions the browser calls; each one is written to the audit log.
// Secret: APP_ORIGINS.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { firstPassword, parseAccountAction, studentEmail } from "../_shared/accounts.ts";
import { allowedOrigins, corsHeaders, jsonError } from "../_shared/http.ts";

const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
const origins = allowedOrigins(Deno.env.get("APP_ORIGINS"));

interface RosterRow {
  student_id: string;
}

/** Writes what an admin did to an account to the audit log (Admin → Audit log). */
async function audit(actor: string, action: string, studentId: string): Promise<void> {
  await db.rpc("audit_account_action", { p_actor: actor, p_action: action, p_target: studentId });
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request.headers.get("origin"), origins);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return jsonError(405, "Use POST.", cors);

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: caller } = await db.auth.getUser(token);
  if (!caller.user) return jsonError(401, "Sign in first.", cors);
  const { data: me } = await db.from("accounts").select("role").eq("id", caller.user.id).maybeSingle();
  if ((me as { role?: string } | null)?.role !== "admin") return jsonError(403, "Admins only.", cors);

  const action = parseAccountAction(await request.json().catch(() => null));
  if (!action) return jsonError(400, "Unknown request.", cors);

  if (action.action === "activate") {
    const { data: roster, error } = await db.from("students").select("student_id").in("student_id", action.student_ids);
    if (error) return jsonError(500, error.message, cors);
    const results: { student_id: string; ok: boolean; message?: string }[] = [];
    for (const r of roster as RosterRow[]) {
      const { data: existing } = await db.from("accounts").select("id").eq("student_id", r.student_id).maybeSingle();
      if (existing) {
        results.push({ student_id: r.student_id, ok: true, message: "already active" });
        continue;
      }
      const created = await db.auth.admin.createUser({
        email: studentEmail(r.student_id),
        password: firstPassword(r.student_id),
        email_confirm: true,
        user_metadata: { student_id: r.student_id },
      });
      if (created.error || !created.data.user) {
        results.push({ student_id: r.student_id, ok: false, message: created.error?.message ?? "not created" });
        continue;
      }
      // Name, class and cohort stay on the roster; the account is the sign-in and the role.
      const { error: accountError } = await db.from("accounts").insert({ id: created.data.user.id, student_id: r.student_id });
      if (accountError) {
        // No half-made accounts: an auth user without an account row couldn't use the app.
        await db.auth.admin.deleteUser(created.data.user.id);
        results.push({ student_id: r.student_id, ok: false, message: accountError.message });
      } else {
        await audit(caller.user.id, "activate", r.student_id);
        results.push({ student_id: r.student_id, ok: true });
      }
    }
    for (const id of action.student_ids) {
      if (!results.some((r) => r.student_id === id)) results.push({ student_id: id, ok: false, message: "not on the roster" });
    }
    return Response.json({ results }, { headers: cors });
  }

  if (action.user_id === caller.user.id && action.action !== "unlock") {
    return jsonError(400, "Not on your own account.", cors);
  }
  const { data: account } = await db.from("accounts").select("student_id").eq("id", action.user_id).maybeSingle();
  if (!account) return jsonError(404, "No such account.", cors);
  const studentId = (account as { student_id: string }).student_id;

  if (action.action === "reset") {
    const { error } = await db.auth.admin.updateUserById(action.user_id, { password: firstPassword(studentId) });
    if (error) return jsonError(500, error.message, cors);
    await db.from("accounts").update({ must_change_password: true }).eq("id", action.user_id);
    await audit(caller.user.id, "reset", studentId);
    // Signed-in devices keep working until their session ends; the student picks a new password next time.
    return Response.json({ ok: true }, { headers: cors });
  }
  const { error } = await db.auth.admin.updateUserById(action.user_id, {
    ban_duration: action.action === "lock" ? "876000h" : "none",
  });
  if (error) return jsonError(500, error.message, cors);
  await audit(caller.user.id, action.action, studentId);
  return Response.json({ ok: true }, { headers: cors });
});
