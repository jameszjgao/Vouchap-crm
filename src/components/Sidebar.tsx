import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  FileText,
  Users,
  LogOut,
  UserCheck,
} from 'lucide-react';
import type { OpsUser } from '../lib/ops-auth';
import { useMenuPermissions } from '../lib/menu-context';
import { MENU_KEYS } from '../lib/menu-permissions';
import './Sidebar.css';

interface SidebarProps {
  opsUser: OpsUser;
  onSignOut: () => void;
}

export default function Sidebar({ opsUser, onSignOut }: SidebarProps) {
  const { can } = useMenuPermissions();

  const showOverview = can(MENU_KEYS.OVERVIEW_PANORAMA) || can(MENU_KEYS.OVERVIEW_MY);
  const showCustomers = can(MENU_KEYS.CUSTOMERS_ALL) || can(MENU_KEYS.CUSTOMERS_MY);
  const showOrders = can(MENU_KEYS.ORDERS_ALL) || can(MENU_KEYS.ORDERS_MY);
  const showSku = can(MENU_KEYS.SKU_EDITION) || can(MENU_KEYS.SKU_ADDON);
  const showTeam = can(MENU_KEYS.TEAM_MEMBERS) || can(MENU_KEYS.ROLES_PERMISSIONS);

  return (
    <aside className="crm-sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-name">Vouchap</span>
        <span className="sidebar-brand-badge">CRM</span>
      </div>
      <nav className="sidebar-nav">
        {showOverview && (
          <div className="sidebar-group">
            <div className="sidebar-group-label">
              <LayoutDashboard size={18} /> 运营总揽
            </div>
            <div className="sidebar-group-items">
              {can(MENU_KEYS.OVERVIEW_PANORAMA) && (
                <NavLink to="/overview/panorama" className={({ isActive }) => (isActive ? 'active' : '')}>
                  全景仪表台
                </NavLink>
              )}
              {can(MENU_KEYS.OVERVIEW_MY) && (
                <NavLink to="/overview/my" className={({ isActive }) => (isActive ? 'active' : '')}>
                  我的工作台
                </NavLink>
              )}
            </div>
          </div>
        )}

        {showCustomers && (
          <div className="sidebar-group">
            <div className="sidebar-group-label">
              <Users size={18} /> 客户
            </div>
            <div className="sidebar-group-items">
              {can(MENU_KEYS.CUSTOMERS_ALL) && (
                <NavLink to="/customers/all" className={({ isActive }) => (isActive ? 'active' : '')}>
                  全部客户
                </NavLink>
              )}
              {can(MENU_KEYS.CUSTOMERS_MY) && (
                <NavLink to="/customers/my" className={({ isActive }) => (isActive ? 'active' : '')}>
                  我的客户
                </NavLink>
              )}
            </div>
          </div>
        )}

        {showOrders && (
          <div className="sidebar-group">
            <div className="sidebar-group-label">
              <FileText size={18} /> 订单
            </div>
            <div className="sidebar-group-items">
              {can(MENU_KEYS.ORDERS_ALL) && (
                <NavLink to="/orders/all" className={({ isActive }) => (isActive ? 'active' : '')}>
                  全部订单
                </NavLink>
              )}
              {can(MENU_KEYS.ORDERS_MY) && (
                <NavLink to="/orders/my" className={({ isActive }) => (isActive ? 'active' : '')}>
                  我的客户订单
                </NavLink>
              )}
            </div>
          </div>
        )}

        {showSku && (
          <div className="sidebar-group">
            <div className="sidebar-group-label">
              <Package size={18} /> SKU（权益规格）
            </div>
            <div className="sidebar-group-items">
              {can(MENU_KEYS.SKU_EDITION) && (
                <NavLink to="/sku/edition" className={({ isActive }) => (isActive ? 'active' : '')}>
                  版本规格
                </NavLink>
              )}
              {can(MENU_KEYS.SKU_ADDON) && (
                <NavLink to="/sku/addon" className={({ isActive }) => (isActive ? 'active' : '')}>
                  增购规格
                </NavLink>
              )}
            </div>
          </div>
        )}

        {showTeam && (
          <div className="sidebar-group">
            <div className="sidebar-group-label">
              <UserCheck size={18} /> 运营团队
            </div>
            <div className="sidebar-group-items">
              {can(MENU_KEYS.TEAM_MEMBERS) && (
                <NavLink to="/team/members" className={({ isActive }) => (isActive ? 'active' : '')}>
                  团队人员
                </NavLink>
              )}
              {can(MENU_KEYS.ROLES_PERMISSIONS) && (
                <NavLink to="/team/roles" className={({ isActive }) => (isActive ? 'active' : '')}>
                  角色与权限
                </NavLink>
              )}
            </div>
          </div>
        )}
      </nav>
      <div className="sidebar-footer">
        <button type="button" onClick={onSignOut} aria-label="登出">
          <LogOut size={18} /> 登出
        </button>
      </div>
    </aside>
  );
}
