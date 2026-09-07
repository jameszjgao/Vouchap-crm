import type { OpsUser } from '../lib/ops-auth';
import { CRM_PRODUCTS, useProduct } from '../lib/product-context';
import type { ProductId } from '../lib/products';

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
  const { productId, setProductId } = useProduct();
  return (
    <header className="crm-header">
      <div className="header-left">
        <h2><span className="header-crm-badge">CRM</span> 运营管理</h2>
        <div className="header-products" role="tablist" aria-label="产品">
          {CRM_PRODUCTS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={productId === p.id}
              className={`header-product-btn${productId === p.id ? ' is-active' : ''}`}
              onClick={() => setProductId(p.id as ProductId)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
      <div className="header-user">
        <span className="header-name">{opsUser.name || opsUser.email}</span>
        <span className="header-role">{ROLE_LABELS[opsUser.role] ?? opsUser.role}</span>
        <a className="btn btn-secondary btn-small" href="/reset-password">修改密码</a>
        <button type="button" className="btn btn-secondary btn-small" onClick={onSignOut}>
          登出
        </button>
      </div>
    </header>
  );
}
