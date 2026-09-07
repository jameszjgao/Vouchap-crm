export const CRM_PRODUCTS = [
  { id: 'vouchap', name: 'Vouchap' },
  { id: 'portalflow', name: 'Portalflow' },
  { id: 'wholestore', name: 'Wholestore' },
  { id: 'aimlink', name: 'aim.link' },
] as const;

export type ProductId = (typeof CRM_PRODUCTS)[number]['id'];

export const DEFAULT_PRODUCT_ID: ProductId = 'vouchap';

export type TenantKind = 'firm' | 'client' | 'provider' | 'consumer' | 'workspace';

export function isProductId(value: string): value is ProductId {
  return CRM_PRODUCTS.some((p) => p.id === value);
}

export function productName(id: ProductId): string {
  return CRM_PRODUCTS.find((p) => p.id === id)?.name ?? id;
}

export function tenantKindLabel(productId: ProductId, kind: string): string {
  if (productId === 'aimlink' || kind === 'workspace') return 'Workspace';
  const normalized = normalizeTenantKind(kind);
  if (productId === 'wholestore') return normalized === 'provider' ? 'Vendor' : 'Dealer';
  if (productId === 'portalflow' || productId === 'vouchap') {
    return normalized === 'provider' ? 'Firm' : 'Client';
  }
  return kind;
}

/** Map frozen Vouchap firm/client onto kernel provider/consumer for SKU matching. */
export function normalizeTenantKind(kind: string): 'provider' | 'consumer' | 'workspace' {
  if (kind === 'firm' || kind === 'provider') return 'provider';
  if (kind === 'workspace') return 'workspace';
  return 'consumer';
}
