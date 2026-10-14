# Khả năng mở rộng realtime

## Trạng thái demo hiện tại

- Map REST được stringify/gzip một lần theo `code + version`, có ETag và cache trình duyệt.
- `GET /api/worlds` chỉ trả metadata; dữ liệu địa hình đầy đủ lấy theo mã map.
- Socket lấy map trực tiếp từ repository RAM, không gọi HTTP ngược vào chính server.
- Socket chỉ gửi `mapCode + mapVersion`; client tải địa hình tĩnh qua REST nén thay vì nhét map 2 MB vào gói realtime.
- Player được tra cứu O(1) theo `userId`.
- AOI chia map thành chunk 96 pixel, bán kính quan sát 150 pixel. Move, join, leave và cập nhật monster chỉ gửi tới vùng gần.
- Client gửi movement tối đa 20 lần/giây; server nhận tối đa khoảng 22 lần/giây/socket.
- `/api/health` trả số session và bộ nhớ để theo dõi demo.

## Giới hạn phải xử lý trước production

Demo vẫn là một Node.js process và lưu user/player/monster trong RAM. Khi process restart dữ liệu mất; không thể scale ngang an toàn.

Thứ tự nâng cấp đề xuất:

1. PostgreSQL lưu account, character, inventory, skill và map metadata.
2. Redis lưu presence/session/cooldown ngắn hạn; dùng Socket.io Redis adapter.
3. Tách map thành zone worker; mỗi worker chịu một nhóm map/instance.
4. Đưa map versioned dạng file nén lên object storage/CDN.
5. Load test theo các mốc 100, 500, 1.000 kết nối và đặt SLO cho tick, latency, memory.

Chạy kiểm tra đồng thời hiện tại bằng `npm run smoke:concurrency`; đổi tải qua `LOAD_CLIENTS`.
