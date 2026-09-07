import { supabase } from './supabase';
import type { ProductId } from './products';

export type HubTenant = {
  id: string;
  name: string | null;
  kind: string;
  createdAt: string;
  memberCount: number;
  creatorEmail: string | null;
  creatorName: string | null;
};

export type HubOrder = {
  id: string;
  tenantId: string;
  space_id: string;
  sku_id: string;
  status: string;
  started_at: string;
  expires_at: string | null;
  source: string;
  created_at: string;
  created_by_ops_user_id: string | null;
  metadata: Record<string, unknown> | null;
  sku_edition?: { code: string; name: string } | null;
};

export type HubSku = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  feature_modules: Record<string, boolean> | null;
  data_limits: Record<string, unknown> | null;
  period_type: string;
  quota_period: string;
  price_monthly: number | null;
  price_yearly: number | null;
  currency: string;
  is_trial: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type HubAddon = {
  id: string;
  code: string;
  name: string | null;
  description: string | null;
  units: number;
  price: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

async function invokeProductOps<T>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('product-ops', { body: payload });
  if (error) {
    const msg = error.message || 'product-ops failed';
    throw new Error(msg);
  }
  const body = (data ?? {}) as { ok?: boolean; error?: string } & T;
  if (body && typeof body === 'object' && body.error && body.ok !== true) {
    throw new Error(body.error);
  }
  return body;
}

export async function listTenants(productId: ProductId): Promise<HubTenant[]> {
  const res = await invokeProductOps<{ tenants: HubTenant[] }>({ action: 'list_tenants', product_id: productId });
  return res.tenants ?? [];
}

export async function listSkus(productId: ProductId): Promise<HubSku[]> {
  const res = await invokeProductOps<{ skus: HubSku[] }>({ action: 'list_skus', product_id: productId });
  return res.skus ?? [];
}

export async function listAddons(productId: ProductId): Promise<HubAddon[]> {
  const res = await invokeProductOps<{ addons: HubAddon[] }>({ action: 'list_addons', product_id: productId });
  return res.addons ?? [];
}

export async function listOrders(productId: ProductId): Promise<HubOrder[]> {
  const res = await invokeProductOps<{ orders: HubOrder[] }>({ action: 'list_orders', product_id: productId });
  return res.orders ?? [];
}

export async function getCounts(productId: ProductId): Promise<{ tenants: number; orders: number; skus: number }> {
  const res = await invokeProductOps<{ counts: { tenants: number; orders: number; skus: number } }>({
    action: 'get_counts',
    product_id: productId,
  });
  return res.counts ?? { tenants: 0, orders: 0, skus: 0 };
}

export async function getEntitlements(productId: ProductId, tenantId: string): Promise<unknown> {
  const res = await invokeProductOps<{ entitlements: unknown }>({
    action: 'get_entitlements',
    product_id: productId,
    tenant_id: tenantId,
  });
  return res.entitlements;
}

export async function getTenantStats(productId: ProductId, tenantId: string): Promise<unknown> {
  const res = await invokeProductOps<{ stats: unknown }>({
    action: 'get_tenant_stats',
    product_id: productId,
    tenant_id: tenantId,
  });
  return res.stats ?? null;
}

export async function createOrder(input: {
  productId: ProductId;
  tenantId: string;
  skuId: string;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  const res = await invokeProductOps<{ id: string | null }>({
    action: 'create_order',
    product_id: input.productId,
    tenant_id: input.tenantId,
    sku_id: input.skuId,
    expires_at: input.expiresAt ?? null,
    metadata: input.metadata ?? {},
  });
  return res.id ?? null;
}

export async function updateOrder(input: {
  productId: ProductId;
  orderId: string;
  status?: string;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await invokeProductOps({
    action: 'update_order',
    product_id: input.productId,
    order_id: input.orderId,
    status: input.status,
    expires_at: input.expiresAt,
    metadata: input.metadata,
  });
}
