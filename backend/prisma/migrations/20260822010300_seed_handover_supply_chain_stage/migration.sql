-- Move the existing downstream stages one position without violating the
-- unique order index, then insert the warehouse-to-carrier handover stage.
UPDATE "supply_chain_stages"
SET "order" = -"order"
WHERE "order" >= 7;

UPDATE "supply_chain_stages"
SET "order" = (-"order") + 1,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "order" < 0;

INSERT INTO "supply_chain_stages" (
  "id", "name", "display_name", "icon", "color", "order",
  "description", "created_at", "updated_at"
)
VALUES (
  gen_random_uuid(),
  'HARVEST',
  'Thu hoạch',
  'Sprout',
  '#16A34A',
  1,
  'Nguyên liệu được thu hoạch tại vùng sản xuất',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
), (
  gen_random_uuid(),
  'RECEIVED',
  'Tiếp nhận nguyên liệu',
  'PackageOpen',
  '#2563EB',
  2,
  'Nguyên liệu được tiếp nhận tại cơ sở sản xuất',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
), (
  gen_random_uuid(),
  'QUALITY_INSPECTION',
  'Kiểm định chất lượng',
  'FlaskConical',
  '#7C3AED',
  3,
  'Kiểm tra chất lượng, an toàn thực phẩm theo tiêu chuẩn',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
), (
  gen_random_uuid(),
  'PROCESSING',
  'Chế biến',
  'Factory',
  '#D97706',
  4,
  'Sản phẩm được chế biến, sơ chế theo quy trình',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
), (
  gen_random_uuid(),
  'PACKAGING',
  'Đóng gói',
  'Box',
  '#0891B2',
  5,
  'Đóng gói thành phẩm, dán nhãn, tem OCOP',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
), (
  gen_random_uuid(),
  'WAREHOUSE',
  'Nhập kho',
  'Warehouse',
  '#059669',
  6,
  'Hàng hóa được nhập vào kho bảo quản',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
), (
  gen_random_uuid(),
  'HANDOVER_TO_CARRIER',
  'Bàn giao đơn vị vận chuyển',
  'Handshake',
  '#2563EB',
  7,
  'Quản lý kho xác nhận xuất kho, bàn giao vận đơn và chỉ định nhân viên logistics',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
), (
  gen_random_uuid(),
  'SHIPPING',
  'Đang vận chuyển',
  'Truck',
  '#DC2626',
  8,
  'Nhân viên logistics xác nhận đã nhận hàng và đang vận chuyển',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
), (
  gen_random_uuid(),
  'DISTRIBUTOR',
  'Đại lý / Nhà phân phối',
  'Store',
  '#9333EA',
  9,
  'Hàng hóa được tiếp nhận tại đại lý phân phối',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
), (
  gen_random_uuid(),
  'RETAIL',
  'Bán lẻ',
  'ShoppingCart',
  '#EA580C',
  10,
  'Sản phẩm được bày bán tại điểm bán lẻ',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
), (
  gen_random_uuid(),
  'CUSTOMER',
  'Khách hàng',
  'User',
  '#0D9488',
  11,
  'Sản phẩm đã đến tay khách hàng cuối',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO UPDATE
SET
  "display_name" = EXCLUDED."display_name",
  "icon" = EXCLUDED."icon",
  "color" = EXCLUDED."color",
  "order" = EXCLUDED."order",
  "description" = EXCLUDED."description",
  "updated_at" = CURRENT_TIMESTAMP;
