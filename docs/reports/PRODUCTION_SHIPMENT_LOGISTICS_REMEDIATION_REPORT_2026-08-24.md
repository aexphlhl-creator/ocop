# Báo cáo nâng cấp nghiệp vụ Shipment/Logistics theo hướng production

**Ngày hoàn thành:** 24/08/2026  
**Phạm vi:** quản lý đơn vị vận chuyển, tài khoản Logistics, tạo và bàn giao chuyến hàng, cập nhật trạng thái giao nhận, truy xuất/audit, webhook nhà vận chuyển.  
**Kết luận:** core workflow Shipment/Logistics đã được tách khỏi lịch sử truy xuất lô và triển khai theo mô hình production-grade. Việc tích hợp chính thức với từng hãng vận chuyển vẫn cần hợp đồng API, khóa webhook và kiểm thử chứng nhận của hãng trước khi go-live.

## 1. Nghiệp vụ và phân quyền sau khi sửa

| Vai trò | Quyền nghiệp vụ |
|---|---|
| `ADMIN` | Tạo đơn vị vận chuyển, tạo tài khoản Logistics thuộc một đơn vị, giám sát toàn bộ chuyến và audit; không tự thao tác thay Warehouse Manager/Logistics. |
| `WAREHOUSE_MANAGER` | Tạo chuyến từ các lô đạt QC thuộc kho mình quản lý; gán/gán lại nhân viên Logistics; xác nhận bàn giao có minh chứng; hủy trước bàn giao. |
| `LOGISTICS` | Chỉ xem và cập nhật chuyến đang được phân công cho chính mình; xác nhận lấy hàng, các điểm trung chuyển, giao chặng cuối, giao thành công/thất bại, giao lại và hoàn hàng. |
| `SELLER` | Chỉ xem các chuyến chứa lô hàng thuộc phạm vi sản phẩm/doanh nghiệp của mình. |

Admin không còn là người tự nhập các trạng thái `SHIPPING`/`DELIVERED`. Lịch sử lô hàng giữ vai trò truy xuất chất lượng; trạng thái vận chuyển mới phải đi qua Shipment workflow để tránh hai nguồn dữ liệu mâu thuẫn.

## 2. Mô hình dữ liệu production

Đã bổ sung các thực thể:

- `LogisticsOrganization`, `LogisticsOrganizationMember`: quản lý hãng/đội vận chuyển và nhân sự trực thuộc.
- `Shipment`, `ShipmentItem`: một chuyến có thể chứa nhiều lô và số lượng phân bổ từng phần.
- `ShipmentAssignment`: lưu toàn bộ lịch sử gán/gán lại, chỉ cho phép một phân công đang hoạt động.
- `ShipmentEvent`: audit trail bất biến, lưu actor/source, thời gian nghiệp vụ, vị trí, GPS, người nhận, nguyên nhân lỗi, ảnh/tệp và metadata.
- `CarrierWebhookEvent`: lưu payload, hash, trạng thái xử lý và external event ID để chống replay.

Các ràng buộc quan trọng:

- Idempotency tạo chuyến: unique `(created_by_id, idempotency_key)`.
- Idempotency sự kiện: unique `(shipment_id, idempotency_key)`.
- Tracking code duy nhất trong phạm vi hãng vận chuyển: `(carrier_organization_id, tracking_code)`.
- Số lượng ShipmentItem phải lớn hơn 0.
- Partial unique index bảo đảm một chuyến chỉ có một assignment active.
- Trigger PostgreSQL chặn `UPDATE`/`DELETE` đối với `shipment_events`.
- `version` được kiểm tra khi cập nhật để chống lost update/concurrent overwrite.

Migration `20260824010000_production_shipments` đã:

1. Tạo enum, bảng, khóa ngoại, index và trigger.
2. Tạo đơn vị nội bộ `OCOP_INTERNAL`.
3. Gắn tài khoản `LOGISTICS` hiện hữu vào đơn vị nội bộ.
4. Backfill dữ liệu phân công vận chuyển lô cũ sang Shipment/Assignment/Event mà không xóa dữ liệu legacy.

Migration đã được áp dụng thành công vào PostgreSQL local ngày 24/08/2026.

## 3. State machine

Trạng thái Shipment:

`DRAFT`, `ASSIGNED`, `HANDED_OVER`, `IN_TRANSIT`, `AT_DISTRIBUTOR`, `AT_RETAIL`, `OUT_FOR_DELIVERY`, `DELIVERED`, `DELIVERY_FAILED`, `RETURNING`, `RETURNED`, `CANCELLED`.

Luồng được kiểm soát theo `routeType`:

- `DIRECT_TO_CUSTOMER`: bàn giao → lấy hàng/đang vận chuyển → giao chặng cuối → đã giao.
- `VIA_DISTRIBUTOR`: bổ sung điểm nhà phân phối trước bước giao tiếp theo.
- `VIA_RETAIL`: bổ sung điểm nhà phân phối và/hoặc điểm bán lẻ theo transition table.
- `INTERNAL_TRANSFER`: vận chuyển giữa các kho nội bộ, vẫn có bàn giao và audit.

Quy tắc lỗi/hoàn hàng:

- Giao thất bại bắt buộc có nguyên nhân và minh chứng nghiệp vụ.
- Có thể giao lại từ `DELIVERY_FAILED`.
- Hủy thủ công chỉ hợp lệ trước bàn giao.
- Sau bàn giao phải dùng `RETURN_STARTED` → `RETURNED`, không sửa/xóa lịch sử.
- Giao thành công đồng bộ trạng thái Order trong cùng transaction khi Shipment có liên kết đơn hàng.

## 4. API đã triển khai

- `GET/POST /api/v1/shipments/organizations`
- `GET/POST /api/v1/shipments`
- `GET /api/v1/shipments/:shipmentId`
- `POST /api/v1/shipments/:shipmentId/assign`
- `POST /api/v1/shipments/:shipmentId/handover`
- `POST /api/v1/shipments/:shipmentId/transition`
- `POST /api/v1/shipments/:shipmentId/cancel`
- `POST /api/v1/shipments/webhooks/:providerCode`
- `POST /api/v1/users/logistics` yêu cầu `organizationId`
- `GET /api/v1/users/logistics` hỗ trợ lọc theo tổ chức

Webhook dùng HMAC-SHA256 trên raw request body, so sánh timing-safe, chống replay theo external event ID và lưu payload nhận được. Secret được cấu hình qua `CARRIER_WEBHOOK_SECRETS` dưới dạng JSON; mỗi secret phải dài tối thiểu 32 ký tự.

## 5. Giao diện đã triển khai

- Route mới `/dashboard/shipments` với UI theo vai trò.
- Warehouse Manager tạo chuyến từ nhiều lô QC passed, chọn số lượng từng phần, hãng, tuyến và đích đến.
- Gán/gán lại Logistics đúng tổ chức; đổi hãng yêu cầu tracking code mới.
- Form bàn giao/chuyển trạng thái hỗ trợ vị trí, GPS, thời gian, ghi chú, người nhận, lỗi, ảnh và tệp minh chứng.
- Timeline audit thể hiện cả thao tác nội bộ và sự kiện webhook.
- Admin có màn hình tạo/list đơn vị vận chuyển và tạo tài khoản Logistics theo đơn vị.
- Sidebar tách rõ “Chuyến hàng” và “Truy xuất lô hàng”.
- Đã sửa liên kết dashboard Logistics từ màn hình legacy `/dashboard/supply-chain` sang `/dashboard/shipments` sau khi smoke test phát hiện hồi quy.

## 6. Kết quả kiểm thử

| Hạng mục | Kết quả |
|---|---|
| Backend Jest toàn bộ | **PASS — 23 suites, 117 tests** |
| Backend production build | **PASS** |
| Frontend production build | **PASS**, route `/dashboard/shipments` được sinh thành công |
| Shipment migration test bằng PGlite | **PASS — 21 migrations**, kiểm tra bảng/index/seed/append-only audit |
| Prisma format/validate/generate | **PASS** |
| ESLint các file Shipment/Logistics/Sidebar/Supply-chain thay đổi | **PASS** |
| API auth/RBAC smoke | **PASS** — unauthenticated `401`; Admin và Seller không được tạo Shipment (`403`) |
| API tạo tài khoản Logistics + membership + đăng nhập role | **PASS**; tài khoản QA tạm đã được xóa sau test |
| Browser smoke theo role Logistics | **PASS** — route, menu, state filters, empty state và console |
| Browser console | **PASS — không có warning/error** |
| Horizontal overflow tại viewport kiểm thử | **PASS** |

## 7. Technical debt ngoài phạm vi Shipment

Frontend production build vẫn thành công, nhưng file dashboard tổng hợp `frontend/src/app/(dashboard)/dashboard/page.tsx` đang có sẵn 10 lỗi ESLint và 3 warning (đa số `any`, setState trong effect và biến không dùng). Thay đổi trong đợt này ở file đó chỉ là sửa một `href`; các lỗi cũ không được mở rộng phạm vi sửa để tránh tác động vào phần dashboard không liên quan.

Ngoài ra, Next.js đang cảnh báo convention `middleware` đã deprecated và nên chuyển sang `proxy` trong một đợt kỹ thuật riêng.

## 8. Điều kiện trước khi production go-live

1. Cấu hình secret thật trong `CARRIER_WEBHOOK_SECRETS`; không dùng giá trị mẫu.
2. Viết adapter mapping payload riêng cho GHN/GHTK/Viettel Post hoặc hãng được ký hợp đồng. Endpoint hiện nhận payload chuẩn hóa nội bộ; không giả định các hãng có cùng schema.
3. Xác nhận signature header, retry policy, IP allowlist và SLA với từng hãng.
4. Chạy staging rehearsal với webhook trùng, webhook sai thứ tự, mất mạng, giao thất bại, giao lại và hoàn hàng.
5. Thiết lập alert cho webhook `FAILED`, backlog Shipment lâu không cập nhật và chênh lệch Order/Shipment.
6. Sao lưu database và chạy migration rehearsal trên bản sao production trước khi deploy thật.

## 9. Đánh giá cuối

Luồng Logistics không còn ở mức MVP “một role + vài trạng thái”. Hệ thống hiện có organization membership, shipment aggregate, partial allocation, phân công có lịch sử, state machine theo tuyến, optimistic locking, idempotency, audit bất biến, bằng chứng giao nhận và nền tảng webhook bảo mật.

Đây là **production-grade core** cho Shipment/Logistics, nhưng chưa thể gọi là “đã tích hợp production với GHN/GHTK/Viettel Post” cho đến khi có credential, tài liệu payload chính thức và kiểm thử chứng nhận của nhà vận chuyển.
