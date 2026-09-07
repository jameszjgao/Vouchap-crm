import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const hubUrl = Deno.env.get("SUPABASE_URL");
    const hubService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!hubUrl || !hubService) return json(503, { error: "Hub misconfigured" });
    const hub = createClient(hubUrl, hubService, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: userErr } = await hub.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (userErr || !user?.id) return json(401, { error: "Unauthorized" });

    const { data: ops } = await hub.schema("crm").from("ops_users").select("id, role").eq("user_id", user.id).maybeSingle();
    if (!ops) return json(403, { error: "Not an ops user" });
    if (ops.role !== "admin") return json(403, { error: "Admin only" });

    const body = await req.json().catch(() => ({})) as { action?: string; user_id?: string; password?: string };
    if (body.action !== "set_password") return json(400, { error: "Unknown action" });
    const targetId = String(body.user_id ?? "");
    const password = String(body.password ?? "");
    if (!targetId || password.length < 8) return json(400, { error: "user_id and password (min 8) required" });

    const { data: target } = await hub.schema("crm").from("ops_users").select("user_id").eq("user_id", targetId).maybeSingle();
    if (!target) return json(404, { error: "Target is not an ops user" });

    const { error } = await hub.auth.admin.updateUserById(targetId, { password });
    if (error) throw error;
    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "ops-auth failed" });
  }
});
