import type { OpsUser } from '../lib/ops-auth';

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  ops: '运营',
  sales: '销售',
  support: '支持',
};

interface HeaderProps {
  opsUser: OpsUser;
  onSignOut: () => void;
}

export default function Header({ opsUser, onSignOut }: HeaderProps) {
  return (
    <header className="crm-header">
      <h2><span className="header-crm-badge">CRM</span> 运营管理</h2>
      <div className="header-user">
        <span className="header-name">{opsUser.name || opsUser.email}</span>
        <span className="header-role">{ROLE_LABELS[opsUser.role] ?? opsUser.role}</span>
        <button type="button" className="btn btn-secondary btn-small" onClick={onSignOut}>
          登出
        </button>
      </div>
    </header>
  );
}
