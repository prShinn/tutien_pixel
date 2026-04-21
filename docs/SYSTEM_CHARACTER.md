# 🧑 SYSTEM — Nhân Vật (Character)

---

## Thông Tin Nhân Vật

### Data Model

```json
{
  "id": 1,
  "userId": 1,
  "name": "Thanh Vân",
  "linhCan": "KIM",
  "maCanhGioi": "LUYEN_THE",
  "tangTuVi": 1,
  "tuViHienTai": 0,
  "tuViLenCap": 1000,
  "tuViLinhCan": 0,
  "stats": {
    "str": 10,
    "agi": 8,
    "vit": 10,
    "ene": 7
  },
  "hp": 200,
  "maxHp": 200,
  "mp": 106,
  "maxMp": 106,
  "xu": 50,
  "x": 26,
  "y": 30,
  "mapCode": "thanh_van_tran",
  "skills": [...],
  "equipment": {
    "weapon": null,
    "armor": null,
    "pants": null,
    "boots": null,
    "gloves": null,
    "wings": null,
    "ring": null,
    "amulet": null
  },
  "faction": "CHINH",
  "guildId": null,
  "phe": "CHINH"
}
```

---

## Chỉ Số Cơ Bản (Base Stats)

| Stat | Tên | Ảnh hưởng |
|------|-----|-----------|
| `str` | Sức Mạnh | +5 pAtk / điểm |
| `agi` | Nhanh Nhẹn | +2 speed, +0.5% dodge, -0.2% CD / điểm |
| `vit` | Thể Lực | +10 maxHP, +2 pDef / điểm |
| `ene` | Trí Tuệ (Năng lượng) | +8 maxMP, +3 mAtk / điểm |

### Công Thức Stat Dẫn Xuất

```javascript
// Trong combat.js
pAtk()  = base.str * 5 + equipment.pAtk + realm_bonus.pAtk
mAtk()  = base.ene * 3 + equipment.mAtk + realm_bonus.mAtk
pDef()  = base.vit * 2 + equipment.pDef
mDef()  = base.ene * 1 + equipment.mDef
maxHP   = 100 + base.vit * 10 + equipment.maxHP
maxMP   = 50  + base.ene * 8  + equipment.maxMP
speed   = 3 + base.agi * 0.5 + equipment.speed
dodge%  = base.agi * 0.5 + equipment.agi * 0.3   // cap 40%
```

---

## Phân Bổ Điểm Khi Tạo Nhân Vật

- Mỗi nhân vật mới được **20 điểm** phân bổ vào (str, agi, vit, ene)
- Mỗi stat tối thiểu: **1 điểm**
- Không thể thay đổi sau khi tạo (chỉ có thể tăng qua đồ và đan dược)

---

## Tu Vi Linh Căn

- `tuViLinhCan` — điểm tích lũy riêng của linh căn (khác `tuViHienTai`)
- Tăng khi hấp thụ **linh đan đặc thù theo linh căn**
- Cao hơn → kỹ năng ngũ hành mạnh hơn, chiến lực tăng
- **Hệ số kỹ năng** = `1 + tuViLinhCan / 10000`

---

## Công Thức Chiến Lực (Combat Power)

```javascript
function calcCombatPower(player) {
  const s = player.stats;
  const eq = totalEquipStats(player.equipment);
  const realmBonus = player.canhGioi?.stt * 150 + player.tangTuVi * 20;

  const statCP  = (s.str + s.agi + s.vit + s.ene) * 5;
  const equipCP = (eq.pAtk + eq.mAtk) * 2 + (eq.pDef + eq.mDef) * 1.5
                + eq.maxHP * 0.1 + eq.maxMP * 0.2;
  const tvlcCP  = player.tuViLinhCan * 0.01;  // tu vi linh căn
  
  return Math.floor(statCP + equipCP + realmBonus + tvlcCP + 100);
}
```

### Chiến lực ảnh hưởng
- Dùng để **so sánh sức mạnh** giữa các player (leaderboard)
- Không tham khảo vào combat calculation thực tế

---

## HP / MP Regen

```javascript
// Trong game.js - update()
p.hp = Math.min(p.maxHp, p.hp + CFG.REGEN_HP * dt);   // 0.01 HP/ms
p.mp = Math.min(p.maxMp, p.mp + CFG.REGEN_MP * dt);   // 0.006 MP/ms
```

- Regen tự nhiên tăng theo passive kỹ năng Mộc (+0.5% HP), Thủy (+MP regen)
- NPC bán **Huyết Ngọc** (HP potion) và **Tinh Lực Đan** (MP potion)

---

## Hồi Phục Từ NPC

| Vật phẩm | Hiệu ứng | Giá |
|-----------|----------|-----|
| Huyết Ngọc (nhỏ) | +50% maxHP | 50 xu |
| Huyết Ngọc (lớn) | +100% maxHP | 150 xu |
| Tinh Lực Ngọc (nhỏ) | +50% maxMP | 40 xu |
| Tinh Lực Ngọc (lớn) | +100% maxMP | 120 xu |
| Buff Tân Thủ | +30% allStats 30 phút | Miễn phí (1 lần/ngày) |

---

## Phe Phái (Faction)

- Mặc định khi tạo nhân vật: chọn **CHINH** hoặc **MA**
- Xem chi tiết tại `SYSTEM_FACTION.md`

---

## Tier Cải Tiến Thuộc Tính Gốc

Khi phá đến cảnh giới lớn mới:
- Mỗi đại cảnh giới unlock thêm **5 điểm stat** phân bổ tự do
- Ví dụ: Phá vào Khí Động → +5 điểm, Ly Hợp → thêm +5 điểm...

---

## Save/Load Data

### Fields lưu vào backend (/api/player PUT)
```
name, linhCan, maCanhGioi, tangTuVi, tuViHienTai, tuViLenCap, tuViLinhCan,
stats, hp, maxHp, mp, maxMp, xu, x, y, mapCode, mapId,
jsonIventory, skills (BE format), equip_slot (JSON string),
faction, guildId, tangTuVi, crit, speed
```
