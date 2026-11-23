# Báo cáo khắc phục Phase 1: Payment & Checkout

- Dự án: OCOP Enterprise Platform
- Ngày hoàn tất kiểm tra: 22/08/2026
- Phạm vi triển khai: checkout nhiều gian hàng, giữ tồn kho, đơn hàng, VNPay, đối soát và hoàn tiền
- Trạng thái: đã sửa mã nguồn, xác minh và áp dụng 16 migration lên database local `ocop_vietnam`; **chưa triển khai lên production**

## 1. Kết luận điều hành

Luồng Payment & Checkout trước đây có các rủi ro nghiêm trọng: dữ liệu tài chính lấy từ client, tạo đơn và tạo URL thanh toán rời nhau, thiếu idempotency ở database, cập nhật IPN không có khóa dòng, callback Return có thể bị hiểu nhầm là kết quả thanh toán, và giữ/trừ tồn kho không gắn chính xác với từng lô.

Phần khắc phục Phase 1 đã hoàn thành ở cả backend, database và frontend. Thiết kế mới coi database và IPN đã xác thực là nguồn sự thật; toàn bộ số tiền được tính ở server; một checkout tạo một `PaymentAggregate`, nhiều `Order` theo gian hàng và các `PaymentTransaction` có lịch sử; tồn kho được giữ theo FEFO và chỉ trừ vật lý khi chuyển sang giao hàng.

Kết quả xác minh cuối:

| Hạng mục | Kết quả |
| --- | --- |
| Backend build | PASS |
| Backend unit test | PASS — 21/21 suite, 101/101 test |
| Chuỗi migration | PASS — áp dụng 16 migration |
| Constraint thanh toán quan trọng | PASS |
| Frontend production build | PASS |
| ESLint riêng cho hai trang checkout | PASS — 0 lỗi |
| ESLint backend phần code mới/trọng điểm | PASS — 0 lỗi, 8 cảnh báo heuristic |
| E2E tích hợp thật | Chưa chạy full trên staging có Redis, PostgreSQL và VNPay sandbox |

Không nên coi báo cáo này là xác nhận toàn bộ repository đã hết lỗi. Các tồn đọng ngoài Phase 1 được ghi rõ tại mục 9.

## 2. Các lỗi chính, root cause và cách khắc phục

| ID | Mức độ | Lỗi/rủi ro | Root cause | Khắc phục đã thực hiện |
| --- | --- | --- | --- | --- |
| PAY-01 | Critical | Client có thể can thiệp giá/tổng tiền | API cũ tin dữ liệu tài chính từ request | DTO checkout không nhận giá/tổng tiền; server tải giá sản phẩm, voucher và tự tính lại toàn bộ |
| PAY-02 | Critical | Một request lặp hoặc đồng thời có thể tạo nhiều đơn/giao dịch | Idempotency chỉ dựa vào xử lý ứng dụng, không có unique constraint | Thêm `idempotencyKey`, hash ý định checkout và `UNIQUE(user_id, idempotency_key)`; cùng key khác nội dung trả 409; race được xử lý bằng constraint database |
| PAY-03 | Critical | IPN đồng thời có thể cập nhật trạng thái hai lần hoặc lệch đơn/tồn kho | Không khóa bản ghi và không re-check state trong transaction | Thêm thứ tự khóa xác định và `SELECT ... FOR UPDATE`; chỉ `PENDING` được chuyển trạng thái; toàn bộ giao dịch, aggregate, đơn và tồn kho cập nhật atomically |
| PAY-04 | Critical | Có thể ghi nhận thanh toán sai số tiền/merchant | Kiểm tra chữ ký chưa đủ invariant nghiệp vụ | Xác thực HMAC timing-safe, `TmnCode`, số tiền VNPay chia 100, tiền tệ VND, hạn giao dịch, mã phản hồi và trạng thái giao dịch |
| PAY-05 | Critical | Return URL có thể bị dùng để đánh dấu đã thanh toán | Nhầm vai trò browser return với server IPN | Return chỉ xác thực để hiển thị; không mutate database. Frontend polling trạng thái do backend trả về; IPN/đối soát mới là nguồn sự thật |
| PAY-06 | High | URL thanh toán cũ có thể tạo độc lập với checkout | Endpoint tạo URL không ràng buộc đơn và số tiền server | `POST /payments/create-url` trả 410; URL chỉ được sinh trong pipeline checkout bảo mật |
| PAY-07 | High | API tạo đơn cũ bỏ qua giữ tồn kho/thanh toán | Có hai pipeline tạo đơn song song | `POST /orders` trả 410; bắt buộc sử dụng `POST /orders/checkout` |
| PAY-08 | Critical | Oversell và trừ nhầm lô hàng | Reservation không gắn chính xác OrderItem–InventoryBatch; cập nhật tồn kho thiếu khóa | Thêm `OrderItemBatchReservation`, khóa lô theo FEFO, tính `currentQuantity - active reservations`, cho phép một item dùng nhiều lô |
| PAY-09 | High | Giữ hàng có thể bị trừ vật lý quá sớm hoặc trừ hai lần | Không phân biệt reserve và deduct | Reserve chỉ tăng `reservedQuantity`; khi chuyển sang giao hàng mới giảm `currentQuantity` và `reservedQuantity`; `StockMovement.reservationId` unique bảo đảm idempotent |
| PAY-10 | High | Hết hạn/thất bại có thể làm mất kết quả thanh toán đến muộn | Timeout xử lý như thất bại tuyệt đối | Có grace period và QUERYDR; thanh toán muộn chỉ hoàn tất nếu có thể phục hồi reservation, nếu không chuyển `REFUND_PENDING` thay vì giao hàng khi không còn tồn |
| PAY-11 | High | Retry có thể tạo nhiều phiên pending | Không có ràng buộc một giao dịch hoạt động/aggregate | Partial unique index chỉ cho một transaction `PENDING`; retry khóa aggregate, tái sử dụng phiên còn hiệu lực hoặc tạo `txnRef` mới sau đối soát |
| PAY-12 | Critical | Cùng `gatewayTxNo` có thể gắn nhiều transaction | Thiếu unique invariant cho mã giao dịch cổng | `gateway_tx_no` unique; duplicate chuyển sang `RECONCILIATION_REQUIRED`, không tự động ghi nhận tiền |
| PAY-13 | High | Hoàn tiền có thể bị gửi lặp hoặc mất dấu thất bại | Không có attempt history/idempotency/retry state | Thêm `RefundAttempt`, partial unique pending, retry có backoff, tối đa 5 lần và terminal `REFUND_FAILED` |
| PAY-14 | High | QUERYDR/refund có thể treo request vô hạn hoặc ký sai | Thiếu timeout và không theo đúng field order của VNPay | Dùng `AbortController`, timeout cấu hình; ký request theo thứ tự field quy định và xác thực chữ ký response |
| PAY-15 | High | Trạng thái các đơn con trong cùng checkout có thể race | Khóa theo từng order rời rạc | Chuẩn hóa lock order: aggregate → transactions → orders → reservations/batches; thao tác trên checkout VNPay xét toàn bộ đơn liên quan |
| PAY-16 | Medium | Frontend có thể xóa giỏ hàng trước khi server thật sự nhận checkout | Xử lý UI không gắn với HTTP success | Chỉ xóa giỏ sau response thành công; lưu aggregate/txn để tiếp tục polling; dùng khóa in-flight và idempotency key theo fingerprint nội dung |

## 3. Kiến trúc và invariant sau sửa

### 3.1 Mô hình dữ liệu

- `PaymentAggregate`: đại diện một checkout của một người dùng; chứa tổng tiền, phương thức, trạng thái và idempotency key.
- `Order`: mỗi gian hàng tạo một order và liên kết về cùng aggregate.
- `PaymentTransaction`: mỗi lần thử thanh toán VNPay có `txnRef`, expected amount, received amount, trạng thái và payload IPN đã làm sạch.
- `PaymentQueryAttempt`: lưu lịch sử QUERYDR phục vụ đối soát và điều tra.
- `RefundAttempt`: lưu từng lần gọi hoàn tiền, trạng thái, lỗi và số lần thử.
- `OrderItemBatchReservation`: ánh xạ chính xác số lượng của từng order item được giữ tại từng inventory batch.

Các invariant database quan trọng:

- Một `(user_id, idempotency_key)` chỉ có một aggregate.
- Một aggregate chỉ có tối đa một transaction `PENDING`.
- `txn_ref` là duy nhất.
- `gateway_tx_no` là duy nhất khi có giá trị.
- Một aggregate chỉ có tối đa một refund attempt đang xử lý.
- Một reservation chỉ sinh tối đa một stock movement khấu trừ.
- Payment method và provider phải là cặp hợp lệ (`COD/NONE` hoặc `VNPAY/VNPAY`).

### 3.2 State transition

`PaymentTransaction`:

- `PENDING → COMPLETED`
- `PENDING → FAILED`
- `PENDING → EXPIRED`
- `PENDING → CANCELLED`
- `PENDING → RECONCILIATION_REQUIRED`
- Không cho phép kết quả cũ ghi đè một transaction/aggregate đã ở trạng thái thanh toán hoặc hoàn tiền terminal.

`PaymentAggregate` bổ sung các trạng thái tài chính cần theo dõi: `RECONCILIATION_REQUIRED`, `REFUND_PENDING`, `REFUNDED`, `REFUND_FAILED`.

### 3.3 Thứ tự xử lý IPN

1. Xác thực chữ ký HMAC bên ngoài database transaction.
2. Mở transaction và khóa aggregate/transaction/order theo thứ tự xác định.
3. Đọc lại trạng thái đã lưu; replay terminal trả idempotent response, không cập nhật lần hai.
4. Kiểm tra merchant, amount, currency, expiry, response code và transaction status.
5. Cập nhật transaction, aggregate, orders và reservation atomically.
6. Commit rồi mới thực hiện tác vụ phụ không thuộc tài chính.

## 4. API sau sửa

| Endpoint | Trạng thái/vai trò |
| --- | --- |
| `POST /api/v1/orders/checkout` | Pipeline checkout duy nhất; hỗ trợ COD và VNPay |
| `POST /api/v1/orders` | Deprecated, trả HTTP 410 |
| `POST /api/v1/payments/create-url` | Deprecated, trả HTTP 410 |
| `POST /api/v1/payments/retry` | Retry VNPay an toàn trên aggregate hiện có |
| `GET /api/v1/payments/aggregates/:id/status` | Trạng thái checkout có kiểm tra owner |
| `GET /api/v1/payments/transactions/:txnRef/status` | Trạng thái lần thanh toán có kiểm tra owner |
| `GET /api/v1/payments/vnpay-ipn` | Callback server-to-server có xác thực, được phép cập nhật trạng thái |
| `GET /api/v1/payments/vnpay-return` | Chỉ xác thực và trả dữ liệu hiển thị, không cập nhật trạng thái |

## 5. Frontend đã thay đổi

- Checkout gửi một request duy nhất, không gửi price/amount từ client.
- Hỗ trợ giỏ hàng nhiều gian hàng và voucher theo từng gian hàng cùng voucher nền tảng.
- Sinh UUID idempotency key và tái sử dụng khi cùng người dùng gửi lại cùng một ý định checkout.
- Chặn double-click bằng in-flight guard.
- VNPay redirect bằng URL do server trả về.
- Callback bọc `useSearchParams` trong Suspense theo yêu cầu Next.js.
- Callback không công bố thành công theo query Return; polling database tối đa 60 giây.
- Hiển thị rõ `RECONCILIATION_REQUIRED`/`REFUND_PENDING` và cho retry với phiên failed/expired.

## 6. Migration và khả năng triển khai

Migration mới:

`backend/prisma/migrations/20260821010000_secure_checkout_payments/migration.sql`

Migration thực hiện:

- Tạo enum, bảng, index, foreign key và check constraint mới.
- Backfill dữ liệu reservation cũ trước khi loại bỏ cột legacy.
- Tạo unique reservation index **trước backfill** để `ON CONFLICT` hợp lệ.
- Giữ lại lịch sử tài chính; không cung cấp rollback phá hủy dữ liệu tự động.

Đã dùng `backend/scripts/verify-payment-migration.mjs` với PGlite để chạy toàn bộ 16 migration theo thứ tự và kiểm tra các constraint trọng yếu, bao gồm role `WAREHOUSE_MANAGER`.

Ngày 22/08/2026, `prisma migrate deploy` đã áp dụng thành công các migration còn thiếu lên PostgreSQL local `ocop_vietnam`; `prisma migrate status` xác nhận đủ 16 migration và database local đã up to date. Việc này không đồng nghĩa migration đã được triển khai lên production.

Quy trình release đề xuất:

1. Backup database và kiểm tra khả năng restore.
2. Chạy migration trên bản sao staging có dữ liệu gần production.
3. Kiểm tra dữ liệu legacy vi phạm unique/check constraint trước deployment.
4. Cấu hình đầy đủ biến môi trường VNPay.
5. Chạy `npx prisma migrate deploy` trong maintenance window.
6. Deploy backend trước frontend hoặc cùng một release đã điều phối, vì endpoint cũ sẽ trả 410.
7. Thực hiện smoke test checkout COD, VNPay success/fail/timeout/replay và refund sandbox.
8. Theo dõi `RECONCILIATION_REQUIRED`, `REFUND_PENDING`, `REFUND_FAILED` và cảnh báo cron.

## 7. Biến môi trường cần cấu hình

- `VNPAY_TMN_CODE`
- `VNPAY_HASH_SECRET`
- `VNPAY_URL`
- `VNPAY_API_URL`
- `VNPAY_RETURN_URL`
- `VNPAY_SERVER_IP`
- `VNPAY_REFUND_CREATED_BY`
- `VNPAY_PAYMENT_TIMEOUT_MINUTES`
- `VNPAY_RECONCILIATION_GRACE_MINUTES`
- `VNPAY_API_TIMEOUT_MS`

Production sẽ fail fast nếu thiếu credential bắt buộc. Các phần người dùng đã sửa sẵn trong `env.validation.ts` về `REDIS_TLS`, điều kiện CORS production và kiểm tra `REDIS_HOST` được giữ nguyên.

## 8. Bằng chứng kiểm thử

### Backend

```text
npm run build
PASS

npm test -- --runInBand
Test Suites: 21 passed, 21 total
Tests:       101 passed, 101 total

npm run test:migration
PASS: applied 16 migrations and verified payment/role constraints
```

Các case trọng yếu đã được tự động hóa:

- canonical request hash và idempotency replay/conflict/concurrent race;
- HMAC và amount encoding VNPay;
- Return không mutate state;
- IPN sai chữ ký, sai amount, sai currency;
- replay IPN terminal;
- success yêu cầu đồng thời response code và transaction status hợp lệ;
- duplicate gateway transaction number;
- transaction cũ thất bại không được release aggregate đã thanh toán;
- late payment không xác định chuyển đối soát;
- reservation FEFO, release/deduct idempotent và phục hồi tồn;
- endpoint cũ trả 410;
- quyền sở hữu khi đọc/retry payment.

### Frontend

```text
npx eslint "src/app/(public)/checkout/page.tsx" \
  "src/app/(public)/checkout/callback/page.tsx"
PASS: 0 errors, 0 warnings

npm run build
PASS
```

### Kiểm tra định dạng diff

`git diff --check` trên toàn bộ phần Payment/Checkout mới: PASS. Các thông báo LF/CRLF chỉ là cảnh báo line-ending của Git trên Windows, không phải lỗi nội dung.

## 9. Tồn đọng và rủi ro chưa đóng

### 9.1 E2E cần hạ tầng thật — High trước khi production

Bộ E2E chưa chạy trọn vẹn trên một staging có đầy đủ Redis, PostgreSQL và VNPay sandbox. PostgreSQL local đã được dùng để áp dụng/kiểm tra migration và toàn bộ unit test đã đạt, nhưng vẫn phải chạy lại full E2E với hạ tầng tích hợp được kiểm soát trước production.

Đây là điều kiện bắt buộc trước khi phê duyệt production, đặc biệt cho các race test thực sự với PostgreSQL, cron, IPN và refund sandbox.

### 9.2 Dependency vulnerabilities — High

Kết quả `npm audit --omit=dev` tại thời điểm kiểm tra:

- Backend: 25 cảnh báo — 8 moderate, 17 high, 0 critical.
- Frontend: 4 high.

Có cảnh báo liên quan các dependency trực tiếp như Nest platform/Swagger/Prisma và Next.js cùng dependency bắc cầu. Không chạy `npm audit fix --force` vì có thể gây breaking change ngoài phạm vi Phase 1. Cần một nhánh nâng cấp dependency riêng, test regression và kiểm tra release note.

### 9.3 Lint toàn repository — Medium/technical debt

- Backend full lint: 732 vấn đề — 663 error, 69 warning.
- Frontend full lint: 384 vấn đề — 258 error, 126 warning.

Phần lớn nằm ở module cũ ngoài Payment/Checkout: `any` không an toàn, unused import, React effect/dependency và accessibility. Code trọng điểm Phase 1 không có lint error. Không nên sửa hàng loạt bằng auto-fix trong cùng release tài chính vì phạm vi regression quá lớn.

### 9.4 Cảnh báo riêng phần mới — Low

Backend lint phần mới còn 8 cảnh báo `security/detect-object-injection` tại logic ánh xạ tham số VNPay/canonical data và test. Dữ liệu đầu vào đã được giới hạn scalar, whitelist/validation và ký/xác minh; cảnh báo không làm build thất bại. Nên giữ trong danh sách review bảo mật thủ công.

### 9.5 Voucher khi checkout bị bỏ dở — Medium

Luồng hiện tại khóa và tăng usage của voucher khi checkout được tạo. Cần xác nhận rõ chính sách sản phẩm về việc trả lại quota voucher khi VNPay hết hạn/hủy. Nếu yêu cầu trả quota, nên bổ sung ledger/reservation voucher thay vì giảm `usedCount` trực tiếp để tránh race và gian lận.

### 9.6 Notification sau commit — Low/Medium

Một số notification của luồng order chạy sau transaction tài chính. Nếu notification provider lỗi, dữ liệu tài chính vẫn đúng nhưng request có thể báo lỗi phụ. Nên chuyển sang outbox/event retry trong phase tiếp theo.

### 9.7 Next.js middleware warning — Low

Frontend build thành công nhưng Next.js cảnh báo convention `middleware` đã deprecated theo phiên bản hiện tại. Việc đổi sang convention mới nên thực hiện riêng và regression test auth/routing.

## 10. Tiêu chí phê duyệt release

Có thể phê duyệt merge phần mã Phase 1 sau code review, nhưng **chưa nên phê duyệt production deployment** cho đến khi hoàn tất tất cả mục sau:

- chạy migration trên staging clone và kiểm tra dữ liệu backfill;
- chạy full E2E với PostgreSQL/Redis thật;
- chạy sandbox end-to-end VNPay gồm success, fail, timeout, IPN replay, QUERYDR và refund;
- cấu hình monitoring/alert cho reconciliation và refund queue;
- xác nhận policy hoàn quota voucher;
- lập kế hoạch xử lý dependency high severity hoặc chấp nhận rủi ro có thời hạn.

## 11. Tài liệu đối chiếu VNPay

- Payment/IPN/Return: <https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html>
- QUERYDR và Refund: <https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr%26refund.html>

Các quy tắc amount nhân 100, múi giờ GMT+7, vai trò của IPN/Return và thứ tự field ký QUERYDR/refund được triển khai theo tài liệu sandbox chính thức trên.

## 12. Addendum: tài khoản quản lý kho

Sau báo cáo Phase 1, hệ thống được bổ sung role `WAREHOUSE_MANAGER` riêng thay vì dùng role `SELLER` để tránh cấp thừa quyền. Admin có thể tạo tài khoản ngay trong dropdown Assign Manager; tài khoản vừa tạo được tự động chọn để gán cho warehouse.

Các kiểm soát đã bổ sung:

- Chỉ Admin được gọi API tạo Warehouse Manager và xem danh sách tài khoản có thể gán.
- Public registration không thể tự đăng ký role này.
- Manager chỉ xem/thao tác inventory, batch, history, alert và thống kê thuộc warehouse có `manager_id` của chính họ.
- Manager không được tạo, xóa kho hoặc điều chỉnh kiểm kê dành riêng cho Admin.
- Backend từ chối gán tài khoản không hoạt động hoặc role không hợp lệ làm quản lý kho.
- Migration enum và migration seed role được tách riêng để bảo đảm PostgreSQL commit enum value trước khi sử dụng.
- Frontend có menu và màn hình vào kho riêng cho Warehouse Manager.
- Dashboard kho hiển thị thêm chỉ số **Tổng kho hàng** và tab **Kho hàng (N)** để xem tổng quan từng kho, gồm mã kho, loại kho, quản lý, địa chỉ, mô tả và số SKU.
- Trạng thái rỗng của tab Tổng quan đã phân biệt rõ trường hợp chưa có kho với trường hợp đã có kho nhưng chưa thêm sản phẩm.
- Admin có thể chọn **Sửa** trên từng thẻ kho, cập nhật tên, loại kho, quản lý, mô tả, địa chỉ và tọa độ; mã kho được giữ bất biến.
- API cập nhật kho kiểm tra kho còn hoạt động, chống trùng tên trong cùng đơn vị, xác thực role của quản lý được gán và hỗ trợ bỏ gán quản lý.

Kiểm tra hồi quy cho phần bổ sung này:

- Frontend production build: PASS.
- Inventory service unit test: PASS, 18/18 test.
- ESLint riêng production inventory service: PASS.
- Full backend build: PASS sau khi khôi phục giá trị mock `gasUsed` từ `0` về đúng kiểu `bigint` là `0n`; không thay đổi logic kết nối Blockchain.

## 13. Addendum: kiểm định chất lượng và truy xuất chuỗi cung ứng

Dashboard Supply Chain trước đây hiển thị Shipping bằng số lô có bất kỳ journey nào trong 7 ngày, không phải lô đang vận chuyển; frontend cũng không có thao tác tạo journey dù backend đã có API. Các ô Blockchain Synced, Expiring và Pending đọc field backend chưa trả về nên luôn hiển thị 0.

Phần khắc phục đã triển khai:

- Bổ sung API danh sách lô truy xuất đầy đủ, không còn dùng endpoint “sắp hết hạn trong 10 năm” làm nguồn dữ liệu tạm.
- Shipping chỉ đếm lô có công đoạn mới nhất là `SHIPPING`; Delivered chỉ đếm lô có công đoạn mới nhất là `CUSTOMER`.
- Thống kê `blockchainSynced`, `expiringSoon` và `pendingInspection` được tính và trả về thực tế.
- Form **Ghi nhận công đoạn** cho phép nhập thời điểm nghiệp vụ, địa điểm, GPS, người ghi nhận, ghi chú, ảnh/tài liệu hoặc URL minh chứng.
- Công đoạn kiểm định yêu cầu kết quả `PASSED`, `FAILED` hoặc `QUARANTINE`, ghi chú và ít nhất một minh chứng; kết quả được cập nhật atomically vào lô.
- Backend chặn vận chuyển nếu lô chưa `PASSED`, đồng thời yêu cầu mã vận đơn và đơn vị vận chuyển.
- Xác nhận giao hàng yêu cầu đã có công đoạn vận chuyển, tên người nhận và ít nhất một minh chứng.
- State transition chỉ được tiến về phía trước; chặn công đoạn trùng, chuyển ngược, thời điểm cũ hơn bước gần nhất và giả mạo `actorId`. Kiểm định lại được phép khi kết quả gần nhất chưa đạt.
- Ghi journey chạy trong transaction có row lock để chống hai request đồng thời tạo trạng thái sai thứ tự.
- Timeline hiển thị thời điểm thực tế, thông tin vận chuyển/giao nhận, kết quả QC, ảnh/tài liệu và trạng thái blockchain của từng journey; không còn hiển thị tx hash/Verified giả lập cứng.
- Warehouse Manager được phép xem và ghi nhận journey trong đúng kho được phân công, đồng thời được upload minh chứng.
- Khi `DEMO_MODE=true`, media service lưu minh chứng vào static storage local thay vì từ chối upload; folder được whitelist và tên file do server sinh. Production vẫn dùng MinIO.
- Migration `20260821160000_supply_chain_traceability_workflow` đã thêm `event_time`, mã tham chiếu, đơn vị vận chuyển và người nhận; migration đã áp dụng thành công lên PostgreSQL local.
- Migration `20260821170000_backfill_supply_chain_event_time` khôi phục thời điểm hành trình cũ từ `created_at` nếu giá trị thêm mới lệch quá 5 phút, tránh mọi journey cũ cùng mang thời điểm chạy migration.
- Trang QR công khai hiển thị kết quả QC, vận đơn, đơn vị vận chuyển, người nhận, ảnh/tài liệu giao nhận và trạng thái blockchain thực của từng công đoạn.
- Nhãn xác minh công khai không còn hard-code: chỉ hiện **đã xác minh đầy đủ** khi tất cả lô trong hồ sơ đều `PASSED` và tất cả journey đều có blockchain record `CONFIRMED` kèm transaction hash.

Kết quả kiểm tra:

- Backend production build: PASS.
- Frontend production build: PASS.
- Backend: 21/21 suite, 101/101 test PASS.
- Supply Chain service: 7/7 test PASS, gồm thống kê latest-stage, quality gate, proof requirement, manager scoping và blockchain sync.
- Traceability service: 2/2 test PASS, gồm điều kiện xác minh đầy đủ và chống công bố Verified khi QC/blockchain còn thiếu.
- Migration verification: PASS, 16 migration; `prisma migrate status` xác nhận database local up to date.
- ESLint các file production Supply Chain/Media/Traceability mới: PASS, 0 lỗi (trang QR còn 3 cảnh báo tối ưu `<img>` không làm fail build).
- Endpoint mới `/api/v1/supply-chain/batches` đã được backend local nhận diện và bảo vệ bằng JWT (không token trả 401).
- Kiểm thử UI có xác thực bằng trình duyệt tích hợp chưa thực hiện được vì phiên này không có session Admin.
- Khi smoke test HTTP cuối, backend khởi động và mount đúng route Traceability/Supply Chain nhưng PostgreSQL/Redis local đã ngừng và Docker Desktop không chạy, nên không thể hoàn tất một request có dữ liệu thật; kiểm thử service, migration và production build đã hoàn tất độc lập.
