# Note phối hợp FE — tích hợp API BE

Tài liệu này đối chiếu trực tiếp với `public/js/api.js`, `auth.js`, `game.js`, `net.js`, `inventory.js`, `shop.js`, `cultivation.js`, `skills.js` và `core/mock-backend.mjs` trong repo `tutien_pixel` ngày 2026-11-04.

## 1. Quy tắc chung

- BE chạy ở `http://localhost:3800` theo mặc định. Khi FE chạy ở origin riêng, đặt `TuTienConfig.apiBase` thành URL BE và giữ `CORS_ORIGIN` là origin của FE.
- Giữ nguyên URL `/api/...` hiện tại. BE xác định owner từ Bearer token; `userId` trong body chỉ là field tương thích và không chọn tài khoản đích.
- FE hiện đã dùng `Net.mutate()` để tự gắn `requestId` cho các mutation gameplay và giữ ID khi retry lỗi mạng. Giữ wrapper này; mỗi thao tác mới phải có ID mới.
- BE trả `{ player, result }` cho mutation player. FE cần áp dụng `player` trả về sau commit làm state chuẩn.
- Giá, hiệu ứng, điều kiện cảnh giới và số lượng vật phẩm do BE tra catalog/kiểm tra. FE không gửi giá, xu, HP, stats dẫn xuất hoặc snapshot player làm dữ liệu có thẩm quyền.
- Login/register/demo hiện trả access token 15 phút và refresh token 30 ngày. FE đã lưu refresh token trong `sessionStorage`, gom request refresh đồng thời, thay cả hai token sau khi xoay vòng và gọi logout khi kết thúc phiên; giữ nguyên luồng này khi nối BE.

## 2. Payload mutation cần chuyển sang requestId/itemCode

| Hiện tại trong FE | Hợp đồng tích hợp BE |
|---|---|
| Shop mua `{ itemId }` | `{ requestId, itemCode: itemId, quantity: 1 }` |
| Shop bán `{ index }` | `{ requestId, itemCode: inventory[index].itemCode || inventory[index].id, quantity: 1 }` |
| Dùng vật phẩm `{ index, itemId }` | `{ requestId, itemCode: itemId }` |
| Hấp thụ `{ itemId, amount? }` | `{ requestId, itemCode: itemId }`; bỏ `amount`, BE đọc giá trị từ catalog |
| Đột phá `{}` | `{ requestId }` |
| Cấp stats `{ stat, amount }` | `{ requestId, stat, amount }` |
| Trang bị `{ index, itemId, slot }` | `{ requestId, itemCode: itemId, slot }` |
| Tháo trang bị `{ slot }` | `{ requestId, slot }` |
| Học skill `{ skillCode, source }` | `{ requestId, skillCode, source }` |
| Lưu loadout `{ skillCodes }` | `{ requestId, skillCodes }` |
| Quest accept/track/claim `{}` | `{ requestId }` |

Các call-site hiện tại đã gửi `itemCode` và `quantity` qua `Net.mutate()` cho shop, dùng vật phẩm, trang bị và hấp thụ; quest và skill mutation cũng dùng wrapper này. Tiếp tục dùng mã vật phẩm thay cho `index`, vì thứ tự túi có thể đổi giữa lúc mở UI và lúc request tới server. Nếu bật gọi phân bổ stats online, dùng `/api/player/stats/allocate` cùng `Net.mutate()`.

## 3. Tạo nhân vật và tải lại

- `POST /api/player` vẫn nhận payload hiện tại để tương thích. BE chỉ dùng `name`, `stats`, `gender`, `linhCan`; map/spawn/cảnh giới ban đầu do server chọn. Các field còn lại trong `playerData` như `xu`, HP/MP, inventory, skills, `tuVi*`, `x/y` và equipment chỉ là hint, BE bỏ qua.
- `GET /api/player/by-user/:userId` tiếp tục hoạt động; `userId` phải trùng chủ sở hữu trong token. 404 nghĩa là tài khoản chưa có nhân vật.
- Khi cần lấy cảnh giới theo thứ tự để đột phá, gọi `/api/canh-gioi/stt/:stt`; `/api/canh-gioi/:id` tra theo ID catalog, dù hai giá trị tình cờ trùng trong seed hiện tại.
- FE nên khởi tạo game từ PlayerDTO BE trả về, không ghép lại `playerData` client sau khi tạo thành công.

## 4. Snapshot và lưu state online

FE hiện đã bỏ ghi snapshot khi kết nối BE: `Net.saveNow()` trả về trạng thái skipped online và timer chỉ chạy trong mock mode. Giữ hành vi này; mọi state online phải đến từ response mutation hoặc Socket authoritative, không gửi `PUT /api/player/:id` snapshot.

## 5. Admin và realtime

- Admin BE chỉ nhận Bearer JWT có role `GM`/`ADMIN`; `x-admin-key` đã bị loại bỏ. FE admin cần có màn đăng nhập tài khoản, gọi `POST /api/auth/login`, chỉ cho vào màn quản trị khi response `user.role` là `GM` hoặc `ADMIN`, rồi gắn `Authorization: Bearer <accessToken>` cho mọi request `/api/admin/...` ở cả Admin Hub, Content Manager, Skill VFX và Map Editor. Dùng phiên/token manager hiện có và refresh flow chung; không tạo hoặc lưu admin key riêng. Khi refresh thất bại thì xóa phiên và quay lại đăng nhập; role sai hiển thị lỗi 403.
- Role `GM`/`ADMIN` được cấp bởi vận hành trong DB; FE không có API tự nâng quyền. Không cho phép đăng ký public tạo role quản trị.
- `game_command` là envelope realtime chuẩn `{ requestId, type, payload }`. Tám command `world.join`, `world.resync`, `movement.intent`, `map.change`, `combat.attack`, `combat.skill`, `loot.pickup`, `chat.send` đã được triển khai.
- `movement.intent.x/y` là số thực theo tile. Server giới hạn tốc độ nền 44 tile/giây rồi tính AGI/buff tốc độ từ state server, kiểm tra va chạm và trả `movement_corrected` khi client vượt tốc độ hoặc đi vào nước/ngoài map. FE tiếp tục prediction, nhưng phải reconcile theo tọa độ trả về.
- `world.join` dùng map/vị trí lưu ở BE; `mapCode/x/y/mapVersion/hasMap` do FE gửi chỉ là hint và không thay nguồn dữ liệu server. `map.change` chỉ thành công khi nhân vật ở trong 14 tile quanh portal; BE tự chọn `toX/toY` trong portal, bỏ qua `x/y` đích FE gửi.
- Trong `emitMapChange`, chờ ack `movement.intent` rồi mới gửi `map.change`; không dùng delay cố định để đoán độ trễ mạng.
- `world_init` có `mapVersion`. FE hiện không so sánh version khi `mapCode` không đổi; hãy tải lại map nếu version khác `S.mapVersion` trước khi chơi tiếp.
- Quái từ `world_init.monsters` có ID theo `monsterSpawns` của map. Combat dùng ID này; kỹ năng cần thuộc learned + equipped loadout, đủ MP và còn cooldown. Loot do server spawn; `loot.pickup` cập nhật inventory và quest một lần.
- Server phát `world_init`, `ground_loot_state`, `player_join/leave/move`, `movement_corrected`, `monster_update/spawn/death`, `combat_result`, `player_combat_result`, `skill_result`, `player_skill_cast`, các event `ground_loot_*`, `quest_state_update`, `chat_message`. FE có thể bỏ listener `world_state`, `player_map`, `monster_state_update` vì BE không phát các event cũ này.
- Ack lỗi có `{ ok:false, requestId, command, serverTime, error:{ code, message, details? } }`; hãy xử lý cả `COOLDOWN_ACTIVE`, `TARGET_OUT_OF_RANGE`, `PORTAL_NOT_FOUND_OR_OUT_OF_RANGE`, `LOOT_OUT_OF_RANGE` như thất bại authoritative.

## 6. Trạng thái tích hợp

BE cập nhật endpoint/payload đã triển khai trong `docs/API_V1.md`. `POST /api/player/respawn` nhận `requestId`, chỉ cho nhân vật HP 0 hồi sinh về spawn mặc định, trả snapshot player đã commit và hỗ trợ retry cùng ID. Sau khi nhận snapshot, FE online gửi `world.join` để đồng bộ socket; BE dùng `position_version` để một flush vị trí cũ không ghi đè điểm hồi sinh.

Khi có `REDIS_URL`, mỗi map có một Redis-lease owner; instance còn lại chuyển lệnh qua RPC, room event tiếp tục qua Socket.IO Redis adapter, snapshot runtime hỗ trợ takeover. Khi owner failover, các socket trong map cần kết nối lại. Không có Redis thì realtime chỉ chạy một BE instance. Vị trí/player/economy được commit trong MySQL; quái/drop/buff/cooldown có snapshot runtime trong Redis.

**FE handoff bắt buộc:** admin HTML/JS hiện tại trong `D:\Setup\mine\tutien_pixel\public\admin` vẫn gửi `x-admin-key`, nên các trang admin sẽ nhận 401 cho đến khi chuyển sang Bearer JWT như mục 5. Cập nhật đồng bộ `admin/index.html`, `admin/map-editor.html`, `admin/admin.js`, `admin/map-editor.js` và `admin/content-manager.js`; bỏ input/event handler của `admin-key`, không giữ key trong `localStorage`/`sessionStorage`. API server không còn giai đoạn tương thích key.

Vị trí người chơi được ghi theo nhịp tối đa một lần mỗi hai giây khi có di chuyển, đồng thời flush khi đổi map/ngắt socket. Khi MySQL lỗi, BE giãn retry theo backoff để tránh biến movement 20 Hz thành đợt ghi liên tục.
