import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useMenuPermissions } from '../lib/menu-context';
import { MENU_KEYS, ALL_MENU_KEYS, type MenuKey } from '../lib/menu-permissions';

const ROLES = ['admin', 'ops', 'sales', 'support'];
const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  ops: '运营',
  sales: '销售',
  support: '支持',
};

export default function RolePermissions() {
  const { can } = useMenuPermissions();
  const [permissionsByRole, setPermissionsByRole] = useState<Record<string, Set<MenuKey>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .schema('crm')
        .from('role_menu_permissions')
        .select('role, menu_key');
      if (error) {
        setPermissionsByRole({});
        return;
      }
      const byRole: Record<string, Set<MenuKey>> = {};
      ROLES.forEach((r) => { byRole[r] = new Set(); });
      (data ?? []).forEach((row: { role: string; menu_key: string }) => {
        if (!byRole[row.role]) byRole[row.role] = new Set();
        byRole[row.role].add(row.menu_key as MenuKey);
      });
      setPermissionsByRole(byRole);
    } finally {
      setLoading(false);
    }
  }

  function toggle(role: string, key: MenuKey) {
    setPermissionsByRole((prev) => {
      const next = { ...prev };
      const set = new Set(next[role] ?? []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      next[role] = set;
      return next;
    });
  }

  async function saveRole(role: string) {
    setSaving(role);
    try {
      const keys = Array.from(permissionsByRole[role] ?? []);
      await supabase.schema('crm').from('role_menu_permissions').delete().eq('role', role);
      if (keys.length > 0) {
        await supabase.schema('crm').from('role_menu_permissions').insert(keys.map((menu_key) => ({ role, menu_key })));
      }
      await load();
    } finally {
      setSaving(null);
    }
  }

  if (!can(MENU_KEYS.ROLES_PERMISSIONS)) {
    return (
      <div className="page-card">
        <p style={{ color: '#64748b' }}>无权限访问角色与权限配置。</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 1rem', fontSize: '1.35rem' }}>角色与权限</h1>
      <div className="page-card">
        <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: '#64748b' }}>
          配置各角色可访问的菜单项，保存后该角色登录仅能看到已勾选的菜单与数据。
        </p>
        {loading ? (
          <p>加载中…</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 100 }}>角色</th>
                  <th>菜单权限（勾选可见）</th>
                  <th style={{ width: 90 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {ROLES.map((role) => (
                  <tr key={role}>
                    <td><strong>{ROLE_LABELS[role] ?? role}</strong></td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
                        {ALL_MENU_KEYS.map(({ key, label }) => (
                          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.875rem' }}>
                            <input
                              type="checkbox"
                              checked={(permissionsByRole[role] ?? new Set()).has(key)}
                              onChange={() => toggle(role, key)}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-primary btn-small"
                        onClick={() => saveRole(role)}
                        disabled={saving === role}
                      >
                        {saving === role ? '保存中…' : '保存'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
