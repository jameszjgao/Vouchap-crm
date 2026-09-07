# Adaven-CRM 功能设计

运营身份与分配在 **Hub**（Supabase `glwacznypahmlpwottfz`）；SKU / 订单 / 权益在 **各产品库**。

## 1. Hub 表

| 表 | 说明 | 页面 |
|----|------|------|
| `crm.ops_users` | 运营人员（仅此表用户可登录） | 团队人员 |
| `crm.ops_assignments` | `(product_id, tenant_id)` 唯一 | 客户分配 |
| `crm.tenant_follow_ups` | 跟进 | 客户详情 |
| `crm.ops_audit_log` | 下单/改单审计 | （预留列表） |
| `crm.role_menu_permissions` | 菜单权限 | 角色与权限 |
| `crm.products` | vouchap / portalflow / wholestore / aimlink | 顶栏产品筛选 |
| `crm.product_adapters` | 各产品库 URL + service role（仅 service_role 可读；Function secrets 优先） | `product-ops` |

## 2. 产品适配器（`product-ops`）

| action | 含义 |
|--------|------|
| `list_tenants` | spaces 或 workspaces + 人数/创建者 |
| `list_skus` / `list_addons` | 该库目录 |
| `list_orders` / `create_order` / `update_order` | 该库订单；`created_by_ops_user_id` 置空，`metadata.hub_ops_user_id` 记 Hub 运营 |
| `get_entitlements` | `get_space_entitlements` 或 `get_workspace_entitlements` |
| `get_counts` | 工作台数字 |

UI 类型标签：Vouchap/Portalflow → Firm/Client；Wholestore → Vendor/Dealer；aim.link → Workspace。SQL 不用这些词。

## 3. 页面

- 工作台 / 客户 / 订单 / SKU / 团队：行为与旧版一致，顶栏左侧 **平铺产品按钮** 切换当前产品。
- 客户列表数据来自适配器；分配与跟进来自 Hub。
- 新建订单写入当前产品库，订阅填到期日，credit 包写 metadata。

## 4. 权限

- admin：全菜单、分配/改派、角色配置。
- ops / sales / support：默认「我的」+ SKU 只读 + 团队人员只读。

## 5. Vouchap 现网（Hub 已接管运营读写）

- 不改 Vouchap 应用与表结构。仅对现有 `crm.space_orders` 等补 `service_role` GRANT，供 Hub 适配器访问。
- 运营登录 **Hub Auth**（与 Vouchap 产品 / 旧 CRM 密码不是同一套）。登录后可「修改密码」；管理员可在「团队人员」直接设新密码（`ops-auth`，不依赖发信）。
- 其它产品未配置 adapter / secrets 时，顶栏切过去会报缺失密钥，不影响 Vouchap。
