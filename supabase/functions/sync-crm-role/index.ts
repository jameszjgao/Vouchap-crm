// 将 crm.ops_users 的 role 同步到 Auth 的 app_metadata.crm_role，供 RLS 用 JWT 判断
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "缺少 Authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user: caller } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!caller) {
      return new Response(
        JSON.stringify({ error: "无效的登录态" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = body.user_id as string | undefined;
    const getMe = body.get_me === true;

    if (getMe) {
      const { data: row } = await supabase
        .schema("crm")
        .from("ops_users")
        .select("id, user_id, email, name, role, created_at, updated_at")
        .eq("user_id", caller.id)
        .maybeSingle();
      return new Response(
        JSON.stringify(row ? { user: row } : { user: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: callerOps } = await supabase
      .schema("crm")
      .from("ops_users")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();
    const isAdmin = callerOps?.role === "admin";

    if (targetUserId) {
      if (targetUserId !== caller.id && !isAdmin) {
        return new Response(
          JSON.stringify({ error: "仅可同步自己的 crm_role，或需 admin 权限同步他人" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: row } = await supabase
        .schema("crm")
        .from("ops_users")
        .select("role")
        .eq("user_id", targetUserId)
        .maybeSingle();
      if (!row) {
        return new Response(
          JSON.stringify({ error: "该用户不在运营名单中" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { error } = await supabase.auth.admin.updateUserById(targetUserId, {
        app_metadata: { crm_role: row.role },
      });
      if (error) throw error;
      return new Response(
        JSON.stringify({ ok: true, user_id: targetUserId, crm_role: row.role }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "仅 admin 可执行全量同步" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: rows } = await supabase
      .schema("crm")
      .from("ops_users")
      .select("user_id, role");
    if (!rows?.length) {
      return new Response(
        JSON.stringify({ ok: true, synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    for (const r of rows) {
      await supabase.auth.admin.updateUserById(r.user_id, {
        app_metadata: { crm_role: r.role },
      });
    }
    return new Response(
      JSON.stringify({ ok: true, synced: rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "同步失败" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
