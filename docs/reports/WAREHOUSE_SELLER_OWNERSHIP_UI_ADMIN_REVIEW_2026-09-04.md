# Báo cáo rà soát & sửa lỗi Warehouse Seller Ownership - 2026-09-04

## Kết luận

Nhận định của user là đúng: trước bản vá, phần Admin/Warehouse UI chưa thể hiện rõ kho thuộc Seller nào, khiến quy trình Seller tạo lô hàng có nguy cơ bị đứt ở bước chọn kho. Backend đã có `Warehouse.sellerId` và nhiều rule truy xuất nguồn gốc phụ thuộc vào quan hệ này, nhưng frontend Admin chưa bắt buộc/chưa hiển thị/chưa lọc theo Seller đầy đủ.

## Lỗi nghiệp vụ đã xử lý

### 1. Admin tạo kho nhưng chưa gán rõ Seller sở hữu

- Root cause: `Warehouse` có `sellerId`, nhưng modal tạo/sửa kho chưa luôn hiển thị selector Seller và danh sách kho chưa hiển thị Seller sở hữu.
- Mức độ: High, vì Seller không có kho hợp lệ thì không thể tạo lô đúng owner; traceability bị thiếu mắt xích chủ thể.
- Đã sửa:
  - Modal tạo/sửa kho bắt buộc chọn `Seller sở hữu kho`.
  - Chỉ load Seller đã xác minh để gán kho.
  - Card kho hiển thị Seller sở hữu, email và cảnh báo nếu kho legacy chưa gán Seller.

### 2. Có thể thêm sản phẩm sai Seller vào kho

- Root cause: UI “Thêm sản phẩm vào kho” trước đây chưa lọc sản phẩm theo Seller của kho.
- Mức độ: Critical, vì nếu sản phẩm Seller A nằm trong kho Seller B thì lô hàng và truy xuất nguồn gốc sai chủ thể.
- Đã sửa:
  - Khi chọn kho, dropdown sản phẩm chỉ hiển thị sản phẩm cùng `sellerId` với kho.
  - Kho chưa có Seller bị chặn thao tác thêm sản phẩm.
  - Backend tiếp tục chặn cứng điều kiện `warehouse.sellerId === product.sellerId`.

### 3. Edit kho chưa hỗ trợ cập nhật Seller/Manager đầy đủ

- Root cause: UI có danh sách kho nhưng thiếu thao tác edit đúng nghĩa; backend update chưa trả đầy đủ owner info.
- Mức độ: High.
- Đã sửa:
  - Thêm nút edit trên card kho cho Admin.
  - Modal edit dùng lại dữ liệu kho hiện tại.
  - Backend trả `seller`, `manager`, `_count` khi list/update kho.
  - Backend cho gán Seller cho kho legacy nếu an toàn, nhưng chặn đổi Seller khi kho đã có dữ liệu vận hành để bảo toàn traceability.

### 4. Warehouse Manager thấy thao tác không đúng nghiệp vụ

- Root cause: nút “Thêm sản phẩm vào kho” hiển thị chung cho nhiều role.
- Mức độ: Medium.
- Đã sửa:
  - Warehouse Manager không còn thấy thao tác “Thêm sản phẩm vào kho”.
  - Warehouse Manager tập trung vào nghiệp vụ kho/vận hành: xem kho được phân công, tạo chuyến/bàn giao vận chuyển.

### 5. Edit kho bị lỗi 400 khi vô tình đổi Seller sở hữu

- Root cause: backend production rule đã chặn đổi Seller khi kho đã phát sinh tồn kho/lô hàng/đơn vận hành để bảo toàn truy xuất nguồn gốc, nhưng UI edit vẫn cho chọn Seller khác. Người dùng có thể vô tình đổi Seller và nhận lỗi `400 Bad Request`.
- Mức độ: High về trải nghiệm vận hành; Critical nếu hệ thống cho đổi owner sau khi đã có traceability. Backend đã chặn đúng, UI cần phản ánh rule đó.
- Đã sửa:
  - Khi kho đã có dữ liệu vận hành và đã có Seller owner, dropdown `Seller sở hữu kho` bị khóa trong modal edit.
  - UI hiển thị thông báo rõ: Seller đã khóa vì kho đã phát sinh dữ liệu, người dùng vẫn sửa được tên, loại kho, quản lý, mô tả và địa chỉ.
  - Kho legacy chưa có Seller vẫn có thể gán owner nếu backend xác nhận không có dữ liệu xung đột.

### 6. Search address trong Warehouse bật popup `Failed to fetch`

- Root cause: modal kho gọi trực tiếp Nominatim/OpenStreetMap từ browser. Khi máy local/mạng/chính sách chặn kết nối tới dịch vụ bản đồ bên ngoài, request bị fail và code cũ gọi `alert(error.message)`, tạo popup chặn thao tác.
- Mức độ: Medium về vận hành; không làm hỏng dữ liệu nhưng gây UX xấu và dễ bị hiểu nhầm là lỗi lưu kho.
- Đã sửa:
  - Bỏ popup `alert("Failed to fetch")` khi geocoding thất bại.
  - Ưu tiên tìm tọa độ bằng dữ liệu tỉnh/thành nội bộ của hệ thống trước, có hỗ trợ tìm không dấu như `Ha Noi`, `Ben Tre`, `Quang Ninh`.
  - Chỉ gọi dịch vụ bản đồ bên ngoài khi không match dữ liệu nội bộ.
  - Nếu external geocoding lỗi, hiển thị cảnh báo inline dưới ô search và cho phép người dùng nhập địa chỉ thủ công/kéo marker tiếp tục.

### 7. Map Picker trong Warehouse không hiện nền bản đồ

- Root cause: `MapPicker` chỉ dùng tile từ `tile.openstreetmap.org` và marker icon từ `unpkg.com`. Khi môi trường local/mạng/chính sách trình duyệt chặn các host ngoài này, Leaflet vẫn render container nhưng nền bản đồ trắng/xám và marker icon có thể không tải.
- Mức độ: Medium về UX; dữ liệu GPS vẫn có thể lưu nhưng người dùng tưởng form lỗi.
- Đã sửa:
  - Marker chuyển sang CSS `divIcon` nội bộ, không còn phụ thuộc CDN `unpkg.com`.
  - Thêm tile provider dự phòng CARTO nếu OpenStreetMap tile lỗi.
  - Nếu tất cả tile ngoài đều lỗi, hiển thị nền fallback dạng lưới + cảnh báo inline + GPS hiện tại, vẫn giữ marker/drag/search/current-location để người dùng thao tác.

## File đã thay đổi trong scope này

- `backend/src/features/inventory/inventory.service.ts`
- `backend/src/features/inventory/inventory.repository.ts`
- `backend/src/features/inventory/inventory.service.spec.ts`
- `frontend/src/components/inventory/CreateWarehouseModal.tsx`
- `frontend/src/app/(dashboard)/dashboard/inventory/page.tsx`

## Quy trình sau bản vá

1. Admin tạo/xác minh Seller ở màn Người bán.
2. Admin tạo kho và bắt buộc gán Seller sở hữu kho.
3. Admin/Seller thêm sản phẩm của đúng Seller vào kho tương ứng.
4. Seller tạo lô từ inventory thuộc chính Seller và kho thuộc chính Seller.
5. Warehouse Manager chỉ xử lý các bước kho được phân công, không tự gán sản phẩm lẫn owner.
6. Shipment/carrier tiếp tục đi theo luồng vận chuyển ngoài, trạng thái được cập nhật từ carrier/webhook hoặc thao tác bàn giao phù hợp.

## Kết quả kiểm thử

- Backend focused tests: `inventory.service.spec.ts`, `supply-chain.service.spec.ts`, `shipments.service.spec.ts` pass 40/40.
- Backend build: pass.
- Frontend TypeScript: pass.
- Frontend production build: pass.
- Sau bản vá case edit kho 400: `inventory.service.spec.ts` pass 18/18, Frontend TypeScript pass, Frontend production build pass.
- Sau bản vá address search: Frontend TypeScript pass, Frontend production build pass.
- Sau bản vá Map Picker fallback: Frontend TypeScript pass, Frontend production build pass.

## Ghi chú còn lại

- Full ESLint toàn frontend/backend vẫn còn nhiều lỗi cũ như `any`, unused imports và rule React Compiler `set-state-in-effect` trong các file dashboard hiện hữu. Các lỗi này không phát sinh từ riêng bản vá ownership này, nhưng nên có một phase cleanup riêng trước production hardening.
