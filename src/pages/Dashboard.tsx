import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { OpsUser } from '../lib/ops-auth';
import { Users, FileText, Package, UserCheck } from 'lucide-react';

interface DashboardProps {
  opsUser: OpsUser | null;
  mode: 'panorama' | 'my';
}

export default function Dashboard({ opsUser, mode }: DashboardProps) {
  const [stats, setStats] = useState<{ spaces: number; orders: number; skus: number; assignments: number } | null>(null);
  const isPanorama = mode === 'panorama';

  useEffect(() => {
    load();
  }, [opsUser?.id, mode]);

  async function load() {
    try {
      if (isPanorama) {
        const [spacesRes, ordersRes, skusRes, assignmentsRes] = await Promise.all([
          supabase.from('spaces').select('id', { count: 'exact', head: true }),
          supabase.schema('crm').from('space_orders').select('id', { count: 'exact', head: true }),
          supabase.schema('crm').from('sku_edition').select('id', { count: 'exact', head: true }),
          supabase.schema('crm').from('ops_assignments').select('id', { count: 'exact', head: true }),
        ]);
        setStats({
          spaces: spacesRes.count ?? 0,
          orders: ordersRes.count ?? 0,
          skus: skusRes.count ?? 0,
          assignments: assignmentsRes.count ?? 0,
        });
      } else if (opsUser?.id) {
        const assignmentsRes = await supabase
          .schema('crm')
          .from('ops_assignments')
          .select('space_id')
          .eq('ops_user_id', opsUser.id);
        const mySpaceIds = (assignmentsRes.data ?? []).map((a) => (a as { space_id: string }).space_id);
        const myCount = mySpaceIds.length;
        let ordersCount = 0;
        if (mySpaceIds.length > 0) {
          const ordersRes = await supabase
            .schema('crm')
            .from('space_orders')
            .select('id', { count: 'exact', head: true })
            .in('space_id', mySpaceIds);
          ordersCount = ordersRes.count ?? 0;
        }
        const skusRes = await supabase.schema('crm').from('sku_edition').select('id', { count: 'exact', head: true });
        setStats({
          spaces: myCount,
          orders: ordersCount,
          skus: skusRes.count ?? 0,
          assignments: myCount,
        });
      } else {
        setStats({ spaces: 0, orders: 0, skus: 0, assignments: 0 });
      }
    } catch {
      setStats({ spaces: 0, orders: 0, skus: 0, assignments: 0 });
    }
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 1rem', fontSize: '1.35rem' }}>工作台</h1>
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
        <Link to="/skus" className="page-card dashboard-card">
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
          <li>{isPanorama ? '全部客户' : '我的客户'}：{isPanorama ? '查看所有客户，可分配负责人' : '仅展示分配给我的客户'}</li>
          <li>{isPanorama ? '全部订单' : '我的客户订单'}：按客户配置订单；{isPanorama ? '可查看所有' : '仅我负责的客户的订单'}</li>
          <li>权益包(SKU)：定义功能模块与数据量上限</li>
          <li>客户分配：{isPanorama ? '查看/管理所有分配' : '仅我负责的客户'}</li>
        </ul>
      </div>
    </div>
  );
}
