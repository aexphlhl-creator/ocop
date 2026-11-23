# Mẫu Biên Bản Nghiệm Thu Hạ Tầng & Dịch Vụ Vận Hành OCOP

> **Mục đích:** Sử dụng để ghi nhận bằng chứng thực tế từ đội ngũ vận hành khi thực thi các lệnh kiểm tra chỉ đọc, diễn tập khôi phục và kiểm chứng dịch vụ đối tác theo [deploy/INFRASTRUCTURE_HANDOVER.md](file:///d:/Study/Study/Congty/Coding/OCOP/deploy/INFRASTRUCTURE_HANDOVER.md).
> **Nguyên tắc an toàn:** Tất cả output phải được che thông tin nhạy cảm (masking mật khẩu, token, private key, session cookie) trước khi lưu vào biên bản. Tuyệt đối không lưu secret ở dạng plain text.

---

## Thông Tin Biên Bản
- **Mã biên bản:** `BB-NTHT-YYYYMMDD-XX`
- **Hệ thống:** Nền tảng OCOP Việt Nam (OCOP Platform)
- **Môi trường thực hiện:** [ ] Staging / DR Isolation  |  [ ] Production
- **Thời điểm thực hiện:** YYYY-MM-DD HH:mm:ss (UTC+7)
- **Người thực hiện:** [Họ và tên, Vai trò]
- **Người nghiệm thu / Ký duyệt:** [Họ và tên, Vai trò]

---

## 1. Nghiệm Thu Cụm Kubernetes Production

| Hạng Mục | Thông Tin Kiểm Chứng |
| :--- | :--- |
| **Lệnh thực thi** | `kubectl get namespaces,cronjobs,pvc -n ocop-production` |
| **Thời điểm (Timestamp)** | YYYY-MM-DD HH:mm:ss (UTC+7) |
| **Môi trường** | Cụm Kubernetes Production (Context: `<tên_cluster_đã_che>`) |
| **Output gốc (đã che nhạy cảm)** | ```text<Dán output lệnh kubectl get tại đây, đã che IP/hostname nội bộ>``` |
| **Tiêu chí PASS/FAIL** | - **PASS:** Namespace `ocop-production` tồn tại (Active); đủ 3 CronJobs (`ocop-postgres-backup`, `ocop-postgres-backup-hourly`, `ocop-postgres-backup-monitor`); PVC bound thành công.<br>- **FAIL:** Không tìm thấy namespace, CronJob thiếu hoặc PVC trạng thái Pending/Error. |
| **Kết quả đánh giá** | [ ] PASS  |  [ ] FAIL  |  [ ] CHƯA THỂ XÁC MINH |
| **Người xác nhận** | [Ký / Ghi rõ họ tên] |

---

## 2. Nghiệm Thu Kho Lưu Trữ S3 Ngoài Vùng (WORM / Object Lock & Lifecycle)

| Hạng Mục | Thông Tin Kiểm Chứng |
| :--- | :--- |
| **Lệnh thực thi** | 1. `aws s3api get-object-lock-configuration --bucket <BUCKET>`<br>2. `aws s3api get-bucket-versioning --bucket <BUCKET>`<br>3. `aws s3api get-bucket-lifecycle-configuration --bucket <BUCKET>`<br>4. `aws s3api get-object-retention --bucket <BUCKET> --key hourly/<DUMP_KEY> --version-id <VERSION_ID>` |
| **Thời điểm (Timestamp)** | YYYY-MM-DD HH:mm:ss (UTC+7) |
| **Môi trường** | Kho S3 ngoài vùng độc lập (Region: `<region_s3>`, Bucket: `<bucket_name>`) |
| **Output gốc (đã che nhạy cảm)** | ```json<Dán output JSON của 4 lệnh trên tại đây, đã che Account ID/ARN>``` |
| **Tiêu chí PASS/FAIL** | - **PASS:** `ObjectLockConfiguration.ObjectLockEnabled == "Enabled"`; `VersioningConfiguration.Status == "Enabled"`; đủ 4 rules trong Lifecycle policy (`hourly/` 7 ngày, `daily/` 30 ngày, `weekly/` 90 ngày, `monthly/` 365 ngày); Object retention trả về `Mode: COMPLIANCE` và `RetainUntilDate` hợp lệ.<br>- **FAIL:** Object Lock bị Disabled, Versioning bị Suspended/Disabled, Lifecycle thiếu rules hoặc không đọc được retention. |
| **Kết quả đánh giá** | [ ] PASS  |  [ ] FAIL  |  [ ] CHƯA THỂ XÁC MINH |
| **Người xác nhận** | [Ký / Ghi rõ họ tên] |

---

## 3. Nghiệm Thu Diễn Tập Khôi Phục Thảm Họa (DR Restore Drill) & Đo Lường RPO/RTO

| Hạng Mục | Thông Tin Kiểm Chứng |
| :--- | :--- |
| **Lệnh thực thi** | `RESTORE_DATABASE_URL="postgres://***@staging-db:5432/ocop_restore_drill" RESTORE_FILE_PATH="/tmp/target.dump" RESTORE_SHA256_FILE="/tmp/target.dump.sha256" RESTORE_SIGNATURE_FILE="/tmp/target.dump.sha256.sig" BACKUP_HMAC_SECRET="***" RESTORE_DRILL_MODE=true node backend/scripts/production-restore.mjs` |
| **Thời điểm (Timestamp)** | YYYY-MM-DD HH:mm:ss (UTC+7) |
| **Môi trường** | Cơ sở dữ liệu Staging cô lập (Tách biệt hoàn toàn với Production DB) |
| **Output gốc (đã che nhạy cảm)** | ```text<Dán output quá trình tải 3 file từ S3, verify checksum, HMAC và log restore tại đây>``` |
| **Số liệu đo thực nghiệm** | - **Thời gian khôi phục (RTO):** `XX` phút (Từ lúc bắt đầu tải dump đến khi DB sẵn sàng truy vấn).<br>- **Tuổi bản sao (RPO):** `YY` phút (Chênh lệch giữa thời điểm dump và điểm giả lập thảm họa). |
| **Tiêu chí PASS/FAIL** | - **PASS:** Checksum SHA-256 khớp 100%; chữ ký HMAC xác thực nguồn gốc hợp lệ; `pg_restore` không phát sinh lỗi nghiêm trọng; schema khớp với Prisma migrations; RTO và RPO nằm trong ngưỡng cam kết vận hành.<br>- **FAIL:** Lỗi checksum, sai chữ ký, restore thất bại hoặc dữ liệu bị mất mát. |
| **Kết quả đánh giá** | [ ] PASS  |  [ ] FAIL  |  [ ] CHƯA THỂ XÁC MINH |
| **Người xác nhận** | [Ký / Ghi rõ họ tên] |

---

## 4. Nghiệm Thu Tên Miền HTTPS & Media Storage (CDN/S3)

| Hạng Mục | Thông Tin Kiểm Chứng |
| :--- | :--- |
| **Lệnh thực thi** | 1. `curl -Iv https://<DOMAIN_PROD>/api/health`<br>2. Kiểm tra chứng chỉ SSL/TLS qua OpenSSL / Qualys SSL Labs. |
| **Thời điểm (Timestamp)** | YYYY-MM-DD HH:mm:ss (UTC+7) |
| **Môi trường** | Domain Production công khai |
| **Output gốc (đã che nhạy cảm)** | ```text<Dán output HTTP headers và thông tin chứng chỉ SSL tại đây>``` |
| **Tiêu chí PASS/FAIL** | - **PASS:** Phản hồi HTTP 200/OK qua giao thức HTTPS (TLS 1.2/1.3); chứng chỉ hợp lệ từ CA uy tín, còn hạn > 30 ngày; CORS header cho media bucket được cấu hình an toàn.<br>- **FAIL:** Lỗi SSL/TLS, chứng chỉ tự ký hoặc hết hạn, HTTP không tự động redirect sang HTTPS. |
| **Kết quả đánh giá** | [ ] PASS  |  [ ] FAIL  |  [ ] CHƯA THỂ XÁC MINH |
| **Người xác nhận** | [Ký / Ghi rõ họ tên] |

---

## 5. Nghiệm Thu Cổng Thanh Toán Trực Tuyến VNPAY Live

| Hạng Mục | Thông Tin Kiểm Chứng |
| :--- | :--- |
| **Lệnh / Thao tác thực thi** | Thực hiện 01 giao dịch thanh toán thật (hoặc trên Merchant Sandbox chính thức do VNPAY cấp), xác nhận URL thanh toán và nhận webhook IPN. |
| **Thời điểm (Timestamp)** | YYYY-MM-DD HH:mm:ss (UTC+7) |
| **Môi trường** | Cổng thanh toán VNPAY Live / Sandbox Doanh nghiệp |
| **Output gốc (đã che nhạy cảm)** | ```json<Dán payload IPN response đã che vnp_SecureHash và số thẻ khách hàng tại đây>``` |
| **Tiêu chí PASS/FAIL** | - **PASS:** `vnp_ResponseCode == "00"`; chữ ký HMAC-SHA512 xác thực IPN khớp 100%; đơn hàng cập nhật trạng thái `PAID` trong database.<br>- **FAIL:** Sai mã băm checksum, giao dịch bị từ chối hoặc webhook không nhận được callback. |
| **Kết quả đánh giá** | [ ] PASS  |  [ ] FAIL  |  [ ] CHƯA THỂ XÁC MINH |
| **Người xác nhận** | [Ký / Ghi rõ họ tên] |

---

## 6. Nghiệm Thu Tích Hợp Đơn Vị Vận Chuyển (GHTK / GHN)

| Hạng Mục | Thông Tin Kiểm Chứng |
| :--- | :--- |
| **Lệnh / Thao tác thực thi** | Gọi API tính cước vận chuyển thử nghiệm và nhận webhook tracking mẫu từ đối tác vận chuyển. |
| **Thời điểm (Timestamp)** | YYYY-MM-DD HH:mm:ss (UTC+7) |
| **Môi trường** | API Doanh nghiệp của đối tác vận chuyển |
| **Output gốc (đã che nhạy cảm)** | ```json<Dán JSON response tính phí / tạo mã vận đơn đã che token tại đây>``` |
| **Tiêu chí PASS/FAIL** | - **PASS:** API phản hồi thành công danh mục dịch vụ và mã vận đơn tracking; webhook cập nhật trạng thái đơn hàng hoạt động chính xác.<br>- **FAIL:** Lỗi 401 Unauthorized, token không hợp lệ hoặc không tính được cước phí. |
| **Kết quả đánh giá** | [ ] PASS  |  [ ] FAIL  |  [ ] CHƯA THỂ XÁC MINH |
| **Người xác nhận** | [Ký / Ghi rõ họ tên] |

---

## 7. Nghiệm Thu Truy Xuất Nguồn Gốc Blockchain (On-Chain Certification)

| Hạng Mục | Thông Tin Kiểm Chứng |
| :--- | :--- |
| **Lệnh thực thi** | 1. Truy vấn block hiện tại qua RPC: `curl -X POST <RPC_URL> -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'`<br>2. Kiểm tra bytecode contract: `curl -X POST <RPC_URL> -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_getCode","params":["<CONTRACT_ADDRESS>","latest"],"id":2}'`<br>3. Kiểm tra transaction ghi nhận lô hàng OCOP on-chain. |
| **Thời điểm (Timestamp)** | YYYY-MM-DD HH:mm:ss (UTC+7) |
| **Môi trường** | Blockchain Mainnet / Public Network được phê duyệt |
| **Output gốc (đã che nhạy cảm)** | ```json<Dán transaction hash và biên lai giao dịch (receipt) đã che private key tại đây>``` |
| **Tiêu chí PASS/FAIL** | - **PASS:** Smart contract có bytecode trên mạng đích; transaction ghi nhận lô hàng có trạng thái `status: 1` (Success) trên block explorer công khai.<br>- **FAIL:** Contract rỗng (`0x`), transaction reverted hoặc RPC không phản hồi. |
| **Kết quả đánh giá** | [ ] PASS  |  [ ] FAIL  |  [ ] CHƯA THỂ XÁC MINH |
| **Người xác nhận** | [Ký / Ghi rõ họ tên] |

---

## Kết Luận Chung Về Biên Bản Nghiệm Thu
- **Tổng số hạng mục:** 7
- **Số hạng mục PASS:** `...` / 7
- **Số hạng mục FAIL:** `...` / 7
- **Số hạng mục CHƯA THỂ XÁC MINH:** `...` / 7
- **Khuyến nghị Go-Live:** [ ] CHẤP THUẬN GO-LIVE  |  [ ] GIỮ PRODUCTION NO-GO

**Đại diện Đội ngũ Vận hành ( ký & ghi rõ họ tên ):** ___________________________  
**Đại diện Quản lý Kỹ thuật ( ký & ghi rõ họ tên ):** ___________________________
