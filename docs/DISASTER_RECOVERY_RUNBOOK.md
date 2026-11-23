# Quy Trình Sao Lưu & Phục Hồi Thảm Họa (Disaster Recovery Runbook)

## 1. Mục Tiêu Vận Hành & Khác Biệt Môi Trường
- **Chỉ tiêu RPO Mục tiêu (Recovery Point Objective):**
  - **Mục tiêu Vận hành Thiết kế (Design Target):** **$\text{RPO} \le 1$ giờ** cho toàn bộ cơ sở dữ liệu giao dịch và truy xuất nguồn gốc.
  - **Lưu ý Quan trọng về Trạng Thái Nghiệm Thu:** Mức $\text{RPO} \le 1$ giờ là **MỤC TIÊU THIẾT KẾ, CHƯA PHẢI MỨC ĐÃ ĐẠT ĐƯỢC CHỨNG MINH TRÊN PRODUCTION THỰC TẾ**. Dự án tuyệt đối không tuyên bố đạt RPO này cho đến khi vận hành lịch chạy liên tục và hoàn thành diễn tập kịch bản mất mát dữ liệu thực tế trên cụm hạ tầng thật.
  - **Cơ chế Kỹ thuật Phục vụ Mục tiêu $\le 1$ giờ:** Triển khai **Hourly Snapshot CronJob** (`deploy/k8s/postgres-backup-hourly-cronjob.yaml`) chạy tự động vào phút thứ 0 của mỗi giờ (`0 * * * *`), lưu trữ snapshot nén được ký số HMAC và tải lên S3 cold storage.
  - **Phân định rõ với Daily Dump:** Nếu chỉ chạy Daily Dump lúc 02:00 AM UTC (`deploy/k8s/postgres-backup-cronjob.yaml`), mức RPO thực tế chỉ là **$\le 24$ giờ**.
  - **Lộ trình RPO $\le 5$ phút (WAL/PITR):** Khi quy mô dữ liệu vượt 50 GB hoặc tần suất giao dịch cao, hạ tầng PostgreSQL sẽ được nâng cấp lên Continuous WAL Archiving (`archive_command` đẩy WAL segments mỗi 60 giây sang S3) kết hợp `pgBackRest`/`WAL-G` để phục hồi Point-In-Time đến từng mili-giây.
- **Chỉ tiêu RTO Mục tiêu (Recovery Time Objective):** $\le 2$ giờ (thời gian tối đa để tái thiết lập toàn bộ cụm hạ tầng Production từ thảm họa hoàn toàn).
- **Đo Lường Thời Gian Thực Thi & Cảnh Báo Chậm Trễ (Duration & Staleness):**
  - **Thời gian thực thi đo được ($T_{\text{backup}}$):** Tính từ thời điểm bắt đầu `pg_dump` đến khi bản sao, manifest và chữ ký được tải và xác thực hoàn tất trên kho đích.
  - **Xử lý khi Backup kéo dài qua lượt chạy kế tiếp:** Cấu hình `concurrencyPolicy: Forbid` trên Kubernetes CronJob đảm bảo không có 2 Job chạy đè lên nhau. Nếu thời gian thực thi vượt ngưỡng cảnh báo (ví dụ $> 45$ phút với tier hourly), script tự động phát cảnh báo khẩn cấp qua Webhook về nguy cơ trễ lịch.
  - **Cảnh báo Bản Sao Bị Quá Hạn (Staleness Monitoring):** Hàm `checkBackupFreshness` tự động kiểm tra mốc thời gian của bản sao thành công gần nhất. Nếu quá 90 phút chưa có bản sao hourly mới thành công (hoặc quá 36 giờ với daily), hệ thống phát cảnh báo P1 báo động CronJob bị lỗi hoặc bỏ lỡ lịch.
- **Khác biệt với Kết quả Đo Kiểm Staging:**
  - Kết quả đo lường staging cục bộ (upload media MinIO, DB dump 325 KB) **chỉ là bằng chứng kiểm chứng tính khả thi kỹ thuật của luồng mã nguồn**.
  - Kết quả đó **tuyệt đối không được coi là RTO/RPO của môi trường Production thật** (nơi dung lượng dữ liệu lớn và có độ trễ đường truyền Internet/WAN).

---

## 2. Lịch Trình Sao Lưu, Phân Tách Tier & Vị Trí Lưu Trữ
- **Lịch chạy & Phân Tách Tier (Multi-Tier Isolation):**
  - *Tier Hourly (Mục tiêu RPO $\le 1$h):* Chạy mỗi giờ (`0 * * * *`) qua `deploy/k8s/postgres-backup-hourly-cronjob.yaml`.
    - Đường dẫn cục bộ: `/backups/hourly/`
    - Tiền tố S3: `hourly/`
    - Tên file: `ocop_backup_hourly_YYYY-MM-DDTHH-mm-ss.dump`
    - Retention: 24 bản chụp (24 giờ).
  - *Tier Daily (Lưu trữ 7 ngày):* Chạy lúc 02:00 AM UTC (`0 2 * * *`) qua `deploy/k8s/postgres-backup-cronjob.yaml`.
    - Đường dẫn cục bộ: `/backups/daily/`
    - Tiền tố S3: `daily/`
    - Tên file: `ocop_backup_daily_YYYY-MM-DDTHH-mm-ss.dump`
    - Retention: 7 ngày.
  - *Tier Weekly & Monthly:* Bản chụp Chủ Nhật giữ 4 tuần (prefix `weekly/`), bản chụp ngày 1 hàng tháng giữ 12 tháng tại kho lạnh (prefix `monthly/`).
- **Nguyên Tắc Cô Lập Retention (Zero Conflict):**
  - Script backup lọc chính xác theo tiền tố và tên tier (`ocop_backup_{tier}_`). Job hourly tuyệt đối không xóa nhầm các bản sao daily, weekly hay monthly dù lưu chung bucket hay chung phân vùng đĩa.
  - Áp dụng dọn dẹp đồng bộ cả ở thư mục lưu trữ cục bộ và trên S3 Cold Storage.
- **Vị trí lưu trữ độc lập (Off-site Cold Storage):**
  - **Bucket sao lưu chính:** AWS S3 Glacier Flexible Retrieval hoặc Cloudflare R2 bucket (`ocop-prod-backups-cold-storage`) tại region độc lập với cụm ứng dụng chính.
  - **Bucket Media:** Cấu hình S3 Cross-Region Replication (CRR) sang bucket dự phòng.
  - **Chính sách bất biến:** Bật Object Lock (WORM - Write Once Read Many) với thời hạn lưu giữ 30 ngày để chống mã độc tống tiền (ransomware).
  - **Chữ ký nguồn gốc Manifest (HMAC Origin Signature):** Mỗi bản sao đi kèm manifest `.sha256` và chữ ký xác thực nguồn gốc `.sha256.sig` được ký bằng khóa bí mật `BACKUP_HMAC_SECRET` độc lập.

---

## 3. Chính Sách Xoay Vòng Bản Sao (Retention Policy) & Tương Thích S3 Object Lock (WORM)
- **Thiết kế tương thích S3 Object Lock (WORM - Write Once, Read Many):**
  - Khi bật Object Lock trên bucket S3 (Compliance Mode hoặc Governance Mode), object ở trạng thái bất biến và không thể bị xóa bởi bất kỳ người dùng hay script nào (kể cả root account trong Compliance Mode) cho đến khi hết thời hạn retention.
  - **Thời hạn lưu giữ bất biến (WORM Retention Periods) theo từng Tier:**
    - *Tier Hourly (`hourly/`):* Khóa WORM 24 giờ (tối thiểu) đến 7 ngày.
    - *Tier Daily (`daily/`):* Khóa WORM 7 ngày đến 30 ngày.
    - *Tier Weekly (`weekly/`):* Khóa WORM 30 ngày đến 90 ngày.
    - *Tier Monthly (`monthly/`):* Khóa WORM 365 ngày (1 năm cho kiểm toán và tuân thủ).
  - **Ủy quyền dọn dẹp cho S3 Lifecycle Rules (Khuyến nghị chuẩn Production):**
    - Cấu hình cờ `BACKUP_S3_USE_LIFECYCLE_PRUNING=true` trong Kubernetes CronJob (`deploy/k8s/postgres-backup-cronjob.yaml` và `deploy/k8s/postgres-backup-hourly-cronjob.yaml`) để bàn giao toàn bộ việc xóa object đã hết hạn cho công cụ vòng đời tự động của hạ tầng S3 đám mây (AWS S3 Lifecycle / Cloudflare R2 Lifecycle), loại bỏ hoàn toàn việc script gọi `deleteObject` thủ công.
    - **Tệp Cấu hình S3 Lifecycle áp dụng được:** Xem chi tiết tại [deploy/k8s/s3-lifecycle-policy.json](file:///d:/Study/Study/Congty/Coding/OCOP/deploy/k8s/s3-lifecycle-policy.json).
    - **Lệnh kích hoạt chính sách vòng đời trên AWS S3:**
      ```bash
      aws s3api put-bucket-lifecycle-configuration \
        --bucket ocop-prod-backups-cold-storage \
        --lifecycle-configuration file://deploy/k8s/s3-lifecycle-policy.json
      ```
  - **Xử lý An toàn khi Chạy Xóa Thủ Công (Manual Pruning Fail-Closed Protocol):**
    - Script phân biệt rạch ròi giữa lỗi Object Lock và lỗi quyền hạn/mạng:
      - *Lỗi Object Lock được nhận diện chắc chắn:* Mã lỗi `ObjectUnderRetention` hoặc thông báo lỗi chứa `Object under retention`/`WORM`/`governance retention`/`compliance retention` $\rightarrow$ Script ghi log cảnh báo thông tin (`[WORM/OBJECT-LOCK RETENTION]`) và hoãn xóa cho S3 Lifecycle Rules xử lý. Job backup hoàn tất thành công.
      - *Lỗi IAM hoặc lỗi mạng:* Lỗi `AccessDenied` thông thường không liên quan đến retention, hoặc lỗi mạng (`NetworkingError`, `ECONNREFUSED`) $\rightarrow$ Script ghi log `[S3 RETENTION CRITICAL ERROR]`, **ném lỗi làm job backup thất bại ngay lập tức (fail-closed)** và phát cảnh báo khẩn cấp tới On-call. Tuyệt đối không che giấu lỗi quyền hạn hay hạ tầng dưới danh nghĩa WORM!

---

## 4. Hệ Thống Giám Sát Backup Độc Lập & Kênh Cảnh Báo (Independent S3 Monitor)
Hệ thống giám sát chạy hoàn toàn độc lập với job tạo backup, không phụ thuộc vào `mtime` hay ổ đĩa cục bộ:
- **Monitor Độc Lập (`backend/scripts/monitor-backup-s3.mjs`):**
  - Chạy định kỳ 15 phút một lần qua Kubernetes CronJob (`deploy/k8s/postgres-backup-monitor-cronjob.yaml`).
  - Truy vấn trực tiếp kho lưu trữ lạnh S3 để kiểm tra danh sách bản sao, manifest và chữ ký số.
- **Phân biệt "Bộ ba object tồn tại" và "Đã xác minh toàn vẹn mật mã":**
  1. *Yêu cầu bộ ba object (Triplet Presence):* Mọi bản sao lưu bắt buộc phải có đầy đủ 3 đối tượng trên S3:
     - Tệp nén cơ sở dữ liệu: `ocop_backup_{tier}_{timestamp}.dump`
     - Tệp manifest kiểm tra tính toàn vẹn: `ocop_backup_{tier}_{timestamp}.dump.sha256`
     - Tệp chữ ký xác thực nguồn gốc: `ocop_backup_{tier}_{timestamp}.dump.sha256.sig`
     Nếu thiếu bất kỳ tệp nào, monitor lập tức gắn cờ `MISSING_MANIFEST` hoặc `MISSING_SIGNATURE` và từ chối trạng thái `HEALTHY`.
  2. *Xác minh toàn vẹn bản sao mới nhất (Cryptographic Verification of Latest Replica):*
     - Với bản sao mới nhất của từng tier, monitor tải dữ liệu thực tế từ S3 về bộ nhớ.
     - Kiểm tra định dạng manifest hex 64 ký tự (`CORRUPTED_MANIFEST`).
     - Xác minh chữ ký nguồn gốc HMAC-SHA256 (`HMAC_SIGNATURE_MISMATCH`).
     - Tính toán lại mã băm SHA-256 từ luồng byte của tệp `.dump` và đối soát 100% với manifest (`SHA256_PARITY_MISMATCH`).
     - **Chỉ khi toàn bộ các bước kiểm tra mật mã thành công 100% và độ tuổi nằm trong ngưỡng RPO thì monitor mới cấp trạng thái `HEALTHY`**.
- **Các kịch bản phát hiện và cảnh báo tự động:**
  1. *Upload Thất Bại / Bản Sao Bị Hỏng (`UPLOAD_INCOMPLETE`, `MISSING_SIGNATURE`, `SHA256_PARITY_MISMATCH`):* Phát hiện object `.dump` có kích thước 0 bytes, thiếu `.sha256`, thiếu `.sig`, hoặc nội dung dump bị sửa đổi làm lệch mã băm.
  2. *Chữ Ký Không Hợp Lệ (`HMAC_SIGNATURE_MISMATCH`):* Phát hiện bản sao giả mạo hoặc manifest bị sửa đổi trái phép.
  3. *Job Bị Bỏ Lỡ / CronJob Không Chạy (`CRONJOB_MISSED`):* Nếu thời gian trôi qua kể từ bản sao hợp lệ mới nhất trên S3 vượt quá chu kỳ chạy định kỳ + thời gian ân hạn (Grace Period) (ví dụ > 70 phút cho Hourly, > 26 giờ cho Daily).
  4. *Bản Sao Sắp Vượt Ngưỡng RPO (`RPO_APPROACHING`):* Phát cảnh báo Warning khi độ tuổi bản sao trên S3 đạt ngưỡng cảnh báo (ví dụ $\ge 50$ phút cho Hourly, $\ge 22$ giờ cho Daily).
  5. *Vi Phạm Ngưỡng Thiết Kế RPO (`RPO_BREACH`):* Phát cảnh báo Critical khẩn cấp khi bản sao thành công gần nhất cũ hơn mục tiêu RPO ($\ge 60$ phút cho Hourly, $\ge 24$ giờ cho Daily).
  6. *Thiếu Hoàn Toàn Bản Sao (`ZERO_VALID_BACKUPS`):* Không tìm thấy bất kỳ bộ ba bản sao hợp lệ nào trên kho lạnh S3.
- **Kênh Cảnh Báo Khẩn Cấp:**
  - Tự động kích hoạt gửi cảnh báo JSON có che giấu thông tin nhạy cảm tới webhook `BACKUP_ALERT_WEBHOOK_URL` (PagerDuty / Opsgenie / Telegram).
  - Yêu cầu đội On-call tiếp nhận trong vòng 15 phút khi nhận cảnh báo mức **CRITICAL**.

---

## 5. Hướng Dẫn Khôi Phục Cơ Sở Dữ Liệu (Step-by-step Restore & Safety Protocol)
Quy trình khôi phục được bảo vệ nghiêm ngặt bằng các khóa an toàn tự động:
- **Bắt buộc khai báo minh bạch:** Phải cung cấp rõ ràng `RESTORE_DATABASE_URL` và `RESTORE_FILE_PATH`. Hệ thống từ chối mặc định/fallback sang `DATABASE_URL` để ngăn chặn rủi ro ghi đè thảm họa lên production database đang hoạt động.
- **Xác thực Checksum bắt buộc trước khi xóa (`--clean`):** Bản sao phải đi kèm tệp manifest `.sha256` tin cậy (sidecar). Hệ thống so khớp mã băm SHA-256 từng byte; nếu không có manifest hoặc không khớp thì từ chối gọi `pg_restore`.
- **Phân biệt Checksum Parity và Xác thực Nguồn gốc (Origin Authenticity):**
  - *Checksum Parity ($H(\text{dump}) == H_{\text{manifest}})$:* Kiểm chứng file `.dump` không bị hỏng hóc hay lỗi bit trong quá trình truyền tải.
  - *Origin Authenticity ($S(\text{manifest}) == \text{valid}$):* Kiểm chứng tệp manifest `.sha256` thực sự do hệ thống backup chính thức tạo ra thông qua chữ ký `.sha256.sig` và khóa bí mật `BACKUP_HMAC_SECRET`. Nếu chữ ký không hợp lệ, hệ thống từ chối khôi phục ngay cả khi checksum parity khớp, loại trừ triệt để nguy cơ tiêm mã độc qua bản dump giả mạo.
- **Chế độ diễn tập cô lập (Drill Mode):** Khi bật `RESTORE_DRILL_MODE=true`, đích khôi phục bắt buộc phải là database cô lập (tên chứa `drill`, `test`, `isolated`, hoặc tiền tố `ocop_restore_`). Từ chối khôi phục nếu tên database là production.
- **Chế độ kiểm tra an toàn (Dry Run):** `RESTORE_DRY_RUN=true` cho phép kiểm tra tính hợp lệ của biến môi trường, kết nối DB, manifest và checksum mà không can thiệp hay xóa bất kỳ dữ liệu nào.

### Các bước thực hiện:
1. **Tải bản sao lưu, manifest và chữ ký từ kho lưu trữ độc lập:**
   ```bash
   aws s3 cp s3://ocop-prod-backups-cold-storage/ocop_backup_YYYY-MM-DD.dump ./latest.dump
   aws s3 cp s3://ocop-prod-backups-cold-storage/ocop_backup_YYYY-MM-DD.dump.sha256 ./latest.dump.sha256
   aws s3 cp s3://ocop-prod-backups-cold-storage/ocop_backup_YYYY-MM-DD.dump.sha256.sig ./latest.dump.sha256.sig
   ```
2. **Thực thi khôi phục an toàn với engine đã kiểm chứng:**
   ```bash
   RESTORE_DATABASE_URL="postgresql://user:pass@host:5432/target_db" \
   RESTORE_FILE_PATH="./latest.dump" \
   BACKUP_HMAC_SECRET="<trusted-secret-from-vault>" \
   node backend/scripts/production-restore.mjs
   ```
3. **Kiểm tra trạng thái schema và di chuyển dữ liệu:**
   ```bash
   cd backend && DATABASE_URL="postgresql://user:pass@host:5432/target_db" npx prisma migrate status
   ```
   *Yêu cầu kết quả bắt buộc:* `Database schema is up to date!`.
4. **Kiểm tra Health Check ứng dụng:**
   ```bash
   curl -i http://localhost:3000/api/v1/health/ready
   ```
   *Yêu cầu phản hồi bắt buộc:* `HTTP/1.1 200 OK`.

---

## 6. Trạng Thái Triển Khai Thực Tế & Danh Mục Hạ Tầng Thật Còn Thiếu

| Thành phần | Trạng thái Hiện tại | Bằng chứng Staging Đã Đo | Điều Kiện Hạ Tầng Thật Còn Thiếu Để Nghiệm Thu Production |
| :--- | :---: | :--- | :--- |
| **Hạ tầng Cụm Kubernetes** | **CHƯA KIỂM CHỨNG TRÊN CLUSTER THẬT** | Manifest Hourly & Daily đã kiểm tra cú pháp và cấu trúc hợp lệ; Docker container chạy non-root (UID 1000) thông suốt. | Cần cụm K8s Production (EKS/GKE/K3s) đang hoạt động với quyền `kubectl apply`, Secret Vault và PVC CSI driver thực tế. |
| **Kho Sao Lưu Ngoài Vùng (Off-site S3) & WORM** | **CHƯA KIỂM CHỨNG TRÊN KHO NGOÀI VÙNG** | Đã kiểm thử luồng upload, download, parity SHA-256, chữ ký HMAC trên MinIO cục bộ; kiểm chứng tương thích WORM và S3 Lifecycle Policy qua test mock. CHƯA triển khai trên bucket thật. | Cần tài khoản AWS S3 / Cloudflare R2 độc lập vùng địa lý, cấu hình TLS bắt buộc, IAM Least-Privilege và kích hoạt S3 Object Lock (WORM Compliance Mode) trên bucket production thật. |
| **Mục Tiêu RPO $\le 1$ giờ** | **MỤC TIÊU THIẾT KẾ (CHƯA ĐẠT)** | Đã triển khai script backup phân tách tier hourly/daily và kiểm chứng cơ chế đo thời gian thực thi, cảnh báo staleness. | Cần vận hành lịch CronJob liên tục và tổ chức diễn tập mô phỏng mất dữ liệu (data loss drill) trên hạ tầng staging tương đương production. |
| **Media HTTPS / CDN** | **CHỜ HẠ TẦNG MẠNG** | Đã kiểm thử upload/read media MinIO nội bộ. | Cần domain tĩnh, chứng chỉ TLS/SSL Let's Encrypt / Cloudflare, CDN và cấu hình chính sách ký URL (Presigned URL) chống đọc công khai tài liệu chứng nhận. |
| **Cổng Thanh Toán VNPAY Live** | **CHỜ CREDENTIALS** | Đã kiểm thử luồng tính toán chữ ký kiểm tra (checksum) VNPAY sandbox nội bộ. | Cần tài khoản thương mại doanh nghiệp, Merchant ID (TMN_CODE) và Hash Secret chính thức từ VNPAY trên môi trường live. |
| **Hãng Vận Chuyển Live** | **CHỜ CREDENTIALS & ENDPOINT TĨNH** | Đã triển khai adapter GHN/GHTK/ViettelPost với xác thực chữ ký webhook. | Cần hợp đồng thương mại với đơn vị vận chuyển, API Token live, và endpoint webhook có IP/Domain tĩnh có thể nhận callback từ Internet. |
| **Mạng Blockchain Mục Tiêu** | **CHƯA TRIỂN KHAI MAINNET** | Đã kiểm thử triển khai và mint hợp đồng thông minh trên Hardhat node cục bộ (`127.0.0.1:8545`). | Cần địa chỉ ví đa chữ ký (Multisig Wallet / Gnosis Safe), nạp native token (MATIC/ETH) để trả phí gas và deploy lên mạng Polygon/Base mainnet. |
