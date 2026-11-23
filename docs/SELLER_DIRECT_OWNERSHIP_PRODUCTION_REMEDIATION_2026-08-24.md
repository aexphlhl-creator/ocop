# Báo cáo remediation production: Admin quản lý trực tiếp Seller

Ngày hoàn thành: 24/08/2026  
Phạm vi: Backend, frontend, Prisma/PostgreSQL, dữ liệu seed, phân quyền, kho, logistics, shipment và truy xuất nguồn gốc.

## 1. Kết quả

Mô hình nghiệp vụ vận hành đã được chuyển từ `Admin → Business → dữ liệu` sang:

`Admin → Seller (User role SELLER) → SellerProfile → dữ liệu Seller sở hữu trực tiếp`

Các thực thể vận hành chính hiện có khóa `sellerId` trực tiếp gồm Product, Order, Voucher, OCOP upgrade request, Warehouse, Supplier, PurchaseOrder và GoodsReceipt. Seller được xác định bằng tài khoản `User` có role `SELLER`; `SellerProfile` là hồ sơ gian hàng một-một của tài khoản đó, không phải một chủ thể đăng nhập riêng.

Admin quản lý nhiều Seller tại `/dashboard/sellers`: tạo tài khoản, cập nhật hồ sơ, xác minh, khóa và kích hoạt lại. Seller không còn tự đăng ký từ màn hình public; đăng ký public chỉ tạo tài khoản khách hàng `VISITOR`.

## 2. Quyền và trách nhiệm nghiệp vụ

| Role | Trách nhiệm chính |
| --- | --- |
| `ADMIN` | Tạo/quản lý Seller, giám sát toàn hệ thống, xác minh hồ sơ/chứng nhận và xử lý ngoại lệ |
| `SELLER` | Quản lý hồ sơ gian hàng, sản phẩm, nguồn gốc và công đoạn sản xuất thuộc chính mình |
| `WAREHOUSE_MANAGER` | Quản lý kho được gán, tiếp nhận lô, kiểm kê, xác nhận xuất kho và bàn giao |
| `LOGISTICS` | Tiếp nhận chuyến giao, xác nhận lấy hàng/đang giao/đã giao hoặc thất bại kèm bằng chứng |
| `VISITOR` | Mua hàng, theo dõi đơn và tra cứu QR/lô công khai |

Admin-created Seller, Warehouse Manager và Logistics phải đổi mật khẩu tạm trước khi được phép gọi API nghiệp vụ.

## 3. Thay đổi dữ liệu và migration

Đã bổ sung và áp dụng các migration production quan trọng:

- `20260824010000_production_shipments`: shipment, event bất biến, phân công logistics và ràng buộc trạng thái.
- `20260824020000_production_traceability`: định danh party/location, khai báo nguồn gốc theo revision, liên kết nguyên liệu đầu vào–đầu ra và audit append-only.
- `20260824030000_direct_seller_ownership`: backfill SellerProfile xác định, thêm sở hữu trực tiếp theo Seller và bảo vệ lịch sử.
- `20260824040000_account_security_hardening`: chuẩn hóa email không phân biệt hoa/thường, unique index và cờ bắt buộc đổi mật khẩu.

Cơ sở dữ liệu local `ocop_vietnam` hiện có 24 migration và `prisma migrate status` xác nhận schema đã đồng bộ.

Quy tắc backfill chọn Seller đã xác minh trước, sau đó chọn bản ghi sớm nhất theo thứ tự ổn định. Migration dừng ngay nếu không xác định được chủ sở hữu hợp lệ; không gán dữ liệu ngẫu nhiên.

Các cột/bảng `Business` cũ vẫn được giữ nullable trong một chu kỳ rollback/audit. Luồng ghi vận hành mới không phụ thuộc chúng; dữ liệu demo Product/Warehouse đã có `business_id = NULL`. Route `/dashboard/businesses` chuyển hướng sang `/dashboard/sellers`. API Business cũ chỉ còn lớp tương thích và nên bị xóa ở phase 2 sau khi hết thời hạn rollback.

## 4. Luồng truy xuất nguồn gốc production

Mỗi lô có định danh riêng và lưu dữ liệu theo hướng GS1 CTE/KDE:

1. Seller khai báo nguồn: source party, source location, source lot, quốc gia, ngày thu hoạch/sản xuất, phương pháp và bằng chứng.
2. Hệ thống tạo lịch sử revision; bản khai cũ không bị ghi đè mất dấu vết.
3. Seller ghi các công đoạn sản xuất có Who–What–Where–When–Why và bằng chứng: thu hoạch/tiếp nhận nguyên liệu, kiểm định, chế biến, đóng gói.
4. Khi chế biến, `BatchMaterialLink` nối lô nguyên liệu đầu vào với lô thành phẩm đầu ra để truy ngược và truy xuôi.
5. Warehouse Manager xác nhận nhập kho, xuất kho và bàn giao.
6. Logistics xác nhận lấy hàng, đang vận chuyển, giao thành công hoặc thất bại; mỗi event là append-only.
7. Chứng nhận có thể gắn ở cấp Product hoặc Batch nhưng API khử trùng theo `certificateNumber`.
8. Điểm xác minh chỉ đạt 100% khi các dữ kiện áp dụng đều đầy đủ; trạng thái blockchain được báo riêng, không giả định là đã đồng bộ.

Lỗi chiều liên kết nguyên liệu đã được sửa: API hiện đọc các liên kết mà lô hiện tại là **đầu ra**, từ đó trả về đúng các lô nguyên liệu đã tiêu thụ. Đã thêm test hồi quy cho lỗi này và lỗi chứng nhận bị lặp.

## 5. Kho, Manager và Logistics

- Danh sách kho có tab riêng, tổng số kho, thẻ tổng quan và chức năng chỉnh sửa.
- Modal tạo kho cho phép tạo Warehouse Manager rồi gán ngay; lỗi mất focus khi nhập tên kho đã được xử lý.
- Admin có khu vực tạo/quản lý tài khoản Logistics.
- Shipment có state machine và kiểm tra role; Admin giám sát, không thay người vận hành xác nhận công đoạn thông thường.
- Lịch sử shipment/traceability là append-only và giữ actor, thời điểm, vị trí, ghi chú, bằng chứng và mã tham chiếu.

## 6. Bảo mật tài khoản

- Email được trim/lowercase khi đăng ký, đăng nhập và lưu DB; có unique index `lower(email)`.
- Đăng nhập không phân biệt hoa/thường.
- Mật khẩu yêu cầu 8–72 ký tự, có chữ hoa, chữ thường và chữ số.
- Tài khoản vận hành do Admin tạo có `mustChangePassword = true`.
- Interceptor toàn cục chặn API nghiệp vụ cho đến khi đổi mật khẩu; chỉ cho phép `/auth/me`, `/auth/change-password`, `/auth/logout` và `/auth/refresh`.
- Luồng đổi mật khẩu xác minh mật khẩu hiện tại và xóa cờ bắt buộc đổi mật khẩu trong cùng thao tác.
- Khóa Seller làm Seller và dữ liệu public của Seller ngừng xuất hiện; cache liên quan được xóa bằng Redis `SCAN` + `UNLINK`, không dùng lệnh `KEYS` blocking.

## 7. Seed và dữ liệu demo

Seed chuẩn không còn tạo Business mới. Mỗi gian hàng có một Seller account và một SellerProfile riêng; Product có `sellerId`, `businessId = NULL`.

Enterprise seed đã được sửa để:

- tạo đúng role `WAREHOUSE_MANAGER` và `LOGISTICS`;
- sửa tài khoản kho demo từng bị gán nhầm role Seller;
- tạo năm Seller độc lập, năm kho theo Seller và dữ liệu procurement sở hữu trực tiếp;
- tạo 40 batch, 120 journey, 30 certificate;
- tạo party/location đã xác minh, origin declaration và quan hệ nguyên liệu `FIFO-B → FIFO-A`;
- chỉ seed chuỗi sản xuất đến nhập kho; không giả lập shipping/delivered bằng event batch cũ.

Sau khi chạy cả hai seed, API public đang đọc 10 SellerProfile và 23 Product trong DB kiểm thử tích hợp.

## 8. Kết quả kiểm thử

| Hạng mục | Kết quả |
| --- | --- |
| Prisma format / validate / generate | PASS |
| Migration status | PASS — 24 migration, DB up to date |
| Payment migration verifier | PASS |
| Shipment migration verifier | PASS |
| Traceability migration verifier | PASS |
| Direct Seller migration verifier | PASS |
| Backend unit test | PASS — 25 suite, 138 test |
| Backend E2E | PASS — 5 suite, 26 test |
| Backend production build | PASS |
| Frontend production build | PASS — 37 page |
| `git diff --check` | PASS |

Runtime smoke test:

- đăng nhập email viết hoa trả về đúng tài khoản đã chuẩn hóa;
- tài khoản Seller tạm bị chặn API nghiệp vụ trước khi đổi mật khẩu và được mở sau khi đổi;
- Product public trả về `sellerId`/SellerProfile và không còn object Business;
- lô `DEMO-015-FIFO-A` trả về `VERIFIED`, completeness score 100, không thiếu trường, một liên kết nguyên liệu, hai certificate và hai mã certificate duy nhất;
- UI đã được kiểm tra ở danh sách gian hàng, chi tiết Seller, đăng ký khách hàng và trang truy xuất nguồn gốc. Kiểm tra UI này phát hiện trực tiếp hai lỗi relation nguyên liệu và certificate lặp, sau đó đã có test hồi quy.

## 9. Nợ kỹ thuật còn lại

Các mục dưới đây không làm build/test hiện tại thất bại nhưng chưa đủ điều kiện để coi toàn repository là lint-clean:

- Backend ESLint hiện báo 760 vấn đề (680 error, 80 warning), chủ yếu là type-safety/format cũ trên phạm vi rộng.
- Frontend ESLint hiện báo 326 vấn đề (223 error, 103 warning), chủ yếu là `any`, React hooks và accessibility cũ.
- Lệnh TypeScript độc lập trên toàn bộ test mock còn lỗi typing vì một số mock cũ chưa có các field mới; production build TypeScript vẫn PASS.
- E2E cần `--forceExit` do còn open handle trong test harness.
- Next.js cảnh báo convention `middleware` đã deprecated và nên chuyển sang `proxy` ở đợt cleanup.
- Blockchain demo hiện chưa có confirmation thật; UI/API phải tiếp tục hiển thị độc lập với trạng thái traceability nghiệp vụ.

Khuyến nghị không bật lint thành release gate ngay trên toàn repository trong cùng bản thay đổi lớn này. Nên tạo đợt hardening riêng, chốt baseline, sửa theo module và sau đó bật `lint + unit + E2E + migration verifier + build` làm CI gate bắt buộc.

## 10. Kế hoạch loại bỏ Business phase 2

Sau một chu kỳ staging/rollback:

1. Theo dõi log để xác nhận không còn client gọi `/api/v1/businesses` hoặc gửi `businessId`.
2. Xóa fallback Business trong Product API, notification target legacy và service tạo Order cũ đã bị trả HTTP 410.
3. Export bảng Business/khóa legacy phục vụ audit.
4. Migration cuối xóa relation/cột `business_id`, `legacy_business_id`, bảng `businesses` và route redirect.
5. Chạy lại toàn bộ migration verifier trên DB snapshot production trước khi deploy.

## 11. Kết luận phát hành

Phần mô hình nghiệp vụ Admin–Seller, phân quyền vận hành, shipment và truy xuất nguồn gốc đã được triển khai, migrate và kiểm thử thành công. Có thể đưa bản này lên staging/UAT. Trước khi phát hành production công khai cần hoàn tất cấu hình secret/integration theo môi trường, chạy UAT theo role thật, backup DB, diễn tập rollback và quyết định policy đối với lint debt nêu trên.
