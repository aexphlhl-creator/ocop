# External Carrier Shipment Simplification Report

Ngày: 2026-09-04

## Kết luận

Đã chỉnh quy trình vận chuyển theo hướng production phù hợp với phạm vi OCOP hiện tại: hệ thống không vận hành đội giao hàng nội bộ, không tạo tài khoản nhân viên logistics, không để admin/seller tự cập nhật trạng thái shipping/delivered. OCOP chỉ tạo vận đơn với hãng vận chuyển bên ngoài, warehouse manager xác nhận bàn giao hàng cho hãng, các trạng thái vận chuyển sau đó được cập nhật qua webhook/API/tracking của hãng.

## Root cause nghiệp vụ

Thiết kế MVP trước đó giả định hệ thống có role `LOGISTICS` và nhân viên giao hàng nội bộ. Điều này làm quy trình bị sai phạm vi:

- Admin phải tạo tài khoản logistics dù doanh nghiệp không vận hành đội ship.
- Warehouse manager phải gán chuyến cho nhân viên logistics nội bộ.
- Trạng thái `SHIPPING`, `DELIVERED`, `DELIVERY_FAILED` có thể bị cập nhật thủ công bởi user nội bộ, không phản ánh nguồn dữ liệu thật từ hãng vận chuyển.
- Supply-chain journey bị lẫn trách nhiệm giữa truy xuất nguồn gốc sản xuất và tracking vận chuyển.

## Thay đổi đã thực hiện

### Backend

- Thêm `trackingUrlTemplate` cho bảng `logistics_organizations` để lưu link tracking của hãng, hỗ trợ placeholder `{trackingCode}`.
- Khi tạo shipment, bắt buộc có `trackingCode`; shipment chuyển thẳng sang trạng thái `ASSIGNED` theo nghĩa “đã tạo vận đơn với hãng”.
- `handover` chỉ cho `WAREHOUSE_MANAGER` xác nhận bàn giao hàng cho hãng, yêu cầu bằng chứng bàn giao và cập nhật order sang trạng thái shipped.
- Chặn flow nội bộ cũ:
  - `POST /api/v1/users/logistics` trả `410 Gone`.
  - `GET /api/v1/users/logistics` trả `410 Gone`.
  - service assign/transition shipment nội bộ trả `410 Gone`.
  - supply-chain không còn cho role logistics ghi nhận hành trình lô.
- Webhook carrier được giữ làm nguồn cập nhật trạng thái vận chuyển sau bàn giao.
- Supply-chain response không còn expose logistics assignment cũ trong các truy vấn chính; dữ liệu vận chuyển lấy qua `shipmentItems.shipment`.

### Frontend

- Trang `/dashboard/logistics` đổi thành quản lý “Hãng vận chuyển”, không còn tạo tài khoản logistics.
- Form tạo shipment yêu cầu chọn hãng vận chuyển và nhập mã vận đơn từ hãng.
- Shipment card hiển thị hãng, mã vận đơn, và link tracking ngoài nếu hãng có `trackingUrlTemplate`.
- Modal shipment chỉ còn:
  - bàn giao cho hãng,
  - hủy trước bàn giao.
  Không còn phân công/gán lại/cập nhật trạng thái bởi logistics nội bộ.
- Trang supply-chain không còn nút/tải danh sách tài khoản logistics.
- Form ghi nhận hành trình lô chỉ còn dữ liệu nguồn gốc/sản xuất do seller ghi nhận; không còn trường “Nhân viên Logistics”, “shipping”, “delivered”.
- Overview lô hiển thị vận đơn/hãng/tracking từ shipment liên kết, không hiển thị người phụ trách logistics nội bộ.

## Quy trình production sau sửa

1. Seller khai báo/tạo lô và ghi nhận các công đoạn nguồn gốc/sản xuất.
2. Warehouse manager tiếp nhận/cách ly/xếp vị trí theo lifecycle kho.
3. QA kiểm định và phát hành lô đạt chuẩn.
4. Khi có đơn cần giao, warehouse manager tạo shipment với hãng vận chuyển bên ngoài và nhập mã vận đơn.
5. Warehouse manager bàn giao hàng cho hãng, kèm bằng chứng bàn giao.
6. Hãng vận chuyển cập nhật trạng thái qua webhook/API/tracking:
   - picked up,
   - in transit,
   - out for delivery,
   - delivered,
   - delivery failed/returning/returned nếu có.
7. Customer/admin/seller theo dõi trạng thái qua timeline và tracking URL.

## Kiểm thử đã chạy

- Backend build: `npm run build` — pass.
- Backend tests trọng điểm:
  - `shipments.service.spec.ts`
  - `users.service.spec.ts`
  - `supply-chain.service.spec.ts`
  - `carrier-webhooks.controller.spec.ts`
  - Kết quả: 4 suites pass, 31 tests pass.
- Frontend TypeScript: `npx tsc --noEmit` — pass.
- Frontend focused lint các file shipment/supply-chain/layout liên quan — pass.

## Ghi chú tương thích

Tên schema/class `LogisticsOrganization` vẫn được giữ để tránh migration rename lớn và rủi ro không cần thiết. Trong nghiệp vụ mới, entity này được dùng như “hãng vận chuyển/carrier provider”. Role/tables logistics legacy được giữ để không phá dữ liệu/migration cũ, nhưng UI/API mới không còn sử dụng chúng cho vận hành production.
