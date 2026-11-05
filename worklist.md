# BE Worklist — API và service tích hợp FE

**Trạng thái:** Sẵn sàng giao BE estimate và triển khai  
**Rà soát source:** 2026-11-05

**Ưu tiên chung:** P0 cho contract và luồng đăng nhập/chơi cơ bản; P1 cho gameplay/realtime/admin; P2 cho beta nhiều instance  
**Phạm vi:** Backend cung cấp API và application/domain service để FE hiện tại sử dụng. Giữ URL/payload đang chạy trong giai đoạn tích hợp; không để FE gửi state có thể tự tăng xu, vật phẩm hoặc tiến trình.

## 1. Rà soát nhanh hiện trạng

- FE đang dùng Express REST API và Socket.IO cùng origin. API được khai báo tại `public/js/api.js`; request consumer ở `public/js/auth.js`, `net.js`, `game.js`, `gamedata.js`, `inventory.js`, `shop.js`, `cultivation.js`, `skills.js`, `quest.js`, `public/admin/*`.
- BE đã có các route auth, player, quest, world/catalog, admin map/content/VFX và Socket command. Một số domain đã tách như `game/quest-service.js`, `game/admin-content-service.js`, `game/game-state-store.js`, `socket/command-pipeline.js`; logic REST player/admin vẫn còn một phần trong `routes/*.js` và `server.js`.
- Account/player được snapshot vào JSON; room, quái, loot, session và command dedup còn phụ thuộc memory của một process. `package.json` chưa có PostgreSQL/Prisma/Redis.
- Mức phù hợp hiện tại: **alpha nội bộ một process**; chưa đủ beta online/multi-instance.
- Chi tiết field/response đã trace FE được ghi tại mục **BE-API-01** trong [NODEJS_WEBGAME_ROADMAP.md](D:/Setup/mine/NODEJS_WEBGAME_ROADMAP.md).

## 2. Quy ước contract bắt buộc

- REST trả JSON cả success lẫn error. Giữ `{ "error": "..." }` để tương thích `Net._fetch`; có thể bổ sung `code`, `details`, `requestId`. Không thêm `{ data: ... }` bao ngoài khi chưa migrate FE.
- Private API xác thực bằng Bearer JWT và lấy owner từ token. `userId` trong body/path không được dùng thay cho authorization.
- Admin FE đã chuyển sang phiên Bearer riêng trong `sessionStorage`, xác minh role qua `/api/auth/me`, refresh/logout theo auth contract và không gửi `x-admin-key`; BE có thể gỡ adapter sau compatibility window.
- Mutation trả state authoritative sau commit; transaction/idempotency áp dụng cho xu, inventory, tu vi, quest reward và equipment.
- Service xử lý use case/invariant; controller/router chỉ validate, auth, gọi service và map response. Realtime gateway không tự chứa nghiệp vụ domain mới.
- API/socket contract và error code là nguồn chuẩn dùng chung; mọi đổi field phải có compatibility window và contract test.

## 3. Danh sách công việc

### BE-01 — Đóng băng REST/Socket contract và error model `[P0]`

**Deliverables**

- [ ] Tạo `docs/API_V1.md` hoặc OpenAPI đầy đủ cho các route đang được FE gọi.
- [ ] Tạo schema/version cho `game_command`, ack và event server → client.
- [ ] Mỗi endpoint ghi rõ method/path, auth, request DTO, success DTO, status code, error DTO và side effect.
- [ ] Chuẩn hóa lỗi theo `{ error, code, details?, requestId? }`; giữ `error` string để FE hiện tại đọc được.
- [ ] Ghi bảng legacy Socket input/event và kế hoạch sunset.

**Acceptance**: API spec khớp `public/js/api.js` và call-site thực tế; có contract test chứng minh response FE parse được.

### BE-02 — Auth và vòng đời nhân vật `[P0]`

**REST FE đang gọi**

| Method + path | Request | Response FE cần |
|---|---|---|
| `POST /api/auth/register`, `/api/auth/login` | `{ username, password }` | `{ token, user: { id, username } }` |
| `POST /api/auth/demo` | `{}` | `{ token, user: { id, username } }`; chỉ bật trong demo/dev |
| `GET /api/auth/me` | Bearer JWT | `{ user: { id, username } }` |
| `POST /api/player` | `{ name, gender, linhCan, stats }` | `PlayerDTO` trực tiếp có `id`, map/spawn hợp lệ; owner lấy từ Bearer token |
| `GET /api/player/by-user/:userId` | Bearer JWT | `PlayerDTO` trực tiếp; 404 JSON nếu chưa tạo nhân vật |
| `PUT /api/player/:id` | FE đang gửi snapshot định kỳ | Chốt checkpoint an toàn và trả player canonical có `id` sau commit |

**Service cần bàn giao**: `AuthService`, `PlayerService`/use cases register, login, get/create player và persist authoritative player state; repository interface để storage không nằm trong route.

**Bắt buộc xử lý**

- [ ] Không tin `userId`, stats dẫn xuất, HP/MP, xu, inventory, realm hoặc progression client gửi.
- [ ] Chốt đăng nhập lại sau restart, owner check, token expiry và demo account policy.
- [ ] Giải quyết `PUT /api/player/:id`: FE gửi snapshot mỗi 30 giây nhưng BE hiện chỉ nhận `name/gender/img`. Không được mass-assign snapshot; thiết kế checkpoint server-authoritative hoặc điều phối FE đổi sang các mutation API.
- [ ] Chuẩn hóa trường player: `id/userId/name/gender/linhCan/stats/derivedStats/hp/maxHp/mp/maxMp/xu/tuVi*/tangTuVi/maCanhGioi/canhGioi/mapCode/x/y/skills/learnedSkills/equippedSkills/equipment/inventory/combatPower`. Duy trì alias cũ `jsonIventory`, `trangBi`, `equip_slot` trong migration window hoặc cung cấp bước FE đổi rõ ràng.
- [ ] Chốt response khi nhân vật đã tồn tại; hiện POST có thể trả HTTP 409 nhưng body là PlayerDTO trực tiếp, trong khi FE bỏ qua `response.ok` ở `Net._fetch`.

**Acceptance**: auth → load/create player → reload sau restart hoạt động; owner/unauthorized test pass; response player luôn canonical, không dựa vào raw client aggregate.

### BE-03 — World và catalog read services `[P0]`

**REST FE đang gọi**

- World: `GET /api/worlds/default`, `GET /api/worlds/by-code?code=...`, `GET /api/world-structure`.
- Cảnh giới: `GET /api/canh-gioi`, `GET /api/canh-gioi/stt/:stt`, `GET /api/canh-gioi/:id`.
- Catalog: `GET /api/linh-can`, `/api/items`, `/api/skills`, `/api/skills/catalog`, `/api/skill-vfx`.
- Admin map editor còn dùng `GET /api/monsters`, `GET /api/admin/worlds`, `GET /api/admin/worlds/:code`.

**Response FE cần**

- Catalog roots/items/skills/realms/monsters: array trực tiếp, không bọc `data`.
- Skill book: `{ skills: SkillDTO[], learnedSkills: string[], equippedSkills: string[] }`.
- Skill VFX: `{ profiles: Record<skillCode, VfxProfile> }`.
- `WorldDTO`: `code`, `w/h`, `version`, `spawnX/Y`, `jsonMap`/tiles, `layers`, `portals`, `monsterSpawns`, `monsters`, `npcs`, `rules`.
- World structure: `{ name, description, regions: [{ name, description, maps: [...] }] }`.

**Service cần bàn giao**: `WorldService`, `CatalogService`, `RealmService`, `SkillCatalogService`; map published/version và catalog là source of truth phía server.

**Contract cần chốt**: FE breakthrough gọi `/api/canh-gioi/{stt}` nhưng route đó hiện tìm theo `id`. Chuẩn hóa caller sang `/api/canh-gioi/stt/:stt` hoặc đổi route/FE trước khi chốt v1; không dựa vào seed hiện tại có `id == stt`.

**Acceptance**: FE tải được màn tạo nhân vật, map, continent, catalog và skill book; kiểm tra map không tồn tại trả 404 JSON; response map/grid không bị stringify ngoài quy ước.

### BE-04 — Player gameplay services và mutation atomic `[P1]`

**REST FE đang gọi**

| Use case | Endpoint + request | Response FE đọc |
|---|---|---|
| Dùng vật phẩm | `POST /api/player/inventory/use` `{ index, itemId }` | `{ player: PlayerDTO, result }` |
| Mua/bán | `POST /api/player/shop/buy` và `/shop/sell` `{ requestId, itemCode, quantity }`; FE gửi `itemCode` + `quantity`, `Net.mutate` tự gắn idempotency `requestId` | `{ ok, player: PlayerDTO, result: { type, itemId, itemCode, quantity, price } }`; `price` là tổng giá theo số lượng |
| Cộng điểm | `POST /api/player/stats/allocate` `{ requestId, stat, amount }`; FE gửi `stat` trong `str/agi/vit/ene`, `amount: 1` | `{ stats, unspentStatPoints, derivedStats, player: PlayerDTO }` |
| Hấp thụ/đột phá | `POST /api/player/cultivation/absorb` `{ itemId, amount? }`; `/breakthrough` `{}` | `{ player, result: { amount? , major?, gain? } }` |
| Trang bị | `POST /api/player/equipment/equip` `{ index, itemId, slot }`; `/unequip` `{ slot }` | `{ player, result: { type, slot, itemId } }` |
| Học skill | `POST /api/player/skills/learn` `{ skillCode, source }` | `{ learnedSkills, skill, combatPower }` |
| Trang bị skill | `PUT /api/player/skills/equip` `{ skillCodes: string[] }` | `{ equippedSkills, skills }` |

**Service cần bàn giao**: `InventoryService`, `ShopService`, `CultivationService`, `EquipmentService`, `SkillService`, `Wallet/LedgerService`.

**Acceptance**

- [ ] Server tra item/skill/giá/điều kiện từ catalog, kiểm tra owner, giới hạn stack/slot/cảnh giới.
- [ ] Xu và inventory thay đổi trong cùng transaction; reward dùng idempotency key; retry không nhân xu/vật phẩm.
- [ ] Response luôn là state mới sau commit; lỗi giữ `{error, code?}` và status 4xx phù hợp.
- [ ] Có unit/domain và DB integration tests cho đủ/thiếu xu, túi đầy, vật phẩm sai, sai owner, item cạnh tranh và duplicate request.

### BE-05 — Quest service `[P1]`

**REST**: `GET /api/quests`; `POST /api/quests/:id/accept`, `/:id/track`, `/:id/claim` với body `{}`.

**Service cần bàn giao**: `QuestService` quản lý lifecycle, progress event, điều kiện nhận thưởng và giao dịch reward.

**Response**: snapshot `{ revision, trackedId, quests[] }`; mỗi quest có `id/category/title/giver/location/summary/objective/progress/target/status/rewards[]`. Accept/track trả snapshot có `ok`; claim trả snapshot + `rewards`, `grantedItems`, `player: { xu, tuViHienTai, inventory }`.

**Acceptance**: progress tăng từ combat/loot event; claim atomic/idempotent; Socket `quest_state_update` dùng cùng schema với REST.

### BE-06 — Realtime gameplay service và Socket contract `[P1]`

**Command FE gửi qua `game_command`**

| Type | Payload tối thiểu | Kết quả FE cần |
|---|---|---|
| `world.join` | `{ mapCode, x, y, mapVersion, hasMap }` | Ack rồi `world_init`; server chọn vị trí authoritative |
| `movement.intent` | `{ x, y, mapCode }` | Ack/correction; map luôn lấy từ session server |
| `map.change` | `{ mapCode, x, y }` | Ack rồi `world_init`; phải kiểm tra portal |
| `combat.attack` | `{ targetId, mapCode?, skillCode? }` | Ack/event có hit list, HP, miss/critical, cooldown, loot |
| `combat.skill` | `{ skillCode }` | Ack/event có effect, HP/MP, buff, cooldown |
| `loot.pickup` | `{ itemId }` | Ack; self nhận `ground_loot_picked`, room nhận remove |
| `chat.send` | `{ message }` tối đa 100 ký tự | Ack và `chat_message` |
| `world.resync` | `{}` | Ack và authoritative `world_init` |

**Service cần bàn giao**: `RealtimeGateway`, `MovementService`, `CombatService`, `MonsterRuntimeService`, `LootService`, `ChatService`; gateway chỉ xác thực/validate/dispatch, domain service giữ invariant.

**Ack**: success `{ ok:true, requestId, command, serverTime, result }`; error `{ ok:false, requestId, command, serverTime, error:{ code, message } }`.

**Events FE đang dùng**: `world_init`, `player_join/leave/move`, `movement_corrected`, `player_state_update`, `monster_update/spawn`, `combat_result`, `player_combat_result`, `player_skill_cast`, `skill_result`, `ground_loot_*`, `quest_state_update`, `chat_message`, `server_msg`.

**Acceptance**: schema test cho command/ack/event, unauthorized socket, reconnect/resync, duplicate request, concurrent pickup/shop/loot. FE còn listener `world_state`, `player_map`, `monster_state_update`, `monster_death` nhưng chưa thấy BE phát các event đó; chốt xóa listener hoặc bổ sung event có contract test.

### BE-07 — Admin map/content/skill VFX services `[P1]`

- Map API: `GET/POST /api/admin/worlds`, `GET/PUT/DELETE /api/admin/worlds/:code`, validate, publish, portal link/delete.
- Content API: `GET/POST /api/admin/content/:collection`, `PUT/DELETE /api/admin/content/:collection/:id`; collection FE sửa là `quests`, `npcs`, `items`, `skills`; `accounts` chỉ xem.
- Skill VFX API: `GET/POST /api/admin/skill-vfx`, `PUT/DELETE /api/admin/skill-vfx/:skillCode`.
- `GET /api/admin/worlds` cần trả array summary với `code/status/tenMap/w/h/regionId/portalCount/monsterPackCount/spawnX/spawnY/validation`.
- Content list cần `{ collection, demo, persisted, data[] }`; create/update trả `{ demo, persisted, data }`; delete `{ demo, persisted, removed }`.
- VFX profile cần `{ skillCode, root, form, label, durationMs, colors:{main,light,dark,accent} }`; GET trả `{ profiles: object }`.
- Service cần bàn giao: `AdminWorldService`, `AdminContentService`, `SkillVfxService`; validate trước publish và ghi audit.
- Acceptance: admin authorization theo role; CRUD và publish có persistence, version, audit, errors JSON; `persisted:true` khi đã lưu bền vững. Static `x-admin-key` chỉ được giữ trong compatibility window.

### BE-08 — Persistence, security và beta readiness `[P2]`

- [ ] Đề xuất storage schema/migration cho user, player, wallet/ledger, inventory/equipment, skill, quest và world/content version.
- [ ] Bảo đảm transaction + concurrency control cho kinh tế/progression; runtime state tách khỏi persistent source of truth.
- [ ] Thay JWT 7 ngày không refresh/revoke bằng access + refresh/revoke flow; áp dụng RBAC cho GM/Admin.
- [ ] Chuẩn hóa request validation/size limits, rate limits, secret fail-fast, CORS policy và sanitized errors.
- [ ] Tách liveness/readiness, graceful shutdown, backup/restore và observability cơ bản.
- [ ] Nếu scale Socket.IO nhiều instance: Redis adapter/shared dedup/runtime ownership; không lưu game tick vào DB.

**Acceptance**: restart không mất state đã commit; hai request cạnh tranh không tạo currency/item/reward sai; hai instance thấy cùng room event; có hướng rollback/restore.

## 4. Thứ tự bàn giao và Definition of Done

1. **Sprint/Batch 1 — P0:** BE-01, BE-02, BE-03; cung cấp OpenAPI + player/world/catalog services, auth/owner, contract tests. FE nối được login → tạo/load nhân vật → load map.
2. **Sprint/Batch 2 — P1:** BE-04, BE-05, BE-06; mutation gameplay, quest và realtime; thêm transaction/idempotency và test cạnh tranh.
3. **Sprint/Batch 3 — P1/P2:** BE-07, BE-08; admin content và điều kiện beta/persistence/scale.

Mỗi work item chỉ được đóng khi có: code/service, API contract cập nhật, unit/domain tests, integration/contract tests, ví dụ request/response, auth/owner review và ghi rõ phần chưa triển khai. Không coi route trả 200 là hoàn tất nếu response FE cần thiếu field hoặc mutation chưa được lưu đúng.

## 5. Giới hạn kiểm tra hiện tại

Đây là worklist dựa trên rà soát source FE/BE và roadmap hiện có. Lần tạo tài liệu này không chạy build, test hoặc server; trạng thái runtime và kết quả test hiện tại chưa được xác minh.

## 6. Bổ sung từ danh sách lỗi thao tác/gameplay ngày 2026-11-05

### FE batch đang xử lý

Các thay đổi FE trong nhánh hiện tại: phím B/C mở/đóng KPAH, Tab chọn quái theo vòng gần nhất, Escape/Enter thoát focus chat, Space tự áp sát mục tiêu xa, auto-fight quét 384px và ưu tiên skill hợp lệ, UI phân bổ điểm qua API, mua/bán theo số lượng, nhãn đồ rơi, NPC dùng sprite, hiệu ứng đột phá, và trạng thái chết khóa điều khiển. Mock API được chỉnh theo payload shop/stats hiện có của BE.

**Đã kiểm tra trên tab demo cô lập (`?mockBackend=1`)**: nạp game, KPAH B/C, chat Enter/Escape, Tab chọn mục tiêu, Space áp sát, auto-fight dùng skill, modal khi HP bằng 0 và hồi sinh mock về spawn với 50% HP/MP. `npm test`: 130/130 đạt, gồm hai unit test mới cho đòn chí tử/quái ngừng đánh. Chưa xác minh các luồng này với BE thật.

### BE-09 — Hồi sinh nhân vật `[P0 trước alpha online]`

**Hiện trạng**: Đã bỏ nhánh local demo tự đặt HP thành 25% sau đòn chí tử. Khi HP về 0, FE khóa di chuyển/đánh, tắt auto-fight, mở modal và chặn quái tiếp tục đánh. Mock API có luồng hồi sinh về spawn với 50% HP/MP để demo; BE thật vẫn chưa có endpoint/service theo source đã rà soát.

**Endpoint cần cung cấp**: `POST /api/player/respawn` với Bearer JWT và `{ requestId }` (FE `Net.mutate` tự gắn ID). Server xác định điểm hồi sinh từ map/world config, đưa nhân vật về tile spawn hợp lệ, đặt HP/MP bằng 50% mức tối đa authoritative, xóa trạng thái chết/combat/path, và lưu mutation nguyên tử/idempotent.

**Response FE cần**: `{ ok: true, player: PlayerDTO, result: { type: "respawned", mapCode, x, y, hp, mp } }`; player phải chứa tọa độ và vitals canonical. Lỗi trả JSON `{ error, code? }` và giữ nhân vật ở trạng thái chết.

**Acceptance**: owner check; không nhận tọa độ/HP/MP do client yêu cầu; điểm spawn walkable; retry cùng requestId không hồi sinh/phát thưởng hai lần; FE nhận snapshot rồi mở khóa điều khiển. **Chưa thấy endpoint/service này trong BE source được rà soát.**

### BE-10 — Hồi phục HP/MP ngoài giao tranh `[P1]`

**Yêu cầu gameplay**: sau 5 giây không chịu sát thương, mỗi 3 giây hồi 2% max HP và 3% max MP; dừng hoặc trì hoãn hồi khi bị đánh/giao tranh theo server state. Server clamp vào max vitals, không tin client.

**Service/event**: quản lý timer theo player session trong gameplay service; không ghi DB theo từng tick. Đồng bộ bằng event `player_state_update`/snapshot có `hp`, `maxHp`, `mp`, `maxMp` (hoặc chốt event riêng có schema). Persist theo cơ chế checkpoint hiện tại.

**Acceptance**: test timer theo thời gian, vừa bị đánh thì reset 5 giây, không vượt max, player rời room/disconnect thì dọn timer, không phát hồi phục hai lần khi nhiều instance cùng sở hữu session.

### BE-11 — Mở rộng catalog trang bị, shop và drop `[P1]`

**Hiện trạng**: FE mock catalog hiện có một vật phẩm `EQUIPMENT` là `SWORD_BAO_KHI_1`; slot trang bị còn lại chưa có lựa chọn trong catalog. Item/giá/điều kiện mua và drop phải do BE catalog làm nguồn chuẩn; FE không tự thêm gear riêng để tránh lệch dữ liệu authoritative.

**Deliverables**: bổ sung áo/giáp, quần, giày, nón, nhẫn, vòng hộ thân; dùng đúng enum slot và schema stats mà equipment service/FE đang hỗ trợ; chốt DEF/HP/SPD và realm requirement; cấu hình giá shop và drop table của quái; trả item catalog nhất quán cho `/api/items`, `/api/shop/catalog/items`, inventory và mutation response.

**Acceptance**: test catalog validation cho slot/stat/realm; mua đúng giá và đúng lượng; drop chỉ cấp item có trong catalog; trang bị/tháo ra giữ nguyên stat; catalog FE mock được cập nhật cùng mã item sau khi BE chốt.

### BE-12 — Đồng bộ HP/MP chết và hồi sinh qua Socket `[P1]`

Đảm bảo mọi luồng combat kết thúc HP/MP canonical (kể cả HP bằng 0) đều phát đủ snapshot cho FE. FE cần nhận `hp <= 0` thật để mở dead modal; không gửi fake HP và không tự hồi sinh. Khi respawn thành công, event/snapshot phải đồng bộ cùng tọa độ, mapCode và vitals để client không bị trạng thái chết sót lại.

**Next BE order**: BE-09 trước khi cho alpha online có death; BE-10 cùng batch realtime; BE-11 catalog sau khi chốt schema item/equipment. FE batch hiện tại chỉ dùng mock cho respawn cho đến khi BE-09 có API thật.
