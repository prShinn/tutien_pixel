# ⚔️ SYSTEM — Trang Bị (Equipment)

---

## Slot Trang Bị

| Slot ID | Tên | Icon | Bonus chính |
|---------|-----|------|-------------|
| `weapon` | Vũ Khí | ⚔ | pAtk hoặc mAtk |
| `armor` | Áo (Thân Giáp) | 🥋 | pDef, maxHP |
| `pants` | Quần | 👖 | pDef, agi |
| `boots` | Giày | 👟 | Speed, agi |
| `gloves` | Găng Tay | 🥊 | pAtk, crit |
| `wings` | Cánh | 🪶 | Speed, agi, dodge (mở khóa sau Siêu Phàm) |
| `ring` | Nhẫn | 💍 | mAtk hoặc pAtk, random stat |
| `amulet` | Vòng Cổ | 📿 | maxMP, mAtk |

---

## Phẩm Cấp Trang Bị

| Cấp | Tên | Màu | Số stat bonus | Drop từ |
|-----|-----|-----|---------------|---------|
| 0 | Thường | ⬜ `#aaaaaa` | 1 stat | Quái thường |
| 1 | Bảo Khí | 🟩 `#55cc55` | 2 stat | Quái Elite |
| 2 | Linh Khí | 🟦 `#4499ff` | 3 stat | Boss thường |
| 3 | Thánh Khí | 🟪 `#cc44ff` | 4 stat + effect | Boss cấp cao |
| 4 | Thần Khí | 🟧 `#ff8800` | 5 stat + 2 effect | Boss vùng đất hiếm |
| 5 | Đế Bảo | 🟥 `#ff3333` | 6 stat + 3 effect | Boss cuối, craft |
| 6 | Truyền Thuyết | 🌟 `#ffd700` + glow | 8 stat + 5 effect | Cực kỳ hiếm |

---

## Loại Vũ Khí

| Loại | Code | Stat chính | Tầm đánh | Đặc điểm |
|------|------|-----------|----------|----------|
| Kiếm | `SWORD` | pAtk | Gần (1.2 tile) | Tốc độ trung bình, cân bằng |
| Đao | `BLADE` | pAtk | Gần (1.4 tile) | Damage cao, chậm hơn |
| Thương | `SPEAR` | pAtk | Trung (2.0 tile) | AoE hẹp phía trước |
| Cung | `BOW` | pAtk | Xa (5.0 tile) | Projectile, tốc bắn nhanh |
| Nỏ | `CROSSBOW` | pAtk | Xa (6.0 tile) | Damage cao, CD cao |
| Quạt/Phiến | `FAN` | mAtk | Trung (2.5 tile) | AoE rộng, damage phép |
| Sáo | `FLUTE` | mAtk | Trung (3.0 tile) | Debuff âm thanh |
| Trượng | `STAFF` | mAtk | Gần (1.0 tile) | mAtk cao nhất |
| Gậy | `ROD` | mAtk/pAtk | Gần (1.5 tile) | Hybrid physical/magic |
| Song Kiếm | `DUAL_SWORD` | pAtk ×2 | Gần (1.0 tile) | Attack speed +30% |

---

## Chỉ Số Trang Bị

### Stat chính (Primary Stats)
- `pAtk`: Vật lý tấn công
- `mAtk`: Pháp thuật tấn công
- `pDef`: Vật lý phòng thủ
- `mDef`: Pháp thuật phòng thủ
- `maxHP`: Máu tối đa
- `maxMP`: Mana tối đa
- `speed`: Tốc độ di chuyển
- `agi`: Nhanh nhẹn (ảnh hưởng CD, dodge)

### Effect đặc biệt (proc, bonus)
- `crit_rate`: Tỷ lệ chí mạng +X%
- `crit_dmg`: Damage chí mạng +X%
- `lifesteal`: Hút máu X% damage gây ra
- `thorns`: Phản X% damage nhận
- `element_bonus`: Tăng X% damage ngũ hành tương ứng
- `skill_cd_reduce`: Giảm CD kỹ năng X%
- `mp_cost_reduce`: Giảm MP tiêu hao X%

---

## Nâng Cấp Trang Bị

### Nâng cấp chỉ số (Enhance)
- Dùng **Nguyên Liệu Nâng Cấp** (xem `SYSTEM_ITEMS.md`)
- Mỗi +1 tăng tất cả stats của trang bị thêm **8%**
- Tối đa **+10** cho phẩm thường → **+20** cho Truyền Thuyết
- Nâng cao có tỷ lệ thành công giảm dần, thất bại mất nguyên liệu

### Thăng Phẩm Cấp (Ascend)
- Dùng **Nguyên Liệu Rèn Thăng** + xu + đan dược
- Thường → Bảo Khí → Linh Khí (chỉ thăng 1-2 cấp)
- Tỷ lệ thành công thấp — thất bại mất nguyên liệu, không mất đồ

---

## Backend Data Structure

```json
// Mẫu item trang bị trong CFG.ITEMS / /api/items
{
  "id": "SWORD_LUYEN_THE_1",
  "name": "Luyện Thể Kiếm",
  "icon": "⚔",
  "type": "EQUIP",
  "subtype": "weapon",
  "weaponType": "SWORD",
  "grade": 0,
  "gradeName": "Thường",
  "stats": {
    "pAtk": 15,
    "speed": 2
  },
  "effects": [],
  "reqRealm": 1,
  "reqRealmCode": "LUYEN_THE",
  "giaMua": 0,
  "giaBan": 50,
  "desc": "Thanh kiếm thường dành cho tu sĩ mới bắt đầu"
}
```

---

## Công Thức Tính Stats Từ Trang Bị

```javascript
// Trong combat.js
function totalStats(player) {
  const eq = player.equipment;
  let bonus = { pAtk:0, mAtk:0, pDef:0, mDef:0, maxHP:0, maxMP:0, speed:0, agi:0 };
  for (const [slot, item] of Object.entries(eq)) {
    if (!item) continue;
    for (const [k, v] of Object.entries(item.stats || {})) {
      bonus[k] = (bonus[k] || 0) + v * (1 + (item.enhance || 0) * 0.08);
    }
  }
  return bonus;
}
```

---

## Yêu Cầu Cảnh Giới Để Đeo

| Phẩm Cấp | Cảnh Giới Tối Thiểu |
|-----------|---------------------|
| Thường | Luyện Thể |
| Bảo Khí | Khí Động |
| Linh Khí | Ly Hợp → Chân Nguyên |
| Thánh Khí | Thần Du → Siêu Phàm |
| Thần Khí | Nhập Thánh → Thánh Vương |
| Đế Bảo | Động Hư → Hư Vương |
| Truyền Thuyết | Đạo Nguyên+ |

> **Slot Cánh** 🪶 chỉ mở khi đạt **Siêu Phàm Cảnh** trở lên
