# Tu Tien Pixel Backend

## Vai trò

Backend này cung cấp REST và Socket.IO cho frontend tại `D:\Setup\mine\tutien_pixel`. Các đường dẫn và payload được đối chiếu với `public/js/api.js` và call sites hiện có; đổi contract phải cập nhật [FE_INTEGRATION_NOTE.md](docs/FE_INTEGRATION_NOTE.md).

BE đang là modular monolith dùng Node.js 24, Express, Socket.IO và MySQL/InnoDB. Đã có auth với refresh token xoay vòng, player/catalog/world reads, transactional shop, inventory/cultivation, stats/equipment/skills, quest persistence, admin map/content/VFX persistence, và Socket.IO cho join/movement/portal/combat/loot/chat. Có thể bật Redis adapter cho room broadcasts bằng `REDIS_URL`; presence/quái/drop/buff/cooldown vẫn là single-process nên chưa được scale nhiều instance.

## Chạy local

```powershell
npm install
Copy-Item .env.example .env
npm start
```

FE local mặc định kết nối BE ở `http://localhost:3800`. `CORS_ORIGIN` nhận một origin hoặc danh sách cách nhau bằng dấu phẩy. Cấu hình mẫu cho phép các cổng FE local 3000, 3001 và 4200.

BE lắng nghe tại `http://localhost:3800` theo mặc định; có thể đổi bằng biến môi trường `PORT`. Import [schema.sql](schema.sql) vào MySQL mới. Với database hiện tại, chạy một lần [migration](migrations/20261104_player_progression.sql) trước khi khởi động. Node 24 được yêu cầu; script `start`/`dev` đọc `.env` bằng runtime option của Node.

## API chính

- Auth: register, login, demo (dev only), me.
- Player: create/load, power, profile name update; stats, shop, inventory, cultivation, skills, equipment.
- World/catalog: map published và read-only catalog seed.
- Quest: snapshot, accept, track, claim; reward commit nguyên tử.
- Admin: map CRUD/validate/publish/portal, content CRUD, skill VFX CRUD; chỉ tài khoản Bearer JWT có role `GM` hoặc `ADMIN`.
- Socket.IO: authenticated commands `world.join`, `world.resync`, movement, portal, combat, skill, loot, chat.

Chi tiết request, response, auth, error code và boundary ở [API_V1.md](docs/API_V1.md), [SOCKET_V1.md](docs/SOCKET_V1.md), [ERROR_CODES.md](docs/ERROR_CODES.md), [STATE_INVARIANTS.md](docs/STATE_INVARIANTS.md). Mô hình entity, khóa, quan hệ và đường join ở [DATA_MODEL_V1.md](docs/DATA_MODEL_V1.md); phân lớp và hướng chia module ở [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Lưu ý tích hợp FE

FE gửi `requestId` ổn định cho các mutation REST và giữ lại ID khi retry sau lỗi mạng. Các command realtime mang `requestId` riêng trong envelope. Với đột phá, BE trả lại kết quả đã lưu và snapshot hiện tại nếu client gửi lại cùng ID. Snapshot nhân vật và kết quả combat do BE quyết định.

Vận hành backup/restore và migration rollback ở [OPERATIONS.md](docs/OPERATIONS.md). Runtime yêu cầu Node 24 và MySQL; realtime multi-instance chưa được bật.
