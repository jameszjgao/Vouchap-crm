# Vouchap CRM 功能设计

基于 `crm` schema 表结构与运营需求整理的功能与权限说明。

---

## 1. 表结构与页面对应

| 表 | 说明 | 主要页面 |
|----|------|----------|
| `crm.ops_users` | 运营人员（仅此表用户可登录 CRM） | 工作台 / 运营人员(admin) |
| `crm.ops_audit_log` | 运营操作审计 | （预留，可后续做只读列表） |
| `crm.sku_edition` | 权益包版本（功能模块 + 用量 + 定价） | 权益包(SKU) |
| `crm.sku_addon` | 用量增购（每 N 条价格） | 权益包(SKU) |
| `crm.space_orders` | 客户订单（含试用/购买/运营开通） | 客户订单 |
| `crm.ops_assignments` | 线索分配（客户 → 运营负责人） | 用户线索、客户分配 |
| `crm.referral_codes` / `crm.referral_relations` | 邀请码与邀请关系 | （预留） |
| `public.spaces` | 主应用客户/空间（只读展示） | 用户线索、客户订单、客户分配 |

---

## 2. 功能模块

### 2.1 工作台 (Dashboard)
- **统计**：客户数、订单数、权益包数、客户分配数（均只读统计）。
- **入口**：卡片跳转至用户线索、客户订单、权益包、客户分配。
- **权限**：所有登录运营可见。

### 2.2 用户线索 (Leads)
- **列表**：`public.spaces` 列表，展示客户名称、地址、负责人、分配时间、创建时间。
- **分配**：管理员可为每个客户「分配/改派」负责人（写入 `crm.ops_assignments`，`space_id` 唯一，upsert）。
- **权限**：所有人可看列表；仅 **admin** 可操作分配、并看到运营人员下拉（需能查 `ops_users`）。

### 2.3 客户订单 (SpaceOrders)
- **列表**：`crm.space_orders` + `sku_edition` 名称/编码，客户名称来自 `public.spaces`；状态、开始/到期、来源、创建时间。
- **新建订单**：选择客户、权益包(SKU)、可选到期日；来源固定为 `ops_grant`，`created_by_ops_user_id` 为当前运营。
- **权限**：所有登录运营可看列表、可新建（依赖 RLS）。

### 2.4 客户分配 (Assignments)
- **列表**：`crm.ops_assignments` + 运营姓名/邮箱、客户名称（来自 `public.spaces`）、角色、分配时间。
- **新增分配**：选择客户、运营人员，upsert（`space_id` 唯一）。
- **取消分配**：按条删除 `ops_assignments`。
- **权限**：所有人可看列表；仅 **admin** 可新增/取消分配（并加载 `ops_users` 下拉）。

### 2.5 权益包 (Skus)
- **版本 (sku_edition)**：编码、名称、试用、周期、月价、功能模块、数据上限、创建时间；功能模块用中文标签（支出/收入/入库/出库）。
- **用量增购 (sku_addon)**：编码、名称、每档条数、价格、启用、排序。
- **权限**：只读，所有登录运营可看。

### 2.6 运营人员 (OpsUsers)
- **列表**：`crm.ops_users` 邮箱、姓名、角色（中文：管理员/运营/销售/支持）、创建时间。
- **说明**：仅在此表中的用户可登录 CRM；需先在 Supabase Auth 创建用户，再在此表添加记录。
- **权限**：仅 **admin** 可访问该页（路由级重定向）；侧栏仅 admin 显示「运营人员」入口。

---

## 3. 权限与角色

- **admin**：可访问运营人员页、用户线索/客户分配中的分配与改派、新增/取消分配。
- **ops / sales / support**：可访问工作台、用户线索（只读列表）、客户订单（列表+新建）、客户分配（只读）、权益包（只读）；不可访问运营人员页，不可在线索/分配中操作负责人。

（实际权限以 Supabase RLS 与前端路由/按钮显隐为准。）

---

## 4. 技术要点

- **表名**：前端统一使用 `sku_edition`、`sku_addon`（若曾用 `sku`/`billing_addon` 需先执行重命名迁移）。
- **客户名称**：订单/分配/线索中客户名称通过请求 `public.spaces` 的 `id,name` 在前端合并展示。
- **RLS**：`crm.ops_users` 使用 `current_ops_user_role()` 等避免 policy 自引用导致 500；其余表按「当前用户在 `ops_users` 中」或 admin 策略控制。
- **新建订单**：`space_orders` 插入时 `source = 'ops_grant'`，`created_by_ops_user_id` 为当前运营 id。

---

## 5. 后续可扩展

- 审计日志：`crm.ops_audit_log` 只读列表与筛选。
- 邀请体系：`referral_codes` / `referral_relations` 的查询与展示。
- 订单编辑：客户订单状态/到期日修改（需 RLS 与审计）。
- 权益包/增购的 admin 编辑（若需在 CRM 内维护 SKU）。
