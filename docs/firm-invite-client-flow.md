# Firm 邀请 Client 业务流程与分支方案

## 1. 现状与可复用能力

### 1.1 Website 邮件确认页（auth/confirm）

- **位置**：`vouchap-website/app/auth/confirm/page.tsx`
- **能力**：
  - 支持类型：`recovery`、`signup`、`invite`、`email_change`（Supabase Auth 魔术链接）
  - **移动端**：识别 UA 后自动跳转深链 `vouchap://auth/confirm?…`，并提供「Open App」按钮
  - **PC 端**：展示「扫码在 App 打开」的二维码（内容为深链）+「Continue in browser」跳转 Web 应用
  - 深链与 Web 确认页共用同一套 query/hash 参数
- **可复用点**：同一套「设备判断 + 深链/二维码/浏览器继续」的交互模式，可直接套用到「空间邀请」落地页。

### 1.2 CRM 邀请码能力

- **表**：`crm.referral_codes`（一用户一码）、`crm.referral_relations`（被邀请人 ↔ 邀请码）
- **用途**：用户拉新注册的**转介绍**（谁邀请了谁），与「Firm 邀请 Client 加入空间」是不同场景。
- **结论**：Firm 邀请 Client 不直接复用 referral 表；邀请关系以 `space_invitations` + 可选「开放加入」 token 为主。

### 1.3 主应用（vouchap-app）空间邀请

- **表**：`space_invitations`（id, space_id, inviter_id, inviter_email, invitee_email, space_name, status, created_at, accepted_at）
- **创建**：空间管理员在 App 内输入被邀请人邮箱 → `create_space_invitation` RPC → 可选发邮件（Edge Function `send-invitation-email`）
- **链接形态**：当前为 **App 深链** `vouchap://invite/{invitationId}` 或开发环境 `exp://…/invite/{invitationId}`，**无网站落地页**
- **App 内处理**：`invite/[id].tsx` 用 `invitationId` 拉邀请 → 已登录且邮箱匹配 → 带 `inviteId` 回 `/login` 走确认浮窗；未登录则按邮箱是否已注册 → `/login` 或 `/register`，并带上 `inviteId`、`email`
- **接受/拒绝**：`handle-invitations` 中 `acceptInvitation` / `declineInvitation`，接受后写入 `user_spaces` 并更新邀请状态

**缺口**：邮件/二维码若在 **PC 或手机浏览器** 打开，没有统一落地页，无法友好引导到 App 或 Web 端。

---

## 2. 目标与约束

- **邀请方式**：  
  - 方式 A：分享**二维码图片**（扫码后打开链接）  
  - 方式 B：发送**带链接的邮件**
- **客户入口**：可能从 **PC 打开邮件/链接**，也可能从 **手机** 打开。
- **客户状态**：  
  - 已安装 App 且已有空间（可能已有账号、可能已是该空间成员）  
  - 已安装 App 但尚未加入该空间  
  - 未注册 / 未安装 App  

需要在这三种入口 × 多种状态下，统一、可预期地完成「验证邀请 → 登录/注册（如需）→ 接受邀请加入空间」。

---

## 3. 统一链接策略与落地页

### 3.1 规范链接形态

- **唯一权威链接**：使用 **网站 URL** 作为邮件和二维码的目标，便于 PC/移动端统一体验与统计。
- 建议形态：
  - **指定邮箱邀请**：`https://{website}/invite/{invitationId}`  
    - 其中 `invitationId` 为 `space_invitations.id`（UUID）。
  - （可选）**开放加入（无预填邮箱）**：`https://{website}/invite/join?token={spaceJoinToken}`  
    - 见下文「可选：开放加入 token」。

邮件内与二维码中均使用上述网站链接；App 内或后续步骤再通过「Open in App」或「Continue in browser」跳转到深链或 Web 应用。

### 3.2 Website 邀请落地页（新建）

- **路由**：`/invite/[id]`（或 `/invite/join` 处理 token，若实现开放加入）
- **职责**：
  1. **校验**：根据 `id`（或 token）调用后端/Edge 校验邀请是否存在、status 是否为 pending、是否过期（若有过期策略）。
  2. **展示**：空间名称、邀请方（inviter 名称或邮箱）、简要说明「您被邀请加入 xxx 空间」。
  3. **设备与去向**（复用 auth/confirm 的交互）：
     - **移动端**：  
       - 主操作：「Open in App」→ 深链 `vouchap://invite/{invitationId}`（或等价 path）。  
       - 备选：「Continue in browser」→ `{WEB_APP_BASE}/invite/{invitationId}`（Web 端处理同逻辑）。
     - **PC 端**：  
       - 展示「扫码在 App 打开」的二维码（内容为 `vouchap://invite/{invitationId}`）。  
       - 「Continue in browser」→ Web 应用同一路径。
  4. **未安装 App**：提供 App Store / Google Play 下载入口（与 auth/confirm 一致）。
- **与 auth/confirm 的复用**：布局、设备检测、二维码生成、深链与 WEB_APP_BASE 的拼接方式可直接参考或抽成共用组件。

### 3.3 深链与 Web 应用路径约定

- **App 深链**：`vouchap://invite/{invitationId}`  
  - 保持与现有 `invite/[id].tsx` 一致，参数为邀请 ID。
- **Web 应用**：`{WEB_APP_BASE}/invite/{invitationId}`  
  - Web 端需实现与 App 一致的「按 invitationId 校验 → 登录/注册 → 接受/拒绝」流程（或重定向到 App 的深链）。

---

## 4. 分支处理矩阵（按入口与客户状态）

| 入口 | 客户状态 | 行为 |
|------|----------|------|
| **PC 打开邮件/链接** | 任意 | 进入 **Website `/invite/{id}`** → 见下方「按登录与邮箱」 |
| **手机打开邮件/链接** | 任意 | 同上，先到 Website → 再选「Open in App」或「Continue in browser」 |
| **扫码二维码** | 任意 | 同上（二维码为网站 URL 或深链见 4.2） |

在 **Website 落地页** 或 **App/Web 应用内** 统一按「是否已登录」与「邮箱是否匹配」分支：

| 是否已登录 | 邮箱与邀请是否一致 | 行为 |
|------------|--------------------|------|
| 是 | 一致 | 直接进入「接受/拒绝」流程；若已是该空间成员则仅更新邀请状态并可选切换当前空间。 |
| 是 | 不一致 | 提示「该邀请面向 xxx@...，请退出当前账号并使用该邮箱」；不暴露其他邮箱全文时可仅显示脱敏。 |
| 否 | 邀请有指定邮箱 | 按该邮箱是否已注册：**已注册** → 跳转登录（预填 email + inviteId）；**未注册** → 跳转注册（预填 email + inviteId），注册完成后自动进入接受流程。 |
| 否 | 开放加入（无指定邮箱） | 先登录/注册；完成后用当前用户邮箱创建或匹配邀请（见 5.2）。 |

**「已安装 App 且已有空间」** 的细分：

- 若当前用户**已是本空间成员**：仅更新邀请状态为 accepted，并可选切换到该空间，无需再次插入 `user_spaces`。
- 若当前用户**有账号、有空间，但不是本空间成员**：正常走接受流程，插入 `user_spaces`，并切换当前空间。

---

## 5. 两种邀请方式的具体流程

### 5.1 方式一：邮件中的链接（指定邮箱）

1. **Firm 侧**（在 App 或 CRM/Web 管理端）：输入 Client 邮箱 → 调用现有 `create_space_invitation`（或等价 API）→ 生成 `space_invitations` 记录，得到 `invitationId`。
2. **发邮件**：邮件中的链接为 `https://{website}/invite/{invitationId}`（不再直接使用 `vouchap://...` 作为主链接）。
3. **Client 侧**：  
   - 点击链接 → 打开 Website `/invite/[id]` → 校验邀请 → 选择「Open in App」或「Continue in browser」。  
   - 之后按上表：已登录且邮箱匹配 → 接受/拒绝；未登录 → 登录/注册（带 inviteId + email）→ 再接受/拒绝。
4. **过期与撤销**：沿用现有 `space_invitations.status`（pending/accepted/expired/cancelled/declined/removed）；若需「过期时间」，可在表上增加 `expires_at` 或由业务层约定。

### 5.2 方式二：二维码图片（可指定邮箱或开放加入）

- **指定邮箱**：Firm 先创建邀请（同上），得到 `invitationId`；**二维码内容**为 `https://{website}/invite/{invitationId}`。Client 扫码后与「方式一」完全一致。
- **不指定邮箱（开放加入）**：  
  - 需新增「空间开放加入 token」的生成与校验（见下节）。  
  - 二维码内容为 `https://{website}/invite/join?token=xxx`。  
  - 落地页校验 token 后，若未登录则先登录/注册；登录后用**当前用户邮箱**在后台创建一条 `space_invitations`（或直接按 token 将当前 user 加入 space），再走同一套接受/展示逻辑。  
  - 若产品暂不做「开放加入」，可仅支持「先创建邀请再生成二维码」的指定邮箱方式。

---

## 6. 可选：开放加入 Token（QR 不预填邮箱）

若需要「仅分享二维码、不预先填写 Client 邮箱」：

- **存储**：新增表或 CRM 扩展，例如 `space_join_tokens`：`space_id`、`token`（唯一）、`expires_at`、`created_by`（inviter_id）。  
  或复用/扩展 `space_invitations`：如增加 `invitee_email` 可为 NULL 且用 `token` 字段表示「开放加入」。
- **生成**：Firm 在 App/CRM 点击「生成邀请二维码」且不填邮箱时，创建一条 token 记录，二维码链接为 `https://{website}/invite/join?token=xxx`。
- **校验**：Website `/invite/join` 根据 token 查 space_id、过期时间；通过则展示空间名与邀请方，未登录则引导登录/注册，登录后：
  - 用当前用户 email 创建一条 `space_invitations`（pending）并重定向到 `/invite/{invitationId}`，或  
  - 直接按 token 将当前 user_id 加入 `user_spaces`（视产品是否要求「必须有一条邀请记录」而定）。

CRM 侧若需要统计「通过开放链接加入」的线索，可在 `space_invitations` 或 `space_join_tokens` 上增加 `source=email_link` / `source=qr` 等字段。

---

## 7. 与 CRM 的衔接（可选）

- **线索**：现有线索来自 `public.spaces` + `crm.ops_assignments`；通过邀请加入的新成员仍属于同一 space，无需新建线索，仅空间成员数变化。  
- **邀请记录**：若 CRM 需要查看「某空间发出的邀请及状态」，可读 `space_invitations`（需主应用暴露只读 API 或 Supabase 跨 schema 查询/视图）。  
- **referral_codes**：继续用于「用户拉新」的转介绍；Firm 邀请 Client 不写 `referral_relations`，除非产品明确希望「被 Firm 邀请的 Client 也算作某人的 referral」。

---

## 8. 实现清单（方案确定后开发顺序建议）

1. **Website**
   - [ ] 新增 `/invite/[id]` 页面：校验 `space_invitations`、展示空间名与邀请方、设备判断、深链/二维码/「Continue in browser」。
   - [ ] （可选）`/invite/join?token=xxx`：校验开放加入 token，未登录引导登录/注册，登录后创建邀请或直接加入空间并重定向。
   - [ ] 与 auth/confirm 复用：设备检测、二维码生成、WEB_APP_BASE / 深链拼接可抽成公共组件或 util。

2. **主应用（vouchap-app）**
   - [ ] 邮件中的链接改为 `https://{website}/invite/{invitationId}`（配置 website 域名）；发邮件时仍可附带「在 App 中打开」的深链作为次要入口。
   - [ ] 若 Web 端有「Continue in browser」：确保 Web 应用有 `/invite/[id]` 的等价逻辑（校验 → 登录/注册 → 接受/拒绝），与 App 的 `invite/[id].tsx` 行为一致。
   - [ ] （可选）「生成邀请二维码」：生成 `https://{website}/invite/{invitationId}` 或带 token 的 join 链接，并生成二维码图片供下载/分享。

3. **后端 / 数据**
   - [ ] 邀请校验 API：供 Website 无状态校验邀请是否有效（id/token → space_id、inviter、status、过期）；可用 Supabase Edge Function 或 Public RPC，避免暴露 RLS 细节。
   - [ ] （可选）`space_join_tokens` 或扩展 `space_invitations`：开放加入 token 的生成、校验与过期。

4. **CRM**
   - [ ] 若需在 CRM 中「发邀请」：提供按 space + 邮箱创建邀请的入口，并展示邀请链接或二维码（链接指向 Website `/invite/{id}`）。
   - [ ] （可选）只读展示某空间的邀请列表及状态（pending/accepted/expired 等）。

---

## 9. 小结

- **统一入口**：邮件与二维码均使用 **Website `/invite/{id}`**（及可选的 `/invite/join?token=`），再在落地页按设备引导至 App 或浏览器。
- **分支清晰**：按「是否已登录」「邮箱是否与邀请一致」「是否已为该空间成员」在 App/Web 内统一处理；Website 只负责校验与跳转，不承载登录/注册表单（可跳转到主应用或 Web 应用对应页）。
- **复用**：Website 的 auth/confirm 的「设备判断 + 深链/二维码/Continue in browser」交互可直接复用到邀请页；主应用现有 `space_invitations` 与接受/拒绝逻辑保持不变，仅「链接形态」与「首屏落地」改为网站优先。
- **可选扩展**：开放加入 token 用于「仅二维码、不填邮箱」场景；CRM 仅需在需要时增加创建邀请与查看邀请状态的入口。

方案确定后，可按上述清单分步实现并先上线「指定邮箱 + 网站落地页」，再视需求增加「开放加入」与 CRM 深度集成。
