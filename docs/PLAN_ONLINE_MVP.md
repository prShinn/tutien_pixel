# PLAN ONLINE MVP — Vạn Cổ Đế Tôn

## 1. Mục tiêu

Xây dựng một vertical slice chơi được của webgame tu tiên online: người chơi đăng nhập, tạo nhân vật, vào Thanh Vân Trấn, di chuyển realtime, gặp người chơi khác, đi ra Bình Nguyên Hoang Dã, đánh quái, nhận loot, tu luyện và đột phá cảnh giới đầu tiên.

Giai đoạn đầu dùng Node.js + dữ liệu JSON/mock trong RAM. Client chỉ gửi thao tác và hiển thị state; server dần trở thành nguồn sự thật duy nhất cho gameplay.

## 2. Kiến trúc đích

```text
Browser client
  ├─ REST: load static data, auth, player snapshot
  └─ Socket.io: input và realtime state
           │
           ▼
Node.js server :3000
  ├─ Express API
  ├─ Socket session/map rooms
  ├─ Authoritative game services
  └─ Mock repositories (JSON/RAM)
```

### Client chịu trách nhiệm

- Nhận input và gửi intent: `move`, `attack`, `use_skill`, `pickup`.
- Render map, player, monster, NPC, effect và HUD.
- Interpolate chuyển động để hiển thị mượt.
- Không tự quyết định damage, loot, inventory hoặc đột phá.

### Server chịu trách nhiệm

- Xác thực session và kiểm tra payload.
- Quản lý player, map room, vị trí và trạng thái online.
- Tính combat, cooldown, HP, monster AI, loot và tu luyện.
- Broadcast snapshot/delta cho các client trong cùng map.

## 3. Các phase triển khai

### Phase 0 — Làm project chạy được

- Đồng bộ frontend, REST và Socket.io về port `3000`.
- Bổ sung script chạy project và kiểm tra syntax.
- Sửa endpoint contract, đặc biệt realm `/api/canh-gioi/stt/:stt`.
- Tách mock data khỏi logic server.

**Nghiệm thu:** mở game bằng `http://localhost:3000`, API và static frontend hoạt động trong cùng server.

### Phase 1 — Mock API và seed data

Tạo dữ liệu tối thiểu cho:

- Realms, linh căn, item, skill.
- Thanh Vân Trấn và Bình Nguyên Hoang Dã.
- NPC hướng dẫn/shop.
- Hoang Sói, Thổ Heo Rừng, Độc Thảo Yêu.
- Loot table và portal.

API cốt lõi:

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
GET  /api/worlds/default
GET  /api/worlds/by-code
GET  /api/canh-gioi
GET  /api/canh-gioi/stt/:stt
GET  /api/linh-can
GET  /api/items
GET  /api/skills
GET  /api/monsters
GET  /api/player/me
POST /api/player
PUT  /api/player/me
```

**Nghiệm thu:** tạo tài khoản, tạo nhân vật, load đủ static data và load được map mặc định.

### Phase 2 — UI và luồng người chơi

- Login/register.
- Tạo nhân vật, chọn linh căn, phân bổ 20 điểm.
- HUD HP/MP/tu vi/xu.
- Inventory, equipment, skill bar.
- NPC dialog, shop, loading, reconnect và error state.

**Nghiệm thu:** người chơi đi hết luồng đăng nhập → tạo nhân vật → vào Thanh Vân Trấn mà không cần thao tác thủ công trong DevTools.

### Phase 3 — Realtime nền tảng

Socket events chuẩn:

```text
Client → Server: join_world, move_intent, map_change_request, chat_send
Server → Client: snapshot, player_join, player_leave, player_state, chat_message
```

- Mỗi map là một Socket.io room.
- Join/reconnect/leave phải cập nhật đúng room.
- Movement dùng intent hoặc tọa độ đã validate, không tin tuyệt đối tọa độ client.
- Có snapshot ban đầu và delta realtime.

**Nghiệm thu:** hai cửa sổ trình duyệt thấy nhau di chuyển, chat và đổi map đúng; reconnect không tạo player ma.

### Phase 4 — Server-authoritative gameplay

- `attack_request` và `skill_request`.
- Validate khoảng cách, cooldown, MP và target.
- Server tính damage và phát `combat_result`.
- Monster state, AI, death, respawn.
- Loot server-side và `inventory_updated`.
- Nhặt đồ bằng `pickup_request`.
- Tu vi, hấp thu linh thạch/đan dược và đột phá.

**Nghiệm thu:** sửa payload damage ở browser không thể tự tăng damage, xu, item hoặc tu vi.

### Phase 5 — Vertical slice nội dung

```text
Thanh Vân Trấn
  → NPC hướng dẫn
  → nhận buff/nhiệm vụ đầu tiên
  → portal
Bình Nguyên Hoang Dã
  → đánh quái
  → nhận loot
  → về thành bán/mua đồ
  → hấp thu linh thạch
  → đột phá cảnh giới đầu tiên
```

**Nghiệm thu:** một người chơi hoàn thành được gameplay loop; nhiều người chơi cùng map vẫn thấy nhau và cùng đánh quái.

### Phase 6 — Co-op và đồng bộ nâng cao

- Boss HP scale theo số người.
- Loot riêng theo player.
- Party cơ bản.
- Snapshot định kỳ để sửa lệch state.
- Interpolation và reconnect recovery.

### Phase 7 — Persistence và production

- Thay repository RAM bằng SQLite trước.
- Hash password bằng bcrypt.
- Validate/rate-limit auth, chat và gameplay request.
- Logging, health check, test API và test nhiều client.
- Chỉ sau khi MVP ổn định mới cân nhắc PostgreSQL, guild, faction war và PvP.

## 4. Definition of Done cho mỗi tính năng

- Có data contract hoặc event contract.
- Có server handler trước khi nối UI.
- Client không tự quyết định state quan trọng.
- Có loading, error và reconnect path.
- Test được bằng một client và tối thiểu hai client nếu là tính năng online.
- Chạy syntax check và kiểm tra lại luồng dữ liệu trước khi hoàn tất.

## 5. Ngoài phạm vi MVP

Guild, chiến tranh Chính–Ma, PvP, quest tree lớn, craft, enhance, endgame realm và database production chưa làm trong vertical slice đầu tiên.
## PHẠM VI UI HIỆN TẠI

MVP hiện tại tập trung PC webgame trước: desktop là layout chuẩn, thao tác bằng chuột/bàn phím. Mobile được để ở phase cuối và không tạo nhánh gameplay riêng trong vertical slice hiện tại.

### Phase 8 — Mobile webgame (làm sau cùng)

- Chuyển HUD PC sang responsive layout, không đổi server/socket contract.
- Thêm touch joystick, touch skill bar, safe-area và landscape gameplay.
- Kiểm tra PC và mobile cùng map realtime.
- Chỉ bắt đầu sau khi Phase 0–7 và gameplay PC qua smoke/regression test.

