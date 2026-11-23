# Kết quả rà soát và sửa tiếp — 14/09/2026

## Phạm vi

Tiếp tục trên worktree hiện có, giữ các thay đổi của người dùng; không reset hoặc commit. Đây là kết quả kiểm tra mã nguồn và kiểm thử tự động, không phải cam kết toàn bộ hệ thống không còn lỗi.

## Các nhóm lỗi đã xử lý

- Kho: ràng buộc sản phẩm/kho cùng Seller; lọc lựa chọn theo quyền; phân biệt tồn vật lý và tồn khả dụng. Chuyển kho kiểm tra số lượng, trạng thái kho/lô, hàng đã giữ chỗ và chống thực hiện lặp bằng idempotency key. Lô đích được cách ly.
- Danh mục kho tạo tồn ban đầu bằng 0. Số lượng thực tế phải qua lô sản xuất → tiếp nhận → kiểm định → lưu vị trí → phát hành, không cộng số lượng trực tiếp để bỏ qua công đoạn.
- Dashboard: sửa đọc sai cấu trúc danh sách sản phẩm; lấy đủ các trang dữ liệu liên quan và tách query cache theo người dùng.
- Sự kiện: sửa endpoint hoàn tất, cấu trúc phản hồi/upload, ngày bắt đầu/kết thúc và phân trang. API công khai không lộ sự kiện nháp/riêng tư. Không báo đăng ký thành công khi chưa có API đăng ký.
- Thông báo: chuẩn hóa kiểu dữ liệu, kiểm tra người nhận và thời gian lên lịch; cập nhật lại danh sách sau thao tác.
- Truy xuất/chứng nhận: bỏ dữ liệu giả về giao dịch blockchain, xác nhận, số quyết định, con dấu, chữ ký và sao OCOP. Hiển thị bằng chứng thật của lô đang tra cứu; bản in được ghi rõ chỉ là thông tin hồ sơ.
- Bản đồ: escape nội dung HTML trong popup; không dựng tọa độ/hành trình mẫu thành bằng chứng thật. Bộ chọn địa điểm bỏ kết quả gợi ý cũ, hủy request hết hiệu lực, xử lý tọa độ 0 và giữ container khi thu gọn bản đồ.
- Sửa lỗi TypeScript, ESLint và một số vấn đề kiểm tra dữ liệu, xử lý lỗi, cache ở sản phẩm, đánh giá, voucher, shipment và các màn hình dashboard.

## Kiểm tra đã chạy

| Kiểm tra | Kết quả |
| --- | --- |
| Backend TypeScript, không emit | Đạt |
| Frontend TypeScript, không emit | Đạt |
| Backend Jest, không cache, chạy tuần tự | 26 suites, 201 tests đạt |
| Backend ESLint src/test | 0 lỗi, 9 cảnh báo |
| Frontend ESLint src | 0 lỗi, 53 cảnh báo |
| Frontend production build | Đạt; có route `/dashboard/inventory` |
| Migration production lot/payment/shipment/traceability/direct seller | Cả 5 script đạt trên PGlite cô lập, mỗi script áp dụng 28 migrations |
| Kiểm tra file TypeScript/TSX rỗng trong src/test | Không có |

## Giới hạn và việc kiểm chứng tiếp

- Chưa kiểm thử thao tác đầu cuối bằng tài khoản Admin/Seller/Warehouse Manager/QA trên trình duyệt. Tại thời điểm kiểm tra, `localhost:3000` không có server lắng nghe. Route có trong build không đủ để kết luận lỗi 404 trong phiên đăng nhập thực tế đã hết.
- Cần smoke test luồng lô → tiếp nhận → QA → putaway → release → đặt hàng → đóng gói → bàn giao; kiểm tra lại số lượng khả dụng, quyền từng vai trò và thử gửi lặp yêu cầu chuyển kho.
- Kiểm tra migration ở đây dùng cơ sở dữ liệu cô lập, không áp dụng thay đổi lên dữ liệu triển khai.
- Còn cảnh báo lint và cảnh báo Next.js về quy ước middleware đã deprecated. Chưa coi các cảnh báo này là đã xử lý.
- Có sự cố công cụ tự ghi ESLint làm rỗng một số file trong quá trình làm việc. Đã khôi phục từ nguồn cache/lịch sử thay đổi, kiểm tra không còn file mã nguồn rỗng và chạy lại TypeScript/Jest không cache thành công. Các chỉnh sửa sau đó dùng patch thay vì công cụ ghi tự động.

## Lệnh kiểm tra lặp lại

Trong `backend`: `node node_modules/typescript/bin/tsc --noEmit --incremental false`, `node node_modules/jest/bin/jest.js --runInBand --no-cache --silent`.

Trong `frontend`: `node node_modules/typescript/bin/tsc --noEmit --incremental false`, `node node_modules/next/dist/bin/next build`. Không chạy build cùng lúc dev server dùng chung `.next`.
