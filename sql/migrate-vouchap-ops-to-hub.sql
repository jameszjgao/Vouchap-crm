-- One-time copy of Vouchap crm.ops_users / assignments / follow-ups onto the Adaven-CRM Hub.
-- 1) Create matching Auth users on the Hub (same emails).
-- 2) On Vouchap (giuacjbfsyrristkigmz), export:
--      SELECT email, name, role FROM crm.ops_users;
--      SELECT space_id, ou.email, a.role, a.assigned_at
--        FROM crm.ops_assignments a JOIN crm.ops_users ou ON ou.id = a.ops_user_id;
-- 3) On Hub, after inserting ops_users with the NEW Auth user_id, map assignments:

-- INSERT INTO crm.ops_users (user_id, email, name, role)
-- SELECT id, email, raw_user_meta_data->>'name', 'admin'
-- FROM auth.users WHERE email = 'ops@example.com';

-- INSERT INTO crm.ops_assignments (product_id, tenant_id, ops_user_id, role, assigned_at)
-- SELECT 'vouchap', '<space_id>'::uuid, ou.id, 'primary', now()
-- FROM crm.ops_users ou WHERE ou.email = 'ops@example.com';

-- Follow-ups: insert into crm.tenant_follow_ups (product_id, tenant_id, ops_user_id, content, created_at)
-- with product_id = 'vouchap'. Do not alter the Vouchap source tables.
