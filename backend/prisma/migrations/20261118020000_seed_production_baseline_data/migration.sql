-- 1. Base Roles (Ensure all standard roles exist on clean DB)
INSERT INTO "roles" ("id", "name", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'ADMIN', 'System administrator', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SELLER', 'OCOP seller and business owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'VISITOR', 'Public visitor and customer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'EVENT_COORDINATOR', 'OCOP event coordinator', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'WAREHOUSE_MANAGER', 'Warehouse manager scoped to assigned warehouses', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'LOGISTICS', 'Logistics and delivery coordinator', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'QUALITY_ASSURANCE', 'Quality assurance and inspection operator', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- 2. Base Categories (5 Standard OCOP Categories)
INSERT INTO "categories" ("id", "name", "slug", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'Thực phẩm', 'thuc-pham', 'Các sản phẩm nông sản chế biến, đồ khô', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Đồ uống', 'do-uong', 'Trà, cà phê, rượu vang địa phương', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Thảo dược', 'thao-duoc', 'Dược liệu, tinh dầu, thực phẩm chức năng', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Thủ công mỹ nghệ', 'thu-cong-my-nghe', 'Gốm sứ, mây tre đan, dệt thổ cẩm', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Dịch vụ du lịch nông thôn', 'du-lich-nong-thon', 'Homestay, điểm tham quan làng nghề', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "updated_at" = CURRENT_TIMESTAMP;

-- 3. Base OCOP Star Levels (3, 4, 5 stars)
INSERT INTO "ocop_levels" ("id", "level", "title", "color", "icon", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 3, '3 Sao OCOP', '#3498db', 'star-3', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 4, '4 Sao OCOP', '#e67e22', 'star-4', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 5, '5 Sao OCOP', '#f1c40f', 'star-5', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("level") DO UPDATE
SET
  "title" = EXCLUDED."title",
  "color" = EXCLUDED."color",
  "icon" = EXCLUDED."icon",
  "updated_at" = CURRENT_TIMESTAMP;

-- 4. Base Certificate Types (Exact match with schema: id, code, name, description, created_at)
INSERT INTO "certificate_types" ("id", "code", "name", "description", "created_at")
VALUES
  (gen_random_uuid(), 'VIETGAP', 'VietGAP', 'Thực hành sản xuất nông nghiệp tốt tại Việt Nam', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'GLOBALGAP', 'GlobalG.A.P', 'Tiêu chuẩn thực hành nông nghiệp tốt toàn cầu', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ORGANIC_VN', 'Hữu cơ Việt Nam', 'Chứng nhận sản phẩm nông nghiệp hữu cơ TCVN 11041', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'HACCP', 'HACCP', 'Hệ thống phân tích mối nguy và điểm kiểm soát tới hạn', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ISO22000', 'ISO 22000', 'Hệ thống quản lý an toàn thực phẩm tiêu chuẩn quốc tế', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OCOP_STAR', 'Chứng nhận phân hạng OCOP', 'Quyết định công nhận sản phẩm OCOP đạt 3, 4 hoặc 5 sao', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'HALAL', 'Halal', 'Chứng nhận sản phẩm phù hợp luật Hồi giáo', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description";
