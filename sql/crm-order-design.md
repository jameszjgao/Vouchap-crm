# 运营系统 · 订单与 SKU 设计

## 1. 订单（space_orders）与生效规则

- **主体**：每个客户空间（`space`）可有多条订单，一条订单对应一个 SKU。
- **生效订单**：同一 `space_id` 下，**按创建时间 `created_at` 取最新的一条**，且 `status = 'active'`、未过期（`expires_at IS NULL OR expires_at > now()`）的订单为当前生效订单。
- **剩余授权时间**：由生效订单的 `expires_at` 决定；`expires_at` 为 NULL 表示永久有效。业务上“剩余时间”为 `expires_at - now()`（仅当 `expires_at` 非空时有意义）。

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

### 2.3 周期用量（data_limits，按月）

- `quota_period` 默认 `month`。
- **total_vouchers_per_month**：当月所有类型凭证（voucher）合计上限，主应用按“当月新增凭证总数”做校验。
- 可选 per-type 键：`expenses_per_month`、`income_per_month`、`inbound_per_month`、`outbound_per_month`，未启用模块可为 `0` 或省略。
- 主应用在“新增”对应主数据时，按 `total_vouchers_per_month` 做当月总用量校验（或同时按 per-type 做分项校验）。

### 2.4 定价（price_monthly / currency）

- `price_monthly`：月价（数值），**NULL 表示免费**。
- `currency`：货币代码，默认 `USD`。

## 3. 用量增购（billing_addon）

- **规则**：数据用量可增购，如 Data Refill Pack：$20 / 500 entries。
- **表**：`crm.sku_addon`，字段包括 `code`、`units`（每多少条为一档）、`price`、`currency`。
- **预置**：`VCH_ADDON_500` — Data Refill Pack，$20.00 / 500 entries。
- 主应用在用户超量时可按该表计算增购费用或展示增购包文案。

## 4. 预置 SKU 档位（免费试用 + 4 档 VCH 产品，周期为月）

| code       | name            | target                    | members | total vouchers/mo | 模块                          | 月价       | 备注           |
|------------|-----------------|---------------------------|---------|-------------------|-------------------------------|------------|----------------|
| VCH_TRIAL  | Free Trial      | 免费试用                  | 2       | 50                | 四模块全开                    | Free       | 注册即添加，订单 expires_at = 15 天 |
| VCH_BASIC  | Personal        | Individuals & Families   | 2       | 200               | Income & Expenses             | Free       |                |
| VCH_BIZ    | Business        | Freelancers & Small Teams | 20      | 500               | Income & Expenses + Multi-user| $19.99/mo  |                |
| VCH_FLOW   | Smart Flow      | Wholesalers & Trade Agents| 5       | 1,000             | AI-Inbound & Outbound        | $99.99/mo  |                |
| VCH_ELITE  | Enterprise Pro  | Scale-up Businesses      | 不限    | 2,500             | Full Suite + Priority Support | $199.99/mo |                |

- **试用订单**：注册时为该 space 创建一条 `space_orders`，`sku_id` 指向 VCH_TRIAL，`expires_at = started_at + 15 days`，`source = 'registration'`。
- **用量**：`data_limits.total_vouchers_per_month` 为当月凭证总数上限，主应用按当月新增凭证合计做校验。
- **增购**：`crm.sku_addon` 中 `VCH_ADDON_500` — Data Refill Pack, $20.00 / 500 entries.

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

### 6.2 crm.sku_edition

| 字段 | 说明 |
|------|------|
| feature_modules | JSONB，键：expenses, income, inbound, outbound（布尔） |
| data_limits | JSONB，含 members、total_vouchers_per_month；可选 per-type *_per_month |
| period_type | 计费周期：month / year / forever |
| quota_period | 用量统计周期，默认 month |
| price_monthly | 月价，NULL=免费 |
| currency | 货币，默认 USD |

### 6.3 crm.sku_addon

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

| 字段 | 说明 |
|------|------|
| code | 唯一码，如 VCH_ADDON_500 |
| units | 每多少条为一档 |
| price | 该档价格 |
| currency | 货币 |
| is_active | 是否启用 |

## 7. 主应用使用方式

- **当前权益**：调用 `crm.get_space_entitlements(space_id)`，返回当前生效订单对应的 `feature_modules`、`data_limits`、`quota_period`、`sku_code`、`sku_name`、`price_monthly`、`currency`、`expires_at`。
- **剩余授权时间**：从返回的 `expires_at` 计算 `expires_at - now()`。
- **模块开关**：根据 `feature_modules.expenses/income/inbound/outbound` 控制功能是否可用。
- **成员上限**：根据 `data_limits.members` 校验空间成员数（999999 视同不限）。
- **周期用量**：根据 `data_limits.total_vouchers_per_month` 在当月统计新增凭证总数并做上限校验；超量时可结合 `crm.sku_addon`（如 VCH_ADDON_500）做增购计费或提示。
