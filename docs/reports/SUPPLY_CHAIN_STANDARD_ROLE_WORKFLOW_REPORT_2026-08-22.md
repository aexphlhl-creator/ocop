# Báo cáo triển khai nghiệp vụ chuẩn Chuỗi cung ứng

Ngày hoàn tất: 22/08/2026  
Phạm vi: phân quyền Admin, Warehouse Manager và Logistics cho quy trình bàn giao - vận chuyển - giao hàng.

## 1. Kết quả

Hệ thống đã được chuyển từ mô hình “Admin hoặc nhiều role cùng tự ghi công đoạn” sang mô hình có trách nhiệm và audit trail rõ ràng:

| Vai trò | Trách nhiệm được phép | Trách nhiệm bị chặn |
|---|---|---|
| `ADMIN` | Giám sát toàn bộ lô, lịch sử, thống kê; tạo tài khoản Logistics | Không được ghi bất kỳ công đoạn hành trình nào |
| `SELLER` | Thu hoạch, tiếp nhận, kiểm định, chế biến, đóng gói | Không được nhập kho, bàn giao hoặc cập nhật vận chuyển |
| `WAREHOUSE_MANAGER` | Kiểm định, nhập kho, xác nhận xuất kho và bàn giao đúng kho được phân công | Không được cập nhật đang giao/đã giao |
| `LOGISTICS` | Nhận đúng chuyến được chỉ định; cập nhật đang vận chuyển, nhà phân phối, bán lẻ và đã giao | Không xem hoặc cập nhật lô không được giao cho mình |

Luồng bắt buộc hiện tại:

`Thu hoạch → Tiếp nhận → Kiểm định → Chế biến → Đóng gói → Nhập kho → Bàn giao vận chuyển → Đang vận chuyển → Nhà phân phối → Bán lẻ → Khách hàng`

Không được bỏ bước, đi lùi hoặc ghi trùng công đoạn. Kiểm định lại chỉ được phép khi lần kiểm định gần nhất chưa đạt.

## 2. Root cause đã khắc phục

### High — Không có phân công trách nhiệm chuyến hàng

Trước đây database không có entity liên kết lô hàng với người vận chuyển. Vì vậy hệ thống không thể chứng minh ai được bàn giao lô và ai có quyền xác nhận đang giao/đã giao.

Khắc phục: bổ sung `BatchLogisticsAssignment` gồm lô, người Logistics, người bàn giao, đơn vị vận chuyển, mã vận đơn, thời điểm nhận/giao và trạng thái. Unique index có điều kiện bảo đảm mỗi lô chỉ có tối đa một phân công `ASSIGNED/IN_TRANSIT` đang hoạt động.

### High — Admin có thể trực tiếp tạo sự kiện truy xuất

API ghi journey trước đây cho phép Admin. Điều này làm mất tính độc lập giữa giám sát và vận hành.

Khắc phục: loại Admin khỏi endpoint mutation và kiểm tra lần hai trong service. Thử gọi API thật bằng token Admin trả HTTP `403`.

### High — Không có mốc bàn giao giữa kho và vận chuyển

Trước đây `WAREHOUSE` chuyển thẳng sang `SHIPPING`, nên không lưu được biên bản, người nhận chuyến, đơn vị vận chuyển và mã vận đơn tại thời điểm xuất kho.

Khắc phục: thêm stage `HANDOVER_TO_CARRIER` ở thứ tự 7. Bước này chỉ Warehouse Manager được ghi, bắt buộc chọn Logistics, đơn vị vận chuyển, mã vận đơn và ít nhất một minh chứng.

### High — Người vận chuyển có thể cập nhật sai lô nếu chỉ dựa vào role

Chỉ kiểm tra role `LOGISTICS` là chưa đủ vì mọi nhân viên vận chuyển có cùng role.

Khắc phục: mọi read/write của Logistics đều scope theo `logisticsUserId` trong assignment. Khi bắt đầu vận chuyển, assignment phải ở `ASSIGNED`; các bước sau phải ở `IN_TRANSIT`; khi giao cho khách hàng chuyển atomically sang `DELIVERED`.

### Medium — Có thể bỏ qua công đoạn

Logic cũ chỉ chặn đi lùi, nhưng vẫn cho phép nhảy từ công đoạn 4 lên 6.

Khắc phục: backend yêu cầu `stage.order = latest.order + 1`; frontend cũng chỉ hiển thị đúng bước kế tiếp thuộc quyền của role.

### Medium — Danh tính người ghi nhận có thể sửa trên form

Khắc phục: `actorName` và `actorId` được lấy từ JWT/tài khoản đã xác thực. Ô tên trên UI chuyển sang read-only; giá trị giả mạo từ client bị bỏ qua.

### Medium — Chỉ số “Đang vận chuyển” mất lô ở nhà phân phối/bán lẻ

Khắc phục: `inProgressBatches` tính các lô có stage mới nhất là `SHIPPING`, `DISTRIBUTOR` hoặc `RETAIL`; `completedBatches` chỉ tính `CUSTOMER`; bổ sung chỉ số `awaitingCarrierPickup` cho lô đã bàn giao nhưng chưa nhận vận chuyển.

## 3. Thay đổi dữ liệu và migration

Đã bổ sung và áp dụng thành công bốn migration:

1. `20260822010000_add_logistics_role_and_assignments`
2. `20260822010100_seed_logistics_role`
3. `20260822010200_add_handover_supply_chain_stage`
4. `20260822010300_seed_handover_supply_chain_stage`

Enum value và dữ liệu dùng enum được tách thành migration riêng để phù hợp transaction rule của PostgreSQL.

Migration stage được làm self-contained: database sạch sau `migrate deploy` có đủ cả 11 stage, không phụ thuộc việc đã chạy seed thủ công. Database local hiện có 20/20 migration và `prisma migrate status` báo up to date.

## 4. Thay đổi giao diện

- Admin thấy banner “Chế độ giám sát”, không còn nút ghi nhận công đoạn.
- Admin có modal danh sách/tạo tài khoản Logistics; mật khẩu yêu cầu tối thiểu 8 ký tự có chữ hoa, chữ thường và chữ số.
- Warehouse Manager có menu Bàn giao vận chuyển, được chọn nhân viên Logistics khi ghi bước bàn giao.
- Logistics có dashboard/menu Chuyến hàng của tôi và chỉ thấy lô được phân công.
- Form ghi nhận lọc đúng stage theo role và chỉ hiển thị đúng bước kế tiếp.
- Bước bàn giao bắt buộc mã vận đơn, nhà vận chuyển và minh chứng.
- Bước Shipping hiển thị read-only mã vận đơn/nhà vận chuyển đã nhận từ bàn giao.
- Tổng quan lô hiển thị nhà vận chuyển, mã vận đơn, người phụ trách và trạng thái chuyến.
- Timeline, bản đồ và trang truy xuất công khai có icon riêng cho bước bàn giao.

## 5. Bằng chứng kiểm thử

### Automated regression

- Prisma schema format/validate/generate: PASS.
- Backend production build: PASS.
- Frontend production build: PASS, 34 route được tạo.
- Backend unit test: **21/21 suite, 108/108 test PASS**.
- Targeted ESLint cho production Supply Chain/Users backend: PASS.
- Targeted ESLint cho form, account modal, stats, overview và page Supply Chain frontend: PASS.
- PGlite migration test: PASS, áp dụng 20 migration và xác nhận payment/role/handover/logistics constraints.

Test mới bao gồm:

- Admin bị chặn ghi journey.
- Warehouse Manager bàn giao thành công cho một Logistics hợp lệ.
- Tên giả mạo từ client không thay thế danh tính tài khoản.
- Logistics không được xem lô giao cho người khác.
- Không được bỏ qua công đoạn trung gian.
- Public registration không thể tạo role Logistics.
- Chỉ tài khoản Logistics active xuất hiện trong danh sách phân công.
- Thống kê phân biệt chờ nhận hàng, đang vận chuyển qua nhiều điểm và đã giao.

### Smoke test database/API thật

- PostgreSQL và Redis local: kết nối thành công.
- Bốn migration mới: áp dụng thành công.
- `GET /api/v1/supply-chain/stages`: 11 stage.
- `HANDOVER_TO_CARRIER.order`: 7.
- `SHIPPING.order`: 8.
- `GET /api/v1/users/logistics` bằng Admin: thành công.
- `POST /api/v1/supply-chain/.../journey` bằng Admin: HTTP 403.
- Public đăng ký `LOGISTICS`: HTTP 400 từ DTO whitelist (chỉ `VISITOR/SELLER`).
- Backend và frontend production server khởi động thành công tại local.

### Browser smoke test

Middleware bảo vệ `/dashboard/supply-chain` hoạt động: phiên trình duyệt chưa đăng nhập được redirect đúng về `/login`; form đăng nhập render bình thường. Phiên trình duyệt tích hợp không có sẵn session Admin nên không nhập thông tin đăng nhập của người dùng để tránh can thiệp tài khoản; phần UI có xác thực được bao phủ bởi production build và API smoke test.

## 6. Phạm vi chưa tích hợp

Luồng hiện tại dùng tài khoản `LOGISTICS` nội bộ và thao tác xác nhận thủ công có audit trail. Chưa tích hợp webhook thật của GHN, GHTK hoặc Viettel Post vì repository chưa có API credential, hợp đồng webhook, mapping trạng thái và cơ chế xác minh chữ ký của từng nhà cung cấp.

Khi triển khai webhook ở phase tiếp theo cần tối thiểu:

- bảng mapping provider status → state nội bộ;
- chữ ký webhook, chống replay và idempotency event;
- lưu raw payload đã che dữ liệu nhạy cảm;
- retry/dead-letter queue;
- đối soát định kỳ khi webhook thiếu hoặc đến sai thứ tự;
- cơ chế override có phê duyệt và audit log.

## 7. Technical debt không thuộc thay đổi này

Full frontend lint toàn repository vẫn thất bại với 335 vấn đề cũ (223 error, 112 warning) ở nhiều module ngoài phạm vi, chủ yếu là explicit `any`, React effect, unused import và accessibility. Các file production Supply Chain được thay đổi trong hạng mục này lint sạch và production build pass. Không chạy auto-fix hàng loạt để tránh tạo regression ngoài phạm vi.
