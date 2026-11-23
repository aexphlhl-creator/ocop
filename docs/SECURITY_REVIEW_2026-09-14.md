# Rà soát bảo mật OCOP — 14/09/2026

## Bổ sung kiểm tra HTTP trực tiếp sau khi khởi động dịch vụ

Phần này cập nhật giới hạn ở lần kiểm tra trước: frontend localhost:3000 và backend localhost:3001 hiện truy cập được. Đây vẫn là kiểm tra qua loopback trên máy phát triển, không phải từ Internet. Các kết quả từ chối kết nối ở phần báo cáo ban đầu là trạng thái trước khi khởi động.

Đã thực hiện yêu cầu chỉ đọc, token giả và một request webhook thiếu dữ liệu. Không tạo tài khoản, không đăng nhập mạo danh người dùng thật, không xóa/upload file, không thay đổi mật khẩu hoặc thử gây quá tải.

| Kiểm tra trực tiếp | Kết quả | Diễn giải |
| --- | --- | --- |
| GET /health/live | 200, environment=demo | Backend đang chạy chế độ demo |
| GET /metrics, không token | 200, có process metrics, khoảng 10 KB | Xác nhận thông tin vận hành đọc được không cần đăng nhập; chưa xác nhận truy cập qua Internet |
| GET /api/docs-json, không token | 200, khoảng 110 KB | OpenAPI đang công khai trên môi trường local/dev; không khẳng định production cũng bật |
| GET /auth/me, /users, /inventory, /orders, /certificates dưới /api/v1 | 401 | Chặn truy cập ẩn danh ở các endpoint đã thử |
| GET /auth/me với Bearer giả | 401 | Không chấp nhận access token không hợp lệ |
| POST /auth/refresh với refresh token giả | 401 | Không chấp nhận refresh token không hợp lệ |
| POST /auth/google với chuỗi không phải JWT, không thuộc tiền tố demo | 401 | Token Google bất hợp lệ bị từ chối; **không phủ định SEC-01**, vì chưa thử nhánh demo với tài khoản thật |
| POST /media/upload không token, không file | 401 | Guard upload hoạt động trước thao tác lưu |
| POST /shipments/webhooks/AUDIT với body rỗng | 400 | Chỉ chứng minh validation chặn body thiếu; không coi đây là kiểm thử HMAC đầy đủ |
| CORS với Origin localhost:3000 | Allow-Origin localhost:3000 | Origin frontend được cho phép |
| CORS với Origin audit-untrusted.example | Không có Allow-Origin | Không cấp quyền đọc CORS cho origin lạ; HTTP 200 không phải bypass CORS |
| GET /reviews/product/:id không token | 200, một review có user.email | **SEC-04 đã được xác nhận trên API thật**, email được che trong output |
| GET /dashboard/inventory không cookie | 307 về /login | Frontend chặn điều hướng chưa đăng nhập |
| GET /dashboard/inventory với cookie giả, thử lại sau compile | 200 | Trả HTML trang; API /auth/me vẫn 401, không chứng minh truy cập được dữ liệu kho |
| Trang chủ/login và dashboard trong lúc compile | Có lúc 500, lần khác 200/redirect | Có lỗi runtime EPERM ở Next dev, xem ghi chú dưới |

Kiểm tra review: lấy danh sách 23 sản phẩm công khai, chọn sản phẩm báo có review; response một review chứa trường email. Không lưu giá trị email cá nhân trong báo cáo. Các trang sản phẩm không có review trước đó không đủ để kết luận lỗi không tồn tại.

### Lỗi frontend phát hiện trực tiếp

Response 500 chứa lỗi `EPERM: operation not permitted, rename` khi đổi tên file tạm thành `frontend/.next/dev/server/middleware-build-manifest.js`; JSON lỗi trả cả đường dẫn tuyệt đối trên máy. Điều này xác nhận lỗi khả dụng gián đoạn và lộ thông tin debug ở dev, **chưa xác định nguyên nhân gốc** (không tự kết luận do antivirus, quyền hay nhiều process). Không build/xóa cache/restart trong lượt kiểm tra này.

Frontend `/` và `/login` không có CSP, X-Frame-Options hoặc X-Content-Type-Options trong các phản hồi đã lấy. Đây là khoảng trống hardening ở môi trường hiện tại, chưa phải bằng chứng XSS/clickjacking khai thác thành công. Không đánh giá HSTS trên HTTP localhost.

Middleware chỉ xét cookie ocop-token có tồn tại. Request cookie giả không được API `/api/v1/auth/me` chấp nhận (401). Không được diễn giải việc vượt điều hướng frontend thành chiếm quyền Admin hoặc vượt guard backend.

### Những gì vẫn chưa xác minh trực tiếp

SEC-01 (nhánh demo), SEC-02 (xóa chéo Seller), SEC-03 (quá tải upload), SEC-05 (phiên sau đổi mật khẩu), SEC-06 (file giả) vẫn giữ mức bằng chứng của kiểm tra mã nguồn/mock trước đó, không nâng thành đã khai thác trên server thật. SEC-07 chưa có kiểm tra firewall từ bên ngoài. Cần tài khoản và dữ liệu test riêng được phép thay đổi để kiểm tra các luồng có trạng thái một cách an toàn.

## Kết luận trung thực

**Có lỗi bảo mật trong mã nguồn hiện tại, bao gồm một nhánh bỏ qua xác thực có thể dẫn đến chiếm tài khoản Admin khi thiếu Google Client ID. Chưa nên coi bản hiện tại là an toàn để mở Internet.**

Đây là white-box security review có tái hiện một số logic bằng dữ liệu giả trong bộ nhớ, **không phải pentest hoàn chỉnh trên website triển khai**. Không có domain triển khai được cung cấp. GET tới localhost:3000/dashboard/inventory, localhost:3001/health/live và localhost:3001/metrics đều ECONNREFUSED. Vì vậy không kết luận server production đang bị khai thác, hay mọi cấu hình bảo vệ ở proxy/firewall đều vắng mặt.

Không sửa mã ứng dụng, không khai thác tài khoản thật, không xóa object thật, không gửi file lớn, không chạy thử gây quá tải. Chỉ thêm báo cáo này. Không in khóa bí mật hoặc token thật.

## Tổng hợp phát hiện

| ID | Mức ưu tiên | Vấn đề | Điều kiện | Bằng chứng |
| --- | --- | --- | --- | --- |
| SEC-01 | Critical | Google demo bypass → token của tài khoản có sẵn, kể cả Admin | API truy cập được; GOOGLE_CLIENT_ID thiếu/rỗng | Đã tái hiện ở service, dependencies giả lập |
| SEC-02 | High | Seller xóa file của người khác | Có tài khoản Seller; MinIO thật; biết objectName | Đã tái hiện lệnh xóa tới storage giả lập |
| SEC-03 | High | Multipart upload không giới hạn trước khi nạp RAM | Tài khoản được upload; proxy không giới hạn đủ chặt | Xác nhận code và implementation Multer; không chạy DoS |
| SEC-04 | Medium | API review công khai lộ email người dùng | Sản phẩm có đánh giá | Xác nhận đường controller → repository → response |
| SEC-05 | Medium | Đổi mật khẩu không thu hồi refresh token cũ | Kẻ tấn công đã có token trước đó | Đã tái hiện sau đổi mật khẩu bằng JWT test |
| SEC-06 | Medium | Upload tin MIME/đuôi file, không xác thực nội dung | Tài khoản được upload | Bytes không phải ảnh vẫn được chấp nhận trong mock storage |
| SEC-07 | High, tùy triển khai | Compose production publish DB/Redis/MinIO console | Dùng cấu hình này và firewall cho phép | Xác nhận file compose; chưa kiểm tra từ Internet |

Mức độ ở đây là đánh giá ưu tiên theo tác động và điều kiện, không phải điểm CVSS đã chấm đầy đủ. Các phát hiện có điều kiện không đồng nghĩa đã khai thác được trên production.

## SEC-01 — Nhánh Google demo bỏ qua xác thực

- `backend/src/features/auth/auth.controller.ts:72`: POST `/api/v1/auth/google` không cần đăng nhập, có throttle.
- `backend/src/features/auth/auth.service.ts:181`: nhánh demo chấp nhận khi `!googleClientId`, không bắt buộc NODE_ENV development hoặc DEMO_MODE thực sự bật.
- `auth.service.ts:224`: tìm tài khoản theo email do nhánh demo cung cấp; sau đó cấp token với vai trò đang có. Không kiểm tra mật khẩu hoặc chữ ký Google trong nhánh này.
- `backend/src/config/env.validation.ts`: không bắt buộc GOOGLE_CLIENT_ID khi production. File compose production cũng không truyền biến này. Compose còn thiếu biến bắt buộc khác, nên chưa kết luận nó hiện khởi động được.

Tái hiện: gọi phương thức thật với email `audit-admin@example.invalid`, repository giả lập một Admin đang hoạt động, DEMO_MODE=false và GOOGLE_CLIENT_ID không tồn tại. Kết quả: `returnedRole=ADMIN`, `tokenIssued=true`. Bộ ký token trong phép thử này là mock; không tạo/chiếm tài khoản thật. DTO Google chỉ yêu cầu chuỗi không rỗng nên không chặn nhánh này ở đầu vào.

Tác động: người chưa đăng nhập, biết email của tài khoản đang hoạt động, có thể nhận phiên tương ứng khi điều kiện cấu hình thỏa mãn. Throttle chỉ giảm tốc độ, không sửa lỗi xác thực.

Lưu ý cấu hình local: file .env có GOOGLE_CLIENT_ID và DEMO_MODE=true. Chưa đánh giá Client ID đó có hợp lệ hay không; không khẳng định nhánh thiếu Client ID đang kích hoạt ở local. So sánh DEMO_MODE dạng string trong service còn không đồng nhất với boolean từ env validation.

Khắc phục: bỏ đường demo khỏi endpoint thật; nếu thiếu Client ID thì từ chối Google login. Bắt buộc xác minh issuer/audience/chữ ký và trạng thái email phù hợp. Sau khi khắc phục, nếu nhánh này từng được công khai thì rà log và vô hiệu hóa các phiên có thể đã cấp trái phép.

## SEC-02 — Xóa file thiếu kiểm tra quyền sở hữu (BOLA)

- `backend/src/features/media/media.controller.ts:103`: DELETE `/api/v1/media` nhận objectName, cho ADMIN và SELLER; không truyền CurrentUser.
- `backend/src/features/media/media.service.ts:180`: chuyển objectName trực tiếp tới `removeObject(bucketName, objectName)`.

Tái hiện: service chuyển key `products/owned-by-other-seller.png` tới mock MinIO mà không có user/ownership check. Không xóa dữ liệu thật. Object key ảnh thường có thể đọc từ URL công khai, không cần đoán UUID. Nhánh DEMO_MODE bỏ qua thao tác xóa nên tác động xóa áp dụng khi dùng storage thật.

Tác động: một Seller có thể làm hỏng ảnh/dữ liệu file của Seller khác; phạm vi key không bị giới hạn vào danh mục sản phẩm của chính họ.

Khắc phục: lưu owner/uploader và loại tài nguyên trong metadata DB; kiểm tra quyền theo object trước khi xóa; chặn key không được quản lý. Cần test Seller A không xóa được file Seller B, còn Admin thực hiện đúng chính sách.

## SEC-03 — Giới hạn upload đặt quá muộn

- `media.controller.ts:42`: FileInterceptor không có `limits.fileSize`.
- `backend/src/features/certificates/certificates.controller.ts:111,124`: FilesInterceptor giới hạn số file 10, không giới hạn bytes mỗi file.
- `MediaService` và certificate storage kiểm tra 10/20 MB **sau** khi nhận `file.buffer`.
- Implementation `node_modules/multer/storage/memory.js` gom stream vào buffer trước khi gọi xử lý tiếp. Không tìm thấy cấu hình MulterModule đặt limit toàn cục trong src.

Tác động: tài khoản có quyền upload có thể tạo áp lực RAM trước khi nhận 413. Các giới hạn express.json/urlencoded không áp dụng cho multipart. Không chạy tải lớn để đo khả năng crash; giới hạn reverse proxy có thể giảm tác động nhưng chưa kiểm chứng.

Khắc phục: giới hạn fileSize/files/parts ngay interceptor, giới hạn request tại proxy, quota và rate limit upload; cân nhắc streaming thay memory storage. Kiểm thử trên staging bằng giới hạn nhỏ, không stress production.

## SEC-04 — Lộ email qua review công khai

- `backend/src/features/reviews/reviews.controller.ts:50`: GET `/api/v1/reviews/product/:productId` không yêu cầu đăng nhập.
- `backend/src/features/reviews/reviews.repository.ts:24`: include user với id, fullName và `email: true`.
- Service trả trực tiếp dữ liệu này; TransformInterceptor chỉ bọc response, không bỏ email.

Tác động: khách ngoài có thể thu thập email người đánh giá để spam/phishing. Không có nhu cầu công khai email được thể hiện trong chức năng hiển thị review. Không lấy email thật trong đợt kiểm tra.

Khắc phục: response public chỉ giữ tên hiển thị và trường thật sự cần; phân biệt DTO admin/public, phân trang và giới hạn tần suất.

## SEC-05 — Phiên cũ tồn tại sau đổi mật khẩu

- `backend/src/features/auth/auth.service.ts:285`: đổi passwordHash, không revoke phiên/token.
- Refresh kiểm tra blacklist và isActive, không có tokenVersion/passwordChangedAt hoặc bảng phiên để vô hiệu hóa token cấp trước đó.

Tái hiện: dùng JwtService thật với khóa test, user/repository/Redis trong bộ nhớ. Cấp token → đổi mật khẩu bằng service thật → dùng refresh token cũ. Kết quả `oldRefreshStillAcceptedAfterPasswordChange=true`.

Tác động: đổi mật khẩu không chấm dứt quyền truy cập của người đã giữ token. Đây không phải cách tự chiếm tài khoản từ trạng thái không có token.

Khắc phục: quản lý session/token family hoặc tokenVersion, tăng version/thu hồi khi đổi/reset mật khẩu; kiểm tra ở cả access và refresh. Frontend logout hiện không gửi Authorization header trong lời gọi axios độc lập, nên backend cũng không nhận access token để blacklist qua luồng đó.

## SEC-06 — Nội dung upload không được kiểm chứng

MediaService kiểm tra file.mimetype và phần mở rộng nhưng không đọc signature/giải mã ảnh. Tái hiện upload bytes văn bản `not-an-image` với filename fake.png, MIME image/png được chấp nhận và chuyển tới mock storage.

Tác động: vượt chính sách định dạng file, lưu/phát tán nội dung không đúng loại; PDF/DOC/DOCX cũng được cho phép. **Chưa chứng minh XSS hoặc thực thi mã từ file này; không xếp thành RCE.**

Khắc phục: xác minh nội dung bằng parser phù hợp, re-encode ảnh; giới hạn kích thước sau giải mã, scan tài liệu; phân phối file từ origin riêng và Content-Disposition phù hợp.

## SEC-07 — Cổng hạ tầng trong compose production

`docker-compose.prod.yml:61,81,104` publish PostgreSQL 5432, Redis 6379, MinIO API 9000 và console 9001 lên host, không bind 127.0.0.1. Có cấu hình password, nên không đồng nghĩa truy cập không cần mật khẩu. Chưa xác minh host thực tế, firewall, TLS hoặc khả năng truy cập Internet.

Khắc phục: bỏ port publication của DB/Redis nếu chỉ dùng trong Docker network; hạn chế console vào VPN/mạng quản trị; chỉ công khai endpoint cần thiết qua TLS/proxy, dùng credential riêng và quyền tối thiểu.

## Các rủi ro bổ sung, chưa xếp là exploit độc lập

- Access/refresh token lưu localStorage; cookie ocop-token tạo bằng JavaScript, không HttpOnly và không Secure (`frontend/src/stores/auth.store.ts:42,79`). Nếu có XSS thì tác động tăng; chưa chứng minh XSS khai thác được trong đợt này.
- `/metrics` được đăng ký không có guard trong AppModule; health public có thông tin môi trường và kiểm tra dependency. Cần chặn metrics/ready ở mạng ngoài; chưa thấy response thực vì server không chạy.
- Media và certificate storage dùng cùng biến bucket. Media có nhánh tạo policy public GetObject cho toàn bucket khi tạo mới; cần kiểm tra policy thực tế, tách file công khai/riêng tư. Không khẳng định bucket hiện tại public vì phụ thuộc trạng thái/khởi tạo.
- Rate limiting không áp dụng toàn bộ API chỉ nhờ import ThrottlerModule; nên kiểm tra abuse ở checkout/reviews/upload và hạ tầng proxy. Không chạy flood hoặc giữ chỗ hàng hàng loạt.

## Những điểm bảo vệ có bằng chứng

- Đăng ký public có DTO chỉ cho VISITOR; việc service dùng denylist chưa đủ để kết luận public tự đăng ký QA được, vì DTO chặn trước.
- JWT strategy kiểm tra chữ ký/hết hạn, truy vấn lại user và isActive/role, không chỉ tin role từ client.
- Payment IPN kiểm tra chữ ký, merchant, tiền tệ và amount; các API xem payment kiểm tra owner. Chưa có bằng chứng bỏ qua thanh toán trong đợt này.
- Carrier webhook dùng HMAC raw body và timingSafeEqual. Chưa thấy bằng chứng giả chữ ký thành công.
- Một số popup đã escape HTML; JSON-LD escape dấu <. Không suy ra toàn bộ frontend an toàn XSS từ các vị trí này.

## Giới hạn kiểm tra

- Chưa có kiểm thử black-box qua Internet, HTTPS/TLS/cookie/header thật, reverse proxy, CORS trình duyệt, tài khoản nhiều vai trò trên DB thật, race condition đồng thời hoặc scanner động.
- Đã thử npm audit read-only trên lockfile backend/frontend, nhưng cả hai trả exit 1/error và không có metadata advisory dùng được. **Không được hiểu danh sách rỗng là không có CVE.** Cần chạy lại dependency audit khi registry truy cập được.
- Test/build đạt ở đợt sửa trước không chứng minh an toàn bảo mật: các đường khai thác ở trên chưa được các test đó bao phủ.

## Thứ tự xử lý đề xuất

1. Chặn SEC-01 trước khi public; rà soát và thu hồi phiên nếu từng mở nhánh demo ra ngoài.
2. Sửa quyền sở hữu xóa media, giới hạn multipart sớm, thu hẹp cổng hạ tầng.
3. Bỏ email khỏi public review; triển khai thu hồi session khi đổi mật khẩu; kiểm tra nội dung file và bucket policy.
4. Thêm security regression tests rồi kiểm thử staging với tài khoản/ảnh/lô giả của từng vai trò. Chỉ sau đó mới đánh giá mức sẵn sàng triển khai.

## Tài liệu đối chiếu

- [OWASP API1:2023 — Broken Object Level Authorization](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/): kiểm tra quyền trên từng object, không chỉ role của endpoint.
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html): không tin Content-Type client, kiểm tra nội dung và áp dụng giới hạn upload.

Các tài liệu trên dùng để đối chiếu nguyên tắc; bằng chứng phát hiện đến từ mã nguồn và phép thử cục bộ đã mô tả, không phải từ quét tự động OWASP.
