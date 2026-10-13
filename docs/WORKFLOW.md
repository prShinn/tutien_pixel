# 🛠️ WORKFLOW — Vạn Cổ Đế Tôn

> **Nguyên tắc làm việc chung** giữa lập trình viên + AI assistant khi phát triển project này.

---

## 📁 Cấu Trúc Project

```
tutien_pixel/
├── docs/                  ← Tài liệu thiết kế (các file .md này)
│   ├── WORKFLOW.md
│   ├── GAME_DESIGN.md
│   ├── SYSTEM_REALM.md
│   ├── SYSTEM_SKILLS.md
│   ├── SYSTEM_EQUIPMENT.md
│   ├── SYSTEM_CHARACTER.md
│   ├── SYSTEM_CULTIVATION.md
│   ├── SYSTEM_MONSTERS.md
│   ├── SYSTEM_ITEMS.md
│   ├── SYSTEM_MAP.md
│   ├── SYSTEM_FACTION.md
│   ├── SYSTEM_GUILD.md
│   ├── SYSTEM_NPC.md
│   ├── API_REFERENCE.md
│   └── ROADMAP.md
│
├── public/                ← Frontend (HTML + JS + CSS)
│   ├── index.html         ← Entry point (bản modular hiện tại)
│   ├── index_v1.html      ← [LEGACY] bản monolithic — KHÔNG chỉnh sửa
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── config.js      ← API config + CFG constants
│       ├── state.js       ← Global state S{}
│       ├── utils.js       ← Utility functions
│       ├── gamedata.js    ← Fetch data từ /api/*
│       ├── net.js         ← HTTP + Socket.io
│       ├── auth.js        ← Login/Register/AutoLogin
│       ├── world.js       ← Map loading + tile collision
│       ├── monster.js     ← Monster AI
│       ├── skills.js      ← Skill system
│       ├── combat.js      ← Combat logic
│       ├── cultivation.js ← Tu luyện + Phá cảnh
│       ├── inventory.js   ← Inventory management
│       ├── shop.js        ← Shop NPC
│       ├── render.js      ← Canvas 2D rendering
│       ├── ui.js          ← UI update (sidebar, log)
│       ├── input.js       ← Keyboard/Mouse input
│       └── game.js        ← Game loop + Boot sequence
│
├── data/                  ← Dữ liệu tĩnh / seed data
│   ├── world.json
│   ├── players.json
│   └── users.json
│
├── middleware/
│   └── auth.js            ← JWT middleware
│
├── socket/
│   └── game.js            ← Socket.io handlers
│
└── server.js              ← Express + Socket.io entry point (port 3000)
```

---

## 🔌 Cấu Hình Server

| Service | URL | Mục đích |
|---------|-----|----------|
| Node.js API | `http://localhost:3000/api` | REST API mock/authoritative |
| Socket.io | `http://localhost:3000` | Realtime multiplayer |
| Frontend | `http://localhost:3000` | Static files served by Express |

> Giai đoạn MVP dùng một Node.js server duy nhất. `config.js` phải trỏ API và Socket về cùng origin `http://localhost:3000`.

Chi tiết roadmap nằm tại [`PLAN_ONLINE_MVP.md`](./PLAN_ONLINE_MVP.md).

---

## 📜 Quy Tắc Phát Triển

### 1. Thứ tự ưu tiên khi thêm tính năng
```
1. Thiết kế logic → cập nhật file docs/*.md liên quan
2. Xác định data contract và quyền sở hữu state
3. Thêm/sửa API hoặc Socket handler trong Node.js :3000
4. Thêm/sửa data fetch trong gamedata.js
5. Implement logic trong JS module tương ứng
6. Cập nhật HTML nếu cần thêm UI element
7. Cập nhật CSS nếu cần style mới
```

### 2. Nguyên tắc server-authoritative

- Client gửi **intent**, không gửi kết quả gameplay đã tính sẵn.
- Server là nguồn sự thật cho vị trí hợp lệ, HP, damage, cooldown, loot, inventory, tu vi và cảnh giới.
- Client chỉ render state server trả về và nội suy chuyển động.
- Mỗi event Socket phải có payload tối thiểu, validate ở server và event phản hồi thành công/thất bại.
- Tính năng realtime phải kiểm tra với tối thiểu hai client.

### 3. Quy tắc JS modules
- **KHÔNG** đặt logic vào `index.html` — tất cả JS phải nằm trong `js/*.js`
- **KHÔNG** dùng `var` — dùng `const` / `let`
- **KHÔNG** truy cập DOM trực tiếp trong `combat.js`, `skills.js`, `cultivation.js` — dùng `UI.*` hoặc trả về kết quả
- Mỗi module expose 1 object global duy nhất (ví dụ `const Combat = { ... }`)
- **Thứ tự load** trong index.html phải tuân theo dependency graph (xem WORKFLOW này)

### 4. Quy tắc State
- **Toàn bộ game state** nằm trong object `S` (state.js)
- `S.player` = dữ liệu nhân vật hiện tại
- `S.inventory` = mảng vật phẩm
- `S.monsters`, `S.npcs`, `S.portals`, `S.groundItems` = entities trên map
- **KHÔNG** lưu state game vào global variable rời rạc (ngoại trừ `canvas`, `ctx`, `cW`, `cH` và `socket`, `authToken`, `currentUser` trong net.js/auth.js)

### 5. Quy tắc API
- Tất cả call API đi qua `Net.get()`, `Net.post()`, `Net.put()`
- Data tĩnh (items, skills, realms, roots) được fetch 1 lần lúc boot qua `GameData.load()`
- Không hardcode data game trong JS — luôn tham chiếu `CFG.ITEMS`, `CFG.SKILLS`, `CFG.REALMS`, `CFG.ROOTS`

### 6. Quy tắc Render
- **Tất cả vẽ** nằm trong `render.js` — pixel-art thủ công bằng `ctx.fillRect()`
- Không dùng ảnh/sprite sheet (trừ khi có quyết định đổi sang tileset)
- Render order: tiles → portals → npcs → otherPlayers → monsters → player → effects → UI overlays

---

## 🗺️ Dependency Graph JS Modules

```
config.js ──┐
state.js ───┼── gamedata.js ─┐
utils.js ───┘                │
                             ├── net.js ─┐
                             │           ├── auth.js
                             │           └── world.js ─┐
                             │                          ├── monster.js
                             │                          ├── skills.js ──── combat.js
                             │                          ├── cultivation.js
                             │                          ├── inventory.js
                             │                          ├── shop.js
                             │                          ├── render.js
                             │                          ├── ui.js
                             │                          └── input.js
                             └──────────────────────────────── game.js (entry)
```

---

## 🧩 Workflow Thêm Tính Năng Mới

### Ví dụ: Thêm hệ thống Nhiệm Vụ (Quest)

```markdown
1. [ ] Đọc SYSTEM_QUEST.md (hoặc tạo mới)
2. [ ] Thiết kế API endpoints: GET /api/quests, POST /api/quest/accept/:id, POST /api/quest/complete/:id
3. [ ] Tạo js/quest.js với QuestSystem object
4. [ ] Thêm vào gamedata.js: loadQuests()
5. [ ] Thêm S.quests = [] vào state.js
6. [ ] Cập nhật index.html: thêm panel quest + <script src="./js/quest.js">
7. [ ] Thêm CSS panel quest vào style.css
8. [ ] Thêm input handler cho phím mở quest (ví dụ Q)
9. [ ] Test end-to-end
```

### Mẫu workflow cho tính năng realtime

```markdown
1. [ ] Mô tả state nào thuộc server, state nào chỉ thuộc client
2. [ ] Định nghĩa request/response hoặc Socket event contract
3. [ ] Tạo mock data/seed nếu tính năng cần dữ liệu
4. [ ] Implement server validation và state transition
5. [ ] Implement client Net event và cập nhật S
6. [ ] Implement UI/render từ state, không tính lại nghiệp vụ quan trọng
7. [ ] Test một client
8. [ ] Test hai client cùng map
9. [ ] Test reconnect, payload sai và map khác nhau
10. [ ] Cập nhật API_REFERENCE.md và PLAN_ONLINE_MVP.md nếu milestone thay đổi
```

---

## 📋 Checklist Trước Khi Deploy

- [ ] `API.BASE` và `API.SOCKET_URL` cùng trỏ về Node.js server :3000 trong MVP
- [ ] Tất cả `console.log` debug đã xóa hoặc đổi thành `console.info`
- [ ] Không có hardcoded data trong JS
- [ ] `server.js` có đầy đủ routes cần thiết
- [ ] Data seed (worlds, canh-gioi, items, skills) đã được nạp vào backend
- [ ] Socket handlers cập nhật cho tính năng mới
- [ ] Server không tin damage, loot, inventory hoặc tu vi do client gửi lên
- [ ] Tính năng realtime đã test với hai client

---

## 🔄 Phiên Bản & Milestone

Xem file `docs/ROADMAP.md` để biết roadmap phát triển chi tiết.
