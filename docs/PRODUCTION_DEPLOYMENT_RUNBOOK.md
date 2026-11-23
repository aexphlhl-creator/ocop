# OCOP Production Deployment & Operations Runbook

## 1. Giới thiệu & Phạm vi
Tài liệu này là cẩm nang vận hành và hướng dẫn triển khai hệ thống Sàn thương mại điện tử và Truy xuất nguồn gốc OCOP lên môi trường Production.
Tài liệu bao gồm:
1. Quy trình khởi tạo trên Cơ sở dữ liệu trắng (Clean Database Initialization).
2. Tạo tài khoản Quản trị viên tối cao đầu tiên (First Admin Provisioning).
3. Danh mục biến môi trường bắt buộc & nguyên tắc an ninh mạng (Environment Variables Checklist).
4. Quy trình sao lưu & phục hồi thảm họa (Backup & Disaster Recovery).
5. Vận hành giám sát hệ thống (Monitoring & Observability).
6. Quy trình nâng cấp & quay lui khẩn cấp (Deployment & Rollback Procedure).

---

## 2. Quy trình khởi tạo trên Cơ sở dữ liệu trắng (Fresh DB Initialization)

Hệ thống OCOP được thiết kế để khởi tạo trên PostgreSQL trắng hoàn toàn mà không để lại bất kỳ tài khoản mặc định hay mật khẩu demo nào.

### Bước 2.1: Triển khai lược đồ cơ sở dữ liệu
Chạy các migrations chính thức của Prisma lên cơ sở dữ liệu production:
```bash
cd backend
npx prisma migrate deploy
```
*Ghi chú: Toàn bộ 30 migrations (bao gồm migration nền tảng `20261118020000_seed_production_baseline_data`) sẽ được áp dụng tự động, tạo đủ bảng, quan hệ, và nạp các danh mục tĩnh (5 nhóm ngành OCOP, 3 cấp sao 3-5, các vai trò hệ thống, giai đoạn chuỗi cung ứng chuẩn).*

### Bước 2.2: Nạp dữ liệu nền tảng (Baseline Seeding)
Chạy lệnh seed production (tuyệt đối không bật cờ `DEMO_MODE=true`):
```bash
cd backend
npm run seed:prod
# hoặc npx ts-node prisma/seed.ts
```
*Cơ chế an toàn: `prisma/seed.ts` được lập trình để chỉ nạp danh mục ngành hàng, cấp sao, vai trò chuẩn. Toàn bộ tài khoản demo, sản phẩm demo, tin tức demo bị vô hiệu hóa hoàn toàn khi không có cờ `DEMO_MODE=true`.*

### Bước 2.3: Tạo Quản trị viên đầu tiên (First Admin Provisioning)
Chạy công cụ CLI tạo tài khoản Admin an toàn theo một trong các phương thức:

**Cách 1: Chạy CLI với tham số dòng lệnh (Khuyến nghị cho Admin vận hành):**
```bash
cd backend
node scripts/create-admin.mjs --email "admin@yourdomain.gov.vn" --password "$ADMIN_PASSWORD" --name "Quản trị viên Hệ thống OCOP"
```
*(Trong đó `$ADMIN_PASSWORD` do người vận hành nhập trực tiếp hoặc sinh từ password manager an toàn, tuyệt đối không dùng mật khẩu mẫu cố định).*

**Cách 2: Chạy qua biến môi trường không tương tác (CI/CD / Provisioning script):**
```bash
cd backend
INIT_ADMIN_EMAIL="admin@yourdomain.gov.vn" \
INIT_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
INIT_ADMIN_NAME="Quản trị viên Hệ thống OCOP" \
npm run admin:create
```
*Lưu ý: Script hỗ trợ cả tiền tố `INIT_ADMIN_*` và `ADMIN_*` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME`).*

**Chính sách bảo mật tài khoản khởi tạo:**
- Mật khẩu phải đạt tối thiểu 10 ký tự, chứa cả chữ hoa, chữ thường, chữ số và ký tự đặc biệt (!@#$%^&*...).
- Sử dụng thuật toán băm Argon2id tiêu chuẩn khuyến nghị của OWASP.
- Cờ `mustChangePassword` tự động kích hoạt (`true`), buộc Admin phải đổi mật khẩu ngay lần đăng nhập đầu tiên trên Dashboard.
- Không thể tạo tài khoản trùng lặp nếu hệ thống đã có tài khoản Quản trị viên đang hoạt động (chống ghi đè chiếm quyền).

### Bước 2.4: Admin tạo Seller đầu tiên
Admin đăng nhập vào Dashboard Quản trị (`/login`), vào mục **Quản lý Hợp tác xã/Chủ thể (Sellers)** để tạo tài khoản Chủ thể OCOP đầu tiên.
Chủ thể sau khi được tạo có thể truy cập ngay `/dashboard/products` để đăng bán sản phẩm đầu tiên mà không phụ thuộc vào bất kỳ sản phẩm tiền nhiệm nào, nhờ vào API danh mục ngành hàng và cấp sao độc lập (`/api/v1/categories`, `/api/v1/ocop-levels`).

---

## 3. Danh mục biến môi trường bắt buộc (Production Env Checklist)

| Tên biến | Bắt buộc | Mô tả & Khuyến nghị bảo mật |
| :--- | :---: | :--- |
| `NODE_ENV` | Có | Phải đặt là `production`. |
| `PORT` | Có | Cổng backend lắng nghe (thường là `3000`). |
| `DATABASE_URL` | Có | Chuỗi kết nối PostgreSQL: `postgresql://user:pass@host:5432/ocop_db?schema=public&sslmode=prefer`. |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Có | Thông số kết nối Redis cụm nội bộ (BullMQ queue, cache, rate-limit). |
| `JWT_SECRET` | Có | Chuỗi ngẫu nhiên tối thiểu 32 byte (Hex/Base64) ký Access Token. |
| `JWT_REFRESH_SECRET` | Có | Chuỗi ngẫu nhiên tối thiểu 32 byte ký Refresh Token (khác `JWT_SECRET`). |
| `MINIO_ENDPOINT` | Có | Hostname S3 nội bộ giữa các container (VD: `minio` hoặc `10.0.0.5`). |
| `MINIO_PORT` | Có | Cổng S3 API nội bộ (mặc định `9000`). |
| `MINIO_USE_SSL` | Có | `true` nếu S3 gateway hỗ trợ TLS, `false` nếu chạy nội mạng backend. |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | Có | Khóa định danh truy cập MinIO Object Storage. |
| `MINIO_BUCKET` | Có | Tên bucket lưu trữ (VD: `ocop-media`). |
| `MINIO_PUBLIC_URL` | Có | **Bắt buộc cho Production**: URL công khai qua CDN/Reverse-Proxy (VD: `https://media.ocop.vn`). Tránh lộ endpoint/console nội bộ. |
| `CARRIER_WEBHOOK_SECRETS` | Có | JSON Map cấu hình khóa HMAC bí mật theo từng đơn vị vận chuyển: `{"GHN":"secret_key_32_chars","GHTK":"secret_key_32_chars"}`. |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` | Khi bật TT | Mã merchant và khóa bí mật tích hợp Cổng thanh toán VNPAY chính thức. |
| `FRONTEND_URL` | Có | Domain chính thức của ứng dụng Web (VD: `https://ocop.vn`). |

---

## 4. An ninh Hạ tầng mạng (Network Hardening)

Cấu hình mẫu trong `docker-compose.prod.yml`:
- **PostgreSQL (5432):** Không công khai cổng ra Internet (`ports` không ánh xạ ra `0.0.0.0`). Chỉ backend container trong mạng Docker `ocop-network` mới có quyền truy vấn.
- **Redis (6379):** Không công khai cổng ra Internet. Luôn cấu hình mật khẩu mạnh (`requirepass`).
- **MinIO Console (9001):** Chỉ bind vào `127.0.0.1:9001` để truy cập qua SSH Tunnel nội bộ hoặc VPN quản trị.
- **MinIO S3 API (9000):** Chỉ bind vào `127.0.0.1:9000` phục vụ Nginx reverse proxy hoặc CDN phân phối media tĩnh qua tên miền phụ `media.ocop.vn`.

---

## 5. Sao lưu & Phục hồi thảm họa (Backup & Disaster Recovery)

### 5.1. Sao lưu Cơ sở dữ liệu PostgreSQL
Thiết lập cron job định kỳ hàng ngày (02:00 sáng):
```bash
# Full snapshot sao lưu logic
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -F c -b -v -f "/var/backups/ocop/db_$(date +%Y%m%d_%H%M%S).dump"

# Duy trì WAL Archiving (Point-in-Time Recovery - PITR)
archive_mode = on
archive_command = 'test ! -f /var/lib/postgresql/wal_archive/%f && cp %p /var/lib/postgresql/wal_archive/%f'
```

### 5.2. Sao lưu Tệp tin Media (MinIO)
Đồng bộ hóa dữ liệu MinIO sang kho lưu trữ thứ cấp hoặc dịch vụ S3 tương thích:
```bash
# Sử dụng MinIO Client (mc)
mc mirror --overwrite /data/minio/ocop-media s3-backup/ocop-media-backup/
```

### 5.3. Quy trình phục hồi khi gặp sự cố
1. Ngừng tạm thời traffic tại Load Balancer (trả về trang 503 Maintenance).
2. Xóa hoặc khởi tạo cơ sở dữ liệu mới sạch sẽ.
3. Phục hồi dữ liệu từ bản sao lưu gần nhất:
```bash
pg_restore -h $DB_HOST -U $DB_USER -d $DB_NAME -v "/var/backups/ocop/db_TARGET_DATE.dump"
```
4. Kiểm tra tính toàn vẹn dữ liệu và phiên bản migration:
```bash
npx prisma migrate status
```
5. Mở lại traffic tại Load Balancer.

---

## 6. Vận hành giám sát hệ thống (Monitoring & Observability)

### 6.1. Health Check Endpoints
- **Liveness:** `GET /api/v1/health/live` (Kiểm tra process NestJS đang sống).
- **Readiness:** `GET /api/v1/health` (Kiểm tra kết nối PostgreSQL, Redis, MinIO).

### 6.2. Thu thập Metrics với Prometheus & Grafana
- **Metrics endpoint:** `GET /metrics` (Metrics theo chuẩn OpenMetrics/Prometheus).
- Các chỉ số cần cảnh báo (Alerting Rules):
  - `http_requests_total{status=~"5.."}` > 1% tổng request trong 5 phút.
  - `http_request_duration_seconds{quantile="0.99"}` > 2.0s.
  - `bullmq_jobs_waiting{queue="blockchain"}` > 100 job (Hàng đợi blockchain dồn ứ).
  - `pg_stat_activity_count` tiệm cận `max_connections`.

### 6.3. Khắc phục sự cố Hàng đợi Blockchain (BullMQ Outbox Recovery)
Hệ thống tích hợp sẵn Transactional Outbox. Nếu Redis tạm thời chết:
- Bản ghi truy xuất vẫn được lưu bền vững vào bảng `BlockchainRecord` với trạng thái `QUEUED`.
- Khi Redis hoạt động trở lại, background worker định kỳ (`@Interval(15000) recoverOutboxJobs()`) sẽ tự động quét các bản ghi chưa hoàn thành và đẩy lại vào hàng đợi với deterministic Job ID (`bc-{recordId}`), loại trừ hoàn toàn nguy cơ mất job hoặc ghi nhận trùng lặp trên mạng blockchain.

---

## 7. Quy trình Nâng cấp & Quay lui khẩn cấp (Deployment & Rollback)

### 7.1. Quy trình Nâng cấp phiên bản mới
1. Chạy CI/CD kiểm tra: TypeScript, ESLint, Unit Tests, E2E Security Tests.
2. Build container image cho backend và frontend, đẩy lên Container Registry có gắn tag (commit SHA).
3. Thực hiện migration cơ sở dữ liệu tương thích ngược (Expand/Contract pattern):
```bash
npx prisma migrate deploy
```
4. Triển khai Rolling Update / Blue-Green:
```bash
docker compose -f docker-compose.prod.yml up -d --no-deps --build backend frontend
```
5. Chạy Smoke Test kiểm tra `/api/v1/health` và luồng tra cứu sản phẩm.

### 7.2. Quy trình Quay lui (Rollback Procedure)
Khi phát hiện lỗi nghiêm trọng sau deploy:
1. Chuyển hướng traffic ngay lập tức về image container phiên bản trước:
```bash
docker compose -f docker-compose.prod.yml up -d --no-deps backend:PREVIOUS_TAG frontend:PREVIOUS_TAG
```
2. Nếu bản phát hành có migration phá vỡ cấu trúc cơ sở dữ liệu:
   - Áp dụng migration quay lui (Down migration) hoặc phục hồi database snapshot được chụp ngay trước khi deploy.
3. Xóa cache Redis nếu có thay đổi cấu trúc schema lưu cache:
```bash
redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD KEYS "categories:*" | xargs redis-cli DEL
redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD KEYS "ocop_levels:*" | xargs redis-cli DEL
```
