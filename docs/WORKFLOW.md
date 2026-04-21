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
| Backend API | `http://localhost:8090` | REST API (players, items, maps, skills...) |
| Socket.io | `http://localhost:3000` | Realtime multiplayer |
| Frontend | `http://localhost:3000` | Static files served by Express |

> **config.js** phải luôn trỏ `API.BASE = "http://localhost:8090"` và `API.SOCKET_URL = "http://localhost:3000"`

---

## 📜 Quy Tắc Phát Triển

### 1. Thứ tự ưu tiên khi thêm tính năng
```
1. Thiết kế logic → cập nhật file docs/*.md liên quan
2. Thêm/sửa API endpoint (backend :8090)
3. Thêm/sửa data fetch trong gamedata.js
4. Implement logic trong JS module tương ứng
5. Cập nhật HTML nếu cần thêm UI element
6. Cập nhật CSS nếu cần style mới
```

### 2. Quy tắc JS modules
- **KHÔNG** đặt logic vào `index.html` — tất cả JS phải nằm trong `js/*.js`
- **KHÔNG** dùng `var` — dùng `const` / `let`
- **KHÔNG** truy cập DOM trực tiếp trong `combat.js`, `skills.js`, `cultivation.js` — dùng `UI.*` hoặc trả về kết quả
- Mỗi module expose 1 object global duy nhất (ví dụ `const Combat = { ... }`)
- **Thứ tự load** trong index.html phải tuân theo dependency graph (xem WORKFLOW này)

### 3. Quy tắc State
- **Toàn bộ game state** nằm trong object `S` (state.js)
- `S.player` = dữ liệu nhân vật hiện tại
- `S.inventory` = mảng vật phẩm
- `S.monsters`, `S.npcs`, `S.portals`, `S.groundItems` = entities trên map
- **KHÔNG** lưu state game vào global variable rời rạc (ngoại trừ `canvas`, `ctx`, `cW`, `cH` và `socket`, `authToken`, `currentUser` trong net.js/auth.js)

### 4. Quy tắc API
- Tất cả call API đi qua `Net.get()`, `Net.post()`, `Net.put()`
- Data tĩnh (items, skills, realms, roots) được fetch 1 lần lúc boot qua `GameData.load()`
- Không hardcode data game trong JS — luôn tham chiếu `CFG.ITEMS`, `CFG.SKILLS`, `CFG.REALMS`, `CFG.ROOTS`

### 5. Quy tắc Render
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

---

## 📋 Checklist Trước Khi Deploy

- [ ] `API.BASE` và `API.SOCKET_URL` đúng
- [ ] Tất cả `console.log` debug đã xóa hoặc đổi thành `console.info`
- [ ] Không có hardcoded data trong JS
- [ ] `server.js` có đầy đủ routes cần thiết
- [ ] Data seed (worlds, canh-gioi, items, skills) đã được nạp vào backend
- [ ] Socket handlers cập nhật cho tính năng mới

---

## 🔄 Phiên Bản & Milestone

Xem file `docs/ROADMAP.md` để biết roadmap phát triển chi tiết.
