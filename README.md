# Tu Tiên · Vạn Cổ Đế Tôn

## Trạng thái

Bản hiện tại phù hợp **demo nội bộ trên một server**: đăng ký/đăng nhập, tạo nhân vật, chơi thời gian thực, chiến đấu, loot, quest, inventory và Admin cơ bản. Đây chưa phải bản beta công khai; các giới hạn còn lại được ghi ở cuối README và trong `docs/PLAN_MOCK_FIRST_SERVER_MIGRATION.md`.

## Chạy local

Yêu cầu Node.js và npm tương thích với `package-lock.json`.

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Mở:

- Game: `http://localhost:3000/`
- Admin: `http://localhost:3000/admin`
- Map editor: `http://localhost:3000/admin/map-editor`

Đổi cổng bằng `PORT`. Máy dev dùng cấu hình mẫu trong `.env.example`; production bắt buộc đặt `JWT_SECRET` và `ADMIN_MAP_KEY` riêng.

## Kiểm tra trước khi demo

```powershell
npm test
npm run smoke:persistence
npm run smoke:demo
```

- `npm test`: unit/contract test.
- `npm run smoke:persistence`: tạo account và nhân vật trong file tạm, mua và hấp thụ vật phẩm, di chuyển qua Socket.IO, restart server rồi kiểm tra dữ liệu đã khôi phục.
- `npm run smoke:demo`: chạy 10 smoke test tích hợp trên cổng riêng; không chiếm cổng 3000/3001.

## Dữ liệu và lưu trữ

Account thường và player aggregate được lưu vào `data/game-state.json` bằng snapshot JSON atomic. File gồm password hash bcrypt, nhân vật, inventory, currency, cultivation, skill, quest state và vị trí gần nhất. File này được Git ignore. Có thể đổi đường dẫn bằng `GAME_STATE_FILE`.

Account demo là tạm thời. Runtime map, quái, vật phẩm đang rơi và phiên Socket.IO reset khi server restart. Bản lưu JSON hiện hỗ trợ **một tiến trình trên một máy**; chưa có transaction database, backup/restore tự động hay đồng bộ nhiều server. Nếu file state lỗi hoặc sai schema, server dừng để tránh khởi động với dữ liệu rỗng.

Bản đồ Admin dùng `data/admin-worlds.json`; cấu hình VFX dùng `data/skill-vfx.json`. Items/Skills Admin sửa trong RAM của tiến trình; Quest/NPC trong Admin hiện chưa nối với dữ liệu runtime.

## API chính

| Method | Path | Mục đích |
|---|---|---|
| POST | `/api/auth/register` | Tạo account |
| POST | `/api/auth/login` | Đăng nhập |
| POST | `/api/auth/demo` | Phiên demo, chỉ ngoài production |
| GET | `/api/auth/me` | Xác minh token |
| GET | `/api/worlds`, `/api/worlds/default` | Danh sách và bản đồ mặc định |
| GET | `/api/linh-can`, `/api/canh-gioi`, `/api/items`, `/api/skills` | Catalog game |
| GET/POST | `/api/player/me`, `/api/player` | Đọc/tạo nhân vật đã xác thực |
| POST | `/api/player/shop/buy`, `/api/player/shop/sell` | Mua/bán vật phẩm |
| POST | `/api/player/inventory/use`, `/api/player/cultivation/absorb` | Dùng vật phẩm, hấp thụ tu vi |
| GET/POST | `/api/quests`, `/api/quests/:id/accept`, `/api/quests/:id/claim` | Quest của nhân vật |
| GET/POST/PUT/DELETE | `/api/admin/content/:collection` | Admin CRUD cho catalog mock |
| GET | `/api/health` | Tình trạng tiến trình |

Các route Admin yêu cầu header `x-admin-key`. Xem `server.js` để biết toàn bộ route và điều kiện xác thực.

## Realtime

Client gửi `game_command` với envelope `{ requestId, type, payload }`. Các command canonical gồm `world.join`, `movement.intent`, `map.change`, `combat.attack`, `combat.skill`, `loot.pickup`, `chat.send` và `world.resync`. Server xác thực intent, cập nhật state rồi gửi snapshot/kết quả như `world_init`, `player_move`, `combat_result`, `ground_loot_spawn` và `quest_state_update`.

Các event legacy vẫn được giữ để tương thích smoke test cũ; tính toán gameplay authoritative nằm ở server.

## Cấu trúc chính

- `server.js`: Express API, auth, player state và khởi chạy Socket.IO.
- `game/game-state-store.js`: đọc/ghi state demo.
- `game/quest-service.js`, `game/admin-content-service.js`: logic quest và kiểm tra catalog Admin.
- `socket/game.js`: command realtime, movement, combat, loot và đồng bộ.
- `public/`: game client, pixel UI và Admin.
- `data/mock-data.js`, `data/world-structure.js`: catalog và cấu trúc thế giới mẫu.
- `tests/`, `scripts/`: unit/contract tests, validators và smoke tests.

## Còn cần trước beta công khai

1. Thay JSON file bằng PostgreSQL repository và migration; bảo đảm inventory/reward/currency mutation có transaction và idempotency.
2. Nối CRUD Quest/NPC Admin với runtime, đồng thời lưu catalog Items/Skills bền vững.
3. Bổ sung role-based Admin permission, audit log, backup/restore và vận hành nhiều instance.
4. Hoàn thiện thêm bản đồ runtime; hiện 2 map đang hoạt động trong 11 map trên world graph.
5. Chạy đầy đủ kiểm thử browser trên các viewport mục tiêu và kiểm thử deploy/khôi phục dữ liệu.

Kế hoạch BE chi tiết: `docs/PLAN_MOCK_FIRST_SERVER_MIGRATION.md`.
