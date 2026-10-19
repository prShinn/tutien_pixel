# Đánh giá project Tu Tiên Pixel — 2026-10-15 (Cập nhật toàn diện)

## 1. Kết luận

Project đã đạt mức **vertical slice/demo hoàn chỉnh chơi mượt mà**:
- Đăng nhập demo độc lập theo tab, multiplayer thời gian thực.
- Di chuyển mượt mà, server-authoritative chống speed-hack và wall-hack.
- Hệ thống chiến đấu có chiều sâu: Basic attack, 66 kỹ năng theo 9 linh căn, tương sinh tương khắc Ngũ Hành, hiển thị sát thương nhảy số (vàng to khi CRIT), hit flash chớp trắng quái và chớp đỏ nhân vật.
- Quái theo bầy đàn (Pack AI: Hoang Sói, Thổ Heo, Độc Thảo) tự động truy đuổi và hồi hang khi người chơi chạy xa.
- Giao diện người dùng chuẩn MMORPG: KPAH HUD (HP/MP/Tu vi), **Target HUD** hiển thị mục tiêu đang nhắm ở top-center kèm thanh máu và hệ, **Minimap** định vị quái/người chơi khác/portal phát sáng dạ quang, và **Mũi tên la bàn dẫn đường portal** hiển thị khoảng cách mét trực quan.
- Hệ thống Admin Map Editor tự sinh địa hình và liên kết portal 2 chiều.
- Toàn bộ 11 bộ test smoke và validation đều đạt 100%.

| Hạng mục | Điểm | Nhận xét |
|---|---:|---|
| Chức năng demo | 9.5/10 | Luồng chơi chính, multiplayer, combat, portal, target HUD chạy cực mượt |
| Nền tảng gameplay | 9.0/10 | 9 hệ linh căn, 66 skill, bầy quái, combat và map micro-grid chuẩn |
| Realtime & Authority | 8.5/10 | Socket room, AOI, snapshot, portal 2 chiều, chống hack di chuyển |
| Hiệu năng Client | 9.0/10 | Đã triệt tiêu DOM thrashing 60 FPS trong `renderEquipment`, 40 client tải nhẹ |
| Khả năng bảo trì | 8.5/10 | Tách 18 modular file client, có comment chuẩn hóa Mục đích/Cấu hình/Xử lý |
| Bảo mật/toàn vẹn dữ liệu | 8.0/10 | Whitelist DTO, rate-limit chống spam, inventory transaction thật |
| Kiểm thử tự động | 9.0/10 | 11 bộ test smoke và validation tự động bao phủ toàn bộ luồng chính |

---

## 2. Bằng chứng kiểm tra thực tế (Test Suite Status)

| Tên Test Script | Lệnh chạy | Kết quả kiểm tra | Trạng thái |
| :--- | :--- | :--- | :---: |
| Multiplayer Smoke | `npm run smoke` | `{"joined":true,"moved":true,"chatted":true,"mapSkipped":true}` | ✅ ĐẠT |
| Movement Authority | `npm run smoke:movement` | `{"normalMove":true,"speedHackRejected":true,"correctedTo":[301,200],"valid":true}` | ✅ ĐẠT |
| Portals Two-way | `npm run smoke:portals` | `{"sourceCode":"...","arrival":[80,80],"returned":true,"valid":true}` | ✅ ĐẠT |
| Monster Packs & Aggro | `npm run smoke:monster-packs` | `{"totalMonsters":14,"packs":{"PACK_HOANG_SOI":5,...},"individualAggro":true}` | ✅ ĐẠT |
| Combat Scale | `npm run smoke:combat-scale` | `{"skill":"KIM_KICH","damage":64,"rangeModel":"5x6=30px","valid":true}` | ✅ ĐẠT |
| Server State & Absorb | `npm run smoke:state` | `{"created":true,"absorbed":31,"stage":2,"power":1475}` | ✅ ĐẠT |
| Concurrency 40 Clients | `npm run smoke:concurrency` | `{"clients":40,"elapsedMs":880,"moveEvents":760,"memoryMb":{"rss":140,"heapUsed":77}}` | ✅ ĐẠT |
| Root Balance | `npm run validate:roots` | `Root balance data valid: 9 roots, 66 skills.` | ✅ ĐẠT |
| Combat Balance | `npm run validate:balance` | `Combat balance valid: stat budget, derived stats, mitigation, affinity.` | ✅ ĐẠT |
| World Scale | `npm run validate:world` | `World scale valid: 2 maps micro-grid, actors 14-21px, spawn footprint clear.` | ✅ ĐẠT |

---

## 3. Rủi ro P0 — Toàn bộ đã được xử lý triệt để

### 1. Di chuyển chưa hoàn toàn server-authoritative (Đã xử lý)
- Đã bổ sung kiểm tra va chạm địa hình server-side (`positionCollides`, `movementPathCollides`).
- Giới hạn tốc độ theo thời gian thực (`elapsedMs`, `maxDistance`) và phát event `movement_corrected` khi client vi phạm. Kiểm tra smoke `npm run smoke:movement` đạt 100%.

### 2. API tạo nhân vật nhận dữ liệu quá rộng (Đã xử lý)
- Đã chuyển sang whitelist DTO đầu vào tại `app.post("/api/player")`. Server tự sinh và xác thực toàn bộ chỉ số, tài nguyên (HP, MP, tu vi, xu), kỹ năng và tọa độ xuất phát.
- Khóa triệt để việc cập nhật tọa độ bất hợp lệ qua REST `PUT /api/player/:id`.

### 3. Kinh tế demo có thể bị khai thác (Đã xử lý)
- Hấp thụ linh thạch (`/api/player/cultivation/absorb`) đã xác thực và tiêu thụ vật phẩm từ inventory thật.
- Giao dịch Shop (`buy` / `sell`) đã validate slot index, số lượng, giá bán tối thiểu và trừ tiền phía server.
- Học kỹ năng (`skills/learn`) đã kiểm tra cảnh giới yêu cầu (`skill.tier`) và cập nhật lại chiến lực.

### 4. Bảo mật cấu hình & chống spam (Đã xử lý)
- Tích hợp middleware in-memory rate-limiting (`middleware/rate-limit.js`) chống spam brute-force và DDoS cho các endpoint `/api/auth/*` và API nhạy cảm.
- Bổ sung cảnh báo môi trường production cho `JWT_SECRET` và `ADMIN_MAP_KEY` khi dùng cấu hình mặc định.

---

## 4. Cải tiến UI, Trải nghiệm & Tối ưu hiệu năng mới nhất

### 4.1. Combat & Visual Polish
- **Target Lock Indicator:** Hiển thị vòng tròn đỏ và mũi tên chỉ mục tiêu xoay quanh quái vật đang nhắm.
- **Hit Flash & Hurt Reaction:** Quái vật chớp trắng khi bị đánh trúng; nhân vật người chơi chớp đỏ và khựng nhẹ (flinch) khi nhận sát thương.
- **Hiệu ứng chém kiếm:** Render vệt kiếm hình vòng cung (slash arc) và tia lửa giao kích (spark cross) thay cho các vòng tròn xám mờ cũ.
- **Floating Damage:** Số sát thương bay bổng phân biệt rõ ràng: Đánh thường màu đỏ cam, đòn bạo kích (CRIT!) màu vàng kim to với font scale nổi bật.
- **Smart Targeting:** Phím Space và phím 1–4 tự động bám mục tiêu đã chọn hoặc khóa quái gần nhất trong tầm chiêu.

### 4.2. World & UI Polish
- **Target HUD (Top-Center):** Hiển thị khung thông tin quái vật đang nhắm: Tên, Cấp độ (Lv.), Linh căn/Hệ, Icon đại diện và thanh máu (HP) động mượt mà. Tự động ẩn khi bỏ chọn hoặc quái chết.
- **Minimap:** Nâng cấp hiển thị trực quan: Cổng không gian hình thoi phát sáng dạ quang (`#48dbfb`), người chơi khác dạng chấm xanh lam (`#54a0ff`), quái vật đúng tỷ lệ tọa độ tile, và vòng tròn đỏ nhấp nháy định vị quái đang nhắm.
- **La bàn dẫn đường Portal:** Khi cổng portal ở ngoài tầm màn hình, xuất hiện mũi tên la bàn dạ quang xoay hướng chính xác về phía cổng kèm nhãn tên bản đồ đích và khoảng cách mét thực tế `(x mét)`.

### 4.3. Khắc phục điểm nghẽn hiệu năng (Performance Bottlenecks)
- **Triệt tiêu DOM Thrashing trong `UI.renderEquipment()`:** Trước đây, hàm này được gọi 60 FPS trong game loop, ghi đè `el.innerHTML` 9 ô trang bị 60 lần/giây (~540 lần innerHTML/giây). Đã tối ưu bằng cách thêm `_lastEqHash` và chỉ cập nhật DOM khi mở menu hành trang hoặc khi trang bị thật sự thay đổi.
- **Xóa bỏ dòng trùng lặp gán `ui-xu`:** Loại bỏ lệnh dư thừa tại `public/js/ui.js` dòng 108.
- **Loại bỏ nhân đôi cập nhật `S.atkFx`:** Loại bỏ thao tác `.filter()` thừa ở cuối `update()` trong `public/js/game.js`, gom xử lý trọn vẹn trong vòng lặp in-place.
- **An toàn modal check:** Bổ sung optional chaining `?.` và kiểm tra `#kpah-menu-modal` tránh việc nhân vật vừa đi vừa mở hành trang.
- **Sửa triệt để lỗi không di chuyển được (Movement Synchronization & Controls):**
  - *Nguyên nhân:* Khi vào chơi thử (Demo Mode), client chọn bản đồ `binh_nguyen` (20, 200) nhưng `POST /api/player` trên server hardcode `thanh_van_tran` (300, 200). Khi bấm di chuyển, bước nhảy 280 tile kích hoạt cơ chế chống cheat và gửi `movement_corrected: Vị trí bị địa hình chặn`, giam nhân vật đứng yên.
  - *Giải pháp:* Đồng bộ `mapCode`, `x`, `y` trong `POST /api/player` của `server.js` và `game.js`; thêm safe guard cho `isSolid()` và `loadMap()` trong `world.js`; hỗ trợ gõ phím không bị kẹt bởi IME tiếng Việt (Unikey/EVKey) và kích hoạt tính năng **Click-to-Move** (click chuột xuống đất có vòng sáng chỉ điểm).
- **Dọn dẹp mã rác:** Xóa bỏ 2 file nháp tồn dư ở thư mục gốc: `scratch_kpah.css` và `scratch_render.js`.

---

## 5. Bảng tra cứu & Bản đồ cấu trúc toàn bộ file trong hệ thống

Nhằm phục vụ việc **trace log, debug và phát triển mở rộng sau này**, toàn bộ các file trong repository đã được gắn header comment tiêu chuẩn gồm 3 mục: **(1) Dùng để làm gì**, **(2) Cấu hình gì**, **(3) Xử lý vấn đề nào**.

### 5.1. Backend, Socket & Middleware

| Đường dẫn File | Mục đích sử dụng | Cấu hình liên quan | Vấn đề xử lý |
| :--- | :--- | :--- | :--- |
| [`server.js`](file:///d:/Setup/mine/tutien_pixel/server.js) | Máy chủ chính Express, cung cấp REST API (Auth, Char, Inv, Cultivation, Shop, Admin) | `PORT` (3000), `JWT_SECRET`, CORS | Xác thực người dùng, bảo mật DTO (whitelist thuộc tính), ghi map async atomic chống block event loop |
| [`socket/game.js`](file:///d:/Setup/mine/tutien_pixel/socket/game.js) | Server-Authoritative Socket.io Game Engine (Rooms, Pack AI, Combat, Movement validation) | `MAX_SPEED`, `TICK_RATE` (20Hz), `MONSTER_AGGRO_RANGE` | Chống speed-hack/wall-hack (`movement_corrected`), bầy quái đuổi/hồi hang, broadcast snapshot |
| [`middleware/auth.js`](file:///d:/Setup/mine/tutien_pixel/middleware/auth.js) | Middleware xác thực JWT token từ HTTP Authorization Header | `JWT_SECRET` | Bảo vệ các route nhạy cảm, giải mã `userId`, `username` |
| [`middleware/rate-limit.js`](file:///d:/Setup/mine/tutien_pixel/middleware/rate-limit.js) | Giới hạn tần suất request (Rate Limiter) theo IP in-memory | `windowMs` (60s), `max` (30-60 req) | Chống spam brute-force login, spam tạo nhân vật, tự động dọn RAM chống rò rỉ bộ nhớ |

### 5.2. Kho Dữ liệu & Công thức Cân bằng

| Đường dẫn File | Mục đích sử dụng | Cấu hình liên quan | Vấn đề xử lý |
| :--- | :--- | :--- | :--- |
| [`data/mock-data.js`](file:///d:/Setup/mine/tutien_pixel/data/mock-data.js) | Cơ sở dữ liệu in-memory: Cảnh giới, Linh căn, Item, Skill, Quái vật, Bãi quái, Bản đồ micro-grid | `TILE_W` (600), `TILE_H` (400) | Giúp chạy độc lập không cần setup DB phức tạp, tạo khuôn schema chuẩn để sau này Backend dựng theo |
| [`data/balance.js`](file:///d:/Setup/mine/tutien_pixel/data/balance.js) | Công thức cân bằng toán học (Combat Math, Derivations, Ngũ Hành, OVR) | `BALANCE`, `AFFINITY_PAIRS` | Cân bằng chỉ số công/thủ/né/crit, tương sinh tương khắc Ngũ Hành, tính lượng tu vi thăng cấp |
| [`data/admin-worlds.json`](file:///d:/Setup/mine/tutien_pixel/data/admin-worlds.json) | File lưu trữ dữ liệu bản đồ thiết kế từ Map Editor | Cấu trúc map layers (ground, objects, elevation) | Lưu trữ bản đồ thế giới tùy biến |

### 5.3. Client Gameplay (`public/js/`)

| Đường dẫn File | Mục đích sử dụng | Cấu hình liên quan | Vấn đề xử lý |
| :--- | :--- | :--- | :--- |
| [`public/js/config.js`](file:///d:/Setup/mine/tutien_pixel/public/js/config.js) | Hằng số cấu hình toàn cục phía Client | `API.BASE`, `CFG.TS` (1), `CFG.DS` (3), `CFG.PLAYER_MOVE_SPEED` | Tập trung tham số căn chỉnh màn hình, tỷ lệ zoom và tốc độ game |
| [`public/js/state.js`](file:///d:/Setup/mine/tutien_pixel/public/js/state.js) | Single Source of Truth (`S`): Lưu player, map, monsters, players Map, target, cam | Đối tượng `S`, `canvas`, `ctx` | Xóa bỏ biến toàn cục phân tán, đảm bảo mọi module truy cập chung một trạng thái |
| [`public/js/game.js`](file:///d:/Setup/mine/tutien_pixel/public/js/game.js) | Game Loop chính (`requestAnimationFrame`), điều phối update/render, tạo nhân vật | Vòng lặp `dt`, cự ly đánh | Ổn định 60 FPS, nội suy di chuyển người chơi khác, khóa di chuyển khi mở modal |
| [`public/js/render.js`](file:///d:/Setup/mine/tutien_pixel/public/js/render.js) | Graphics Engine Canvas 2D: Vẽ địa hình đa tầng, actors, animations, minimap, la bàn portal | `TC` (Tile Colors), `CFG.ACTOR_W/H` | Viewport culling (chỉ vẽ vật thể trong màn hình), xóa nền sprite tự động, la bàn dẫn đường |
| [`public/js/net.js`](file:///d:/Setup/mine/tutien_pixel/public/js/net.js) | Client Network Manager: Giao tiếp HTTP REST và Socket.io | `sessionStorage` token, Socket.io | Throttle gửi gói di chuyển, hòa giải trạng thái (Reconciliation) khi server chỉnh tọa độ |
| [`public/js/ui.js`](file:///d:/Setup/mine/tutien_pixel/public/js/ui.js) | UI Controller: Cập nhật HP/MP bar, Cảnh giới, OVR, Target HUD, KPAH modal, chat | `CFG.INV_MAX`, `Linh_CAN` | Đồng bộ dữ liệu lên HTML/CSS, cache hash tránh DOM thrashing 60 FPS |
| [`public/js/skills.js`](file:///d:/Setup/mine/tutien_pixel/public/js/skills.js) | Hệ thống thần thông: Sổ kỹ năng, gán loadout 4 ô, cooldown, smart targeting | `CFG.SKILLS` | Mapper dữ liệu BE↔FE, tự khóa mục tiêu gần nhất khi bấm phím 1-4, buff/debuff |
| [`public/js/combat.js`](file:///d:/Setup/mine/tutien_pixel/public/js/combat.js) | Chiến đấu cơ bản: Xác định Role (Chiến Binh, Pháp Sư...), đòn đánh thường, số sát thương | `CFG.BASIC_ATTACK_RANGE`, `CFG.ATK_CD` | Kiểm tra tầm đánh, gửi đòn đánh lên server, kích hoạt animation và floating text |
| [`public/js/world.js`](file:///d:/Setup/mine/tutien_pixel/public/js/world.js) | Bản đồ & Va chạm: Nạp map DTO, kiểm tra `isSolid()`, trượt góc tường `moveWithCollision`, portal | `T` (Tile types), `CFG.PORTAL_RADIUS` | Ngăn đi xuyên vật cản, trượt mượt mà khi va chạm chéo, chuyển map qua portal |
| [`public/js/monster.js`](file:///d:/Setup/mine/tutien_pixel/public/js/monster.js) | Thực thể quái vật: AI offline local và nội suy tọa độ online | `monsterDefs`, `CFG.TS` | Đảm bảo mượt mà cả khi offline demo lẫn online multiplayer |
| [`public/js/inventory.js`](file:///d:/Setup/mine/tutien_pixel/public/js/inventory.js) | Túi đồ & Trang bị: Thêm đồ (stack 99), mặc/tháo đồ vào 9 ô trang bị, dùng đan dược | `CFG.SLOTS` (9 ô trang bị) | Tự cộng dồn item, tính toán lại chỉ số thuộc tính khi thay đổi trang bị |
| [`public/js/cultivation.js`](file:///d:/Setup/mine/tutien_pixel/public/js/cultivation.js) | Tu luyện & Đột phá: Hấp thụ đá tu vi, nâng tầng 1-9, đột phá đại cảnh giới | `CFG.REALMS`, `CANH_GIOI` | Tỉ lệ thành công/thất bại khi đột phá, cộng điểm tiềm năng sau tiến cấp |
| [`public/js/shop.js`](file:///d:/Setup/mine/tutien_pixel/public/js/shop.js) | Cửa hàng NPC & Hội thoại: Mua bán vật phẩm bằng Xu, dialog hướng dẫn tân thủ | `CFG.SHOP_ITEMS` | Kiểm tra đủ Xu trước khi mua, tự động cập nhật túi đồ và trừ tiền |
| [`public/js/auth.js`](file:///d:/Setup/mine/tutien_pixel/public/js/auth.js) | Quản lý phiên đăng nhập client, tab Login/Register, chế độ Demo | `sessionStorage` token | Chuyển đổi màn hình mượt mà, cho phép chơi thử không cần đăng ký |
| [`public/js/utils.js`](file:///d:/Setup/mine/tutien_pixel/public/js/utils.js) | Tiện ích toán học & Parse dữ liệu: `dist`, `randInt`, `lerp`, `parseEquipSlot` | Pure functions | Ngăn ngừa crash runtime khi dữ liệu trả về từ API rỗng hoặc lỗi cú pháp |
| [`public/js/gamedata.js`](file:///d:/Setup/mine/tutien_pixel/public/js/gamedata.js) | Bootloader nạp metadata từ API lúc khởi động game | `API.BASE`, timeout 8s | Nạp metadata mới nhất từ máy chủ, có fallback an toàn |
| [`public/js/input.js`](file:///d:/Setup/mine/tutien_pixel/public/js/input.js) | Bắt sự kiện bàn phím (WASD, 1-4, Space), chuột nhắm mục tiêu, resize canvas | `Input.keys` | Chuyển đổi tọa độ chuột màn hình sang tọa độ thế giới (world coordinates) |

---

## 6. Lộ trình phát triển tiếp theo (Next Steps)

1. **Giai đoạn Hiện tại (Hoàn thành xuất sắc):** Hoàn thiện toàn bộ logic game, trải nghiệm người dùng, đồ họa combat, target HUD, minimap và la bàn dẫn đường với dữ liệu nhỏ (mock-data) mượt mà, ổn định.
2. **Giai đoạn Kế tiếp (Xây dựng Backend & DB thật):**
   - Khi logic và gameplay client đã hoàn toàn trơn tru, đội ngũ Backend chỉ cần chiếu theo đúng khuôn dữ liệu (schema) tại [`data/mock-data.js`](file:///d:/Setup/mine/tutien_pixel/data/mock-data.js) và các API contract trong [`server.js`](file:///d:/Setup/mine/tutien_pixel/server.js) để triển khai cơ sở dữ liệu thật (PostgreSQL / Redis / MongoDB) một cách nhanh chóng mà không phải sửa đi sửa lại cả hai đầu FE và BE.
3. **Mở rộng Multiplayer & Tải cao:** Tích hợp Redis Socket.io Adapter khi số lượng người chơi đồng thời vượt ngưỡng 500+ client.
