# Báo cáo khắc phục quy trình xuất kho và vận chuyển production

Ngày nghiệm thu: 2026-08-26  
Phạm vi: Inventory, Order Reservation, Shipment, Logistics, giao diện Quản lý kho/Đơn hàng/Chuyến hàng.

## 1. Kết luận

Luồng xuất kho đã được chuyển từ thao tác FIFO thủ công sang quy trình có kiểm soát:

1. Đơn hàng checkout giữ tồn theo từng `OrderItemBatchReservation`.
2. Seller xác nhận và đóng gói đơn, nhưng không được tự chuyển sang `SHIPPED`.
3. Warehouse Manager chọn đơn sẵn sàng xuất tại kho mình quản lý hoặc tạo chuyến điều chuyển thủ công.
4. Khi tạo chuyến, hệ thống khóa và phân bổ tồn; chưa trừ tồn vật lý.
5. Warehouse Manager gán Logistics và xác nhận bàn giao có minh chứng.
6. Tại bàn giao, hệ thống trừ đúng lô/reservation thuộc chuyến trong cùng transaction.
7. Logistics cập nhật hành trình, giao thành công, giao thất bại hoặc hoàn hàng.
8. Hàng hoàn được nhập vào lô `QUARANTINE`, chưa được bán lại trước khi kiểm định.

Admin chỉ giám sát. Seller chỉ quản lý trạng thái chuẩn bị đơn. Warehouse Manager chịu trách nhiệm kho và bàn giao. Logistics chịu trách nhiệm hành trình sau bàn giao.

## 2. Root cause đã phát hiện

| Mã | Mức độ | Root cause | Rủi ro trước khi sửa |
|---|---|---|---|
| OUT-01 | Critical | `POST /inventory/out` cho phép xuất FIFO trực tiếp, không bắt buộc Shipment | Bypass phân công Logistics, bằng chứng bàn giao và audit trail |
| OUT-02 | Critical | Shipment DRAFT/ASSIGNED không cộng `Inventory.reservedQuantity` | Hai chuyến hoặc checkout đồng thời có thể cấp phát trùng cùng tồn |
| OUT-03 | Critical | Bàn giao Shipment không trừ `InventoryBatch` và `Inventory` | Hàng đã rời kho nhưng số tồn vẫn còn, có thể bán lại |
| OUT-04 | High | Hủy chuyến không hoàn phần tồn đã giữ | Tồn khả dụng bị khóa vĩnh viễn |
| OUT-05 | Critical | Order có thể chuyển trực tiếp `PACKING -> SHIPPED` và trừ toàn đơn | Bypass Shipment; có nguy cơ double deduction khi đồng thời có chuyến |
| OUT-06 | Critical | Một order có thể reserve từ nhiều kho nhưng logic bàn giao cũ trừ toàn bộ order | Kho A bàn giao có thể trừ luôn hàng đang nằm tại kho B |
| OUT-07 | High | Hoàn hàng chỉ đổi trạng thái, không có bút toán hoàn kho/cách ly | Sai tồn và hàng chưa tái kiểm định có thể bị bán lại |
| OUT-08 | High | Hủy order không kiểm tra chuyến đang hoạt động | Reservation bị release trong khi chuyến vẫn chuẩn bị giao |
| OUT-09 | Medium | Modal frontend chưa đọc order/reservation, người dùng nhập tay người nhận và lô | Sai địa chỉ, sai seller, sai lô hoặc sai số lượng |
| OUT-10 | Medium | Modal có thể mở trước khi query kho/đơn vị vận chuyển hoàn tất | Dropdown có dữ liệu nhưng state vẫn rỗng, nút tạo bị khóa |
| OUT-11 | Medium | Tailwind chưa map semantic token `error/success/warning/info` | Nút destructive có thể hiển thị nền trắng/chữ trắng |

## 3. Thay đổi đã thực hiện

### 3.1. Bảo toàn tồn kho

- Tạo shipment thủ công cộng phần giữ vào `Inventory.reservedQuantity`.
- Hủy shipment trước bàn giao hoàn đúng phần giữ.
- Bàn giao shipment thủ công:
  - khóa `Inventory` rồi `InventoryBatch` theo thứ tự ID;
  - trừ tồn lô và tổng tồn;
  - trừ phần reserved;
  - tạo `StockMovement OUT` tham chiếu Shipment;
  - rollback toàn bộ nếu bất kỳ bất biến nào không còn đúng.
- Migration `20260826010000_shipment_inventory_consistency` tái dựng `reserved_quantity` từ hai ledger có thẩm quyền:
  - reservation order trạng thái `ACTIVE`;
  - shipment thủ công trạng thái `DRAFT/ASSIGNED`.
- Migration abort nếu phát hiện batch hoặc inventory đã over-allocated.

### 3.2. Xuất theo đơn và split fulfillment

- Thêm `GET /api/v1/shipments/fulfillment-orders` chỉ dành cho Warehouse Manager.
- Endpoint chỉ trả về:
  - order `PACKING/PROCESSING`;
  - COD hoặc VNPay đã `COMPLETED`;
  - reservation ledger còn đầy đủ;
  - lô `ACTIVE`, kiểm định `PASSED`, còn đủ tồn;
  - phần reservation thuộc kho do chính tài khoản quản lý;
  - phần chưa nằm trong shipment `DRAFT/ASSIGNED` khác.
- Một order reserve từ nhiều kho được tách thành nhiều fulfillment group theo kho.
- Mỗi chuyến phải bao phủ chính xác các reservation `ACTIVE` của kho xuất. Một reservation row không được tách giữa nhiều chuyến.
- Khi bàn giao, `deductShipment()` chỉ trừ reservation xuất hiện trong Shipment; phần của kho khác giữ nguyên.
- Order chỉ được đánh dấu `DELIVERED` khi:
  - không còn shipment chưa hoàn tất; và
  - không còn reservation `ACTIVE` chưa tạo/bàn giao chuyến.

### 3.3. Đóng các đường bypass

- `POST /api/v1/inventory/out` trả `410 Gone` với hướng dẫn dùng Shipment.
- Màn hình Inventory bỏ modal xuất FIFO và điều hướng Warehouse Manager sang `/dashboard/shipments`.
- Seller/Admin không còn lựa chọn hoặc quyền API chuyển trực tiếp order sang `SHIPPED`.
- Order có shipment chưa hủy không được hủy; Warehouse Manager phải hủy chuyến trước.

### 3.4. Hoàn hàng và chất lượng

- Khi trạng thái Shipment chuyển `RETURNED`, hệ thống:
  - tạo lô hoàn mới;
  - đặt vị trí `RETURN-QUARANTINE`;
  - đặt `qualityStatus = QUARANTINE`;
  - cộng lại tồn vật lý;
  - ghi `StockMovement RETURN` tham chiếu shipment;
  - yêu cầu kiểm định trước khi bán lại.

### 3.5. Giao diện

- Modal tạo chuyến có hai chế độ:
  - **Xuất theo đơn hàng**: tự lấy order, seller, khách nhận, địa chỉ, kho và các lô đã reserve;
  - **Điều chuyển thủ công**: dùng cho nghiệp vụ không phát sinh từ đơn bán.
- Order nhiều kho hiển thị thành từng lựa chọn theo order + warehouse.
- Dropdown tự đồng bộ giá trị mặc định khi dữ liệu bất đồng bộ tải xong.
- Bổ sung semantic color tokens để nút hủy/destructive hiển thị đúng.

## 4. Ma trận trách nhiệm sau sửa

| Công đoạn | Admin | Seller | Warehouse Manager | Logistics |
|---|---:|---:|---:|---:|
| Theo dõi toàn hệ thống | Có | Theo seller | Theo kho | Chuyến được giao |
| Xác nhận/đóng gói order | Giám sát | Có | Không | Không |
| Tạo chuyến | Không | Không | Có | Không |
| Phân bổ lô/reservation | Không | Không | Có, server kiểm tra | Không |
| Gán Logistics | Không | Không | Có | Không |
| Bàn giao và trừ tồn | Không | Không | Có, cần minh chứng | Không |
| Xác nhận tiếp nhận/đang giao/đã giao | Không | Không | Không | Có |
| Giao thất bại/hoàn hàng | Giám sát | Theo dõi | Theo dõi | Có, cần lý do/minh chứng |
| Hàng hoàn quay lại bán | Không tự động | Không | Sau kiểm định | Không |

## 5. Kết quả kiểm thử

### Build và regression

- Backend production build: PASS.
- Frontend production build: PASS, 37 route được build.
- Unit test: **25/25 suite, 143/143 test PASS**.
- E2E security/validation: **5/5 suite, 26/26 test PASS**.
- Shipment migration verifier: PASS, dựng mới và chạy đủ 25 migration.
- Payment, traceability và direct-seller migration verifier: PASS trong cùng phiên nghiệm thu trước thay đổi cuối; không có migration liên quan nào thay đổi sau đó.
- Prisma migrate status: **25 migration, database up to date**.

### Kiểm tra PostgreSQL thật

- `inconsistent_inventory_reservations = 0`.
- `overallocated_batches = 0`.
- Smoke test tạo/hủy shipment:
  - reserved: `0 -> 1 -> 0`;
  - physical stock: `333 -> 333`;
  - kết thúc `CANCELLED`.
- Endpoint FIFO cũ: HTTP `410 Gone`.
- Endpoint fulfillment theo Warehouse Manager: HTTP 200 và scope role đúng.

Hai shipment audit dùng cho smoke test được giữ ở trạng thái `CANCELLED` (không xóa lịch sử):

- `SHP-20260826-7A624D4A`
- `SHP-20260826-17F25CD1`

## 6. File chính đã thay đổi trong remediation này

- `backend/src/features/shipments/shipments.service.ts`
- `backend/src/features/shipments/shipments.controller.ts`
- `backend/src/features/shipments/shipments.module.ts`
- `backend/src/features/shipments/shipments.service.spec.ts`
- `backend/src/features/orders/inventory-reservation.service.ts`
- `backend/src/features/orders/inventory-reservation.service.spec.ts`
- `backend/src/features/orders/orders.service.ts`
- `backend/src/features/inventory/inventory.controller.ts`
- `backend/prisma/migrations/20260826010000_shipment_inventory_consistency/migration.sql`
- `frontend/src/app/(dashboard)/dashboard/inventory/page.tsx`
- `frontend/src/app/(dashboard)/dashboard/orders/page.tsx`
- `frontend/src/app/(dashboard)/dashboard/shipments/page.tsx`
- `frontend/src/components/shipments/CreateShipmentModal.tsx`
- `frontend/src/components/shipments/types.ts`
- `frontend/src/app/globals.css`

## 7. Cảnh báo không chặn nghiệm thu

- Next.js cảnh báo convention `middleware` đã deprecated; cần chuyển sang `proxy` trong đợt nâng cấp framework sau.
- Jest E2E báo còn open handle sau khi test kết thúc; tất cả assertion vẫn PASS. Nên bổ sung teardown Redis/queue để pipeline thoát nhanh hơn.
- Môi trường hiện đang `DEMO_MODE=true`; tích hợp carrier webhook, media storage và blockchain production cần cấu hình secret/endpoint thật trước go-live.
- Một reservation row được xem là đơn vị phân bổ nguyên tử. Nếu tương lai cần chia cùng một reservation row thành nhiều kiện/chuyến, cần bổ sung `allocatedQuantity/deductedQuantity` hoặc ledger shipment-reservation riêng.

## 8. Bảo toàn working tree

Working tree hiện có hàng nghìn thay đổi tích lũy, phần lớn là GeoJSON và các hạng mục từ phiên trước. Remediation này không reset, xóa hay hoàn tác các file ngoài phạm vi nêu tại mục 6.
