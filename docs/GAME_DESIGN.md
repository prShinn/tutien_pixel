# 🎮 GAME DESIGN — Vạn Cổ Đế Tôn

> Webgame tu tiên pixel-art, online co-op, phong cách hành động nhập vai.

---

## 🌟 Tầm Nhìn Game

**Vạn Cổ Đế Tôn** là một webgame tu tiên với:
- **Thể loại**: Action RPG + Phiêu lưu + Co-op online
- **Phong cách**: Pixel-art 2D top-down, cuộn bản đồ
- **Chủ đề**: Tu tiên tiên hiệp — từ người thường đến Đại Đế thống trị vạn cổ

---

## 📖 Cốt Truyện

### Bối Cảnh
Thế giới Huyền Thiên Lục Hợp — nơi linh khí ngập tràn, dị thú hoành hành, các môn phái tranh hùng. Con đường tu tiên là con đường duy nhất để thoát khỏi cái chết và vươn tới bất tử.

### Khởi Đầu
Người chơi là một **thường nhân** sống trong **Thanh Vân Trấn** (thành trấn khởi đầu). Một ngày, cơ duyên đến — linh căn giác ngộ, bước lên con đường tu tiên.

### Hành Trình
```
Thanh Vân Trấn (khởi đầu)
    ↓ Học võ, nhận buff tân thủ từ NPC
Bình Nguyên Hoang Dã
    ↓ Đánh quái, khám phá, nhận nhiệm vụ
Thanh Long Sơn / Hỏa Yêm Cốc / Huyền Băng Tuyết Nguyên
    ↓ Phá cảnh giới, vào hang động bí ẩn
Các Bản Đồ Cấp Cao...
    ↓ Boss raids, sự kiện chiến tranh Chính-Ma
Đỉnh Thiên (endgame)
```

---

## 🎯 Core Gameplay Loop

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  Đánh quái/Boss → Nhận loot (đồ, xu, nguyên liệu)  │
│       ↓                                             │
│  Dùng linh thạch/đan dược → Tăng tu vi             │
│       ↓                                             │
│  Đủ tu vi → Phá cảnh giới (cần đan dược đặc thù)  │
│       ↓                                             │
│  Trang bị mạnh hơn → Vào vùng đất mới              │
│       ↓                                             │
│  Làm nhiệm vụ → Phần thưởng đặc biệt               │
│       ↓ (loop lại)                                  │
└─────────────────────────────────────────────────────┘
```

---

## 🧑‍🤝‍🧑 Co-op System

- Người chơi di chuyển trên cùng bản đồ — thấy nhau realtime (Socket.io)
- Khi cùng nhau chiến đấu boss → boss có HP scale theo số người
- Chat global + chat phe (Chính/Ma)
- Party system (tương lai): chia sẻ loot, hồi máu đồng đội

---

## 🏷️ Các Hệ Thống Chính

| Hệ thống | File tài liệu | Priority |
|----------|---------------|----------|
| Cảnh giới (Realm) | `SYSTEM_REALM.md` | ⭐⭐⭐⭐⭐ |
| Kỹ năng (Skills) | `SYSTEM_SKILLS.md` | ⭐⭐⭐⭐⭐ |
| Trang bị (Equipment) | `SYSTEM_EQUIPMENT.md` | ⭐⭐⭐⭐⭐ |
| Nhân vật (Character) | `SYSTEM_CHARACTER.md` | ⭐⭐⭐⭐⭐ |
| Tu luyện (Cultivation) | `SYSTEM_CULTIVATION.md` | ⭐⭐⭐⭐⭐ |
| Quái vật (Monsters) | `SYSTEM_MONSTERS.md` | ⭐⭐⭐⭐ |
| Vật phẩm (Items) | `SYSTEM_ITEMS.md` | ⭐⭐⭐⭐ |
| Bản đồ (Map) | `SYSTEM_MAP.md` | ⭐⭐⭐⭐ |
| NPC | `SYSTEM_NPC.md` | ⭐⭐⭐ |
| Phe phái (Faction) | `SYSTEM_FACTION.md` | ⭐⭐⭐ |
| Môn phái/Bang (Guild) | `SYSTEM_GUILD.md` | ⭐⭐ |
| Nhiệm vụ (Quest) | *(tương lai)* | ⭐⭐ |

---

## 🎮 Controls

| Phím | Hành động |
|------|-----------|
| `WASD` / `↑↓←→` | Di chuyển |
| `Space` | Đánh thường (gần nhất) |
| `1-4` | Dùng kỹ năng |
| `F` | Tương tác NPC / nhặt đồ |
| `Enter` | Mở chat |
| `Esc` | Đóng modal |
| `Q` | Mở túi đồ (tương lai) |
| `J` | Mở nhiệm vụ (tương lai) |
| `G` | Mở bang phái (tương lai) |

---

## 🌐 Online Features

- **Multiplayer**: Nhiều người chơi trên cùng bản đồ
- **Chat**: Global, kênh phe Chính/Ma
- **Events**: Chiến tranh Chính-Ma mỗi tuần
- **Co-op**: Boss droppool chia sẻ
- **Auto-save**: Mỗi 60 giây + khi đổi map
