# Hợp Đồng Tích Hợp Webhook Vận Chuyển (Carrier Webhook Specification)

Tài liệu này xác định hợp đồng tích hợp chính thức giữa hệ thống OCOP và các đối tác vận chuyển bên ngoài (GHN, GHTK, Viettel Post, v.v.).

## 1. Biến môi trường bắt buộc

```env
# JSON key-value chứa secret HMAC SHA-256 cho từng đơn vị vận chuyển (tối thiểu 32 ký tự mỗi secret)
CARRIER_WEBHOOK_SECRETS={"GHN":"replace-with-carrier-webhook-hmac-secret-min-32-chars","GHTK":"replace-with-carrier-webhook-hmac-secret-min-32-chars"}
```

- Nếu thiếu cấu hình `CARRIER_WEBHOOK_SECRETS` hoặc không có key cho nhà vận chuyển tương ứng, endpoint sẽ trả về `503 Service Unavailable`.
- Khóa bí mật phải được lưu trữ an toàn trong Secret Manager/KMS và không được commit lên kho mã nguồn.

## 2. Endpoint & Cơ chế xác thực chữ ký

- **URL**: `POST /api/v1/shipments/webhooks/:providerCode` (Ví dụ: `/api/v1/shipments/webhooks/GHN`)
- **HTTP Header**:
  - `Content-Type: application/json`
  - `x-carrier-signature: sha256=<HMAC_HEX>`
- **Thuật toán xác thực**:
  - HMAC SHA-256 được tính trên **exact raw request body** (chuỗi bytes nguyên thủy trước khi parse JSON).
  - So sánh chữ ký bằng thuật toán so sánh thời gian an toàn (`crypto.timingSafeEqual`) nhằm chống timing attacks.
  - Chữ ký không hợp lệ bị từ chối ngay lập tức với `401 Unauthorized` trước khi thực hiện bất kỳ truy vấn cơ sở dữ liệu nào.

## 3. Cấu trúc Payload Webhook (CarrierWebhookDto)

```json
{
  "externalEventId": "EVT-20260901-00123",
  "trackingCode": "GHN-2026-888999",
  "eventType": "PICKED_UP",
  "eventTime": "2026-09-01T09:15:00.000Z",
  "location": "Bưu cục GHN Cầu Giấy, Hà Nội",
  "recipientName": "Nguyễn Văn A",
  "failureReason": null,
  "note": null,
  "imageUrls": [],
  "attachmentUrls": []
}
```

### Các sự kiện hợp lệ (`eventType`):
- `PICKED_UP`: Lấy hàng thành công từ kho người bán -> Chuyển chuyến sang `IN_TRANSIT`.
- `OUT_FOR_DELIVERY`: Đang trên đường phát hàng tới người mua.
- `DELIVERED`: Giao hàng thành công -> Cập nhật Order sang `DELIVERED`, kết toán COD sang `COMPLETED`.
- `DELIVERY_FAILED`: Giao hàng không thành công (yêu cầu `failureReason`).
- `RETURN_STARTED`: Bắt đầu hoàn trả hàng (yêu cầu `failureReason` hoặc `note`).
- `RETURNED`: Đã hoàn hàng về kho -> Nhập trả tồn kho (`receiveReturnedInventory`), Order sang `RETURNED`.

## 4. Cơ chế chống trùng lặp (Idempotency & Replay Protection)

- Hệ thống duy trì bảng `carrier_webhook_events` với ràng buộc duy nhất `(organization_id, external_event_id)`.
- Khi carrier gửi lại cùng một `externalEventId`:
  - Request được ghi nhận thành công (`200 OK`) với `{ accepted: true, duplicate: true }`.
  - Không thay đổi trạng thái đơn hàng, không kích hoạt kết toán lại và không ghi nhận sự kiện trùng lặp.

## 5. Giới hạn xác nhận & Trạng thái tích hợp thực tế

> [!WARNING]
> **Hiện trạng kiểm thử**: Toàn bộ luồng nhận webhook, giải mã HMAC, máy trạng thái đơn hàng, hoàn trả tồn kho và kết toán COD đã được kiểm thử tự động với đối tác giả lập (`Mock Carrier Integration`).
> 
> **Phần chưa thể xác nhận trên môi trường Production**:
> - Tài khoản doanh nghiệp thật tại GHN/GHTK/Viettel Post (chưa ký hợp đồng API chính thức).
> - Webhook URL callback công khai có IP whitelist từ máy chủ của hãng vận chuyển.
> - Sandbox credentials thực tế từ cổng đối tác.
> 
> Hệ thống **tuyệt đối không giả vờ đã tích hợp hoàn chỉnh với hãng thật** cho tới khi có tài khoản production được cấu hình và kiểm thử trực tiếp qua Internet.
