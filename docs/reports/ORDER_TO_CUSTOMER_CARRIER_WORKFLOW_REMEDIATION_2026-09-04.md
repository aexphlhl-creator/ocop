# Order-to-Customer Carrier Workflow Remediation

Ngày thực hiện: 2026-09-04

## Mục tiêu nghiệp vụ

Chuẩn hóa quy trình vận hành theo hướng production nhưng vẫn gọn cho MVP:

1. Seller/khách tạo đơn hàng qua checkout.
2. Seller/Admin chỉ xác nhận và chuẩn bị đơn.
3. Warehouse Manager tạo shipment, chọn hãng vận chuyển bên ngoài và nhập mã vận đơn do hãng cung cấp.
4. Khi bàn giao cho hãng vận chuyển, hệ thống trừ tồn kho theo reservation/FIFO và ghi nhận tracking nội bộ.
5. Sau bàn giao, trạng thái vận chuyển phụ thuộc vào hãng vận chuyển qua webhook/tracking code, không cần role shipper/logistics nội bộ của nền tảng.
6. Customer xem được hãng vận chuyển, mã vận đơn, link tracking của hãng và lịch sử sự kiện giao hàng.

## Root cause các điểm lệch đã sửa

### 1. Backend đã có Shipment nhưng Customer Order chưa nhận đủ dữ liệu vận chuyển

- `orders.repository.ts` trước đó trả order/tracking/items nhưng chưa include đầy đủ `shipments`, `carrierOrganization`, `events`.
- Hậu quả: khách hàng không thấy hãng vận chuyển/mã vận đơn/sự kiện từ carrier dù backend shipment đã tồn tại.

Đã sửa:

- Include shipment trong `create`, `findById`, `findByUserId`, `findBySellerId`.
- Include carrier organization: tên hãng, mã hãng, provider, tracking URL template.
- Include shipment events theo thời gian để frontend hiển thị timeline.

### 2. Shipment cập nhật trạng thái nhưng chưa đồng bộ đủ Order Tracking

- Khi hãng vận chuyển báo trạng thái mới, order status có thể đổi nhưng thiếu bản ghi `orderTracking`.
- Hậu quả: customer/admin có thể thấy trạng thái tổng nhưng timeline đơn hàng bị đứt.

Đã sửa:

- `HANDED_OVER`, `IN_TRANSIT`, `AT_DISTRIBUTOR`, `AT_RETAIL`, `OUT_FOR_DELIVERY` sẽ đồng bộ order sang `SHIPPED` nếu order chưa terminal.
- Khi chuyển sang `SHIPPED`, hệ thống tạo order tracking kèm shipment number, carrier name và tracking code.
- `DELIVERED` chỉ cập nhật order khi tất cả shipment active của order đã hoàn tất và không còn reservation active.
- `RETURNED` chỉ cập nhật order khi toàn bộ shipment active tương ứng đã returned/cancelled.

### 3. COD chưa hoàn tất thanh toán khi carrier xác nhận giao thành công

- Với COD, payment chỉ nên hoàn tất khi carrier báo `DELIVERED`.
- Trước đó thiếu bước hoàn tất payment aggregate từ sự kiện giao hàng.

Đã sửa:

- Khi shipment chuyển `DELIVERED`, nếu order là COD thì order `paymentStatus` chuyển `COMPLETED`.
- Nếu payment aggregate của COD không còn order active chưa giao/chưa trả, aggregate chuyển `COMPLETED` và set `completedAt`.

### 4. Admin Orders còn field vận chuyển cũ

- Form cập nhật order từng có `trackingCode`/`shippingPartner`, khiến admin/seller có thể cố cập nhật shipping trực tiếp từ order.
- Điều này sai nghiệp vụ vì vận chuyển phải đi qua Shipment và carrier.

Đã sửa:

- DTO update order status chỉ còn `status` và `description`.
- Transition order của seller/admin chỉ còn xử lý xác nhận/đóng gói/hủy trước khi bàn giao.
- Copy UI dashboard orders làm rõ: vận chuyển cập nhật qua Shipment.

### 5. Customer chưa có UI tracking carrier

- Trang `Đơn hàng của tôi` chỉ có timeline order cũ, không có thông tin hãng vận chuyển.

Đã sửa:

- Bổ sung khối “Vận chuyển qua hãng”.
- Hiển thị carrier, tracking code, shipment status, link mở tracking ngoài, và lịch sử event carrier.
- Type hóa dữ liệu customer order/shipment để tránh lệch contract backend/frontend.

### 6. Admin chưa quản trị được danh sách hãng vận chuyển

- Trang logistics/carrier mới chỉ tạo/xem, chưa sửa hoặc tắt hãng.
- Với production, admin cần quản trị provider và tracking URL template.

Đã sửa:

- Backend thêm endpoint cập nhật carrier organization.
- Frontend logistics cho phép sửa hãng, tracking URL template, bật/tắt active/inactive.
- Admin xem được cả hãng inactive bằng `includeInactive=true`.

## Các file chính đã thay đổi

- `backend/src/features/shipments/shipments.service.ts`
- `backend/src/features/shipments/shipments.controller.ts`
- `backend/src/features/shipments/dto/create-logistics-organization.dto.ts`
- `backend/src/features/orders/orders.repository.ts`
- `backend/src/features/orders/orders.service.ts`
- `backend/src/features/orders/orders.controller.ts`
- `backend/src/features/orders/dto/update-order-status.dto.ts`
- `frontend/src/app/(dashboard)/dashboard/logistics/page.tsx`
- `frontend/src/app/(dashboard)/dashboard/orders/page.tsx`
- `frontend/src/app/(dashboard)/profile/orders/page.tsx`
- `frontend/src/components/ui/order-timeline.tsx`
- `frontend/src/components/shipments/types.ts`

## Quy trình sau khi sửa

```text
Customer đặt hàng / checkout
  -> Order PENDING
  -> Seller/Admin CONFIRMED
  -> Seller/Admin PACKING
  -> Warehouse Manager tạo shipment, chọn carrier ngoài, nhập trackingCode
  -> Warehouse Manager handover shipment
       - trừ tồn kho/reservation
       - ghi supply-chain handover event
       - order chuyển SHIPPED
       - customer thấy carrier + tracking code
  -> Carrier webhook cập nhật IN_TRANSIT / OUT_FOR_DELIVERY / DELIVERED / RETURNED...
  -> Khi tất cả shipment giao thành công
       - order DELIVERED
       - COD payment COMPLETED nếu là COD
       - customer timeline đầy đủ đến lúc nhận hàng
```

## Kết quả kiểm thử

### Backend

Lệnh:

```bash
npm run build
npm test -- shipments.service.spec.ts users.service.spec.ts supply-chain.service.spec.ts carrier-webhooks.controller.spec.ts orders.service.spec.ts checkout.service.spec.ts inventory-reservation.service.spec.ts payments.service.spec.ts --runInBand
```

Kết quả:

- Build NestJS: Passed.
- Test suites: 7 passed / 7 total.
- Tests: 52 passed / 52 total.

### Frontend

Lệnh:

```bash
npx tsc --noEmit
npx eslint "src/app/(dashboard)/profile/orders/page.tsx" "src/app/(dashboard)/dashboard/orders/page.tsx" "src/app/(dashboard)/dashboard/logistics/page.tsx" "src/components/ui/order-timeline.tsx" "src/components/shipments/types.ts"
```

Kết quả:

- TypeScript: Passed.
- ESLint: Passed với 0 error.
- Còn 2 warning không chặn build về việc nên dùng `next/image` thay cho `<img>` ở trang orders.

## Kết luận

Quy trình order-to-customer hiện đã khép kín theo nghiệp vụ mong muốn:

- Nền tảng không tự vận hành shipper/logistics nội bộ.
- Hệ thống chỉ quản lý danh sách hãng vận chuyển, shipment, mã vận đơn và webhook/event tracking.
- Warehouse chịu trách nhiệm bàn giao hàng cho hãng.
- Carrier chịu trách nhiệm cập nhật trạng thái vận chuyển.
- Customer nhìn được tracking đầy đủ ở trang đơn hàng.

