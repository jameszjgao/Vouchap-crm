# CRM 登录从零配置

按下面顺序做，**不要跳步**。

---

## 第一步：在 Supabase 里先有 Auth 用户

1. 打开 Supabase Dashboard → **Authentication** → **Users**
2. 点 **Add user** → **Create new user**
3. 填邮箱：`jamesgao@aim.link`，设一个密码（记住）
4. 保存

这样 `auth.users` 里才有这条用户，后面 SQL 才能从 `auth.users` 里取到正确的 `id` 填进 `crm.ops_users.user_id`。

---

## 第二步：执行一条龙 SQL

1. 打开 **SQL Editor**
2. 打开项目里的 `sql/crm-login-from-scratch.sql`
3. 把里面的邮箱 `jamesgao@aim.link` 改成你要加的人（或保持不改）
4. **整段复制、粘贴、执行**

脚本会：建 schema/表（若没有）、RLS、权限、并从 **auth.users** 插入一条 `crm.ops_users`（`user_id` = auth 的 id，不会填错）。

---

## 第三步：确认 API 暴露了 crm

1. Dashboard → **Project Settings** → **API**（或 **Data API**）
2. 找到 **Exposed schemas**
3. 确认列表里有 **crm**，没有就加上

---

## 第四步：登录 CRM

1. 本地跑 CRM：`npm run dev`
2. 打开登录页，用**第一步**里填的邮箱和密码登录

---

## 以后加新运营账号

1. 先在 **Authentication → Users** 里加好该用户（或对方自己注册）。
2. 在 SQL Editor 执行（把邮箱改成对方邮箱）：

```sql
INSERT INTO crm.ops_users (user_id, email, name, role)
SELECT id, email, COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)), 'admin'
FROM auth.users
WHERE email = '新账号@example.com'
ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role, updated_at = now();
```

**不要**在 Table Editor 里手填 `crm.ops_users`：`user_id` 必须等于 `auth.users.id`，手填容易错，登录就会失败。
