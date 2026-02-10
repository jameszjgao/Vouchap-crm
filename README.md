# Vouchap 运营管理系统 (CRM)

与 Vouchap 主应用**同库**，使用独立 `crm` schema，便于合规与未来分库。

## 功能

- **运营鉴权**：仅 `crm.ops_users` 中的用户可登录（对应 Supabase Auth）
- **用户线索**：查看注册用户与客户
- **客户订单**：按客户配置订单，控制版本与功能权益；支持注册即产生的免费试用订单
- **权益包 (SKU)**：定义功能模块开关与周期内数据量上限
- **客户分配**：将客户分配给运营人员负责
- **推荐码与转介绍**：表结构已就绪，后续可扩展页面

## 环境

- Node 18+
- 与主应用共用同一 Supabase 项目

## 配置

1. 复制 `.env.example` 为 `.env`，填写 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（与主应用一致）。
2. 在 Supabase 中执行 `sql/crm-schema.sql`（Dashboard → SQL Editor）。
3. 在 Supabase **Settings → API** 中，将 **Schema** 暴露为 `public,crm`（或勾选暴露 `crm`），否则 CRM 无法访问 `crm` 下表。
4. 首次运营账号：在 Auth 中创建用户（或邀请注册），然后执行：
   ```sql
   INSERT INTO crm.ops_users (user_id, email, name, role)
   SELECT id, email, raw_user_meta_data->>'name', 'admin'
   FROM auth.users WHERE email = '你的运营邮箱';
   ```
5. **RLS 用 JWT 判断角色**：执行 `sql/crm-ops-users-rls-jwt.sql`，使 `crm.ops_users` 的 RLS 用 `auth.jwt()->'app_metadata'->>'crm_role'` 判断 admin（不查本表，无递归）。
6. **同步 role 到 JWT**：部署 Edge Function `sync-crm-role`，登录后会把 `crm.ops_users.role` 写入 Auth 的 `app_metadata.crm_role` 并刷新 session。
   - 在项目根目录（含 `supabase/functions` 的目录）执行：`supabase functions deploy sync-crm-role`
   - 需配置 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`（Supabase 部署时自动注入）。
   - 已有运营用户首次使用前，可由 admin 登录后调用一次「全量同步」（见下），或每人登录一次即会同步自己。

## 本地运行

```bash
npm install
npm run dev
```

CRM 开发服务默认使用 **5174** 端口（若 5173 已被 vouchap-web 占用）。请打开 **http://localhost:5174** 访问运营管理，不要与平台的 http://localhost:5173 混淆。

## 主应用如何用权益

主应用按**空间**查当前生效权益，调用函数（anon 可执行）：

```sql
SELECT crm.get_space_entitlements('空间UUID');
-- 返回 { "feature_modules": {...}, "data_limits": {...}, "sku_code": "FREE_TRIAL", "expires_at": ... }
```

注册空间时创建免费试用订单：在创建空间的逻辑中（主应用或 Edge Function），插入一条 `crm.space_orders`，`sku_id` 为 `FREE_TRIAL` 对应 id，`source = 'registration'`。

## 同步 crm_role 到 JWT（Edge Function）

- **登录时**：前端登录成功后会调 `sync-crm-role`（传当前 `user_id`），把该用户在 `crm.ops_users` 的 `role` 写入 Auth `app_metadata.crm_role`，并 `refreshSession()`，后续 RLS 即按 JWT 判断。
- **全量同步**：admin 可 POST `https://<项目>.supabase.co/functions/v1/sync-crm-role`，Body `{}`，Header `Authorization: Bearer <admin 的 access_token>`，会同步所有 `crm.ops_users` 的 role 到对应用户的 app_metadata。
- **改角色后**：在 CRM 或 SQL 中修改 `crm.ops_users.role` 后，需让该用户重新登录（或调一次 sync 传其 `user_id`），JWT 才会更新。

## 分库说明

所有 CRM 表均在 `crm` schema 下，且未对 `public` 建 FK。日后若需分库，只需迁移整个 `crm` schema 到新项目，主应用通过 API 或同步获取权益数据即可。
