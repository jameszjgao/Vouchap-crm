import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';

interface SkuRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  feature_modules: Record<string, boolean>;
  data_limits: Record<string, number>;
  period_type: string;
  quota_period: string;
  price_monthly: number | null;
  currency: string;
  is_trial: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface AddonRow {
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
}

const MODULE_LABELS: Record<string, string> = {
  expenses: '支出',
  income: '收入',
  inbound: '入库',
  outbound: '出库',
};

interface SkusProps {
  tab: 'edition' | 'addon';
}

export default function Skus({ tab }: SkusProps) {
  const [editions, setEditions] = useState<SkuRow[]>([]);
  const [addons, setAddons] = useState<AddonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [tab]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'edition') {
        const edRes = await supabase.schema('crm').from('sku_edition').select('id, code, name, description, feature_modules, data_limits, period_type, quota_period, price_monthly, currency, is_trial, sort_order, created_at, updated_at').order('sort_order', { ascending: true });
        if (edRes.error) setError(edRes.error.message || '请求失败');
        else setEditions(edRes.data ?? []);
      } else {
        const addonRes = await supabase.schema('crm').from('sku_addon').select('id, code, name, description, units, price, currency, is_active, sort_order, created_at, updated_at').order('sort_order', { ascending: true });
        if (addonRes.error) setError(addonRes.error.message || '请求失败');
        else setAddons(addonRes.data ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  if (tab === 'addon') {
    return (
      <div>
        <h1 style={{ margin: '0 0 1rem', fontSize: '1.35rem' }}>增购规格</h1>
        <div className="page-card">
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#64748b' }}>
            每 N 条数据为一档的增购价格，用于超量购买。
          </p>
          {error && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#fef2f2', color: '#b91c1c', borderRadius: 6 }}>
              <strong>加载失败：</strong> {error}
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
                请确认 Supabase API 的 Exposed schemas 包含 <code>crm</code>，并已执行 <code>sql/crm-grant-orders-assignments.sql</code>。
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
                    <th>编码</th>
                    <th>名称</th>
                    <th>每档条数</th>
                    <th>价格</th>
                    <th>启用</th>
                    <th>排序</th>
                    <th>创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {addons.length === 0 && !loading ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: '#64748b', padding: '1.5rem' }}>暂无用量增购数据</td></tr>
                  ) : addons.map((row) => (
                    <tr key={row.id}>
                      <td><code>{row.code}</code></td>
                      <td>{row.name || '–'}</td>
                      <td>{row.units}</td>
                      <td>{row.currency} {row.price}</td>
                      <td>{row.is_active ? '是' : '否'}</td>
                      <td>{row.sort_order}</td>
                      <td>{row.created_at ? format(new Date(row.created_at), 'yyyy-MM-dd HH:mm') : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 1rem', fontSize: '1.35rem' }}>版本规格</h1>
      <div className="page-card">
        <h3 style={{ margin: '0 0 0.5rem' }}>版本 (sku_edition)</h3>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#64748b' }}>
          功能模块与周期内数据量上限，供客户订单使用。
        </p>
        {error && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#fef2f2', color: '#b91c1c', borderRadius: 6 }}>
            <strong>加载失败：</strong> {error}
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
              请确认 Supabase API 的 Exposed schemas 包含 <code>crm</code>，并已执行 <code>sql/crm-grant-orders-assignments.sql</code>。
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
                  <th>编码</th>
                  <th>名称</th>
                  <th>试用</th>
                  <th>计费周期</th>
                  <th>用量周期</th>
                  <th>月价</th>
                  <th>功能模块</th>
                  <th>数据上限</th>
                  <th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {editions.length === 0 && !loading ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: '#64748b', padding: '1.5rem' }}>暂无权益包数据</td></tr>
                ) : editions.map((row) => (
                  <tr key={row.id}>
                    <td><code>{row.code}</code></td>
                    <td>{row.name}</td>
                    <td>{row.is_trial ? '是' : '否'}</td>
                    <td>{row.period_type}</td>
                    <td>{row.quota_period ?? '–'}</td>
                    <td>{row.price_monthly != null ? `${row.currency} ${row.price_monthly}` : '免费'}</td>
                    <td>
                      <small>
                        {Object.entries(row.feature_modules ?? {}).map(([k, v]) => `${MODULE_LABELS[k] ?? k}:${v ? '开' : '关'}`).join(', ') || '–'}
                      </small>
                    </td>
                    <td>
                      <small>
                        {Object.entries(row.data_limits ?? {}).map(([k, v]) => `${k}:${v}`).join(', ') || '–'}
                      </small>
                    </td>
                    <td>{format(new Date(row.created_at), 'yyyy-MM-dd HH:mm')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
