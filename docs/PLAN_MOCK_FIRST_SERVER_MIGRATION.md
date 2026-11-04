# Plan Mock-first → Server-authoritative → Database

## Quyết định hiện tại

- Node/Express là server authoritative cho bản demo.
- Account thường và toàn bộ player aggregate (bao gồm inventory, cultivation, skill, quest state và vị trí gần nhất) được lưu vào `data/game-state.json` bằng snapshot atomic; file có thể đổi qua `GAME_STATE_FILE`.
- Player/runtime và catalog vẫn phục vụ từ RAM; world session, quái, ground loot và account demo không bền qua restart.
- Chưa dùng database. File store chỉ hỗ trợ một tiến trình/máy chủ demo, không phù hợp nhiều instance hoặc phát hành production.
- FE giữ state hiển thị trong `S` nhưng không phải nguồn sự thật. Tính năng mới tiếp tục đi qua API hoặc Socket intent để có thể thay repository mà không đổi giao diện.

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

### Demo persistence đã hoàn thành

- [x] Khôi phục account thường, player và bộ đếm ID khi server khởi động.
- [x] Ghi snapshot atomic có debounce khi player đổi qua REST hoặc Socket.IO; đăng ký và tạo nhân vật chờ ghi xong trước khi trả thành công.
- [x] Graceful shutdown flush dữ liệu; file sai schema/JSON làm server fail-fast để tránh khởi động với state rỗng rồi ghi đè.
- [x] `GAME_STATE_FILE` cho phép test tách biệt và `.gitignore` loại file chứa password hash khỏi git.
- [ ] PostgreSQL migration/repository, multi-instance coordination, transaction/ledger và backup/restore vẫn thuộc giai đoạn BE trước beta công khai.

## Contract không được phá

- Mock reset khi restart là chấp nhận được ở giai đoạn này.
- Client không được quyết định kết quả gameplay.
- Socket dùng intent và server result; không dùng `*_effect` để gửi damage tin cậy.
- DTO/API phải ổn định trước khi bắt đầu DB.

## Nhật ký nhiệm vụ — mock server đã nối, persistence thật còn chờ BE

Trạng thái: **đã nối end-to-end trong mock server**. Client lấy snapshot theo player đã xác thực; server sở hữu trạng thái, tiến độ hạ quái/nhặt linh thạch và trao thưởng. Các route hiện tại:

- `GET /api/quests` — trả danh sách và nhiệm vụ đang theo dõi của player.
- `POST /api/quests/:id/accept` — nhận nhiệm vụ.
- `POST /api/quests/:id/track` — bật/tắt theo dõi.
- `POST /api/quests/:id/claim` — xác nhận đủ điều kiện và trao thưởng một lần.
- Socket `quest_state_update` — gửi snapshot khi vào thế giới, hồi đồng bộ hoặc có tiến độ mới.

**Giới hạn hiện tại:** player và quest state cùng các dữ liệu game đang ở bộ nhớ tiến trình của mock server; restart server sẽ mất dữ liệu. Trước production cần repository/database transaction cho quest state cùng ví/inventory, migration tương thích, audit/ledger chống nhận thưởng trùng qua restart/concurrent requests và chính sách phiên nhiều thiết bị. Tiến độ tương tác NPC chưa được cấu hình thành objective; các nhiệm vụ hiện tại dùng sự kiện hạ quái và nhặt item do server xác nhận.

Kiểm tra chấp nhận: chỉ người chơi đã xác thực xem/sửa quest state của mình; client không gửi số đếm hay phần thưởng; nhiệm vụ đủ mục tiêu mới nhận thưởng; claim lặp không cộng thêm; túi đầy không làm mất trạng thái/reward; lỗi tải có nút thử lại; reconnect nhận lại snapshot.

## Quản trị cấu hình animation VFX skill

Trạng thái: **Đã nối UI Admin với mock server.** `GET/POST/PUT/DELETE /api/admin/skill-vfx` (xóa/sửa dùng `/:skillCode`) yêu cầu admin key và lưu profile đã validate vào `data/skill-vfx.json` bằng ghi file atomic; `GET /api/skill-vfx` cung cấp cấu hình presentation cho client. Runtime game nạp profile từ server; Admin chỉ cập nhật bộ nhớ local làm cache sau khi server xác nhận thao tác.

Giới hạn production: file JSON thuộc một tiến trình/máy chủ và chưa có version, audit log, quyền theo vai trò hay cập nhật live không cần tải lại; cần chuyển sang database/repository và cơ chế publish có version trước khi chạy nhiều instance. VFX không ảnh hưởng sát thương, cooldown hoặc trạng thái combat, nên không broadcast qua Socket.IO.

## Quản trị catalog nội dung trong Admin

Trạng thái: **đã có CRUD mock cho Quest, NPC, Items và Skills**. Admin có tìm kiếm, tạo/sửa bằng JSON có kiểm tra, xóa có xác nhận; API giữ ID bất biến khi sửa, so khớp ID số của skill, giữ nguyên chữ hoa trong mã catalog, kiểm tra trường thiết yếu và từ chối mã item/skill bị trùng. Tài khoản chỉ xem được.

Giới hạn hiện tại: catalog Items/Skills dùng trực tiếp mảng mock server và ảnh hưởng API/runtime của tiến trình hiện tại; Quest/NPC trong Admin vẫn là dữ liệu demo riêng, chưa nối vào QuestService hoặc NPC trên world. Các thay đổi mất khi server khởi động lại. BE cần chốt schema chuẩn, nối Quest/NPC vào runtime, thêm repository/database, phân quyền admin theo vai trò và audit log trước khi phát hành.

## Chế độ API mock phía trình duyệt (bỏ qua BE tạm thời)

**Bật bằng:** mở `/?mockBackend=1` (hoặc thêm `?mockBackend=1` vào URL game hiện tại). Không có tham số này thì `fetch` và luồng BE hiện hành giữ nguyên. Admin API được loại khỏi bộ chặn mock.

Chế độ này giữ nguyên URL, method, body và DTO mà game đang gọi qua REST; một lớp `fetch` thay phản hồi cho `/api/*` bằng dữ liệu local. File fixture được tạo lại từ catalog, balance, world structure và loot hiện có bằng `npm run mock:fixtures`; không sửa tay các file sinh ra trong `public/mock-api/`.

| Nhóm | Contract FE giữ nguyên | Hành vi mock |
| --- | --- | --- |
| Đăng nhập | `POST /api/auth/demo`, `/login`, `/register`; `GET /api/auth/me` | Tạo phiên giả trong trình duyệt; không xác minh mật khẩu và không dùng cho môi trường thật. |
| Dữ liệu | `GET /api/canh-gioi`, `/api/linh-can`, `/api/items`, `/api/skills`, `/api/monsters`, `/api/balance`, `/api/skill-vfx`, `/api/world-structure` | Đọc catalog fixture sinh từ `data/mock-data.js`, `data/balance.js`, `data/world-structure.js`. |
| Thế giới | `GET /api/worlds`, `/default`, `/by-code?code=...` | Đọc map fixture; quái có bảng rơi đồ và vật phẩm rơi dùng catalog ID chuẩn. |
| Nhân vật | `POST /api/player`; `GET /me`, `/state`, `/by-user/:userId`, `/power`; `PUT /:id` | Player lưu trong `localStorage` theo schema mock; endpoint mutation đọc catalog thay vì thuộc tính giả từ túi. |
| Tiến trình | `POST /inventory/use`, `/shop/buy`, `/shop/sell`, `/cultivation/absorb`, `/cultivation/breakthrough`, `/stats/allocate`, `/skills/learn`, `/equipment/equip`, `/equipment/unequip`; `PUT /skills/equip` | Cập nhật player local và trả DTO cùng dạng các API hiện tại. |
| Nhiệm vụ | `GET /api/quests`; `POST /:id/accept`, `/track`, `/claim` | Lưu tiến trình local; hạ quái và nhặt vật phẩm phát sự kiện tiến độ. |
| Realtime | Không gửi Socket.IO khi bật mock | Di chuyển, AI quái, chiến đấu, kỹ năng, nhặt đồ/tự nhặt và chat chạy local trong tab. Quái/vật phẩm dưới đất được dựng lại khi tải lại map hoặc trang. |

Các endpoint `/api/*` chưa có trong contract trả `501 MOCK_ENDPOINT_NOT_IMPLEMENTED`, để thiếu mock không biến thành phản hồi thành công giả. Static assets và `/api/admin/*` vẫn đi qua server thật. Lưu ý: account, combat, vị trí, quái và loot trong mode này chỉ để demo một người chơi; người dùng có thể sửa dữ liệu trình duyệt, không có multiplayer hay tính chống gian lận. Tắt mode bằng cách bỏ query `mockBackend=1`.

**Vá xác thực vật phẩm:** `POST /api/player/inventory/use` và `POST /api/player/cultivation/absorb` phải tra `item.id` trong catalog BE để lấy loại, lượng tu vi và hiệu ứng; không dùng `type`, `giaTriTuVi`, `heal*` hoặc `stat*` trong inventory/client request làm nguồn giá trị. Test hồi quy ở `tests/player-router.test.js` bao gồm metadata giả và ID không có catalog.

### Việc còn thuộc BE trước beta công khai

- [ ] PostgreSQL/Prisma, transaction/ledger cho túi đồ, tiền, nhiệm vụ và quà; file JSON hiện tại vẫn serialize snapshot toàn player và chỉ an toàn cho một tiến trình.
- [ ] Redis hoặc adapter lưu trữ chung cho world session, quái, loot, Socket room và distributed lock nếu chạy nhiều instance.
- [ ] JWT blacklist/revoke hoặc refresh-token rotation; thu hồi phiên khi logout/đổi mật khẩu.
- [ ] Giữ server authoritative cho combat/movement/loot; kiểm thử replay, race condition và quyền sở hữu cho mọi mutation.
- [ ] Dời client classic script sang ESM dần; `combat.js`, `monster.js`, `shop.js` vẫn truy cập qua alias `window` trong giai đoạn chuyển tiếp.
- [ ] Chạy migration DB, backup/restore, observability, rate limit và load test trước khi mở beta công khai.
