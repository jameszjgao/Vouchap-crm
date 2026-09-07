/** CRM 新建订单：SKU data_limits 解析与空间类型过滤 */

import { normalizeTenantKind } from '../lib/products';

export const CRM_PRODUCT_VOUCHAP_ID = 'vouchap';

export { CRM_PRODUCTS } from '../lib/products';

const CATALOG_ONLY_SKU_CODES = new Set(['CLIENT_RECOGNITION_BASE', 'FIRM_CLIENT_SIGNING_BONUS']);

export interface SkuEditionRow {
  id: string;
  code: string;
  name: string;
  data_limits: Record<string, unknown> | null;
}

export function parseSkuDataLimits(dl: unknown): { billingKind: string; spaceTarget: string } {
  const o = dl && typeof dl === 'object' && !Array.isArray(dl) ? (dl as Record<string, unknown>) : {};
  const billingKind = typeof o.billing_kind === 'string' ? o.billing_kind : '';
  const st = o.space_target;
  const spaceTarget = typeof st === 'string' && st.length > 0 ? st : 'any';
  return { billingKind, spaceTarget };
}

function inferSpaceTargetFromCode(code: string): 'provider' | 'consumer' | 'workspace' | 'any' {
  if (['FIRM_ANNUAL', 'FIRM_TRIAL_30', 'ENGAGEMENT_CREDIT_PACK', 'PROVIDER_ANNUAL', 'PROVIDER_TRIAL_30'].includes(code)) {
    return 'provider';
  }
  if (['CLIENT_TRIAL_30', 'CLIENT_PAID_MONTHLY', 'RECOGNITION_CREDIT_PACK', 'CONSUMER_TRIAL_30', 'CONSUMER_PAID_MONTHLY'].includes(code)) {
    return 'consumer';
  }
  if (code.startsWith('WORKSPACE_') || code === 'WORKMAP_AI_CREDIT_PACK') return 'workspace';
  return 'any';
}

export function skuIsOrderTarget(sku: Pick<SkuEditionRow, 'code'>): boolean {
  return !CATALOG_ONLY_SKU_CODES.has(sku.code);
}

export function skuMatchesSpaceKind(sku: SkuEditionRow, spaceKind: string): boolean {
  if (!skuIsOrderTarget(sku)) return false;
  const tenantKind = normalizeTenantKind(spaceKind);
  let { spaceTarget } = parseSkuDataLimits(sku.data_limits);
  if (spaceTarget === 'any') {
    const inferred = inferSpaceTargetFromCode(sku.code);
    if (inferred !== 'any') spaceTarget = inferred;
  }
  if (spaceTarget === 'any') return true;
  if (spaceTarget === 'firm') spaceTarget = 'provider';
  if (spaceTarget === 'client') spaceTarget = 'consumer';
  return spaceTarget === tenantKind;
}

export function skuIsSpaceSubscription(sku: SkuEditionRow): boolean {
  const { billingKind } = parseSkuDataLimits(sku.data_limits);
  if (billingKind === 'space_subscription') return true;
  if (!billingKind) {
    return [
      'FIRM_ANNUAL',
      'FIRM_TRIAL_30',
      'CLIENT_TRIAL_30',
      'CLIENT_PAID_MONTHLY',
      'PROVIDER_ANNUAL',
      'PROVIDER_TRIAL_30',
      'CONSUMER_TRIAL_30',
      'CONSUMER_PAID_MONTHLY',
      'WORKSPACE_TRIAL_30',
      'WORKSPACE_TEAM_MONTHLY',
      'WORKSPACE_TEAM_YEARLY',
    ].includes(sku.code);
  }
  return false;
}

export function skuIsCreditPack(sku: SkuEditionRow): boolean {
  const { billingKind } = parseSkuDataLimits(sku.data_limits);
  return (
    billingKind === 'recognition_credit_pack'
    || billingKind === 'engagement_credit_pack'
    || billingKind === 'order_credit_pack'
    || billingKind === 'workmap_ai_credit_pack'
  );
}

export function skuIsRecognitionCreditPack(sku: SkuEditionRow): boolean {
  const { billingKind } = parseSkuDataLimits(sku.data_limits);
  return billingKind === 'recognition_credit_pack' || sku.code === 'RECOGNITION_CREDIT_PACK';
}

export function skuIsEngagementCreditPack(sku: SkuEditionRow): boolean {
  const { billingKind } = parseSkuDataLimits(sku.data_limits);
  return billingKind === 'engagement_credit_pack' || sku.code === 'ENGAGEMENT_CREDIT_PACK';
}

export function skuIsOrderCreditPack(sku: SkuEditionRow): boolean {
  const { billingKind } = parseSkuDataLimits(sku.data_limits);
  return billingKind === 'order_credit_pack' || sku.code === 'ORDER_CREDIT_PACK';
}

export function skuIsWorkmapAiCreditPack(sku: SkuEditionRow): boolean {
  const { billingKind } = parseSkuDataLimits(sku.data_limits);
  return billingKind === 'workmap_ai_credit_pack' || sku.code === 'WORKMAP_AI_CREDIT_PACK';
}
