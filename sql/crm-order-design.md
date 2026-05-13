# 运营系统 · 订单与 SKU 设计

## 1. 订单（space_orders）与生效规则（2026-05 修订）

- **主体**：每个空间（`space`）可有多条 `crm.space_orders`，一条订单对应一个 `crm.sku_edition`。
- **两类订单（由 `sku_edition.data_limits.billing_kind` 区分）**  
  1. **在服订阅** `space_subscription`：`expires_at` **必填**（试用 30 天、月付/年付结束时间）；决定 Client 月包识别量、Firm 当前订阅周期内的 engagement **消耗型**上限等。  
  2. **永久 credit 包** `recognition_credit_pack` / `engagement_credit_pack`：`expires_at` **为 NULL**；Client 识别增购入账 `space_billing_state`；Firm engagement 增购在同订阅窗口内通过 `metadata.engagement_credits_added`（及兼容旧键 `engagement_addon_slots`）计入上限。
- **当前在服订阅（业务选用）**：`crm._active_space_subscription_row(space_id)` — 仅 `billing_kind = space_subscription` 且 `status = active` 且 `expires_at > now()`；**付费优先于试用**（`is_trial` 升序 + `created_at` 降序）。与「全表仅取最新一条」不同：credit 包可与订阅**并存**。
- **聚合读取**：`crm.get_space_entitlements(space_id)`（成员可调用）返回当前订阅、Client 识别快照、Firm 周期内 engagement 用量等。

## 2. 订单关联的 SKU 约定

订单通过 `sku_id` 关联 `crm.sku_edition`，SKU 版本定义功能模块、成员上限、周期用量与定价。

### 2.1 功能模块（feature_modules）

约定客户空间可用的模块，键与含义：

| 键         | 含义     |
|------------|----------|
| `expenses` | 支出模块 |
| `income`   | 收入模块 |
| `inbound` | 入库模块 |
| `outbound`| 出库模块 |

每个键为布尔值，`true` 表示该模块可用。

### 2.2 空间成员上限（data_limits.members）

- 键：`members`
- 含义：该空间允许的成员数量上限（整数）。`999999` 表示视同不限。

### 2.3 当前计费模型（2026-05：以订单为权益来源）

1. **Firm：在服订阅 + 订阅周期内「已关联 project」的 engagement 消耗 + 增购**  
   - 在服 SKU：`FIRM_ANNUAL`、`FIRM_TRIAL_30` 等，`billing_kind=space_subscription`，`data_limits.engagement_included_per_subscription_year`（及兼容旧键 `engagements_included` / `engagement_credits_included`）。  
   - **计数窗口**：当前在服订单的 `[started_at, expires_at)`。窗口内 **`firm.orders` 且存在 `public.projects`（`projects.order_id = orders.id`）且 `status <> 'cancelled'`** 计为已消耗；**不**再按「建单即计数」。  
   - **创建前预检**：`crm.assert_firm_can_create_engagement` — 若 `(已关联 project 的订单数) + (窗口内 onboarding 且尚无 project 的草稿数) >= 上限` 则拒绝，避免无限草稿占满额度。  
   - **首次落 project 前预检**：`crm.assert_firm_can_confirm_engagement(order_id)` — 在 `confirmOrderAndCreateProjectTodos` 插入 `public.projects` 之前执行；若订单尚无 project 且窗口内已关联数已达上限则拒绝（与创建侧对称）。  
   - **增购**：`ENGAGEMENT_CREDIT_PACK` 订单（永久）在同窗口内且 `started_at` 落在窗口内的 `metadata` 之和；**兼容**：当前在服订阅行自身上的 `metadata.engagement_credits_added` / `engagement_addon_slots` 仍计入上限。  
   - 运行时：`crm.assert_firm_can_create_engagement` / `crm.assert_firm_can_confirm_engagement`；无在服订阅抛 `ENGAGEMENT_NO_SUBSCRIPTION`。  
   - **聚合只读**：`crm.get_space_entitlements` 中 `firm_engagement.used_in_period` = 上述已关联数；`pending_onboarding` = 窗口内 onboarding 且无 project 的订单数。

2. **Client：在服订阅月包 + 永久 recognition credit（成功才消耗）**  
   - 在服 SKU：`CLIENT_TRIAL_30`、`CLIENT_PAID_MONTHLY` 等；`recognition_included_per_month` 来自**当前在服订单**对应 SKU，无订阅则为 0（仅可走增购余额）。  
   - **消耗口径**：`crm.record_client_recognition_success` 仅在 **AI 识别成功** 路径扣减；`crm.client_recognition_monthly_usage.success_count` 与 `used_this_month` 一致。  
   - **`get_space_entitlements` · `client_recognition`**：`included_remaining` = 当前 UTC 月内订阅档剩余次数（含 processing 关联时的月度硬顶后再与 included 取小）；`credits_balance` 为增购余额。  
   - 增购：`RECOGNITION_CREDIT_PACK` + `metadata.recognition_credits_added`，触发器入账 `crm.space_billing_state`（仅当 SKU 为 `recognition_credit_pack` 或历史无 `billing_kind` 的兼容行）。  
   - 目录 `CLIENT_RECOGNITION_BASE`：`billing_kind=catalog_policy`，仅作缺省模板/回退，**不作为**无订单时的免费权益来源。  
   - 与 firm 关联且存在 `firm.orders.status=processing` 时，仍适用月度硬顶 100（UTC 月）。

3. **Firm 签约 client：增量 recognition credits**（未变）  
   - 目录 `FIRM_CLIENT_SIGNING_BONUS`；首条 `firm.orders` 触发器向 client 空间增加 credits。

### 2.4 定价字段（price_monthly / price_yearly / currency）

- `price_monthly` / `price_yearly`：标价；**NULL** 表示未标价或免费目录项。  
- `currency`：默认 `USD`。  
- `sku_addon` 中参考包可用 `price=0` 表示「仅 CRM 报价、无固定目录价」。

## 3. sku_addon（参考包）

- **ENGAGEMENT_CREDITS_REF** / **CLIENT_RECOGNITION_CREDITS_REF**：形状参考（units + price），实际入账仍以 `space_orders.metadata` 为准。

## 4. 注册与空间创建

- `public.spaces` **AFTER INSERT** 触发器 `trg_spaces_crm_on_created` → `crm.on_space_created()`：除 `ops_assignments` 外，自动插入 **30 天试用** `space_orders`（`CLIENT_TRIAL_30` / `FIRM_TRIAL_30`，`source=registration`，`expires_at = now()+30 days`）。
- 存量空间可通过迁移一次性补 `2026-05-01` 起 30 天试用订单（`source=ops_grant`），且跳过已有在服订阅的空间。

## 5. 线索、运营分配、邀请码与转介绍

### 5.0 概念

- **线索**：每条线索 = 一个空间的创建者（通常用空间创建者 email 标识）。每条线索应分配给**一个**运营人员，在该运营界面列出其负责的所有空间/线索。
- **运营分配**：每个空间有且仅有一个负责的运营人员（`crm.ops_assignments`：每 `space_id` 唯一）。
- **邀请码**：一用户一码，用户**首次发起邀请时**自动创建（`crm.referral_codes`：`id`、`user_id`、`referral_code`）。
- **邀请关系**：被邀请者 user_id + 邀请码 id（`crm.referral_relations`：`id`、`referee_user_id`、`referrer_code_id`）。每个用户有邀请码，有的用户有邀请人（其 user_id 在 referral_relations 中作为 referee_user_id）。

### 5.0.1 表约定

| 表 | 约定 |
|----|------|
| **ops_assignments** | 每 space 仅能分配给一个运营（`space_id` UNIQUE）；运营界面按 `ops_user_id` 列出其负责的空间/线索。 |
| **referral_codes** | 一用户一码：`id`、`user_id`（UNIQUE）、`referral_code`（UNIQUE）；首次发起邀请时自动创建。 |
| **referral_relations** | `id`、`referee_user_id`（被邀请者 auth 用户 id，UNIQUE）、`referrer_code_id`（邀请码 id）。 |

## 6. 表结构摘要

### 6.1 crm.space_orders

| 字段 | 说明 |
|------|------|
| id | 主键 |
| space_id | 客户空间 ID |
| sku_id | 关联 crm.sku_edition |
| status | pending / active / expired / cancelled |
| started_at | 订单开始时间 |
| expires_at | 授权到期时间，NULL 表示永久 |
| created_at | 创建时间，**用于取“最新生效订单”** |
| created_by_ops_user_id | 创建人（运营） |
| source | registration / purchase / ops_grant |
| metadata | JSONB：firm 用 `engagement_credits_added`；client 用 `recognition_credits_added` |

### 6.2 crm.sku_edition

| 字段 | 说明 |
|------|------|
| feature_modules | JSONB，键：expenses, income, inbound, outbound（布尔） |
| data_limits | JSONB：因 SKU 而异（如 `engagement_credits_included`、`recognition_included_per_month`、`recognition_credits_per_signing`） |
| period_type | 计费周期：month / year / forever |
| quota_period | 用量统计周期，默认 month |
| price_monthly | 月价，NULL=免费 |
| price_yearly | 年价（可选） |
| currency | 货币，默认 USD |

### 6.3 crm.sku_addon

| 字段 | 说明 |
|------|------|
| code | 唯一码，如 ENGAGEMENT_CREDITS_REF |
| units | 每包单位数（参考） |
| price | 参考价（0表示另议） |
| currency | 货币 |
| is_active | 是否启用 |

### 6.4 crm.ops_assignments（线索分配）

| 字段 | 说明 |
|------|------|
| ops_user_id | 运营人员 id |
| space_id | 空间 id，**UNIQUE**（每空间仅能分配给一个运营） |
| role | primary 等 |

### 6.5 crm.referral_codes（邀请码）

| 字段 | 说明 |
|------|------|
| id | 主键 |
| user_id | 归属用户（auth.users.id），**UNIQUE**（一用户一码） |
| referral_code | 邀请码，**UNIQUE**；首次发起邀请时自动创建 |

### 6.6 crm.referral_relations（邀请关系）

| 字段 | 说明 |
|------|------|
| id | 主键 |
| referee_user_id | 被邀请者（auth.users.id），**UNIQUE**（一人只能被邀请一次） |
| referrer_code_id | 邀请码 id |

## 7. 主应用使用方式

- **当前权益**：调用 `crm.get_space_entitlements(space_id)`，返回当前生效订单对应的 `feature_modules`、`data_limits`、`quota_period`、`sku_code`、`sku_name`、`price_monthly`、`currency`、`expires_at`。
- **剩余授权时间**：从返回的 `expires_at` 计算 `expires_at - now()`。
- **模块开关**：根据 `feature_modules.expenses/income/inbound/outbound` 控制功能是否可用。
- **Firm engagements**：`crm.assert_firm_can_create_engagement`（新建 onboarding 前）、`crm.assert_firm_can_confirm_engagement`（首次写入 `public.projects` 前）；**Client AI 识别**：`crm.get_client_recognition_quota` / `crm.record_client_recognition_success`。
