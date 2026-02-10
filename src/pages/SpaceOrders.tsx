import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { OpsUser } from '../lib/ops-auth';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';

interface OrderRow {
  id: string;
  space_id: string;
  sku_id: string;
  status: string;
  started_at: string;
  expires_at: string | null;
  source: string;
  created_at: string;
  created_by_ops_user_id: string | null;
  sku_edition?: { code: string; name: string };
  ops_users?: { name: string | null; email: string } | null;
}

interface SpaceOption {
  id: string;
  name: string | null;
}

interface SkuOption {
  id: string;
  code: string;
  name: string;
}

interface SpaceOrdersProps {
  opsUser: OpsUser | null;
  view: 'all' | 'my';
}

const SOURCE_LABELS: Record<string, string> = {
  registration: '注册',
  purchase: '购买',
  ops_grant: '运营开通',
};

export default function SpaceOrders({ opsUser, view }: SpaceOrdersProps) {
  const [list, setList] = useState<OrderRow[]>([]);
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);
  const [mySpaceIds, setMySpaceIds] = useState<Set<string>>(new Set());
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newSpaceId, setNewSpaceId] = useState('');
  const [newSkuId, setNewSkuId] = useState('');
  const [newExpiresAt, setNewExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isAll = view === 'all';
  const spaceNameById = useMemo(() => {
    const m: Record<string, string> = {};
    spaces.forEach((s) => { m[s.id] = s.name || s.id.slice(0, 8) + '…'; });
    return m;
  }, [spaces]);
  const spacesForNewOrder = useMemo(() => (isAll ? spaces : spaces.filter((s) => mySpaceIds.has(s.id))), [isAll, spaces, mySpaceIds]);

  useEffect(() => {
    load();
  }, [opsUser?.id, view]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      if (isAll) {
        const [ordersRes, spacesRes, skusRes] = await Promise.all([
          supabase.schema('crm').from('space_orders').select(`
            id, space_id, sku_id, status, started_at, expires_at, source, created_at, created_by_ops_user_id,
            sku_edition(code, name),
            ops_users(name, email)
          `).order('created_at', { ascending: false }).limit(200),
          supabase.from('spaces').select('id, name').order('created_at', { ascending: false }).limit(500),
          supabase.schema('crm').from('sku_edition').select('id, code, name').order('sort_order'),
        ]);
        const err = ordersRes.error || spacesRes.error || skusRes.error;
        if (err) setError(err.message || '请求失败');
        if (!ordersRes.error) setList(ordersRes.data ?? []);
        if (!spacesRes.error) setSpaces(spacesRes.data ?? []);
        if (!skusRes.error) setSkus(skusRes.data ?? []);
        setMySpaceIds(new Set());
      } else if (opsUser?.id) {
        const [assignmentsRes, ordersRes, spacesRes, skusRes] = await Promise.all([
          supabase.schema('crm').from('ops_assignments').select('space_id').eq('ops_user_id', opsUser.id),
          supabase.schema('crm').from('space_orders').select(`
            id, space_id, sku_id, status, started_at, expires_at, source, created_at, created_by_ops_user_id,
            sku_edition(code, name),
            ops_users(name, email)
          `).order('created_at', { ascending: false }).limit(200),
          supabase.from('spaces').select('id, name').order('created_at', { ascending: false }).limit(500),
          supabase.schema('crm').from('sku_edition').select('id, code, name').order('sort_order'),
        ]);
        const err = ordersRes.error || spacesRes.error || skusRes.error;
        if (err) setError(err.message || '请求失败');
        const ids = new Set(((assignmentsRes.data ?? []) as { space_id: string }[]).map((a) => a.space_id));
        setMySpaceIds(ids);
        if (!ordersRes.error) {
          const allOrders = (ordersRes.data ?? []) as OrderRow[];
          setList(allOrders.filter((o) => ids.has(o.space_id)));
        }
        if (!spacesRes.error) setSpaces(spacesRes.data ?? []);
        if (!skusRes.error) setSkus(skusRes.data ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateOrder() {
    if (!newSpaceId || !newSkuId || !opsUser?.id) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.schema('crm').from('space_orders').insert({
        space_id: newSpaceId,
        sku_id: newSkuId,
        status: 'active',
        started_at: new Date().toISOString(),
        expires_at: newExpiresAt ? new Date(newExpiresAt).toISOString() : null,
        source: 'ops_grant',
        created_by_ops_user_id: opsUser.id,
      });
      if (!error) {
        setShowNew(false);
        setNewSpaceId('');
        setNewSkuId('');
        setNewExpiresAt('');
        load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 1rem', fontSize: '1.35rem' }}>{isAll ? '全部订单' : '我的客户订单'}</h1>
      <div className="page-card">
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#64748b' }}>
          {isAll ? '全部客户订单。' : '仅我负责的客户的订单。'} 按客户配置订单，控制版本与功能权益；运营可为客户开通或延长权益。
        </p>
        <div style={{ marginBottom: '1rem' }}>
          <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            新建订单
          </button>
        </div>
        {error && (
          <div className="page-card" style={{ marginBottom: '1rem', background: '#fef2f2', color: '#b91c1c' }}>
            <strong>加载失败：</strong> {error}
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
              请确认：1) Supabase 控制台 → 项目设置 → API → Exposed schemas 已包含 <code>crm</code>；2) 已执行 <code>sql/crm-grant-orders-assignments.sql</code> 授权。
            </p>
          </div>
        )}
        <div className="table-wrap">
          {loading ? (
            <p>加载中…</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>客户</th>
                  <th>权益包</th>
                  <th>状态</th>
                  <th>开始时间</th>
                  <th>到期时间</th>
                  <th>来源</th>
                  <th>创建人</th>
                  <th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && !loading ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: '#64748b', padding: '1.5rem' }}>暂无订单数据</td></tr>
                ) : list.map((row) => (
                  <tr key={row.id}>
                    <td>{spaceNameById[row.space_id] ?? row.space_id.slice(0, 8) + '…'}</td>
                    <td>{row.sku_edition ? `${row.sku_edition.name} (${row.sku_edition.code})` : row.sku_id}</td>
                    <td>{row.status}</td>
                    <td>{format(new Date(row.started_at), 'yyyy-MM-dd')}</td>
                    <td>{row.expires_at ? format(new Date(row.expires_at), 'yyyy-MM-dd') : '永久'}</td>
                    <td>{SOURCE_LABELS[row.source] ?? row.source}</td>
                    <td>{row.ops_users ? (row.ops_users.name || row.ops_users.email) : '–'}</td>
                    <td>{format(new Date(row.created_at), 'yyyy-MM-dd HH:mm')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={() => !submitting && setShowNew(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem' }}>新建客户订单</h3>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>客户</span>
              <select
                value={newSpaceId}
                onChange={(e) => setNewSpaceId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }}
              >
                <option value="">请选择</option>
                {spacesForNewOrder.map((s) => (
                  <option key={s.id} value={s.id}>{s.name || s.id.slice(0, 8)}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>权益包 (SKU)</span>
              <select
                value={newSkuId}
                onChange={(e) => setNewSkuId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }}
              >
                <option value="">请选择</option>
                {skus.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>到期日（可选）</span>
              <input
                type="date"
                value={newExpiresAt}
                onChange={(e) => setNewExpiresAt(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6 }}
              />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)} disabled={submitting}>取消</button>
              <button type="button" className="btn btn-primary" onClick={handleCreateOrder} disabled={submitting || !newSpaceId || !newSkuId}>
                {submitting ? '提交中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
