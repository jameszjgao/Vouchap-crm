-- ============================================================
-- 为已有客户空间批量添加免费试用订单（VCH_TRIAL）
-- 每个 space 一条 order：sku=VCH_TRIAL，started_at=空间注册时间，expires_at=2026-05-01 00:00（统一截止）
-- 仅当该 space 尚无订单时插入，重复执行不会重复插入
-- 依赖 crm.sku_edition 中已存在 code='VCH_TRIAL'
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM crm.sku_edition WHERE code = 'VCH_TRIAL') THEN
    RAISE EXCEPTION 'SKU code VCH_TRIAL not found in crm.sku_edition. Add the Free Trial SKU first.';
  END IF;
END $$;

INSERT INTO crm.space_orders (space_id, sku_id, status, started_at, expires_at, created_at, source)
SELECT
  v.space_id,
  (SELECT id FROM crm.sku_edition WHERE code = 'VCH_TRIAL' LIMIT 1),
  'active',
  v.started_at,
  '2026-05-01 00:00:00+00'::timestamptz,
  now(),
  'registration'
FROM (VALUES
  ('038eb2f4-4c46-4ecc-a859-21e28a6a495b'::uuid, '2026-02-10 00:37:37.634409+00'::timestamptz),
  ('0c3e75e0-2849-4c77-ac5e-35201de59564'::uuid, '2026-02-09 18:42:47.583954+00'::timestamptz),
  ('1a426873-c104-4db9-bf8f-386d1b78b3b0'::uuid, '2026-02-09 18:36:13.043072+00'::timestamptz),
  ('50b1d105-3f09-4a04-a194-0a6d30042bc8'::uuid, '2026-02-09 15:30:44.950737+00'::timestamptz),
  ('52e6940e-365e-4857-8db1-dfd9a6dfbd88'::uuid, '2026-01-12 06:25:03.256707+00'::timestamptz),
  ('57ba873b-0044-49b5-bd52-eceec855feb2'::uuid, '2026-02-09 15:07:34.7127+00'::timestamptz),
  ('5d39f556-2007-446c-b9ff-c87611dfb169'::uuid, '2026-02-09 16:59:19.923717+00'::timestamptz),
  ('6985ec23-6c54-46b1-86e5-7fe311d5e0a5'::uuid, '2026-02-09 16:36:21.466321+00'::timestamptz),
  ('88aab6f4-84b1-4c48-a971-7a9600dfccbc'::uuid, '2026-01-09 15:50:36.952282+00'::timestamptz),
  ('8b3f70cf-06df-41ed-a836-de82a1fa87e5'::uuid, '2026-01-10 17:06:07.656303+00'::timestamptz),
  ('8d2ed710-668c-46e2-81d5-1e63e834c23a'::uuid, '2026-02-09 21:59:20.625382+00'::timestamptz),
  ('92f57b48-fdd7-4eef-a193-c06d93f7d389'::uuid, '2026-02-09 15:53:45.253123+00'::timestamptz),
  ('9b3a5472-dc30-4086-b00a-08e67958f7e7'::uuid, '2026-01-12 00:51:39.546279+00'::timestamptz),
  ('c522638a-9f07-44c9-96b0-1c51277aba9f'::uuid, '2026-02-09 16:53:50.8578+00'::timestamptz),
  ('cb8ef2c4-34df-4441-a389-b09e1eb2dbcf'::uuid, '2026-02-08 20:12:35.759977+00'::timestamptz),
  ('ce54466a-ad33-4740-b335-69df6759cc03'::uuid, '2026-01-14 02:57:17.636582+00'::timestamptz),
  ('d536c7e2-3ece-40fe-b56f-b876c43e0747'::uuid, '2026-02-06 07:08:08.434787+00'::timestamptz),
  ('dba94cbb-0272-4cea-8ca0-c679c2d99f55'::uuid, '2026-01-08 06:20:00.699062+00'::timestamptz),
  ('e07743f1-224b-4822-bf50-47abb3dff581'::uuid, '2026-01-17 03:05:47.367395+00'::timestamptz),
  ('ea1916ab-648d-40df-a1d3-2a350346a7be'::uuid, '2026-02-09 17:18:47.131642+00'::timestamptz),
  ('fd5d1c80-74cb-47f6-bfdb-305bfc2eb358'::uuid, '2026-01-08 15:31:54.024981+00'::timestamptz),
  ('fedc742c-5b34-47ec-a9a3-ce4b1f9e1167'::uuid, '2026-01-08 05:08:15.903706+00'::timestamptz)
) AS v(space_id, started_at)
WHERE NOT EXISTS (SELECT 1 FROM crm.space_orders o WHERE o.space_id = v.space_id);
