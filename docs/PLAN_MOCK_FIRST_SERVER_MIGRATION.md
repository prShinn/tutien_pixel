# Plan Mock-first → Server-authoritative → Database

## Quyết định hiện tại

- Chưa dùng database.
- Node/Express là fake API và mock server duy nhất.
- State runtime nằm ở server; FE giữ state hiển thị trong `S` nhưng không phải nguồn sự thật.
- Mọi tính năng mới phải đi qua API hoặc Socket intent để sau này thay RAM store bằng DB không đổi giao diện.

## Luồng chuẩn

```text
FE thao tác → API/Socket intent → Node validate/tính toán
→ cập nhật state RAM → trả result/state → Socket broadcast nếu cần
```

## Giai đoạn A — Chốt logic trên mock server

- [x] Auth demo nhiều tab.
- [x] Catalog linh căn, skill, passive và balance từ server.
- [x] Học skill/trang bị skill qua server API.
- [x] Kiểm tra ngân sách stat khi tạo nhân vật.
- [x] API cộng stat và tính OVR server-side.
- [x] API hấp thụ tu vi và đột phá server-side.
- [x] Socket movement có kiểm tra biên map/bước di chuyển.
- [x] Socket `attack_request` nhận đánh thường và skill offensive, server tính damage/HP/MP/cooldown.
- [x] Server tự quản lý xu loot, respawn và inventory item mock.
- [x] Inventory mua/bán/sử dụng vật phẩm qua API server mock.
- [x] Potion heal, buff skill và snapshot player khi reconnect qua server.

## Giai đoạn B — FE chỉ render state

- FE gửi `{ action, payload }`, không gửi damage/HP/tu vi đã tính.
- Sau mỗi action, FE nhận `state_patch` hoặc `action_result` rồi cập nhật `S`.
- Tắt dần các hàm client tự sửa `hp`, `mp`, `xu`, `tuViHienTai`, `inventory`.
- Socket reconnect phải nhận snapshot mới từ server.

Smoke test hiện có: `npm run smoke` và `npm run smoke:state`.

## Giai đoạn C — Thay RAM bằng database

Thay các Map trong `server.js` bằng repository: `UserRepository`, `PlayerRepository`, `InventoryRepository`, `SkillRepository`. API và event giữ nguyên; chỉ thay implementation phía sau repository.

World session vẫn có thể dùng Redis/in-memory vì là dữ liệu realtime tạm thời.

## Contract không được phá

- Mock reset khi restart là chấp nhận được ở giai đoạn này.
- Client không được quyết định kết quả gameplay.
- Socket dùng intent và server result; không dùng `*_effect` để gửi damage tin cậy.
- DTO/API phải ổn định trước khi bắt đầu DB.
