import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { OpsUser } from '../lib/ops-auth';
import { useProduct } from '../lib/product-context';
import { getCounts, listOrders } from '../lib/hub-api';
import { productName } from '../lib/products';
import { Users, FileText, Package, UserCheck } from 'lucide-react';

interface DashboardProps {
  opsUser: OpsUser | null;
  mode: 'panorama' | 'my';
}

export default function Dashboard({ opsUser, mode }: DashboardProps) {
  const { productId } = useProduct();
  const [stats, setStats] = useState<{ spaces: number; orders: number; skus: number; assignments: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isPanorama = mode === 'panorama';

  useEffect(() => {
    load();
  }, [opsUser?.id, mode, productId]);

  async function load() {
    setError(null);
    try {
      const [counts, assignmentsRes] = await Promise.all([
        getCounts(productId),
        supabase.schema('crm').from('ops_assignments').select('tenant_id, ops_user_id').eq('product_id', productId),
      ]);
      const assignments = (assignmentsRes.data ?? []) as { tenant_id: string; ops_user_id: string }[];
      if (isPanorama) {
        setStats({
          spaces: counts.tenants,
          orders: counts.orders,
          skus: counts.skus,
          assignments: assignments.length,
        });
        return;
      }
      if (!opsUser?.id) {
        setStats({ spaces: 0, orders: 0, skus: counts.skus, assignments: 0 });
        return;
      }
      const myTenantIds = new Set(assignments.filter((a) => a.ops_user_id === opsUser.id).map((a) => a.tenant_id));
      const orders = myTenantIds.size > 0 ? await listOrders(productId) : [];
      setStats({
        spaces: myTenantIds.size,
        orders: orders.filter((o) => myTenantIds.has(o.tenantId || o.space_id)).length,
        skus: counts.skus,
        assignments: myTenantIds.size,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setStats({ spaces: 0, orders: 0, skus: 0, assignments: 0 });
    }
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 1rem', fontSize: '1.35rem' }}>工作台 · {productName(productId)}</h1>
      {error && (
        <div className="page-card" style={{ marginBottom: '1rem', background: '#fef2f2', color: '#b91c1c' }}>
          {error}
        </div>
      )}
      <div className="dashboard-cards">
        <Link to={isPanorama ? '/customers/all' : '/customers/my'} className="page-card dashboard-card">
          <Users size={24} color="#0f766e" />
          <div>
            <div className="dashboard-card-value">{stats?.spaces ?? '–'}</div>
            <div className="dashboard-card-label">{isPanorama ? '全部客户' : '我的客户'}</div>
          </div>
        </Link>
        <Link to={isPanorama ? '/orders/all' : '/orders/my'} className="page-card dashboard-card">
          <FileText size={24} color="#0f766e" />
          <div>
            <div className="dashboard-card-value">{stats?.orders ?? '–'}</div>
            <div className="dashboard-card-label">{isPanorama ? '全部订单' : '我的客户订单'}</div>
          </div>
        </Link>
        <Link to="/sku/edition" className="page-card dashboard-card">
          <Package size={24} color="#0f766e" />
          <div>
            <div className="dashboard-card-value">{stats?.skus ?? '–'}</div>
            <div className="dashboard-card-label">权益包</div>
          </div>
        </Link>
        <Link to={isPanorama ? '/customers/all' : '/customers/my'} className="page-card dashboard-card">
          <UserCheck size={24} color="#0f766e" />
          <div>
            <div className="dashboard-card-value">{stats?.assignments ?? '–'}</div>
            <div className="dashboard-card-label">客户分配</div>
          </div>
        </Link>
      </div>
      <div className="page-card" style={{ marginTop: '1rem' }}>
        <h3>说明</h3>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#64748b', fontSize: '0.9rem' }}>
          <li>顶栏产品筛选决定当前查看的客户库（Vouchap / Portalflow / Wholestore / aim.link）。</li>
          <li>{isPanorama ? '全部客户' : '我的客户'}：{isPanorama ? '查看该产品全部租户，可分配负责人' : '仅展示分配给我的客户'}</li>
          <li>订单与 SKU 写在各产品库；分配与跟进写在 Adaven-CRM Hub。</li>
        </ul>
      </div>
    </div>
  );
}
