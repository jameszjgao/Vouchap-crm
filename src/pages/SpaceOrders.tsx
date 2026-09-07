import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { OpsUser } from '../lib/ops-auth';
import { useProduct } from '../lib/product-context';
import { createOrder, getEntitlements, listOrders, listSkus, listTenants, updateOrder, type HubOrder, type HubTenant } from '../lib/hub-api';
import { productName, tenantKindLabel, type ProductId } from '../lib/products';
import { format } from 'date-fns';
import { Eye, Pencil, Plus } from 'lucide-react';
import {
  type SkuEditionRow,
  skuMatchesSpaceKind,
  skuIsSpaceSubscription,
  skuIsCreditPack,
  skuIsRecognitionCreditPack,
  skuIsEngagementCreditPack,
  skuIsOrderCreditPack,
  skuIsWorkmapAiCreditPack,
  skuIsOrderTarget,
} from './space-orders-sku-helpers';

type SkuOption = SkuEditionRow;

interface SpaceOrdersProps {
  opsUser: OpsUser | null;
  view: 'all' | 'my';
}

const SOURCE_LABELS: Record<string, string> = {
  registration: '注册',
  purchase: '购买',
  ops_grant: '运营开通',
};

function summarizeMetadata(meta: unknown): string {
  if (meta == null || typeof meta === 'object' && Object.keys(meta as object).length === 0) return '–';
  try {
    const s = JSON.stringify(meta);
    return s.length > 72 ? `${s.slice(0, 72)}…` : s;
  } catch {
    return '…';
  }
}

function creditMetadataKey(sku: SkuEditionRow): string | null {
  if (skuIsRecognitionCreditPack(sku)) return 'recognition_credits_added';
  if (skuIsEngagementCreditPack(sku)) return 'engagement_credits_added';
  if (skuIsOrderCreditPack(sku)) return 'order_credits_added';
  if (skuIsWorkmapAiCreditPack(sku)) return 'workmap_ai_credits_added';
  return null;
}

export default function SpaceOrders({ opsUser, view }: SpaceOrdersProps) {
  const { productId } = useProduct();
  const [list, setList] = useState<HubOrder[]>([]);
  const [spaces, setSpaces] = useState<HubTenant[]>([]);
  const [myTenantIds, setMyTenantIds] = useState<Set<string>>(new Set());
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newSpaceId, setNewSpaceId] = useState('');
  const [newSkuId, setNewSkuId] = useState('');
  const [newExpiresAt, setNewExpiresAt] = useState('');
  const [newCreditPackQty, setNewCreditPackQty] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [entitlementsModal, setEntitlementsModal] = useState<{
    spaceId: string;
    title: string;
    loading: boolean;
    text: string;
    error: string | null;
  } | null>(null);

  const [editRow, setEditRow] = useState<HubOrder | null>(null);
  const [editStatus, setEditStatus] = useState('active');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editMetadataText, setEditMetadataText] = useState('{}');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const isAll = view === 'all';
  const spaceNameById = useMemo(() => {
    const m: Record<string, string> = {};
    spaces.forEach((s) => { m[s.id] = s.name || `${s.id.slice(0, 8)}…`; });
    return m;
  }, [spaces]);
  const spacesForNewOrder = useMemo(
    () => (isAll ? spaces : spaces.filter((s) => myTenantIds.has(s.id))),
    [isAll, spaces, myTenantIds],
  );

  const selectedSpace = useMemo(
    () => spacesForNewOrder.find((s) => s.id === newSpaceId) ?? null,
    [spacesForNewOrder, newSpaceId],
  );

  const skusForCustomer = useMemo(() => {
    if (!selectedSpace) return [];
    return skus.filter((s) => skuMatchesSpaceKind(s, selectedSpace.kind));
  }, [skus, selectedSpace]);

  const selectedSku = useMemo(() => skus.find((s) => s.id === newSkuId) ?? null, [skus, newSkuId]);
  const showSubscriptionFields = Boolean(selectedSku && skuIsSpaceSubscription(selectedSku));
  const showCreditPackFields = Boolean(selectedSku && skuIsCreditPack(selectedSku));

  useEffect(() => {
    load();
  }, [opsUser?.id, view, productId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [orders, tenants, skuRows, assignmentsRes] = await Promise.all([
        listOrders(productId),
        listTenants(productId),
        listSkus(productId),
        !isAll && opsUser?.id
          ? supabase.schema('crm').from('ops_assignments').select('tenant_id').eq('product_id', productId).eq('ops_user_id', opsUser.id)
          : Promise.resolve({ data: [] as { tenant_id: string }[], error: null }),
      ]);
      const ids = new Set(((assignmentsRes.data ?? []) as { tenant_id: string }[]).map((a) => a.tenant_id));
      setMyTenantIds(ids);
      setSpaces(tenants);
      setSkus(skuRows.filter(skuIsOrderTarget));
      setList(isAll ? orders : orders.filter((o) => ids.has(o.tenantId || o.space_id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function openEntitlements(spaceId: string, title: string) {
    setEntitlementsModal({ spaceId, title, loading: true, text: '', error: null });
    try {
      const data = await getEntitlements(productId, spaceId);
      setEntitlementsModal({ spaceId, title, loading: false, text: JSON.stringify(data, null, 2), error: null });
    } catch (e) {
      setEntitlementsModal((m) => (m ? { ...m, loading: false, error: e instanceof Error ? e.message : '加载失败' } : null));
    }
  }

  function openEdit(row: HubOrder) {
    setEditRow(row);
    setEditStatus(row.status);
    setEditExpiresAt(row.expires_at ? format(new Date(row.expires_at), 'yyyy-MM-dd') : '');
    setEditMetadataText(JSON.stringify(row.metadata ?? {}, null, 2));
    setEditError(null);
  }

  async function handleEditSave() {
    if (!editRow) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      let meta: Record<string, unknown>;
      try {
        const parsed = JSON.parse(editMetadataText.trim() || '{}');
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          setEditError('metadata 须为 JSON 对象');
          return;
        }
        meta = parsed as Record<string, unknown>;
      } catch {
        setEditError('metadata JSON 无效');
        return;
      }
      await updateOrder({
        productId,
        orderId: editRow.id,
        status: editStatus,
        expiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : null,
        metadata: meta,
      });
      setEditRow(null);
      load();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleCreateOrder() {
    if (!newSpaceId || !newSkuId || !opsUser?.id) return;
    const sku = skus.find((s) => s.id === newSkuId);
    if (!sku) {
      setCreateError('请选择 SKU');
      return;
    }
    setSubmitting(true);
    setCreateError(null);
    try {
      if (skuIsSpaceSubscription(sku) && !newExpiresAt?.trim()) {
        setCreateError('订阅类订单请填写到期日');
        return;
      }
      const metadata: Record<string, number> = {};
      if (skuIsCreditPack(sku)) {
        const n = parseInt(newCreditPackQty.trim(), 10);
        if (!Number.isFinite(n) || n < 1) {
          setCreateError('增购 credit 权益请填写数量（正整数）');
          return;
        }
        const key = creditMetadataKey(sku);
        if (key) metadata[key] = n;
      }
      await createOrder({
        productId,
        tenantId: newSpaceId,
        skuId: newSkuId,
        expiresAt: skuIsSpaceSubscription(sku) && newExpiresAt?.trim() ? new Date(newExpiresAt).toISOString() : null,
        metadata,
      });
      setShowNew(false);
      setNewSpaceId('');
      setNewSkuId('');
      setNewExpiresAt('');
      setNewCreditPackQty('');
      load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 1rem', fontSize: '1.35rem' }}>
        {isAll ? '全部订单' : '我的客户订单'} · {productName(productId)}
      </h1>
      <div className="page-card">
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#64748b' }}>
          订单写入当前产品库；开通后产品端 `get_*_entitlements` 立即生效。
        </p>
        <div style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setCreateError(null);
              setNewSpaceId('');
              setNewSkuId('');
              setNewExpiresAt('');
              setNewCreditPackQty('');
              setShowNew(true);
            }}
          >
            <Plus size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            新建订单
          </button>
        </div>
        {error && (
          <div className="page-card" style={{ marginBottom: '1rem', background: '#fef2f2', color: '#b91c1c' }}>
            <strong>加载失败：</strong> {error}
          </div>
        )}
        <div className="table-wrap">
          {loading ? <p>加载中…</p> : (
            <table>
              <thead>
                <tr>
                  <th>客户</th>
                  <th>权益包</th>
                  <th>状态</th>
                  <th>开始时间</th>
                  <th>到期时间</th>
                  <th>metadata</th>
                  <th>来源</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && !loading ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: '#64748b', padding: '1.5rem' }}>暂无订单数据</td></tr>
                ) : list.map((row) => {
                  const tid = row.tenantId || row.space_id;
                  return (
                    <tr key={row.id}>
                      <td>{spaceNameById[tid] ?? `${tid.slice(0, 8)}…`}</td>
                      <td>{row.sku_edition ? `${row.sku_edition.name} (${row.sku_edition.code})` : row.sku_id}</td>
                      <td>{row.status}</td>
                      <td>{format(new Date(row.started_at), 'yyyy-MM-dd')}</td>
                      <td>{row.expires_at ? format(new Date(row.expires_at), 'yyyy-MM-dd') : '永久'}</td>
                      <td style={{ maxWidth: 220, fontSize: '0.8rem', color: '#475569', wordBreak: 'break-all' }}>{summarizeMetadata(row.metadata)}</td>
                      <td>{SOURCE_LABELS[row.source] ?? row.source}</td>
                      <td>{format(new Date(row.created_at), 'yyyy-MM-dd HH:mm')}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => openEntitlements(tid, spaceNameById[tid] ?? tid)}>
                            <Eye size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />权益
                          </button>
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => openEdit(row)}>
                            <Pencil size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />编辑
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={() => !submitting && setShowNew(false)}>
          <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem' }}>新建客户订单 · {productName(productId)}</h3>
            {createError && (
              <div style={{ marginBottom: '0.75rem', padding: '0.5rem', background: '#fef2f2', color: '#b91c1c', borderRadius: 6, fontSize: '0.875rem' }}>{createError}</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>客户</span>
                <select
                  value={newSpaceId}
                  onChange={(e) => { setNewSpaceId(e.target.value); setNewSkuId(''); }}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }}
                >
                  <option value="">请选择客户</option>
                  {spacesForNewOrder.map((s) => (
                    <option key={s.id} value={s.id}>
                      {(s.name || s.id.slice(0, 8)) + ' · ' + tenantKindLabel(productId as ProductId, s.kind)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>
                  权益包{selectedSpace ? `（${tenantKindLabel(productId, selectedSpace.kind)}）` : ''}
                </span>
                <select
                  value={newSkuId}
                  onChange={(e) => { setNewSkuId(e.target.value); setNewExpiresAt(''); setNewCreditPackQty(''); }}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }}
                >
                  <option value="">请选择 SKU</option>
                  {skusForCustomer.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </label>
              {showSubscriptionFields && (
                <label style={{ display: 'block' }}>
                  <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>到期日（订阅订单必填）</span>
                  <input type="date" value={newExpiresAt} onChange={(e) => setNewExpiresAt(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }} />
                </label>
              )}
              {showCreditPackFields && (
                <label style={{ display: 'block' }}>
                  <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>增购数量</span>
                  <input type="number" min={1} step={1} value={newCreditPackQty} onChange={(e) => setNewCreditPackQty(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }} />
                </label>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)} disabled={submitting}>取消</button>
              <button type="button" className="btn btn-primary" onClick={handleCreateOrder} disabled={submitting || !newSpaceId || !newSkuId}>
                {submitting ? '提交中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {entitlementsModal && (
        <div className="modal-overlay" onClick={() => setEntitlementsModal(null)}>
          <div className="modal-card" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 0.5rem' }}>权益快照</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#64748b' }}>{entitlementsModal.title}</p>
            {entitlementsModal.loading && <p>加载中…</p>}
            {entitlementsModal.error && <div style={{ padding: '0.5rem', background: '#fef2f2', color: '#b91c1c', borderRadius: 6 }}>{entitlementsModal.error}</div>}
            {!entitlementsModal.loading && !entitlementsModal.error && (
              <pre style={{ margin: 0, maxHeight: '60vh', overflow: 'auto', fontSize: '0.8rem', background: '#f8fafc', padding: '0.75rem', borderRadius: 6, whiteSpace: 'pre-wrap' }}>
                {entitlementsModal.text}
              </pre>
            )}
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEntitlementsModal(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {editRow && (
        <div className="modal-overlay" onClick={() => !editSubmitting && setEditRow(null)}>
          <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 0.5rem' }}>编辑订单</h3>
            {editError && <div style={{ marginBottom: '0.75rem', padding: '0.5rem', background: '#fef2f2', color: '#b91c1c', borderRadius: 6, fontSize: '0.875rem' }}>{editError}</div>}
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>状态</span>
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }}>
                <option value="pending">pending</option>
                <option value="active">active</option>
                <option value="expired">expired</option>
                <option value="cancelled">cancelled</option>
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>到期日（空 = 永久）</span>
              <input type="date" value={editExpiresAt} onChange={(e) => setEditExpiresAt(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }} />
            </label>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>metadata（JSON 对象）</span>
              <textarea value={editMetadataText} onChange={(e) => setEditMetadataText(e.target.value)} rows={10} style={{ width: '100%', padding: '0.5rem', borderRadius: 6, fontFamily: 'monospace', fontSize: '0.8rem' }} />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditRow(null)} disabled={editSubmitting}>取消</button>
              <button type="button" className="btn btn-primary" onClick={handleEditSave} disabled={editSubmitting}>
                {editSubmitting ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
