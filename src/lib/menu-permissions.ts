import { supabase } from './supabase';

/** 角色与权限页保存后派发此事件，App 监听并刷新当前用户菜单权限 */
export const CRM_REFRESH_MENU_EVENT = 'crm:refresh-menu-permissions';

/** 与 crm.role_menu_permissions.menu_key 一致 */
export const MENU_KEYS = {
  OVERVIEW_PANORAMA: 'overview_panorama',
  OVERVIEW_MY: 'overview_my',
  CUSTOMERS_ALL: 'customers_all',
  CUSTOMERS_MY: 'customers_my',
  ORDERS_ALL: 'orders_all',
  ORDERS_MY: 'orders_my',
  SKU_EDITION: 'sku_edition',
  SKU_ADDON: 'sku_addon',
  TEAM_MEMBERS: 'team_members',
  ROLES_PERMISSIONS: 'roles_permissions',
} as const;

export type MenuKey = (typeof MENU_KEYS)[keyof typeof MENU_KEYS];

/** 所有可选菜单 key（供角色与权限页使用） */
export const ALL_MENU_KEYS: { key: MenuKey; label: string }[] = [
  { key: MENU_KEYS.OVERVIEW_PANORAMA, label: '全景仪表台' },
  { key: MENU_KEYS.OVERVIEW_MY, label: '我的工作台' },
  { key: MENU_KEYS.CUSTOMERS_ALL, label: '全部客户' },
  { key: MENU_KEYS.CUSTOMERS_MY, label: '我的客户' },
  { key: MENU_KEYS.ORDERS_ALL, label: '全部订单' },
  { key: MENU_KEYS.ORDERS_MY, label: '我的客户订单' },
  { key: MENU_KEYS.SKU_EDITION, label: '版本规格' },
  { key: MENU_KEYS.SKU_ADDON, label: '增购规格' },
  { key: MENU_KEYS.TEAM_MEMBERS, label: '团队人员' },
  { key: MENU_KEYS.ROLES_PERMISSIONS, label: '角色与权限' },
];

/** 菜单分组（与侧栏布局对应，角色与权限页表格行顺序） */
export const MENU_GROUPS: { label: string; keys: MenuKey[] }[] = [
  { label: '运营总揽', keys: [MENU_KEYS.OVERVIEW_PANORAMA, MENU_KEYS.OVERVIEW_MY] },
  { label: '客户', keys: [MENU_KEYS.CUSTOMERS_ALL, MENU_KEYS.CUSTOMERS_MY] },
  { label: '订单', keys: [MENU_KEYS.ORDERS_ALL, MENU_KEYS.ORDERS_MY] },
  { label: 'SKU（权益规格）', keys: [MENU_KEYS.SKU_EDITION, MENU_KEYS.SKU_ADDON] },
  { label: '运营团队', keys: [MENU_KEYS.TEAM_MEMBERS, MENU_KEYS.ROLES_PERMISSIONS] },
];

/**
 * 拉取当前用户角色可访问的菜单 key 列表（来自 crm.role_menu_permissions）
 * 若接口失败或未配置，按 role 回退默认：admin 全部，其他为「我的」+ sku + team_members
 */
export async function getMyMenuPermissions(role: string): Promise<Set<MenuKey>> {
  try {
    const { data, error } = await supabase
      .schema('crm')
      .from('role_menu_permissions')
      .select('menu_key')
      .eq('role', role);
    if (!error && data?.length) {
      return new Set(data.map((r) => r.menu_key as MenuKey));
    }
  } catch {
    /* ignore */
  }
  return getDefaultMenuPermissions(role);
}

export function getDefaultMenuPermissions(role: string): Set<MenuKey> {
  if (role === 'admin') {
    return new Set(ALL_MENU_KEYS.map((m) => m.key));
  }
  return new Set([
    MENU_KEYS.OVERVIEW_MY,
    MENU_KEYS.CUSTOMERS_MY,
    MENU_KEYS.ORDERS_MY,
    MENU_KEYS.SKU_EDITION,
    MENU_KEYS.SKU_ADDON,
    MENU_KEYS.TEAM_MEMBERS,
  ]);
}
