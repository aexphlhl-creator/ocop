# Gói Bàn Giao Nghiệm Thu Hạ Tầng & Quy Trình Vận Hành Thảm Họa (Disaster Recovery)

> **Trạng thái Go-Live hiện tại:** **PRODUCTION NO-GO**  
> **Nguyên nhân:** Toàn bộ kiểm thử logic phần mềm, timeout và tính toàn vẹn (64/64 tests passed, 0 rác) mới chỉ được chứng minh trên môi trường giả lập (Jest mocks) và container Docker MinIO cục bộ với payload đại diện 5–10 MB. Hệ thống **CHƯA ĐƯỢC NGHIỆM THU** trên cụm Kubernetes, kho S3 ngoài vùng, diễn tập khôi phục thực tế và các cổng tích hợp bên thứ ba (VNPAY, hãng vận chuyển, blockchain public).

---

## 1. Kiến Trúc Bảo Vệ & Phạm Vi Đã Kiểm Chứng

1. **Timeout hai tầng cho S3 Monitor (`scripts/monitor-backup-s3.mjs`):**
   - **Giai đoạn mở kết nối (`openTimeoutMs`, mặc định 15.000 ms):** Bảo vệ các lệnh `getObject` mở dump, manifest và signature. Nếu timeout, hàm trả quyền kiểm soát ngay lập tức cho caller với lỗi `GET_OBJECT_TIMEOUT`. Bất kỳ luồng Readable nào giải quyết muộn sau timeout đều được gắn listener no-op trước khi gọi `.destroy()` để giải phóng socket TCP an toàn mà không làm sập Node.js bằng lỗi `ERR_UNHANDLED_ERROR`.
   - **Giới hạn vận hành (Operational Boundary):** Thư viện MinIO JS client không hỗ trợ `AbortSignal` trong API `getObject()`. Do đó, nếu kết nối mạng treo ở tầng TCP/TLS trước khi HTTP response headers được trả về, request nền chỉ có thể giải phóng qua transport/socket timeout cấp hệ điều hành hoặc khi response headers trả về muộn và bị handler hủy.
   - **Giai đoạn streaming dump (`computeStreamSha256`):** Bảo vệ bởi **Inactivity Timeout** (mặc định 60s, reset sau mỗi chunk nhận được) và **Total Deadline Timeout** (mặc định 10m, hard-cap ngăn chặn tấn công trickle).
2. **Khôi phục dữ liệu an toàn bộ nhớ O(1) RAM (`scripts/production-restore.mjs`):**
   - Đã loại bỏ hoàn toàn việc nạp toàn bộ file dump vào bộ nhớ qua `readFile()`. Checksum SHA-256 được tính theo luồng (`computeFileSha256`) trực tiếp từ ổ đĩa với bộ đệm nhỏ (64KB), triệt tiêu nguy cơ Node.js tràn RAM (OOM) hoặc `RangeError`.
   - **Cảnh báo quy mô:** Không công bố khả năng restore cơ sở dữ liệu 50 GB. Quy trình hiện chỉ được chứng minh trên các file dump staging nhỏ (5–10 MB). Cần kiểm thử tải thực nghiệm trước khi công bố năng lực cho dữ liệu lớn.

---

## 2. Triển Khai & Kiểm Tra Cụm Kubernetes Production

- **Namespace triển khai:** `ocop-production`
- **Secret danh định:** `ocop-secrets`
- **ConfigMap danh định:** `ocop-config`

### 2.1. Lệnh Triển Khai
```bash
# 1. Tạo PVC lưu trữ backup cục bộ (nếu sử dụng dual storage)
kubectl apply -f deploy/k8s/postgres-backup-pvc.yaml

# 2. Triển khai CronJob backup hàng ngày (Daily Tier - 02:00 AM UTC)
kubectl apply -f deploy/k8s/postgres-backup-cronjob.yaml

# 3. Triển khai CronJob backup hàng giờ (Hourly Tier - phút 00 mỗi giờ)
kubectl apply -f deploy/k8s/postgres-backup-hourly-cronjob.yaml

# 4. Triển khai CronJob kiểm tra tính toàn vẹn độc lập (Monitor - mỗi 15 phút)
kubectl apply -f deploy/k8s/postgres-backup-monitor-cronjob.yaml
```

### 2.2. Lệnh Kiểm Tra Trạng Thái Chỉ Đọc
```bash
# Kiểm tra danh sách CronJob và lịch biểu
kubectl get cronjobs -n ocop-production

# Kiểm tra PVC đã gắn thành công
kubectl get pvc -n ocop-production

# Kiểm tra lịch sử Job và Pod đã hoàn thành
kubectl get jobs,pods -n ocop-production -l app.kubernetes.io/part-of=ocop-platform
```

### 2.3. Lệnh Chạy Thử Nghiệm Thu Thủ Công (On-Demand Run)
```bash
# Kích hoạt 1 lượt chạy kiểm tra monitor ngay lập tức
kubectl create job --from=cronjob/ocop-postgres-backup-monitor manual-monitor-audit-001 -n ocop-production

# Theo dõi log kiểm tra tính toàn vẹn S3
kubectl logs -f job/manual-monitor-audit-001 -n ocop-production

# Tiêu chí đạt: Log in "MONITOR SUMMARY: HEALTHY" và Pod thoát với exit code 0.
```

---

## 3. S3 Ngoài Vùng (Off-Site S3) với Object Lock & Lifecycle

Kho lưu trữ lạnh (Cold Storage) phải là một bucket S3 nằm ngoài vùng địa lý của máy chủ chính (ví dụ: `ap-southeast-1` so với `ap-east-1`), có bật tính năng **Object Lock (WORM - Write Once, Read Many)**.

### 3.1. Mô Tả Chính Sách Vòng Đời (Khớp file `deploy/k8s/s3-lifecycle-policy.json`)
Cấu hình lifecycle tự động thu dọn dữ liệu tương thích Object Lock mà không cần script can thiệp:
1. **Rule 1 (`PruneHourlyBackupsAfter7Days`):** Áp dụng cho prefix `hourly/`. Tự động xóa bản ghi (Expiration) sau **7 ngày**. Các version cũ (NoncurrentVersionExpiration) bị xóa sau **7 ngày**.
2. **Rule 2 (`PruneDailyBackupsAfter30Days`):** Áp dụng cho prefix `daily/`. Tự động xóa bản ghi sau **30 ngày**. Các version cũ bị xóa sau **30 ngày**.
3. **Rule 3 (`PruneWeeklyBackupsAfter90Days`):** Áp dụng cho prefix `weekly/`. Tự động xóa bản ghi sau **90 ngày**. Các version cũ bị xóa sau **90 ngày**.
4. **Rule 4 (`TransitionMonthlyToGlacierAndPruneAfter365Days`):** Áp dụng cho prefix `monthly/`. Chuyển sang lưu trữ giá rẻ **GLACIER** sau **90 ngày**. Tự động xóa vĩnh viễn sau **365 ngày** (1 năm). Các version cũ bị xóa sau **365 ngày**.

### 3.2. Lệnh Áp Dụng Lifecycle Configuration
```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket ocop-prod-backups-cold-storage \
  --lifecycle-configuration file://deploy/k8s/s3-lifecycle-policy.json
```

### 3.3. Phương Pháp Nghiệm Thu Ưu Tiên: Xác Minh CHỈ ĐỌC (Read-Only)
Ưu tiên nghiệm thu bảo mật bằng các lệnh truy vấn chỉ đọc (read-only queries) đối chiếu metadata, cấu hình bucket, versioning và retention của từng phiên bản cụ thể mà không can thiệp trạng thái lưu trữ:

```bash
# 1. Kiểm tra cấu hình Object Lock trên bucket (phải Enabled và có DefaultRetention nếu cấu hình)
aws s3api get-object-lock-configuration \
  --bucket ocop-prod-backups-cold-storage

# 2. Kiểm tra cấu hình Versioning (bắt buộc Enabled để Object Lock hoạt động)
aws s3api get-bucket-versioning \
  --bucket ocop-prod-backups-cold-storage

# 3. Kiểm tra cấu hình 4 Lifecycle Rules trên bucket (khớp s3-lifecycle-policy.json)
aws s3api get-bucket-lifecycle-configuration \
  --bucket ocop-prod-backups-cold-storage

# 4. Liệt kê các Version ID của một object backup cụ thể
aws s3api list-object-versions \
  --bucket ocop-prod-backups-cold-storage \
  --prefix hourly/ocop_backup_hourly_2026-11-19T10-00-00-000Z.dump

# 5. Kiểm tra Retention (Mode: COMPLIANCE/GOVERNANCE, RetainUntilDate) trên Version ID cụ thể
aws s3api get-object-retention \
  --bucket ocop-prod-backups-cold-storage \
  --key hourly/ocop_backup_hourly_2026-11-19T10-00-00-000Z.dump \
  --version-id <VERSION_ID>

# 6. Kiểm tra Legal Hold của Version ID cụ thể
aws s3api get-object-legal-hold \
  --bucket ocop-prod-backups-cold-storage \
  --key hourly/ocop_backup_hourly_2026-11-19T10-00-00-000Z.dump \
  --version-id <VERSION_ID>
```

### 3.4. Thử Nghiệm Xóa Bất Biến Có Kiểm Soát (Tùy Chọn - Chỉ Dùng Probe Thử Nghiệm Riêng)
> [!IMPORTANT]
> **Nguyên tắc cốt lõi của AWS S3 Versioning & Object Lock:**
> 1. Lệnh `aws s3 rm s3://bucket/key` (không kèm version ID) **KHÔNG** xóa dữ liệu thật và **KHÔNG** trả về mã 403; lệnh này chỉ tạo ra một `DeleteMarker` làm phiên bản hiện tại, trong khi phiên bản dữ liệu bị khóa vẫn tồn tại nguyên vẹn phía sau.
> 2. Để kiểm chứng tính bất biến khi xóa vĩnh viễn, bắt buộc phải chỉ định `--version-id` thông qua API `delete-object` với quyền IAM có `s3:DeleteObjectVersion`.
> 3. **TUYỆT ĐỐI KHÔNG** thao tác xóa thử nghiệm trên bất kỳ file backup thật nào (`hourly/*`, `daily/*`, v.v.).

Nếu chính sách vận hành bắt buộc phải có bằng chứng từ chối xóa thực tế:
```bash
# 1. Tải lên object probe thử nghiệm riêng với thời hạn Object Lock ngắn (ví dụ: 1 ngày)
PROBE_PUT=$(aws s3api put-object \
  --bucket ocop-prod-backups-cold-storage \
  --key probe-test/immutability-probe.tmp \
  --body /dev/null \
  --object-lock-mode COMPLIANCE \
  --object-lock-retain-until-date $(date -u -d "+1 day" +%Y-%m-%dT%H:%M:%SZ))

# Lấy Version ID của object probe vừa tạo
PROBE_VERSION_ID=$(echo "$PROBE_PUT" | jq -r '.VersionId')
echo "Probe Version ID: $PROBE_VERSION_ID"

# 2. Thử xóa VĨNH VIỄN đúng phiên bản probe bị khóa (sử dụng quyền IAM có s3:DeleteObjectVersion)
aws s3api delete-object \
  --bucket ocop-prod-backups-cold-storage \
  --key probe-test/immutability-probe.tmp \
  --version-id "$PROBE_VERSION_ID"

# Kết quả đạt chuẩn: Lệnh thất bại với lỗi AccessDenied / 403 (Object is WORM protected under COMPLIANCE mode).

# 3. Kiểm tra và dọn dẹp Delete Marker (nếu có lệnh aws s3 rm vô tình được gọi trước đó)
# Liệt kê tất cả version và delete marker của probe:
aws s3api list-object-versions \
  --bucket ocop-prod-backups-cold-storage \
  --prefix probe-test/immutability-probe.tmp

# Nếu phát hiện Delete Marker, xóa Delete Marker đó bằng Version ID của marker (Delete Marker không bị khóa):
aws s3api delete-object \
  --bucket ocop-prod-backups-cold-storage \
  --key probe-test/immutability-probe.tmp \
  --version-id "<DELETE_MARKER_VERSION_ID>"

# Phiên bản probe bị khóa ($PROBE_VERSION_ID) sẽ tự động tồn tại an toàn cho đến khi hết hạn retention (1 ngày).
```

---

## 4. Runbook Diễn Tập Khôi Phục (Restore Rehearsal)

Quy trình khôi phục thực tế yêu cầu đồng thời **bộ 3 file đồng hành**:
1. File dữ liệu PostgreSQL dump: `<tên_file>.dump`
2. File manifest chứa mã băm: `<tên_file>.dump.sha256`
3. File chữ ký điện tử HMAC: `<tên_file>.dump.sha256.sig`

### 4.1. Lệnh Tải Bộ Ba File Từ S3 Ngoài Vùng
```bash
TARGET_BACKUP="hourly/ocop_backup_hourly_2026-11-19T10-00-00-000Z.dump"
LOCAL_DIR="/tmp/dr-rehearsal"
mkdir -p "$LOCAL_DIR"

aws s3 cp "s3://ocop-prod-backups-cold-storage/$TARGET_BACKUP" "$LOCAL_DIR/target.dump"
aws s3 cp "s3://ocop-prod-backups-cold-storage/$TARGET_BACKUP.sha256" "$LOCAL_DIR/target.dump.sha256"
aws s3 cp "s3://ocop-prod-backups-cold-storage/$TARGET_BACKUP.sha256.sig" "$LOCAL_DIR/target.dump.sha256.sig"
```

### 4.2. Lệnh Chạy Diễn Tập Restore Vào Database Cô Lập
```bash
# Khai báo chính xác các biến môi trường mà scripts/production-restore.mjs yêu cầu
export RESTORE_DATABASE_URL="postgres://restore_user:restore_pass@staging-db.internal:5432/ocop_restore_drill_isolated"
export RESTORE_FILE_PATH="/tmp/dr-rehearsal/target.dump"
export RESTORE_SHA256_FILE="/tmp/dr-rehearsal/target.dump.sha256"
export RESTORE_SIGNATURE_FILE="/tmp/dr-rehearsal/target.dump.sha256.sig"
export BACKUP_HMAC_SECRET="<khoa_bi_mat_hmac_production_it_nhat_16_ky_tu>"
export RESTORE_DRILL_MODE="true"
export RESTORE_DRY_RUN="false"

# Thực thi khôi phục
node backend/scripts/production-restore.mjs
```

### 4.3. Phương Pháp Đo Lường Chỉ Số RTO & RPO Thực Nghiệm
- **RTO (Recovery Time Objective):** Đo bằng đồng hồ bấm giờ từ lúc bắt đầu tải 3 file từ S3 đến khi `pg_restore` và Prisma migrations xác nhận database cô lập sẵn sàng nhận truy vấn.
- **RPO (Recovery Point Objective):** So sánh `last_modified` hoặc timestamp trong tên file dump với thời điểm dữ liệu cuối cùng được ghi nhận trước khi giả lập sự cố.
- **Tiêu chuẩn nghiệm thu:** Chỉ công bố hệ thống đạt RTO/RPO khi có biên bản ghi nhận số phút thực tế từ bài diễn tập trên staging database tương đương production.

---

## 5. Bảng Checklist Nghiệm Thu Hạ Tầng & Dịch Vụ Bên Ngoài

| STT | Hạng Mục Nghiệm Thu | Cấu Hình / Credential Yêu Cầu | Trạng Thái Kiểm Chứng | Ghi Chú |
| :---: | :--- | :--- | :---: | :--- |
| 1 | **Kubernetes Cluster** | Kubeconfig production, `ocop-secrets`, PVC StorageClass | **CHƯA NGHIỆM THU** | Cần người vận hành áp dụng manifest và chạy thử job. |
| 2 | **S3 WORM Bucket** | Bucket ngoài vùng, Object Lock enabled, Lifecycle Rule | **CHƯA NGHIỆM THU** | Cần bucket S3 thật ngoài vùng địa lý. |
| 3 | **DR Restore Drill** | Database staging cô lập, bộ 3 file thật từ S3 | **CHƯA NGHIỆM THU** | Chưa có kết quả đo RTO/RPO thực nghiệm. |
| 4 | **Domain & HTTPS Media** | Chứng chỉ TLS A+, CDN Cloudflare/CloudFront, CORS | **CHƯA NGHIỆM THU** | Chưa trỏ DNS production và gắn SSL Cert. |
| 5 | **Cổng Thanh Toán VNPAY** | `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, Webhook IPN | **CHƯA NGHIỆM THU** | Chưa có tài khoản doanh nghiệp live. |
| 6 | **Đơn Vị Vận Chuyển** | API Token GHTK / GHN / ViettelPost | **CHƯA NGHIỆM THU** | Chưa có token tài khoản vận chuyển production. |
| 7 | **Blockchain RPC & Ví** | `BLOCKCHAIN_RPC_URL`, Private Key ký chứng nhận OCOP | **CHƯA NGHIỆM THU** | Mới chạy Hardhat local test node (port 8545). |

---

## 6. Kết Luận Quyết Định Go-Live

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    PRODUCTION GO / NO-GO VERDICT                         ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║                         >>>   NO-GO   <<<                                ║
║                                                                          ║
║  Hệ thống tiếp tục duy trì trạng thái NO-GO cho tới khi hoàn tất nghiệm  ║
║  thu thực tế 7 hạng mục hạ tầng và dịch vụ đối tác theo danh mục trên.   ║
╚══════════════════════════════════════════════════════════════════════════╝
```
