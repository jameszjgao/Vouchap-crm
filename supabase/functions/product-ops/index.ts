import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
};

type ProductId = "vouchap" | "portalflow" | "wholestore" | "aimlink";

type ProductConfig = {
  id: ProductId;
  urlEnv: string;
  keyEnv: string;
  defaultUrl: string;
  tenantModel: "space" | "workspace";
  ordersTable: "space_orders" | "workspace_orders";
  tenantCol: "space_id" | "workspace_id";
  entitlementsRpc: string;
  entitlementsArg: string;
};

const PRODUCTS: Record<ProductId, ProductConfig> = {
  vouchap: {
    id: "vouchap",
    urlEnv: "VOUCHAP_SUPABASE_URL",
    keyEnv: "VOUCHAP_SERVICE_ROLE_KEY",
    defaultUrl: "https://giuacjbfsyrristkigmz.supabase.co",
    tenantModel: "space",
    ordersTable: "space_orders",
    tenantCol: "space_id",
    entitlementsRpc: "get_space_entitlements",
    entitlementsArg: "p_space_id",
  },
  portalflow: {
    id: "portalflow",
    urlEnv: "PORTALFLOW_SUPABASE_URL",
    keyEnv: "PORTALFLOW_SERVICE_ROLE_KEY",
    defaultUrl: "https://xvqlqvtfogxkfeillvig.supabase.co",
    tenantModel: "space",
    ordersTable: "space_orders",
    tenantCol: "space_id",
    entitlementsRpc: "get_space_entitlements",
    entitlementsArg: "p_space_id",
  },
  wholestore: {
    id: "wholestore",
    urlEnv: "WHOLESTORE_SUPABASE_URL",
    keyEnv: "WHOLESTORE_SERVICE_ROLE_KEY",
    defaultUrl: "https://foyecolycmxcneflpant.supabase.co",
    tenantModel: "space",
    ordersTable: "space_orders",
    tenantCol: "space_id",
    entitlementsRpc: "get_space_entitlements",
    entitlementsArg: "p_space_id",
  },
  aimlink: {
    id: "aimlink",
    urlEnv: "AIMLINK_SUPABASE_URL",
    keyEnv: "AIMLINK_SERVICE_ROLE_KEY",
    defaultUrl: "https://ychcuxqggqceaodhoutv.supabase.co",
    tenantModel: "workspace",
    ordersTable: "workspace_orders",
    tenantCol: "workspace_id",
    entitlementsRpc: "get_workspace_entitlements",
    entitlementsArg: "p_workspace_id",
  },
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function productClient(hub: SupabaseClient, cfg: ProductConfig): Promise<SupabaseClient> {
  const envUrl = (Deno.env.get(cfg.urlEnv) || "").trim();
  const envKey = (Deno.env.get(cfg.keyEnv) || "").trim();
  if (envKey) {
    return createClient(envUrl || cfg.defaultUrl, envKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  const { data, error } = await hub.schema("crm").from("product_adapters").select(
    "supabase_url, service_role_key",
  ).eq("product_id", cfg.id).maybeSingle();
  if (error) throw new Error(`Adapter lookup failed for ${cfg.id}: ${error.message}`);
  const key = String(data?.service_role_key ?? "").trim();
  if (!key) throw new Error(`Missing secret ${cfg.keyEnv}`);
  const url = String(data?.supabase_url ?? "").trim() || cfg.defaultUrl;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function parseProduct(raw: unknown): ProductConfig {
  const id = String(raw ?? "") as ProductId;
  const cfg = PRODUCTS[id];
  if (!cfg) throw new Error("Unknown product_id");
  return cfg;
}

async function requireOps(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  const hubUrl = Deno.env.get("SUPABASE_URL");
  const hubService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!hubUrl || !hubService) throw Object.assign(new Error("Hub misconfigured"), { status: 503 });
  const hub = createClient(hubUrl, hubService, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await hub.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  if (error || !user?.id) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  const { data: ops } = await hub.schema("crm").from("ops_users").select(
    "id, user_id, email, name, role, created_at, updated_at",
  ).eq("user_id", user.id).maybeSingle();
  if (!ops) throw Object.assign(new Error("Not an ops user"), { status: 403 });
  return { hub, ops: ops as { id: string; user_id: string; email: string; name: string | null; role: string } };
}

async function listSpaceTenants(db: SupabaseClient) {
  const { data: spaces, error } = await db.from("spaces").select("id, name, kind, created_at").order(
    "created_at",
    { ascending: false },
  ).limit(800);
  if (error) throw error;
  const ids = (spaces ?? []).map((s) => s.id);
  const memberCount: Record<string, number> = {};
  const adminBySpace: Record<string, string> = {};
  if (ids.length) {
    const { data: us } = await db.from("user_spaces").select("space_id, user_id, is_admin").in("space_id", ids);
    for (const row of us ?? []) {
      memberCount[row.space_id] = (memberCount[row.space_id] ?? 0) + 1;
      if (row.is_admin && !adminBySpace[row.space_id]) adminBySpace[row.space_id] = row.user_id;
    }
  }
  const adminIds = [...new Set(Object.values(adminBySpace))];
  const creators: Record<string, { email: string | null; name: string | null }> = {};
  if (adminIds.length) {
    const { data: users } = await db.from("users").select("id, email, name").in("id", adminIds);
    for (const u of users ?? []) creators[u.id] = { email: u.email ?? null, name: u.name ?? null };
  }
  return (spaces ?? []).map((s) => {
    const adminId = adminBySpace[s.id];
    const creator = adminId ? creators[adminId] : null;
    return {
      id: s.id,
      name: s.name ?? null,
      kind: s.kind ?? "consumer",
      createdAt: s.created_at,
      memberCount: memberCount[s.id] ?? 0,
      creatorEmail: creator?.email ?? null,
      creatorName: creator?.name ?? null,
    };
  });
}

async function listWorkspaceTenants(db: SupabaseClient) {
  const { data: workspaces, error } = await db.from("workspaces").select(
    "id, name, created_at, created_by_user_id",
  ).order("created_at", { ascending: false }).limit(800);
  if (error) throw error;
  const ids = (workspaces ?? []).map((w) => w.id);
  const memberCount: Record<string, number> = {};
  if (ids.length) {
    const { data: ms } = await db.from("workspace_memberships").select("workspace_id").in("workspace_id", ids);
    for (const row of ms ?? []) {
      memberCount[row.workspace_id] = (memberCount[row.workspace_id] ?? 0) + 1;
    }
  }
  const creatorIds = [...new Set((workspaces ?? []).map((w) => w.created_by_user_id).filter(Boolean))];
  const creators: Record<string, { email: string | null; name: string | null }> = {};
  if (creatorIds.length) {
    const { data: profiles } = await db.from("user_profiles").select("id, email, full_name").in("id", creatorIds);
    for (const p of profiles ?? []) {
      creators[p.id] = { email: p.email ?? null, name: p.full_name ?? null };
    }
  }
  return (workspaces ?? []).map((w) => {
    const creator = creators[w.created_by_user_id] ?? null;
    return {
      id: w.id,
      name: w.name ?? null,
      kind: "workspace",
      createdAt: w.created_at,
      memberCount: memberCount[w.id] ?? 0,
      creatorEmail: creator?.email ?? null,
      creatorName: creator?.name ?? null,
    };
  });
}

async function listOrders(db: SupabaseClient, cfg: ProductConfig) {
  const tenantCol = cfg.tenantCol;
  const { data, error } = await db.schema("crm").from(cfg.ordersTable).select(
    `id, ${tenantCol}, sku_id, status, started_at, expires_at, source, created_at, created_by_ops_user_id, metadata, sku_edition(code, name)`,
  ).order("created_at", { ascending: false }).limit(400);
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    tenantId: row[tenantCol],
    space_id: row[tenantCol],
    sku_id: row.sku_id,
    status: row.status,
    started_at: row.started_at,
    expires_at: row.expires_at,
    source: row.source,
    created_at: row.created_at,
    created_by_ops_user_id: row.created_by_ops_user_id ?? null,
    metadata: row.metadata ?? {},
    sku_edition: row.sku_edition ?? null,
  }));
}

async function writeAudit(
  hub: SupabaseClient,
  opsUserId: string,
  action: string,
  resourceType: string,
  resourceId: string | null,
  details: Record<string, unknown>,
) {
  await hub.schema("crm").from("ops_audit_log").insert({
    ops_user_id: opsUserId,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    details,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const { hub, ops } = await requireOps(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const cfg = parseProduct(body.product_id);
    const db = await productClient(hub, cfg);

    if (action === "list_tenants") {
      const tenants = cfg.tenantModel === "workspace"
        ? await listWorkspaceTenants(db)
        : await listSpaceTenants(db);
      return json(200, { ok: true, tenants });
    }

    if (action === "list_skus") {
      const { data, error } = await db.schema("crm").from("sku_edition").select(
        "id, code, name, description, feature_modules, data_limits, period_type, quota_period, price_monthly, price_yearly, currency, is_trial, sort_order, created_at, updated_at",
      ).order("sort_order");
      if (error) throw error;
      return json(200, { ok: true, skus: data ?? [] });
    }

    if (action === "list_addons") {
      const { data, error } = await db.schema("crm").from("sku_addon").select(
        "id, code, name, description, units, price, currency, is_active, sort_order, created_at, updated_at",
      ).order("sort_order");
      if (error) throw error;
      return json(200, { ok: true, addons: data ?? [] });
    }

    if (action === "list_orders") {
      const orders = await listOrders(db, cfg);
      return json(200, { ok: true, orders });
    }

    if (action === "get_counts") {
      const tenants = cfg.tenantModel === "workspace"
        ? await listWorkspaceTenants(db)
        : await listSpaceTenants(db);
      const { count: orderCount } = await db.schema("crm").from(cfg.ordersTable).select("id", {
        count: "exact",
        head: true,
      });
      const { count: skuCount } = await db.schema("crm").from("sku_edition").select("id", {
        count: "exact",
        head: true,
      });
      return json(200, {
        ok: true,
        counts: {
          tenants: tenants.length,
          orders: orderCount ?? 0,
          skus: skuCount ?? 0,
        },
      });
    }

    if (action === "get_entitlements") {
      const tenantId = String(body.tenant_id ?? "");
      if (!tenantId) return json(400, { error: "tenant_id required" });
      const { data, error } = await db.schema("crm").rpc(cfg.entitlementsRpc, {
        [cfg.entitlementsArg]: tenantId,
      });
      if (error) throw error;
      return json(200, { ok: true, entitlements: data });
    }

    if (action === "get_tenant_stats") {
      const tenantId = String(body.tenant_id ?? "");
      if (!tenantId) return json(400, { error: "tenant_id required" });
      if (cfg.id !== "vouchap") return json(200, { ok: true, stats: null });
      const { data, error } = await db.rpc("get_space_data_stats", { p_space_id: tenantId });
      if (error) return json(200, { ok: true, stats: null, warning: error.message });
      return json(200, { ok: true, stats: data });
    }

    if (action === "create_order") {
      const tenantId = String(body.tenant_id ?? "");
      const skuId = String(body.sku_id ?? "");
      if (!tenantId || !skuId) return json(400, { error: "tenant_id and sku_id required" });
      const metadata = (body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata))
        ? { ...(body.metadata as Record<string, unknown>), hub_ops_user_id: ops.id }
        : { hub_ops_user_id: ops.id };
      const row: Record<string, unknown> = {
        [cfg.tenantCol]: tenantId,
        sku_id: skuId,
        status: "active",
        started_at: new Date().toISOString(),
        expires_at: body.expires_at ?? null,
        source: "ops_grant",
        metadata,
      };
      const { data, error } = await db.schema("crm").from(cfg.ordersTable).insert(row).select("id").maybeSingle();
      if (error) throw error;
      await writeAudit(hub, ops.id, "create_order", "space_order", data?.id ?? null, {
        product_id: cfg.id,
        tenant_id: tenantId,
        sku_id: skuId,
      });
      return json(200, { ok: true, id: data?.id ?? null });
    }

    if (action === "update_order") {
      const orderId = String(body.order_id ?? "");
      if (!orderId) return json(400, { error: "order_id required" });
      const patch: Record<string, unknown> = {};
      if (typeof body.status === "string") patch.status = body.status;
      if ("expires_at" in body) patch.expires_at = body.expires_at;
      if (body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)) {
        patch.metadata = { ...(body.metadata as Record<string, unknown>), hub_ops_user_id: ops.id };
      }
      const { error } = await db.schema("crm").from(cfg.ordersTable).update(patch).eq("id", orderId);
      if (error) throw error;
      await writeAudit(hub, ops.id, "update_order", "space_order", orderId, {
        product_id: cfg.id,
        patch,
      });
      return json(200, { ok: true });
    }

    return json(400, { error: `Unknown action: ${action}` });
  } catch (e) {
    const status = typeof (e as { status?: number }).status === "number" ? (e as { status: number }).status : 500;
    const message = e instanceof Error ? e.message : "product-ops failed";
    return json(status, { error: message });
  }
});
