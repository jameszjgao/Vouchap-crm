import { useState, useEffect, useMemo, Fragment } from 'react';
import { supabase } from '../lib/supabase';
import { useMenuPermissions } from '../lib/menu-context';
import { MENU_KEYS, MENU_GROUPS, ALL_MENU_KEYS, CRM_REFRESH_MENU_EVENT, type MenuKey } from '../lib/menu-permissions';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';

const DEFAULT_ROLES = ['admin', 'ops', 'sales', 'support'];
const DEFAULT_ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  ops: '运营',
  sales: '销售',
  support: '支持',
};

const STORAGE_ROLE_ORDER = 'crm_role_order';
const STORAGE_ROLE_LABELS = 'crm_role_labels';

function getStoredRoleOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_ROLE_ORDER);
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      if (Array.isArray(arr)) return arr;
    }
  } catch {
    /* ignore */
  }
  return [];
}

function setStoredRoleOrder(order: string[]) {
  localStorage.setItem(STORAGE_ROLE_ORDER, JSON.stringify(order));
}

function getStoredRoleLabels(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_ROLE_LABELS);
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, string>;
      if (obj && typeof obj === 'object') return obj;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function setStoredRoleLabels(labels: Record<string, string>) {
  localStorage.setItem(STORAGE_ROLE_LABELS, JSON.stringify(labels));
}

export default function RolePermissions() {
  const { can } = useMenuPermissions();
  const [permissionsByRole, setPermissionsByRole] = useState<Record<string, Set<MenuKey>>>({});
  const [roleOrder, setRoleOrder] = useState<string[]>(() => {
    const stored = getStoredRoleOrder();
    if (stored.length) return stored;
    return [...DEFAULT_ROLES];
  });
  const [roleLabels, setRoleLabels] = useState<Record<string, string>>(() => ({
    ...DEFAULT_ROLE_LABELS,
    ...getStoredRoleLabels(),
  }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [addRoleCode, setAddRoleCode] = useState('');
  const [addRoleLabel, setAddRoleLabel] = useState('');
  const [showAddRole, setShowAddRole] = useState(false);

  const labelByKey = useMemo(() => {
    const m: Record<string, string> = {};
    ALL_MENU_KEYS.forEach(({ key, label }) => { m[key] = label; });
    return m;
  }, []);

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
        console.error('加载权限失败:', error);
        return;
      }
      const byRole: Record<string, Set<MenuKey>> = {};
      const distinctRoles = new Set<string>([...DEFAULT_ROLES]);
      (data ?? []).forEach((row: { role: string; menu_key: string }) => {
        distinctRoles.add(row.role);
        if (!byRole[row.role]) byRole[row.role] = new Set();
        byRole[row.role].add(row.menu_key as MenuKey);
      });
      DEFAULT_ROLES.forEach((r) => {
        if (!byRole[r]) byRole[r] = new Set();
      });
      if (byRole['admin']) byRole['admin'].add(MENU_KEYS.ROLES_PERMISSIONS);
      setPermissionsByRole(byRole);
      setRoleOrder((prev) => {
        const merged = [...new Set([...prev, ...distinctRoles])];
        const stored = getStoredRoleOrder();
        if (stored.length) {
          const ordered = [...stored];
          distinctRoles.forEach((r) => {
            if (!ordered.includes(r)) ordered.push(r);
          });
          return ordered;
        }
        return [...DEFAULT_ROLES, ...[...distinctRoles].filter((r) => !DEFAULT_ROLES.includes(r))];
      });
    } finally {
      setLoading(false);
    }
  }

  function toggle(role: string, key: MenuKey) {
    if (role === 'admin' && key === MENU_KEYS.ROLES_PERMISSIONS) return;
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
      const newKeys = new Set(permissionsByRole[role] ?? []);
      if (role === 'admin') newKeys.add(MENU_KEYS.ROLES_PERMISSIONS);
      const { data: currentRows, error: fetchError } = await supabase
        .schema('crm')
        .from('role_menu_permissions')
        .select('menu_key')
        .eq('role', role);
      if (fetchError) {
        console.error('读取当前权限失败:', fetchError);
        alert(`读取失败：${fetchError.message}`);
        return;
      }
      const currentKeys = new Set((currentRows ?? []).map((r: { menu_key: string }) => r.menu_key as MenuKey));
      const toAdd = [...newKeys].filter((k) => !currentKeys.has(k));
      const toRemove = [...currentKeys].filter((k) => !newKeys.has(k));
      if (toRemove.length > 0) {
        const { error: delError } = await supabase
          .schema('crm')
          .from('role_menu_permissions')
          .delete()
          .eq('role', role)
          .in('menu_key', toRemove);
        if (delError) {
          console.error('角色权限删除失败:', delError);
          alert(`保存失败（删除）：${delError.message}`);
          return;
        }
      }
      if (toAdd.length > 0) {
        const { error: insertError } = await supabase
          .schema('crm')
          .from('role_menu_permissions')
          .insert(toAdd.map((menu_key) => ({ role, menu_key })));
        if (insertError) {
          console.error('角色权限保存失败:', insertError);
          alert(`保存失败（写入）：${insertError.message}`);
          return;
        }
      }
      await load();
      window.dispatchEvent(new Event(CRM_REFRESH_MENU_EVENT));
      alert('已保存');
    } finally {
      setSaving(null);
    }
  }

  function moveRole(index: number, dir: -1 | 1) {
    const next = [...roleOrder];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setRoleOrder(next);
    setStoredRoleOrder(next);
  }

  function addRole() {
    const code = addRoleCode.trim().toLowerCase().replace(/\s+/g, '_');
    if (!code) return;
    if (roleOrder.includes(code)) {
      setAddRoleCode('');
      setAddRoleLabel('');
      setShowAddRole(false);
      return;
    }
    const label = addRoleLabel.trim() || code;
    setRoleOrder((prev) => {
      const next = [...prev, code];
      setStoredRoleOrder(next);
      return next;
    });
    setRoleLabels((prev) => {
      const next = { ...prev, [code]: label };
      setStoredRoleLabels(next);
      return next;
    });
    setPermissionsByRole((prev) => ({ ...prev, [code]: new Set() }));
    setAddRoleCode('');
    setAddRoleLabel('');
    setShowAddRole(false);
  }

  function getRoleLabel(role: string) {
    return roleLabels[role] ?? role;
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
          功能为行（与左侧栏对应），角色为列；勾选表示该角色可访问该功能。可新增角色、调整列顺序；保存后生效。
        </p>
        {loading ? (
          <p>加载中…</p>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={() => setShowAddRole(true)}
              >
                <Plus size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                新增角色
              </button>
              {showAddRole && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="text"
                    placeholder="角色代码"
                    value={addRoleCode}
                    onChange={(e) => setAddRoleCode(e.target.value)}
                    style={{ width: 100, padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.875rem' }}
                  />
                  <input
                    type="text"
                    placeholder="显示名称"
                    value={addRoleLabel}
                    onChange={(e) => setAddRoleLabel(e.target.value)}
                    style={{ width: 100, padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.875rem' }}
                  />
                  <button type="button" className="btn btn-primary btn-small" onClick={addRole}>
                    添加
                  </button>
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => { setShowAddRole(false); setAddRoleCode(''); setAddRoleLabel(''); }}>
                    <X size={14} />
                  </button>
                </span>
              )}
            </div>

            <div className="table-wrap" style={{ overflowX: 'auto', maxWidth: '100%' }}>
              <table style={{ minWidth: 'max-content', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 2,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        padding: '0.5rem 0.75rem',
                        textAlign: 'left',
                        minWidth: 160,
                        fontWeight: 600,
                        boxShadow: '2px 0 4px rgba(0,0,0,0.06)',
                      }}
                    >
                      功能名称
                    </th>
                    {roleOrder.map((role, index) => (
                      <th
                        key={role}
                        style={{
                          border: '1px solid #e2e8f0',
                          padding: '0.5rem 0.5rem',
                          textAlign: 'center',
                          minWidth: 120,
                          background: '#f8fafc',
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{getRoleLabel(role)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            style={{ padding: '2px 4px' }}
                            onClick={() => moveRole(index, -1)}
                            disabled={index === 0}
                            title="左移"
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            style={{ padding: '2px 4px' }}
                            onClick={() => moveRole(index, 1)}
                            disabled={index === roleOrder.length - 1}
                            title="右移"
                          >
                            <ChevronRight size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-small"
                            style={{ padding: '2px 6px' }}
                            onClick={() => saveRole(role)}
                            disabled={saving === role}
                          >
                            {saving === role ? '…' : '保存'}
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MENU_GROUPS.map((group) => (
                    <Fragment key={group.label}>
                      <tr>
                        <td
                          colSpan={roleOrder.length + 1}
                          style={{
                            position: 'sticky',
                            left: 0,
                            zIndex: 1,
                            background: '#e2e8f0',
                            border: '1px solid #e2e8f0',
                            padding: '0.35rem 0.75rem',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            boxShadow: '2px 0 4px rgba(0,0,0,0.06)',
                          }}
                        >
                          {group.label}
                        </td>
                      </tr>
                      {group.keys.map((key) => (
                        <tr key={key}>
                          <td
                            style={{
                              position: 'sticky',
                              left: 0,
                              zIndex: 1,
                              background: '#fff',
                              border: '1px solid #e2e8f0',
                              padding: '0.35rem 0.75rem',
                              minWidth: 160,
                              boxShadow: '2px 0 4px rgba(0,0,0,0.06)',
                            }}
                          >
                            {labelByKey[key]}
                          </td>
                          {roleOrder.map((role) => (
                            <td
                              key={role}
                              style={{
                                border: '1px solid #e2e8f0',
                                padding: '0.25rem',
                                textAlign: 'center',
                                minWidth: 120,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={(permissionsByRole[role] ?? new Set()).has(key)}
                                disabled={role === 'admin' && key === MENU_KEYS.ROLES_PERMISSIONS}
                                onChange={() => toggle(role, key)}
                                title={role === 'admin' && key === MENU_KEYS.ROLES_PERMISSIONS ? '管理员必须保留此权限' : undefined}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
