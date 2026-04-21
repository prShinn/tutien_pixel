# 🗺️ SYSTEM — Bản Đồ (Map System)

---

## Loại Bản Đồ

| Type | Code | Đặc điểm | Level quái |
|------|------|---------|-----------|
| Thành Trì | `CITY` | An toàn, NPC, shop, không có quái | — |
| Thôn Làng | `VILLAGE` | NPC đơn giản, quái cấp thấp quanh làng | 1-8 |
| Đồng Bằng | `PLAIN` | Mở rộng, quái mật độ trung bình | 1-15 |
| Cao Nguyên | `PLATEAU` | Địa thế cao, quái mạnh hơn | 15-30 |
| Núi Tuyết | `ICE_MOUNTAIN` | Buff Thủy quái, Slow debuff vùng | 25-40 |
| Núi Lửa | `VOLCANO` | Buff Hỏa quái, Burn debuff vùng | 30-50 |
| Hang Động | `DUNGEON` | Tối, boss xuất hiện, loot cao | 20-60 |
| Chiến Trường | `WARZONE` | Khu vực PvP Chính-Ma hàng tuần | — |

---

## Bản Đồ Khởi Đầu

### Thanh Vân Trấn (`code: thanh_van_tran`)
- **Type**: CITY
- **Spawn**: Điểm xuất phát mặc định cho tân thủ
- **NPC**: Trưởng Lão (buff tân thủ), Lão Thương (shop), Trấn Thủ (thông tin)
- **Portal đến**: Bình Nguyên Hoang Dã, Đào Hoa Thôn

---

## Danh Sách Bản Đồ Theo Level

```
Level 1-10:
  thanh_van_tran    → Thành Trì khởi đầu
  dao_hoa_thon      → Thôn Làng (quái 1-5)
  binh_nguyen_1     → Đồng Bằng Tây (quái 5-12)

Level 10-25:
  binh_nguyen_2     → Đồng Bằng Đông (quái 10-20)
  thanh_long_son    → Cao Nguyên Xanh (quái 15-25)
  hang_bat_ma       → Hang Động Dơi Quỷ (boss: Hắc Bat Vương lv20)

Level 25-45:
  huyen_bang_tuyen  → Núi Tuyết Huyền (quái 25-40, buff Thủy)
  hoa_yem_coc       → Núi Lửa Hỏa Viêm (quái 30-45, buff Hỏa)
  hang_long_du      → Hang Long Du (boss: Tiểu Long lv35)

Level 45+:
  co_thap_phi_thien → Cao Nguyên Phi Thiên (quái 45-60)
  vuc_tham_mo       → Hang Động Vực Thẳm (boss events)
  chien_truong      → Chiến Trường Chính-Ma (PvP weekly)
```

---

## Tile Types

| Tile | Value | Tên | Solid | Màu |
|------|-------|-----|-------|-----|
| `T.GRASS` | 0 | Cỏ | ❌ | `#2a5a28` |
| `T.STONE` | 1 | Đá | ❌ | `#5a5a68` |
| `T.WATER` | 2 | Nước | ✅ | `#1a3a6a` |
| `T.WALL` | 3 | Tường | ✅ | `#181010` |
| `T.FLOOR` | 4 | Sàn | ❌ | `#3a3020` |
| `T.TREE` | 5 | Cây | ✅ | `#141a10` |
| `T.MTN` | 6 | Núi | ✅ | `#404050` |
| `T.PLAZA` | 7 | Quảng trường | ❌ | `#4a4030` |

---

## Portal System

```json
// Portal trong map data
{
  "x": 30,
  "y": 10,
  "tenMapDen": "Bình Nguyên Tây",
  "denMap": "binh_nguyen_1",
  "toX": 5,
  "toY": 25
}
```

- Khi player bước vào tọa độ portal (dist < 0.5 tile) → teleport
- Hiển thị arrow chỉ hướng portal gần nhất khi portal ngoài màn hình
- Tên portal hiển thị overlay khi vào bản đồ mới

---

## Map Data Structure (Backend)

```json
// GET /api/worlds/by-code?code=thanh_van_tran
{
  "id": 1,
  "code": "thanh_van_tran",
  "tenMap": "Thanh Vân Trấn",
  "type": "CITY",
  "w": 60,
  "h": 50,
  "isDefault": true,
  "spawnX": 30,
  "spawnY": 25,
  "jsonMap": [[3,3,3,...], [3,0,0,...], ...],
  "portals": [
    {
      "x": 58, "y": 25,
      "tenMapDen": "Bình Nguyên Tây",
      "denMap": "binh_nguyen_1",
      "toX": 3, "toY": 25
    }
  ],
  "monsters": [
    {
      "id": "HOANG_SOI_1",
      "name": "Hoang Sói",
      "level": 3,
      "type": "NORMAL",
      "nguHanh": ["KIM"],
      "color": "#aaaaaa",
      "spawnX": 10, "spawnY": 10
    }
  ],
  "npcs": [
    {
      "id": "NPC_TRUONG_LAO",
      "name": "Trưởng Lão",
      "type": "dialog",
      "color": "#c8a84b",
      "x": 28, "y": 24,
      "px": 28 * 32 + 16,
      "py": 24 * 32 + 16,
      "dialog": "Chào mừng tu sĩ đến Thanh Vân Trấn! Ta sẽ ban cho ngươi sức mạnh ban đầu."
    }
  ]
}
```

---

## Debuff Vùng Đất (Area Debuff)

| Map Type | Debuff | Tác động |
|----------|--------|----------|
| Núi Tuyết | Frost Ground | Player bị -20% move speed liên tục |
| Núi Lửa | Scorched Ground | Player nhận 1 Burn nhẹ tích lũy mỗi 5s |
| Hang Động | Darkness | Camera giảm render range |

---

## Mini-map (Tương lai)

- Hiển thị góc màn hình minimap với:
  - Tile layout đã khám phá (fog of war)
  - Vị trí player (dot vàng)
  - Vị trí người chơi khác (dot trắng)
  - Portal vị trí (chấm xanh)
