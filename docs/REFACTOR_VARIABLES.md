# Variable and state refactor

## Quy ước bắt buộc

| Nhóm | Nơi duy nhất được phép đặt | Ví dụ |
|---|---|---|
| Runtime gameplay | `public/js/state.js` trong `S` | player, map, monsters, players, creation |
| Hằng số client | `public/js/config.js` trong `CFG` | tile size, cooldown, catalog refs |
| Catalog từ server | `GameData`/`CFG` | roots, skills, items, realms |
| Module service | module tương ứng | `Net`, `World`, `Combat`, `UI` |
| DOM selector | `UI` hoặc helper UI | không tạo selector rải trong gameplay |
| Server runtime | `server.js`/`socket/game.js` | users, players, sessions, roomMonsters |

## Đã refactor

- `otherPlayers` global được gom vào `S.players`.
- `cRoot`, `cGender`, `cPts` được gom vào `S.creation`.
- `currentUser` được gom vào `S.session.user`.
- `S.mapName` là nguồn tên map duy nhất cho HUD/minimap.

## Cố ý chưa gom thành một biến chung

- `canvas`, `ctx`, `cW`, `cH`: đang là render context dùng xuyên suốt `Render` và `Input`. Đây là context kỹ thuật, không phải gameplay state; bước tiếp theo có thể đưa vào `S.viewport` sau khi tách renderer.
- `data/balance.js` và `public/js/balance.js`: server/client cần cùng công thức nhưng khác runtime (CommonJS/browser). Không được sửa một bên mà quên validator bên kia. Khi có bundling/shared package sẽ hợp nhất.
- `API` trong browser và `socket/api-service.js`: khác process, khác trách nhiệm; chỉ nên thống nhất tên field/contract.

## Gate cho module mới

1. Không khai báo state mutable ở top-level nếu state đó thuộc gameplay.
2. Không tạo bản sao của `S.player`, map hoặc remote players để làm nguồn sự thật thứ hai.
3. Không dùng tên ngắn mơ hồ (`s`, `d`, `r`) ngoài phạm vi hàm ngắn.
4. Mỗi field mới phải có owner và đường cập nhật rõ: API, socket hoặc local presentation.
5. Sau refactor phải chạy `node --check`, `git diff --check` và smoke/validator liên quan.
