# 🗓️ ROADMAP — Vạn Cổ Đế Tôn

> Kế hoạch phát triển theo từng giai đoạn (phase). Đánh dấu ✅ = hoàn thành, 🔧 = đang làm, ⬜ = chưa bắt đầu.

---

## ✅ Đã Hoàn Thành (Foundation)

- ✅ Cấu trúc project modular (17 JS modules)
- ✅ Auth system (register/login/auto-login/logout)
- ✅ Tạo nhân vật (chọn linh căn, phân bổ stats)
- ✅ Game loop (update + render Canvas 2D)
- ✅ Pixel-art rendering (player, monster, NPC, portal, tile)
- ✅ Collision detection
- ✅ Di chuyển WASD + camera follow
- ✅ Monster AI (idle/chase/attack/return)
- ✅ Đánh thường (Space)
- ✅ Hệ thống kỹ năng cơ bản (4 slot)
- ✅ Tu luyện: hấp thu linh thạch, phá cảnh giới
- ✅ Inventory (40 slot)
- ✅ Shop NPC (mua/bán)
- ✅ Portal / đổi map
- ✅ Multiplayer realtime (Socket.io: move sync, chat)
- ✅ Auto-save (60s + map change)
- ✅ Data động từ API (REALMS, ROOTS, ITEMS, SKILLS)
- ✅ Tài liệu thiết kế (docs/*.md)

---

## 🔧 Phase 1 — Combat & Loot (Ưu Tiên Cao)

**Mục tiêu**: Game có thể chơi cơ bản với combat đầy đủ

- ⬜ **Loot system hoàn chỉnh**: quái chết → rơi đồ theo loot table
- ⬜ **Ground items**: đồ rơi trên map, player đến nhặt (F)
- ⬜ **Ngũ hành combat**: tương sinh tương khắc tính damage
- ⬜ **Status effects**: Burn, Freeze, Slow, Root, Stun, Poison
- ⬜ **Kỹ năng đầy đủ** theo SYSTEM_SKILLS.md (9 linh căn × 5 skill)
- ⬜ **Equipment system**: đeo trang bị, stats apply
- ⬜ **Trang bị đa dạng**: weapon types (sword, bow, staff...)
- ⬜ **Critical hit system**: crit rate + crit damage
- ⬜ **Combo system**: đánh liên tiếp tăng damage

---

## ⬜ Phase 2 — World & Content

**Mục tiêu**: Thế giới phong phú, có nội dung để khám phá

- ⬜ **Maps đầy đủ**: 8-10 bản đồ theo SYSTEM_MAP.md
- ⬜ **Boss mechanics**: HP phases, co-op scaling
- ⬜ **NPC hệ thống đầy đủ**: dialog tree, craft, enhance
- ⬜ **Craft system**: Luyện Đan Sư UI
- ⬜ **Nâng cấp trang bị**: enhance +1~+20
- ⬜ **Thăng phẩm trang bị**: Thường → Bảo Khí → ...
- ⬜ **Area debuff**: Frost Ground, Scorched Ground
- ⬜ **Cảnh giới bonuses**: unlock khi phá cảnh giới lớn
- ⬜ **Slot Cánh 🪶**: unlock khi Siêu Phàm
- ⬜ **Bản đồ Hang Động**: boss, loot cao, dungeon mechanic

---

## ⬜ Phase 3 — Social & Events

**Mục tiêu**: Tính năng multiplayer & cộng đồng

- ⬜ **Hệ thống nhiệm vụ (Quest)**: nhận/nộp từ NPC
- ⬜ **Phe phái**: Chính/Ma — chọn khi tạo nhân vật
- ⬜ **Sự kiện Chiến Tranh Chính-Ma**: Thứ 7 hàng tuần
- ⬜ **PvP zone**: Chiến Trường map
- ⬜ **Kênh chat phe**: faction_chat
- ⬜ **Bang phái**: thành lập, quản lý
- ⬜ **Bang nhiệm vụ**: hàng ngày
- ⬜ **Leaderboard**: chiến lực, sát thủ sự kiện

---

## ⬜ Phase 4 — Polish & Endgame

**Mục tiêu**: Game chất lượng cao, endgame content

- ⬜ **Cảnh giới cao**: Động Hư, Hư Vương, Đạo Nguyên, Đế Tôn, Đại Đế
- ⬜ **Auto-cultivation** offline progress
- ⬜ **Mini-map**: fog of war, portal markers
- ⬜ **Particle effects**: kỹ năng có hiệu ứng đẹp
- ⬜ **Sound effects**: combat, skill, map ambient
- ⬜ **Background music**: mỗi map type có nhạc riêng
- ⬜ **Achievement system**: danh hiệu & thành tựu
- ⬜ **Daily events**: boss đặc biệt hàng ngày
- ⬜ **Seasonal content**: nội dung theo mùa
- ⬜ **Database thực**: migrate từ in-memory sang persistent DB

---

## 📊 Technical Debt

- ⬜ Migrate `server.js` từ in-memory sang persistent database (SQLite/MySQL)
- ⬜ Xóa `index_v1.html` và `bak.html` (legacy)
- ⬜ Input validation & sanitization đầy đủ
- ⬜ Rate limiting API
- ⬜ JWT refresh token
- ⬜ Error handling chuẩn (không dùng `alert()`)
- ⬜ ES modules (import/export) thay vì script tags

---

## 🎯 Milestone Ngắn Hạn (Tuần Này)

> Cập nhật mỗi phiên làm việc

1. ⬜ Hoàn thiện loot table → quái chết rơi đồ
2. ⬜ Ground items → nhặt đồ
3. ⬜ Equipment apply stats (trang bị có tác dụng thực)
4. ⬜ Status effect: Burn, Slow, Root
5. ⬜ Seed data backend: maps + items + monsters đầy đủ
