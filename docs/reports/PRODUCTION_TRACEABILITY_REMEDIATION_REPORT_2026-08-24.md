# Báo cáo hoàn thiện truy xuất nguồn gốc production

Ngày thực hiện: 24/08/2026  
Phạm vi: backend, database, dashboard chuỗi cung ứng, trang QR công khai và kiểm thử migration  
Trạng thái: Đã triển khai code và migration; không tự tạo dữ liệu nguồn gốc giả cho các lô hiện hữu

## 1. Kết luận

Hệ thống trước đây chỉ hiển thị thông tin sản phẩm, lô và một số `BatchJourney`; chưa lưu được hồ sơ nguồn gốc có định danh, chưa có phả hệ nguyên liệu đầu vào–đầu ra và chưa đưa sự kiện vận chuyển production vào timeline công khai. Vì vậy trạng thái “đã xác minh” cũ không đủ căn cứ để khẳng định truy xuất nguồn gốc.

Hệ thống đã được bổ sung mô hình truy xuất theo lô, bám theo cách tiếp cận CTE/KDE của [GS1 Global Traceability Standard](https://www.gs1.org/standards/traceability) và mô hình sự kiện của [EPCIS 2.0](https://ref.gs1.org/standards/epcis/2.0.0): định danh chủ thể/địa điểm, bản khai nguồn gốc có revision, phả hệ lô, sự kiện kiểm định/kho/vận chuyển và ma trận Who–What–Where–When–Why.

Đây là triển khai **GS1-aligned**, không tuyên bố chứng nhận GS1 hay EPCIS-compliant. Muốn đạt mức đó cần cấp GTIN/GLN/SSCC chính thức, kiểm tra check digit, vocabulary chuẩn và endpoint EPCIS Capture/Query tương thích đầy đủ.

## 2. Lỗi và root cause đã xử lý

| Mức độ | Lỗi trước khi sửa | Root cause | Cách xử lý |
|---|---|---|---|
| Critical | Có thể hiển thị hồ sơ “verified” dù chưa có nguồn gốc theo lô | `fullyVerified` chỉ dựa trên QC và blockchain | `fullyVerified` nay bắt buộc toàn bộ ma trận dữ liệu và master data nguồn đã xác minh |
| Critical | Không lưu được ai sản xuất, ở đâu, mã lô nguồn nào | Chỉ có trường `supplier` dạng text tự do | Bổ sung `TraceabilityParty`, `TraceabilityLocation`, `BatchOriginDeclaration` |
| High | Mất lịch sử khi hiệu chỉnh nguồn gốc | Không có revision/audit ledger | Bản khai có revision, snapshot, SHA-256 hash và trigger DB chặn update/delete |
| High | Không truy ngược nguyên liệu của lô chế biến | Không có quan hệ input batch → output batch | Bổ sung `BatchMaterialLink`, kiểm tra chu trình và kiểm soát tổng lượng sử dụng |
| High | Timeline public thiếu bàn giao, shipping, delivered | Public API chỉ đọc `BatchJourney` | Hợp nhất `ShipmentEvent` production vào timeline, có actor, carrier, tracking code và thời gian |
| High | QR theo sản phẩm có thể trộn nhiều lô | Endpoint cũ chỉ nhận `productId` | Bổ sung endpoint/public page theo `batchId`; QR trong supply-chain sử dụng batch ID |
| High | API có thể xác minh chủ thể chưa có địa điểm | Chỉ UI chặn, service không có invariant | Backend bắt buộc ít nhất một địa điểm; mọi master data mới đều chờ xác minh rõ ràng |
| Medium | Admin tạo master data được auto-verified | Lẫn bước khai báo và bước kiểm duyệt | Bỏ auto-verify; Admin phải thực hiện bước xác minh riêng |
| Medium | Ma trận cộng điểm cho danh sách sự kiện rỗng | `[].every(...)` trả về `true` | Bắt buộc có sự kiện mới đạt KDE; thêm trạng thái `Không áp dụng` và loại khỏi mẫu số |
| Medium | Người quét QR có thể thấy trạng thái cũ trong 60 giây | Server page dùng `revalidate: 60` | Chuyển API truy xuất sang `cache: no-store` |

## 3. Mô hình dữ liệu mới

### `traceability_parties`

- Định danh chủ thể: mã nội bộ, loại chủ thể, GLN tùy chọn, mã số thuế và thông tin liên hệ.
- Trạng thái xác minh, người xác minh và thời điểm xác minh.
- Chủ thể mới luôn ở trạng thái chưa xác minh.

### `traceability_locations`

- Định danh địa điểm vật lý thuộc một chủ thể: trang trại, vùng trồng, điểm thu gom, cơ sở chế biến, kho, điểm phân phối...
- Địa chỉ có cấu trúc, quốc gia, tọa độ và GLN tùy chọn.
- Mã địa điểm là duy nhất trong phạm vi chủ thể.

### `batch_origin_declarations`

- Một hoặc nhiều revision bất biến cho mỗi batch.
- Lưu `sourceLotCode`, ngày thu hoạch/sản xuất, phương pháp sản xuất và URL minh chứng.
- Lưu snapshot chủ thể và địa điểm tại thời điểm khai báo để thay đổi master data sau này không làm sai lịch sử.
- Revision thứ hai trở đi bắt buộc có lý do hiệu chỉnh.
- Hash SHA-256 và trigger database bảo vệ ledger khỏi update/delete.

### `batch_material_links`

- Liên kết lô nguyên liệu đầu vào với lô đầu ra, số lượng, đơn vị và mã mẻ/công đoạn.
- Chặn self-reference, chặn vòng lặp phả hệ, chặn dùng vượt số lượng ban đầu và chặn trộn đơn vị không đồng nhất.
- Dữ liệu là append-only ở tầng database.

## 4. Quy trình nghiệp vụ production

1. **Seller/đơn vị sản xuất** tạo chủ thể nguồn và địa điểm thực tế.
2. **Admin** kiểm tra hồ sơ pháp lý, địa chỉ và minh chứng rồi xác minh toàn bộ hồ sơ chủ thể/địa điểm.
3. **Seller hoặc Warehouse Manager có quyền trên lô** ghi bản khai nguồn gốc theo batch; không được ghi ngày tương lai.
4. **Seller** ghi các CTE thu hoạch, tiếp nhận nguyên liệu, chế biến và đóng gói; mỗi event phải có actor, vị trí, thời gian và nghiệp vụ.
5. Nếu có chế biến/đóng gói, **Seller/Warehouse Manager** liên kết lô đầu vào–đầu ra; ma trận không đạt nếu thiếu phả hệ.
6. **Seller hoặc Warehouse Manager** ghi kiểm định; trạng thái chỉ đạt khi event QC tồn tại và kết quả batch là `PASSED`.
7. **Warehouse Manager** xác nhận nhập kho và bàn giao cho vận chuyển.
8. **LOGISTICS/đơn vị vận chuyển** cập nhật lấy hàng, đang giao, đến điểm phân phối, đã giao, thất bại hoặc hoàn hàng trong module Shipment; Admin chỉ giám sát.
9. QR production dùng `batchId`. Trang public hợp nhất nguồn gốc, QC, kho, genealogy và ShipmentEvent theo thời gian thực.

## 5. Ma trận xác minh

Các tiêu chí bắt buộc hoặc có điều kiện:

- Bản khai nguồn gốc theo lô.
- Chủ thể nguồn có định danh.
- Địa điểm nguồn có định danh và địa chỉ.
- Mã lô tại nguồn.
- Ngày thu hoạch hoặc ngày sản xuất.
- Kiểm định chất lượng đạt và có event QC.
- Có event tiếp nhận/nhập kho.
- Phả hệ input/output khi có chế biến hoặc đóng gói.
- Event KDE có Who, What, Where, When và Why/business step.
- Chuỗi bàn giao/vận chuyển khi batch phát sinh shipment.

Tiêu chí không phát sinh được hiển thị `Không áp dụng` và không được cộng vào mẫu số. Một batch chỉ có trạng thái `VERIFIED` khi dữ liệu áp dụng đầy đủ và cả chủ thể lẫn địa điểm nguồn đã được Admin xác minh. Blockchain là tín hiệu integrity bổ sung, không thay thế tính đầy đủ của hồ sơ nguồn gốc.

## 6. API được bổ sung

- `GET /api/v1/traceability/batch/:batchId`: hồ sơ public đúng một batch.
- `GET /api/v1/supply-chain/traceability/parties`: danh sách chủ thể/địa điểm theo quyền.
- `POST /api/v1/supply-chain/traceability/parties`: tạo chủ thể nguồn.
- `POST /api/v1/supply-chain/traceability/parties/:partyId/locations`: tạo địa điểm nguồn.
- `POST /api/v1/supply-chain/traceability/parties/:partyId/verification`: Admin xác minh/thu hồi.
- `POST /api/v1/supply-chain/batch/:batchId/origin`: ghi revision nguồn gốc.
- `POST /api/v1/supply-chain/batch/:batchId/material-links`: ghi quan hệ nguyên liệu.

## 7. Giao diện được bổ sung

- Tab `Ma trận nguồn gốc` tại dashboard chuỗi cung ứng.
- Modal `Hồ sơ nguồn gốc` để tạo chủ thể, địa điểm, ghi revision và phả hệ nguyên liệu.
- Modal Admin `Xác minh nguồn gốc` với invariant không cho xác minh hồ sơ chưa có địa điểm.
- Trang QR hiển thị điểm đầy đủ, từng tiêu chí `Đủ / Thiếu / Không áp dụng`, nguồn lô, phả hệ và timeline vận chuyển.
- Dữ liệu QR dùng `no-store`, không giữ trạng thái kiểm định/vận chuyển cũ.

## 8. Migration và kiểm thử

Migration đã triển khai trên PostgreSQL của dự án:

- `20260824020000_production_traceability`
- Tổng trạng thái database: 22/22 migrations, up to date.

Kết quả xác minh cuối:

- Backend unit test: **24 suites, 123 tests passed**.
- Backend production build: **passed**.
- Frontend production build và TypeScript: **passed**, 36 routes.
- ESLint các file truy xuất thay đổi: **0 error, 0 warning**.
- Traceability migration verifier: **passed** qua đủ 22 migrations, tables, indexes, constraints và append-only triggers.
- Shipment migration verifier: **passed** qua đủ 22 migrations.
- HTTP smoke test batch thật: scope `BATCH`, trạng thái `MISSING_ORIGIN`, điểm `0%`, không tự nhận verified.
- Browser smoke test: batch đúng, điểm `0%`, hai tiêu chí hiện `Không áp dụng`, cảnh báo thiếu bản khai nguồn gốc, không có console error.

## 9. Trạng thái dữ liệu hiện hữu

Code và database đã sẵn sàng lưu đúng nguồn gốc, nhưng dữ liệu lịch sử **không được tự backfill** vì hệ thống không thể suy đoán hợp pháp ai sản xuất, địa điểm nào hoặc mã lô nguồn nào.

Batch smoke test `20260821-HỒNG-001` hiện có trạng thái `MISSING_ORIGIN`, điểm `0%`. Đây là kết quả đúng và an toàn. Người phụ trách phải nhập hồ sơ thật, đính kèm minh chứng và Admin xác minh thì trạng thái mới tăng.

## 10. Việc cần làm trước go-live chính thức

- Ban hành SOP và chỉ định người chịu trách nhiệm nhập/xác minh từng KDE.
- Chuẩn hóa đơn vị đo (UCUM hoặc danh mục đơn vị nội bộ) để genealogy không phụ thuộc text.
- Cấp và kiểm tra GTIN/GLN/SSCC chính thức nếu doanh nghiệp tham gia hệ sinh thái GS1.
- Quy định thời hạn lưu bằng chứng và chính sách bảo vệ dữ liệu cá nhân trên QR public.
- Bổ sung cơ chế correction/reversal có kiểm soát cho quan hệ nguyên liệu nếu nghiệp vụ cần sửa một liên kết nhập sai; tuyệt đối không mở update/delete trực tiếp ledger.
- Thực hiện UAT với dữ liệu thật cho tối thiểu một luồng: thu hoạch → chế biến → đóng gói → QC → nhập kho → bàn giao → vận chuyển → giao hàng.

