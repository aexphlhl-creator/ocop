# Tiếp tục phần bị gián đoạn: vòng đời lô production

Ngày: 04/09/2026. Phạm vi: tiếp tục code đang dở trong workspace OCOP; không reset các thay đổi có sẵn.

## Kết luận

Đã nối phần lifecycle backend đang dở với giao diện Seller, Warehouse Manager và QA/QC; đã áp dụng schema tương ứng trên PostgreSQL **local**. Đây là một mốc hoàn thành của đợt remediation, **không phải xác nhận toàn bộ hệ thống đã production-ready**.

## Điểm khôi phục

Code trước gián đoạn đã thêm `BatchLifecycleStatus`, QA, khai báo/tiếp nhận/kiểm định/phát hành, nhưng chưa đầy đủ: lỗi compile, frontend còn gọi nhập kho trực tiếp, chưa có form tạo lô/QA, checkout chưa kiểm tra RELEASED, migration tự phát hành lô legacy PASSED. Các thay đổi này đã được rà lại và sửa tiếp, không làm lại từ đầu.

## Đã thực hiện

1. Khôi phục build backend, bổ sung các trường batch bắt buộc tại demo seed, goods receipt và hàng hoàn; loại bỏ nhánh QC/vận chuyển cũ trong API công đoạn sản xuất.
2. Chuẩn hóa endpoint procurement/events/notifications về `/api/v1`; sửa frontend goods receipt thành `/api/v1/goods-receipts`.
3. Kho tạo mới phải thuộc Seller đang hoạt động, đã xác minh. Manager chỉ là Warehouse Manager; không dùng Admin/Seller làm manager. Form tạo kho có lựa chọn Seller; mã kho không còn sinh từ count dễ trùng khi đồng thời.
4. Seller tạo hồ sơ DRAFT có số lượng khai báo, chưa tăng tồn kho. UI: **Chuỗi cung ứng → Tạo lô sản xuất**. Phải có sản phẩm trong kho thuộc Seller trước.
5. Công đoạn sản xuất thuộc Seller. Các bước tiếp nhận, QA, xếp kho và phát hành dùng API riêng. Admin giám sát, không trực tiếp thực hiện.
6. Tiếp nhận kho ghi số lượng thực nhận, stock movement và minh chứng trong một transaction; khóa inventory trước batch để nhất quán thứ tự lock với checkout.
7. QA độc lập kiểm định PASSED/FAILED; PASSED chỉ chuyển QC_PASSED, không tự cho bán. Kho xác nhận PUT_AWAY rồi QA mới RELEASE. Backend kiểm tra role QA cả trong service.
8. Chống gửi trùng bằng unique key và fingerprint nội dung. Retry cùng nội dung không tăng tồn lần nữa; đổi người/thao tác/nội dung với key cũ bị từ chối. Tạo lô đồng thời cùng key có replay winner.
9. Nhật ký lifecycle append-only lưu người ghi, thời điểm, chứng từ, minh chứng; kiểm tra trình tự thời gian với cả lifecycle và journey. Lỗi enqueue blockchain được bắt và ghi log, không làm mất bản ghi nguồn đã commit.
10. Checkout chỉ chọn lô ACTIVE + PASSED + RELEASED + còn hạn, sản phẩm đã duyệt và Seller còn hoạt động/được xác minh. Kiểm tra lại khi tạo/bàn giao shipment để không xuất lô bị chặn sau khi reserve.
11. Khóa cập nhật SHIPPED/DELIVERED/RETURNED trực tiếp từ trang đơn hàng; vận chuyển phải qua Shipment.
12. Hàng hoàn/chuyển kho có parent batch; lô nhận chuyển kho không tự thừa hưởng quyền RELEASED. Khi kiểm định/phát hành lô con, tìm hồ sơ nguồn theo parent chain và kiểm tra cùng sản phẩm/Seller.
13. Kiểm kê theo batch: đọc lại tồn sau lock, kiểm tra reservation của chính batch và shipment thủ công, không cho chỉnh lô chưa tiếp nhận; movement giữ before/after tồn inventory nhất quán.
14. Giao diện có panel lifecycle, nhật ký, thao tác đúng role/state, form nhận/QC/put-away/release với upload ảnh. Admin có **Tài khoản QA/QC**. QA có menu và trang vào nghiệp vụ.
15. Nút nhập kho trực tiếp cũ chuyển sang trang chuỗi cung ứng. Thẻ chi tiết/bảng không còn coi ACTIVE là “đang bán”. Chỉ số được xuất bán dùng RELEASED; chờ QA bao gồm QUARANTINED; chỉ số vận chuyển lấy từ Shipment thay vì công đoạn vận chuyển legacy.

## Quy trình hiện đã nối

| Người chịu trách nhiệm | Thao tác | Trạng thái sau thao tác | Tồn vật lý |
|---|---|---|---|
| Admin | Gán kho cho Seller, gán Warehouse Manager, tạo QA | Cấu hình vận hành | Không đổi |
| Seller | Tạo hồ sơ lô | DRAFT | Chưa tăng |
| Seller | Khai báo nguồn gốc + công đoạn sản xuất, gửi hồ sơ | SUBMITTED | Chưa tăng |
| Warehouse Manager đúng kho | Tiếp nhận thực tế + chứng từ/ảnh | QUARANTINED | Tăng theo thực nhận |
| QA độc lập | Kiểm định + minh chứng | QC_PASSED hoặc REJECTED | Không đổi |
| Warehouse Manager đúng kho | Xác nhận vị trí lưu trữ | QC_PASSED + PUT_AWAY event | Không đổi |
| QA độc lập | Phát hành có kết luận/chứng từ | RELEASED | Đủ điều kiện reserve/xuất |
| Kho / Logistics | Shipment, bàn giao, giao nhận | Theo state machine Shipment | Trừ tại bàn giao |

Các lô cách ly thiếu nguồn gốc được bổ sung khai báo append-only với lý do và chứng từ trước QA; không tự duyệt bằng việc bổ sung hồ sơ.

## Dữ liệu và sao lưu

- PostgreSQL: `localhost:5432`, database `ocop_vietnam`.
- Trước migration: 41 batches, 0 orders; không có batch initial_quantity <= 0; không trùng inventory/batch number; không trùng user/product review.
- Backup PostgreSQL custom-format 536,469 bytes, đã kiểm tra đọc được bằng `pg_restore --list`:
  `C:/Users/Trung/.codex/backups/ocop/ocop-before-lifecycle-20260904-0940.dump`.
- Đã áp dụng `20260903000000_quality_assurance_role` và `20260903010000_production_lot_lifecycle`.
- Enum QA tách migration riêng, commit trước khi insert role.
- Legacy PASSED **không** tự chuyển RELEASED. Không tạo giả inspected_at/released_at. Số lượng không thay đổi do migration.
- Cache Next phát sinh lỗi đọc `.next/dev/types/routes.d.ts`; đã **di chuyển để giữ lại**, không xóa: `frontend/.next/dev-before-lifecycle-20260904`. Next đã khởi động được lại.
- Không chạy lại seed, không reset DB, không tạo lô thử hay QA thật để thử nghiệp vụ trên dữ liệu local.

## Kiểm chứng

- Backend: 26 suites / 162 tests qua (gồm 19 test mới về lifecycle, quyền QA, receipt, replay, minh chứng, chronology và release gate).
- Backend `npm run build`: qua.
- Frontend `npx tsc --noEmit`: qua.
- ESLint riêng `ProductionLotWorkflow.tsx`: qua. Không tuyên bố toàn frontend sạch lint; baseline đã có nhiều lỗi ngoài phạm vi.
- `node scripts/verify-production-lot-migration.mjs`: qua trên PGlite riêng; chạy chuỗi 27 migrations, kiểm tra legacy quarantine, không giả QA, role QA, audit không sửa/xóa, unique idempotency.
- `node scripts/verify-direct-seller-migration.mjs`: qua chuỗi 27 migrations với fixture ownership/legacy.
- Smoke API thật bằng Seller demo có sẵn: danh sách batch, chi tiết batch, thống kê, inventory đều HTTP 200. Seller gọi inspect nhận HTTP 403 đúng quyền.
- Thống kê thật của Seller demo: 0 lô RELEASED, 8 lô chờ QA sau migration, phù hợp dữ liệu.
- Browser: đăng nhập Seller demo, mở trang chuỗi cung ứng và form tạo lô; danh sách chỉ hiện sản phẩm/kho của Seller. Không submit lô thử. Chưa test tương tác hoàn chỉnh với cả ba tài khoản Seller/Kho/QA.

## Những việc còn lại — không được hiểu là đã hoàn tất

1. E2E trên DB test riêng từ khai báo → nguồn gốc → tiếp nhận → QA → release → checkout → shipment → customer, bao gồm retry/concurrency thực PostgreSQL, rollback và lỗi upload/queue. Unit tests mock không thay thế E2E này.
2. Đồng bộ Shipment → order tracking/notification; đơn có nhiều chuyến kết quả pha trộn delivered/returned; COD thu tiền/đối soát/hoàn tiền chưa được xác nhận hoàn chỉnh. Không suy ra “đã thu tiền” chỉ từ DELIVERED.
3. Chuyển kho thực tế nhiều chặng: schema đã có destinationWarehouseId nhưng cần nối đầy đủ giao diện/API bàn giao–nhận kho và genealogy; thao tác transfer trực tiếp còn là nghiệp vụ cần hoàn thiện. Kiểm tra idempotency payload của transfer.
4. QR/truy xuất public cần chọn đúng batch đã giao, hiển thị lineage và phạm vi thông tin công khai; không chọn tùy ý một batch đang hoạt động của sản phẩm.
5. Hàng hoàn cần kiểm thử gộp nhiều shipment item cùng batch, tránh nhận trùng/va chạm mã; nhận vật lý, tái QA và quyền bán lại cần E2E.
6. Procurement còn cần đối chiếu submit/approve/receipt, concurrency nhận vượt PO và chứng từ tiếp nhận/nguồn gốc cho lô nhập ngoài luồng Seller.
7. Review mới có unique user/product ở schema; nghiệp vụ verified purchase và thông báo lỗi conflict cần hoàn thiện.
8. Outbox/reconciliation bền vững cho blockchain còn cần thực hiện; catch/log enqueue chưa bảo đảm mọi job được giao khi Redis gián đoạn.
9. Checklist sản xuất hiện cố định HARVEST → PROCESSING → PACKAGING; cần cấu hình theo loại sản phẩm (nông sản không chế biến, thủ công…) để không buộc nhập công đoạn không áp dụng.
10. DEMO_MODE hiện bật tại local: blockchain external bị tắt, upload dùng cơ chế local. Chưa kết nối thật webhook hãng vận chuyển, chưa triển khai server production.
11. Kho legacy không có Seller cần luồng repair ownership có kiểm tra lịch sử; hiện form chỉ chọn Seller khi tạo kho mới, không cho tùy ý đổi chủ kho đã có hàng.

## Tiếp tục nếu phiên bị ngắt

Đọc báo cáo này trước, kiểm tra diff hiện tại (không reset), chạy lại build/tests. Ưu tiên mục 1–3 phần còn lại. Backend và frontend dev đã được khởi động trên 3001/3000 trong phiên này; kiểm tra listener trước khi mở server trùng. Tuyệt đối không re-run seed để “làm xanh” lifecycle legacy.
