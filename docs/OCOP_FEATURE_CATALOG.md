# Danh sách tính năng nền tảng OCOP Enterprise

Tài liệu này dùng để chuẩn bị demo cho khách hàng. Nội dung chỉ liệt kê tính năng, trạng thái hiện tại và tác dụng của từng tính năng.

## Cập nhật kiểm tra mã nguồn 14/09/2026

Các nhãn demo bên dưới không thay thế kiểm thử đầu cuối trên môi trường triển khai. Xem `REVIEW_FIXES_2026-09-14.md` để biết phạm vi đã kiểm tra và giới hạn còn lại.

- Thêm sản phẩm vào kho chỉ tạo danh mục tồn kho, số lượng ban đầu bằng 0. Số lượng thực tế đi qua khai báo lô → tiếp nhận → QA → lưu vị trí → phát hành.
- Seller chỉ sử dụng sản phẩm và kho đúng quyền sở hữu. Chuyển kho nội bộ phải cùng sản phẩm/cùng Seller; lô đích được cách ly để QA.
- Nhập/xuất kho thủ công cũ và phân công giao hàng nội bộ đã ngừng dùng. Vận chuyển theo shipment/hãng vận chuyển và webhook.
- Chưa có API đăng ký tham gia sự kiện: giao diện chỉ liên hệ ban tổ chức, không báo đã đăng ký thành công.
- Bản in chứng nhận chỉ là bản tra cứu dữ liệu, không tự tạo số quyết định, con dấu, chữ ký số hoặc hạng sao.
- Blockchain chỉ được báo xác nhận khi có bản ghi thật; không sinh mã giao dịch hoặc số xác nhận mẫu khi thiếu dữ liệu.

## Quy ước trạng thái

| Trạng thái | Ý nghĩa |
| --- | --- |
| Thành công | Đã có thể đưa vào luồng demo chính. |
| Chưa xong | Chưa nên demo như một tính năng hoàn chỉnh. |
| Cần cấu hình | Đã có nền tảng/code nhưng cần cấu hình môi trường, tài khoản cloud, khóa API hoặc dữ liệu thật. |

## 1. Nhóm tính năng nên demo chính

### 1.1 Website công khai

| Tính năng | Trạng thái | Tác dụng |
| --- | --- | --- |
| Trang chủ | Thành công | Giới thiệu nền tảng OCOP, tạo ấn tượng ban đầu và điều hướng người dùng tới sản phẩm, gian hàng, bản đồ, truy xuất nguồn gốc. |
| Danh sách sản phẩm OCOP | Thành công | Cho khách hàng xem toàn bộ sản phẩm OCOP đang có trên hệ thống. |
| Chi tiết sản phẩm | Thành công | Hiển thị thông tin sản phẩm, hình ảnh, chủ thể sản xuất, đánh giá và nút mua hàng. |
| Gian hàng / cửa hàng | Thành công | Giúp khách hàng xem sản phẩm theo từng chủ thể sản xuất hoặc doanh nghiệp. |
| Tin tức | Thành công | Hiển thị bài viết truyền thông, câu chuyện sản phẩm và thông tin OCOP. |
| Bản đồ số OCOP | Thành công | Hiển thị sản phẩm/doanh nghiệp theo vị trí địa lý, hỗ trợ trải nghiệm tìm kiếm theo khu vực. |
| Giỏ hàng | Thành công | Cho phép khách hàng thêm sản phẩm và chuẩn bị đặt hàng. |
| Checkout | Thành công | Cho phép khách hàng tạo đơn hàng từ giỏ hàng. |
| QR Traceability | Thành công | Cho phép quét/xem nguồn gốc sản phẩm công khai theo mã truy xuất. |
| Giao diện responsive | Thành công | Giúp website dùng được trên desktop, tablet và mobile. |

### 1.2 Tài khoản và phân quyền

| Tính năng | Trạng thái | Tác dụng |
| --- | --- | --- |
| Đăng ký tài khoản | Thành công | Cho phép người dùng mới tạo tài khoản. |
| Đăng nhập | Thành công | Xác thực người dùng để vào dashboard hoặc thực hiện thao tác cần tài khoản. |
| Đăng xuất | Thành công | Kết thúc phiên đăng nhập an toàn. |
| Refresh token | Thành công | Duy trì phiên đăng nhập mà không yêu cầu người dùng đăng nhập lại liên tục. |
| Lấy thông tin tài khoản hiện tại | Thành công | Hiển thị đúng thông tin người dùng đang đăng nhập. |
| Phân quyền Admin / Seller / Customer | Thành công | Đảm bảo mỗi nhóm người dùng chỉ truy cập đúng chức năng được phép. |
| Chặn đăng ký trực tiếp vai trò nhạy cảm | Thành công | Tránh người dùng tự đăng ký thành Admin hoặc Event Coordinator. |
| MFA / 2FA | Chưa xong | Chưa có xác thực đa yếu tố, chưa nên giới thiệu như tính năng bảo mật hoàn chỉnh. |
| Quản lý phiên đăng nhập nâng cao | Chưa xong | Chưa có màn hình quản lý các phiên đăng nhập của người dùng. |

### 1.3 Dashboard quản trị

| Tính năng | Trạng thái | Tác dụng |
| --- | --- | --- |
| Dashboard tổng quan | Thành công | Cho Admin/Seller xem nhanh KPI, dữ liệu vận hành và tình trạng hệ thống. |
| Quản lý sản phẩm | Thành công | Tạo, cập nhật, duyệt và quản lý sản phẩm OCOP. |
| Quản lý chủ thể sản xuất | Thành công | Quản lý thông tin doanh nghiệp, hợp tác xã, hộ kinh doanh hoặc chủ thể OCOP. |
| Quản lý kho | Thành công | Theo dõi tồn kho, nhập kho, xuất kho, batch và cảnh báo tồn kho. |
| Quản lý chuỗi cung ứng | Thành công | Ghi nhận các mốc như thu hoạch, chế biến, đóng gói, kiểm định, vận chuyển, giao hàng. |
| Quản lý chứng nhận | Thành công | Quản lý chứng nhận OCOP, VietGAP, HACCP và file chứng nhận. |
| Quản lý đơn hàng | Thành công | Theo dõi đơn hàng, trạng thái giao hàng và lịch sử xử lý. |
| Quản lý mua sắm nội bộ | Đã ngừng dùng | Module/routes Procurement đã được loại khỏi luồng hiện tại; dữ liệu lịch sử được giữ. |
| Quản lý tin tức | Thành công | Tạo và quản lý nội dung truyền thông. |
| Quản lý đánh giá | Thành công | Theo dõi và xử lý đánh giá sản phẩm từ khách hàng. |
| Quản lý voucher | Thành công | Tạo mã giảm giá và chương trình khuyến mãi. |
| Quản lý yêu cầu nâng hạng OCOP | Đã ngừng dùng | Không còn module/routes nâng hạng trong luồng hiện tại. |
| Quản lý hồ sơ người dùng | Thành công | Cho người dùng xem/cập nhật thông tin cá nhân. |
| Quản lý sự kiện | Chưa xong | Có nền tảng module nhưng chưa nên demo như tính năng hoàn chỉnh. |
| Tạo sự kiện | Chưa xong | Chức năng tạo sự kiện hiện chưa đạt yêu cầu demo. |
| Quản lý notification campaign | Thành công | Tạo và gửi thông báo nội bộ đến nhóm người dùng phù hợp. |
| Blockchain dashboard | Thành công | Theo dõi trạng thái job/record blockchain trong hệ thống demo. |

## 2. Nhóm nghiệp vụ cốt lõi

### 2.1 Sản phẩm OCOP

| Tính năng | Trạng thái | Tác dụng |
| --- | --- | --- |
| Tạo sản phẩm | Thành công | Cho Seller/Admin thêm sản phẩm OCOP mới vào hệ thống. |
| Cập nhật sản phẩm | Thành công | Cho phép chỉnh sửa thông tin, mô tả, hình ảnh và dữ liệu liên quan. |
| Duyệt sản phẩm | Thành công | Giúp Admin kiểm soát sản phẩm trước khi hiển thị công khai. |
| Xem sản phẩm công khai | Thành công | Cho khách hàng tìm kiếm và xem sản phẩm. |
| Lọc và phân trang sản phẩm | Thành công | Giúp danh sách sản phẩm dễ duyệt khi dữ liệu lớn. |
| Liên kết sản phẩm với doanh nghiệp | Thành công | Xác định sản phẩm thuộc chủ thể sản xuất nào. |
| Liên kết sản phẩm với cấp sao OCOP | Thành công | Hiển thị sản phẩm đạt OCOP 3 sao, 4 sao hoặc 5 sao. |
| Soft delete sản phẩm | Thành công | Ẩn sản phẩm khỏi hệ thống mà vẫn giữ dữ liệu phục vụ audit. |

### 2.2 Chủ thể sản xuất / doanh nghiệp

| Tính năng | Trạng thái | Tác dụng |
| --- | --- | --- |
| Tạo chủ thể sản xuất | Thành công | Lưu thông tin doanh nghiệp, hợp tác xã hoặc hộ sản xuất. |
| Cập nhật chủ thể sản xuất | Thành công | Duy trì thông tin pháp lý, địa chỉ và mô tả doanh nghiệp. |
| Xem danh sách chủ thể | Thành công | Cho Admin/Seller quản lý các đơn vị tham gia hệ thống. |
| Xem chi tiết chủ thể | Thành công | Hiển thị sản phẩm, kho, đơn hàng và dữ liệu liên quan của một chủ thể. |
| Liên kết địa giới hành chính | Thành công | Gắn doanh nghiệp với tỉnh/phường/xã để phục vụ bản đồ và lọc dữ liệu. |
| Soft delete chủ thể | Thành công | Ngừng hiển thị chủ thể nhưng vẫn giữ dữ liệu lịch sử. |

### 2.3 Kho và tồn kho

| Tính năng | Trạng thái | Tác dụng |
| --- | --- | --- |
| Tạo kho | Thành công | Cho doanh nghiệp quản lý nhiều điểm lưu trữ hàng hóa. |
| Xem danh sách kho | Thành công | Theo dõi hệ thống kho theo doanh nghiệp hoặc vai trò. |
| Nhập kho | Thành công | Ghi nhận sản phẩm được đưa vào kho. |
| Xuất kho | Thành công | Ghi nhận sản phẩm rời khỏi kho. |
| Batch inventory | Thành công | Quản lý hàng hóa theo lô, ngày sản xuất, ngày hết hạn. |
| FIFO | Thành công | Ưu tiên xuất lô nhập trước hoặc lô phù hợp trước để giảm rủi ro hết hạn. |
| Reserved quantity | Thành công | Giữ hàng cho đơn hàng đang xử lý, tránh bán vượt tồn kho. |
| Cảnh báo tồn kho thấp | Thành công | Giúp Seller/Admin phát hiện sản phẩm sắp hết hàng. |
| Cảnh báo lô sắp hết hạn | Thành công | Giúp xử lý hàng hóa trước khi hết hạn. |
| Lịch sử stock movement | Thành công | Theo dõi toàn bộ nhập, xuất, điều chỉnh và chuyển kho. |

### 2.4 Chuỗi cung ứng

| Tính năng | Trạng thái | Tác dụng |
| --- | --- | --- |
| Ghi nhận thu hoạch | Thành công | Lưu mốc đầu tiên của hành trình sản phẩm. |
| Ghi nhận chế biến | Thành công | Lưu thông tin quá trình xử lý/chế biến sản phẩm. |
| Ghi nhận đóng gói | Thành công | Lưu mốc đóng gói trước khi phân phối. |
| Ghi nhận kiểm tra chất lượng | Thành công | Lưu kết quả kiểm định hoặc bước kiểm soát chất lượng. |
| Ghi nhận vận chuyển | Thành công | Theo dõi sản phẩm trong quá trình giao hàng. |
| Ghi nhận giao hàng | Thành công | Xác nhận sản phẩm đã tới điểm nhận hoặc khách hàng. |
| Timeline chuỗi cung ứng | Thành công | Hiển thị hành trình sản phẩm theo thời gian. |
| Dữ liệu phục vụ QR Traceability | Thành công | Đưa thông tin chuỗi cung ứng ra trang truy xuất công khai. |

### 2.5 Chứng nhận

| Tính năng | Trạng thái | Tác dụng |
| --- | --- | --- |
| Tạo chứng nhận | Thành công | Lưu chứng nhận OCOP, VietGAP, HACCP hoặc chứng nhận liên quan. |
| Cập nhật chứng nhận | Thành công | Điều chỉnh thông tin chứng nhận khi có thay đổi. |
| Upload file chứng nhận | Thành công | Lưu tài liệu chứng nhận phục vụ kiểm tra và truy xuất. |
| Hash tài liệu SHA-256 | Thành công | Tạo dấu vân tay số cho file chứng nhận, hỗ trợ xác minh tính toàn vẹn. |
| Cảnh báo chứng nhận sắp hết hạn | Thành công | Giúp doanh nghiệp gia hạn kịp thời. |
| Soft delete chứng nhận | Thành công | Ẩn chứng nhận nhưng vẫn giữ dữ liệu lịch sử. |
| Presigned download URL | Thành công | Cho phép tải file qua URL tạm thời, không lộ bucket storage. |

### 2.6 Truy xuất nguồn gốc QR

| Tính năng | Trạng thái | Tác dụng |
| --- | --- | --- |
| Trang truy xuất công khai | Thành công | Cho khách hàng xem nguồn gốc sản phẩm mà không cần đăng nhập. |
| Hiển thị thông tin sản phẩm | Thành công | Giúp khách biết sản phẩm là gì, thuộc nhóm nào, cấp sao nào. |
| Hiển thị chủ thể sản xuất | Thành công | Tăng độ tin cậy bằng thông tin doanh nghiệp/hợp tác xã sản xuất. |
| Hiển thị batch/kho | Thành công | Cho biết sản phẩm thuộc lô nào và liên quan tới kho nào. |
| Hiển thị chuỗi cung ứng | Thành công | Cho khách hàng xem hành trình sản phẩm từ sản xuất tới giao hàng. |
| Hiển thị chứng nhận | Thành công | Chứng minh sản phẩm có chứng nhận liên quan. |
| Ẩn dữ liệu nhạy cảm | Thành công | Không đưa userId, ipAddress, deletedAt, internalNote ra trang công khai. |
| Hiển thị trạng thái blockchain | Thành công | Cho biết dữ liệu đã được xác minh hoặc đang chờ xác minh trên blockchain. |

### 2.7 Đơn hàng

| Tính năng | Trạng thái | Tác dụng |
| --- | --- | --- |
| Tạo đơn hàng | Thành công | Cho khách hàng đặt mua sản phẩm. |
| Xem danh sách đơn hàng | Thành công | Cho Admin/Seller/Customer theo dõi đơn theo quyền. |
| Xem chi tiết đơn hàng | Thành công | Hiển thị sản phẩm, số lượng, trạng thái và thông tin giao hàng. |
| Cập nhật trạng thái đơn hàng | Thành công | Quản lý vòng đời đơn hàng từ tạo mới tới giao hàng. |
| Hủy đơn hàng | Thành công | Cho phép hủy đơn và giải phóng tồn kho đã giữ. |
| Tracking history | Thành công | Lưu lịch sử thay đổi trạng thái đơn hàng. |
| Liên kết tồn kho | Thành công | Đảm bảo đặt hàng ảnh hưởng đúng tới reserved quantity và stock movement. |

### 2.8 Procurement / mua sắm nội bộ

Module/routes đã ngừng dùng. Các bảng và migration lịch sử có thể còn trong cơ sở dữ liệu để bảo toàn hồ sơ; không có nghĩa là quy trình PO/goods receipt còn được hỗ trợ.

### 2.9 Tin tức, đánh giá, voucher

| Tính năng | Trạng thái | Tác dụng |
| --- | --- | --- |
| Quản lý tin tức | Thành công | Đăng bài truyền thông, câu chuyện sản phẩm, thông báo OCOP. |
| Trang tin tức công khai | Thành công | Cho khách hàng đọc nội dung truyền thông. |
| Đánh giá sản phẩm | Thành công | Cho khách hàng phản hồi chất lượng sản phẩm. |
| Quản lý đánh giá | Thành công | Cho Admin xử lý đánh giá không phù hợp. |
| Voucher giảm giá | Thành công | Tạo khuyến mãi để hỗ trợ bán hàng. |
| Áp dụng voucher | Thành công | Tính giảm giá cho đơn hàng hợp lệ. |
| Yêu cầu nâng hạng sao OCOP | Đã ngừng dùng | Không đưa vào demo như tính năng hiện hành. |

## 3. Nhóm nên demo nếu đã cấu hình môi trường

### 3.1 Blockchain

| Tính năng | Trạng thái | Tác dụng |
| --- | --- | --- |
| Blockchain foundation | Thành công | Chuẩn bị nền tảng smart contract, ABI, provider, wallet và service backend. |
| Blockchain queue | Thành công | Đưa job xác minh chứng nhận/chuỗi cung ứng vào hàng đợi xử lý nền. |
| Blockchain dashboard | Thành công | Cho Admin theo dõi record, trạng thái, giao dịch và lỗi blockchain. |
| Demo mode blockchain | Thành công | Không gửi giao dịch thật khi chạy môi trường demo. |
| Ghi transaction thật lên Polygon Amoy | Cần cấu hình | Cần RPC, private key, contract address và ví có test POL. |
| Explorer URL thật | Cần cấu hình | Chỉ hiển thị đúng khi có giao dịch thật đã được xác nhận. |

### 3.2 Thanh toán

| Tính năng | Trạng thái | Tác dụng |
| --- | --- | --- |
| COD | Thành công | Cho phép đặt hàng thanh toán khi nhận hàng. |
| VNPAY URL | Thành công | Tạo URL thanh toán VNPAY khi có cấu hình merchant. |
| VNPAY IPN/return | Thành công | Nhận kết quả thanh toán từ VNPAY. |
| Thanh toán VNPAY thật | Cần cấu hình | Cần tài khoản merchant, secret, return URL và môi trường VNPAY hợp lệ. |

### 3.3 Storage cloud

| Tính năng | Trạng thái | Tác dụng |
| --- | --- | --- |
| Upload media | Thành công | Cho phép upload hình ảnh/file phục vụ sản phẩm và chứng nhận. |
| Validate file type/size | Thành công | Ngăn upload file sai định dạng hoặc quá lớn. |
| MinIO/S3-compatible provider | Thành công | Chuẩn bị storage production qua provider tương thích S3. |
| Demo storage mode | Thành công | Không kết nối MinIO khi chạy demo mode. |
| Cloudflare R2 hoặc S3 thật | Cần cấu hình | Cần endpoint, access key, secret key và bucket thật. |

## 4. Bảo mật

| Tính năng / yêu cầu | Trạng thái | Tác dụng |
| --- | --- | --- |
| JWT authentication | Thành công | Bảo vệ API cần đăng nhập. |
| Refresh token blacklist | Thành công | Vô hiệu hóa token sau khi logout. |
| RBAC theo vai trò | Thành công | Ngăn người dùng truy cập chức năng ngoài quyền. |
| DTO validation | Thành công | Chặn dữ liệu đầu vào sai schema hoặc thừa field. |
| CORS theo domain | Thành công | Chỉ cho frontend hợp lệ gọi backend. |
| Helmet security headers | Thành công | Tăng bảo vệ HTTP header cơ bản. |
| Rate limiting | Thành công | Giảm rủi ro spam/brute force API. |
| Structured logging | Thành công | Ghi log có cấu trúc để dễ debug và vận hành. |
| Redact dữ liệu nhạy cảm trong log | Thành công | Tránh lộ authorization, cookie, API key. |
| Request correlation id | Thành công | Theo dõi một request xuyên suốt log. |
| Audit log | Thành công | Ghi nhận hành động quan trọng để phục vụ kiểm tra. |
| Environment validation | Thành công | Phát hiện thiếu/sai biến môi trường khi khởi động. |
| Không commit file `.env` thật | Thành công | Giảm rủi ro lộ secret trong Git. |
| Demo mode an toàn | Thành công | Không chạm MinIO thật, không gửi blockchain thật, không gửi email thật. |
| MFA / 2FA | Chưa xong | Chưa có lớp xác thực bổ sung cho tài khoản quan trọng. |
| CSRF protection riêng | Chưa xong | Chưa có cơ chế CSRF chuyên biệt cho form/session cookie. |
| Security scan CI bắt buộc | Cần cấu hình | Cần bật trong GitHub Actions hoặc CI thực tế. |
| Backup/restore policy | Chưa xong | Chưa có runbook chính thức cho backup và restore dữ liệu. |

## 5. Non-functional Requirements

| Yêu cầu | Trạng thái | Tác dụng |
| --- | --- | --- |
| Health check `/health/live` | Thành công | Kiểm tra backend còn sống để cloud platform giám sát. |
| Health check `/health/ready` | Thành công | Kiểm tra backend sẵn sàng phục vụ request. |
| Docker backend | Thành công | Đóng gói backend để deploy lên Render hoặc môi trường container. |
| Production build frontend | Thành công | Cho phép deploy Next.js lên Vercel. |
| Production build backend | Thành công | Cho phép chạy NestJS ở chế độ production. |
| Prisma migration deploy | Thành công | Cho phép tạo/cập nhật schema database trên cloud. |
| Seed demo data | Thành công | Tạo dữ liệu mẫu để khách hàng xem ngay sau khi đăng nhập. |
| Pagination | Thành công | Giúp API danh sách chạy ổn hơn khi dữ liệu lớn. |
| Database index cơ bản | Thành công | Cải thiện truy vấn thường dùng. |
| Compression | Thành công | Giảm dung lượng response HTTP. |
| Redis queue/cache | Thành công | Hỗ trợ blacklist token và queue xử lý nền. |
| Prometheus metrics | Thành công | Cung cấp dữ liệu giám sát kỹ thuật. |
| Centralized logging | Cần cấu hình | Phụ thuộc Render/log provider hoặc hệ thống log bên ngoài. |
| Alerting production | Chưa xong | Chưa có cảnh báo tự động qua Sentry/Grafana/PagerDuty. |
| High availability | Chưa xong | Demo/free tier chưa phải kiến trúc HA. |
| Worker tách service riêng | Chưa xong | Worker hiện chưa nên coi là kiến trúc scale production hoàn chỉnh. |
| Load test chính thức | Chưa xong | Chưa có kịch bản benchmark bằng k6/Artillery. |

## 6. Hạ tầng triển khai demo

| Thành phần | Trạng thái | Tác dụng |
| --- | --- | --- |
| Frontend trên Vercel | Cần cấu hình | Cung cấp URL public cho khách hàng truy cập giao diện. |
| Backend trên Render | Cần cấu hình | Cung cấp API public HTTPS cho frontend. |
| Neon PostgreSQL | Cần cấu hình | Lưu dữ liệu demo trên cloud database. |
| Upstash Redis | Cần cấu hình | Cung cấp Redis cloud cho token blacklist và queue. |
| Cloudflare R2/S3 storage | Cần cấu hình | Lưu file/hình ảnh/chứng nhận khi cần storage cloud thật. |
| `.env.example` | Thành công | Cung cấp mẫu biến môi trường mà không lộ secret. |
| Cloud deployment checklist | Thành công | Hướng dẫn các bước deploy Vercel, Render, Neon, Upstash. |

## 7. Không đưa vào demo chính lúc này

| Tính năng / nhóm việc | Trạng thái | Lý do để sau |
| --- | --- | --- |
| AI recommendation / gợi ý thông minh | Chưa xong | Chưa phải tính năng lõi hiện tại, nên để phase sau. |
| AI phân tích dữ liệu OCOP | Chưa xong | Chưa có module hoàn chỉnh để demo đáng tin cậy. |
| AI chatbot hỗ trợ người dùng | Chưa xong | Chưa có tích hợp chính thức trong hệ thống. |
| Tạo sự kiện | Chưa xong | Hiện chưa đạt yêu cầu demo, không nên trình bày là đã hoàn tất. |
| Email thật | Chưa xong | Notification hiện nên demo ở luồng in-app nội bộ. |
| Push notification | Chưa xong | Chưa tích hợp FCM/Web Push hoặc provider tương đương. |
| Blockchain on-chain thật | Cần cấu hình | Chỉ demo khi đã có RPC, ví, contract và test POL ổn định. |
| VNPAY thật | Cần cấu hình | Chỉ demo khi có merchant sandbox/production hợp lệ. |

## 8. Checklist demo đề xuất

| Mục demo | Trạng thái | Mục đích trình bày |
| --- | --- | --- |
| Mở homepage | Thành công | Cho khách thấy giao diện đầu tiên và định vị sản phẩm. |
| Xem danh sách sản phẩm | Thành công | Chứng minh dữ liệu sản phẩm OCOP đã có sẵn. |
| Xem chi tiết sản phẩm | Thành công | Trình bày thông tin sản phẩm, chủ thể, chứng nhận, đánh giá. |
| Xem bản đồ OCOP | Thành công | Trình bày dữ liệu theo địa lý. |
| Đăng nhập Seller/Admin | Thành công | Chuyển sang phần quản trị. |
| Dashboard KPI | Thành công | Trình bày tổng quan vận hành. |
| Quản lý sản phẩm | Thành công | Demo tạo/cập nhật/duyệt sản phẩm nếu dữ liệu cho phép. |
| Quản lý kho | Thành công | Demo batch, tồn kho, nhập/xuất và cảnh báo. |
| Quản lý chuỗi cung ứng | Thành công | Demo timeline hành trình sản phẩm. |
| Quản lý chứng nhận | Thành công | Demo chứng nhận và file/hash tài liệu. |
| QR Traceability | Thành công | Demo khách hàng quét/xem nguồn gốc sản phẩm. |
| Đơn hàng | Thành công | Demo tạo và theo dõi đơn hàng. |
| Procurement | Đã ngừng dùng | Không demo supplier, PO hoặc goods receipt như chức năng hiện hành. |
| Notification in-app | Thành công | Demo thông báo nội bộ. |
| Sự kiện | Chưa xong | Không đưa vào demo chính cho tới khi hoàn thiện. |
| AI | Chưa xong | Để phase sau, không đưa vào demo chính. |
