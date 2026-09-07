# Adaven-CRM

跨产品运营后台。运营只登录 **Hub** 一次，通过 Edge Function `product-ops` 读写各产品库的客户租户与权益订单。

| 产品 | 租户 | 权益表 | 库 |
|------|------|--------|----|
| Vouchap（冻结） | `public.spaces`（`firm`/`client`） | 现有 `crm.space_orders` | `giuacjbfsyrristkigmz`（不改 schema） |
| Portalflow | `public.spaces`（`provider`/`consumer`） | 现有 `crm.space_orders` | `xvqlqvtfogxkfeillvig` |
| Wholestore | `public.spaces`（`provider`/`consumer`） | 新增 `crm.*` | `foyecolycmxcneflpant` |
| Workmap | `public.workspaces` | `crm.workspace_orders` | 见 [Workmap](https://github.com/jamesgao27/Workmap) |

前端 **只配置 Hub** 的 `VITE_SUPABASE_*`。各产品 **service role** 只放在 Hub Function secrets 或 Hub 表 `crm.product_adapters`（仅 service_role 可读），禁止写入 Vite 环境变量。

让 Hub **立刻**接管 Vouchap 运营（不改 Vouchap 应用/schema）：`bash scripts/wire-vouchap-hub.sh`。

## 环境

Hub 项目：**`glwacznypahmlpwottfz`**（`https://glwacznypahmlpwottfz.supabase.co`）。GitHub：**[jamesgao27/Adaven-CRM](https://github.com/jamesgao27/Adaven-CRM)**。不要复用任一产品库。步骤见 [`supabase/APPLY.md`](supabase/APPLY.md)。

```bash
cp .env.example .env
npm install
npm run dev   # http://localhost:5174
```

## 权限

仅 `crm.ops_users` 中的用户可进入。菜单由 `crm.role_menu_permissions` 控制。分配/改派仅 admin。

## 明确不做

- 不改 Vouchap 应用与其库 schema。
- 不把四个产品的终端用户打通登录。
- 首期无支付网关（`ops_grant` / 产品侧 `registration`）。
