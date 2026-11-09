# Tu Tiên · Vạn Cổ Đế Tôn

## Kết nối bắt buộc

Game và Admin dùng REST/Socket.IO của BE tại D:\Work\game\tu-tien-server\tutien_pixel_be. Account, player, inventory, tiền và quest được BE ghi vào MySQL thật.

FE .env chứa cấu hình local, được Git ignore.

    NODE_ENV=development
    PORT=3000
    DATA_MODE=real
    BACKEND_URL=http://localhost:3800

DATA_MODE chỉ chấp nhận real. Thay địa chỉ BE bằng BACKEND_URL trong .env, sau đó khởi động lại FE. Runtime config được phát tại /runtime-config.js cho cả game và Admin.

## Khởi động

1. Cấu hình kết nối MySQL trong .env của BE. Chạy schema/migration phù hợp với database đang sử dụng theo README của BE.
2. Cài dependency và chạy npm start trong project BE bằng Node 24.
3. Cài dependency và chạy npm start trong project FE.
4. Mở game tại http://localhost:3000 và Admin tại http://localhost:3000/admin.

BE phải cho phép origin FE qua CORS_ORIGIN. Khi dùng địa chỉ từ máy khác, BACKEND_URL phải là địa chỉ BE mà trình duyệt đó truy cập được.

## Quy tắc runtime

- Mọi /api request đến FE được chuyển tiếp tới BE. Socket.IO client kết nối tới cùng BACKEND_URL.
- Game chỉ khởi động sau khi BE xác nhận đúng service và MySQL ready.
- Mất kết nối realtime sẽ dừng cập nhật gameplay cho tới khi kết nối lại.
- Máy chủ FE chỉ phục vụ tài nguyên và chuyển tiếp request. API giả lập và dữ liệu mock trên trình duyệt bị khóa.
- URL query và sessionStorage không thay đổi địa chỉ API. Dùng .env để cấu hình.
- Lỗi BE trả lỗi kết nối hoặc lỗi HTTP thực tế.

## Xác minh và phát triển

Đọc AGENTS.md trước khi thao tác. Các kịch bản API, database, gameplay và failover phải dùng BE/MySQL/Redis thật. Những bài kiểm tra và bản sao staging/validation cũ có dữ liệu giả không được dùng làm bằng chứng vận hành cho cấu hình hiện tại.

npm test và npm run smoke kiểm tra BE HTTP, MySQL readiness và bản đồ published qua request thật. Nghiệm thu mutation/gameplay cần chạy kịch bản riêng trên hệ thống thật.

Credential chỉ nằm trong .env của BE và không được ghi vào log hay Git.
