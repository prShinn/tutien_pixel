# 👾 SYSTEM — Quái Vật (Monsters)

---

## Nguyên Tắc

> Đánh quái/boss chỉ rơi **đồ + xu + nguyên liệu** — **KHÔNG tăng tu vi, KHÔNG tăng cấp**

---

## Phân Loại Quái

| Loại | Tag | HP | ATK | DEF | Loot | Respawn |
|------|-----|----|-----|-----|------|---------|
| Quái Thường | `NORMAL` | ×1 | ×1 | ×1 | Thấp | 420 ticks |
| Quái Elite | `ELITE` | ×3 | ×2 | ×1.5 | Trung | 600 ticks |
| Mini Boss | `MINI_BOSS` | ×8 | ×3 | ×2 | Cao | 1200 ticks |
| Boss Vùng | `BOSS` | ×20 | ×5 | ×3 | Rất cao (boss pool) | 3600 ticks |
| Boss Sự Kiện | `EVENT_BOSS` | ×50 | ×8 | ×5 | Đặc biệt | Theo sự kiện |

---

## Công Thức Chỉ Số Quái

```javascript
function makeMonsterStats(monDef) {
  const lvl = monDef.level || 1;
  const typeMultMap = { NORMAL: 1, ELITE: 3, MINI_BOSS: 8, BOSS: 20 };
  const tm = typeMultMap[monDef.type] || 1;
  
  return {
    maxHp:  Math.floor((80 + lvl * 25)  * tm),
    pAtk:   Math.floor((8  + lvl * 3.5) * tm),
    mAtk:   Math.floor((5  + lvl * 2.5) * tm),
    pDef:   Math.floor((3  + lvl * 1.5) * tm),
    speed:  2 + lvl * 0.05,
    expXu:  Math.floor((5  + lvl * 3)   * tm),  // xu rơi
  };
}
```

---

## Ngũ Hành Quái Vật

Quái vật có thể mang 1-2 **ngũ hành**. Ngũ hành ảnh hưởng:
- **Tương sinh**: Được buff bởi hành sinh ra nó (ví dụ Mộc quái được Thổ quái gần đó buff)
- **Tương khắc**: Chịu thêm damage từ hành khắc (ví dụ Kim quái nhận thêm từ Hỏa skill)
- **Resistance**: Giảm damage từ hành **bị nó khắc**

---

## Danh Sách Quái Vật Mẫu

### Thảo Nguyên / Đồng Bằng (Level 1-10)

| Tên | Ngũ Hành | Loại | Lv range | Đặc điểm | Loot đặc trưng |
|-----|---------|------|---------|----------|----------------|
| Hoang Sói | KIM | NORMAL | 1-5 | AI đơn giản, chase | Nanh sói, da sói |
| Thổ Heo Rừng | THO | NORMAL | 1-5 | Húc vào khi gần | Da thô, thịt dã thú |
| Độc Thảo Yêu | MOC | NORMAL | 3-8 | Bắn gai độc | Dược thảo, hạt giống |
| Hỏa Cáo | HOA/AM | NORMAL | 5-10 | Nhanh, buff Fire | Lông cáo lửa |
| Thạch Golem | THO | ELITE | 5-12 | Chậm, HP cao | Mảnh đá linh, quặng |
| Sơn Lợn Rừng | THO | NORMAL | 2-6 | Charge tấn công | Răng nanh, lông |

### Núi / Hang Động (Level 10-25)

| Tên | Ngũ Hành | Loại | Lv range | Đặc điểm | Loot đặc trưng |
|-----|---------|------|---------|----------|----------------|
| Yêu Lang | KIM/AM | ELITE | 10-18 | Bầy đàn, howl buff | Mắt lang yêu, máu lang |
| Mộc Tinh (Thụ Tinh) | MOC | ELITE | 8-15 | Root skill | Thụ nhựa, mộc linh |
| Thạch Quy Linh | THO | NORMAL | 12-20 | Rut vào mai (giảm DMG) | Giáp quy, linh thạch nhỏ |
| Hàn Băng Nhện | THUY | NORMAL | 15-22 | Slow web | Tơ băng, nội đan nhện |
| Lôi Ưng | LOI | ELITE | 18-25 | Bay, Chain lightning | Lông ưng lôi, mảnh đá lôi |

### Vùng Đất Nguy Hiểm (Level 25+)

| Tên | Ngũ Hành | Loại | Lv range | Đặc điểm | Loot đặc trưng |
|-----|---------|------|---------|----------|----------------|
| Yêu Hồ | HOA/AM | ELITE | 25-35 | Charm effect | Bản linh cầm, đan hồ ly |
| Hắc Long Tiểu | AM/LOI | MINI_BOSS | 30-40 | AoE breath | Vảy đen, long tinh |
| Kim Thuẫn Rùa | KIM/THO | BOSS | 35-50 | Phase 2 sau 50% HP | Giáp Thần, Linh Thạch Kimth |
| Hỏa Phụng Hoàng | HOA/QUANG | BOSS | 50+ | Hồi sinh 1 lần | Vũ Hoàng Kim, Viêm Đơn |

---

## Boss Mechanics

### HP phases
```
Boss thường: 1 phase
Boss cấp cao:
  Phase 1 (100% → 60%): Pattern thường
  Phase 2 (60% → 30%): Tăng speed + thêm skill AoE
  Phase 3 (30% → 0%): Enrage — damage tăng 50%, speed tăng
```

### Co-op scaling
- Player trong aggro range: N người
- Boss HP ×(1 + (N-1) × 0.5) — ví dụ 3 người: ×2 HP
- Loot pool mỗi người nhận riêng

---

## Loot Table

```json
// Mẫu loot table cho Yêu Lang
{
  "monsterId": "YEU_LANG",
  "lootTable": [
    { "itemId": "MAT_LANG_NANH", "chance": 0.60, "min": 1, "max": 2 },
    { "itemId": "MAT_LANG_MAU",  "chance": 0.40, "min": 1, "max": 1 },
    { "itemId": "STONE_LINH_NHO","chance": 0.25, "min": 1, "max": 3 },
    { "itemId": "SWORD_BAO_KHI_1","chance": 0.05,"min": 1, "max": 1 },
    { "itemId": "xu",            "chance": 1.00, "min": 15,"max": 35 }
  ]
}
```

---

## AI States

```
idle      → patrol xung quanh spawn
aggro     → chase player (trong aggro range: CFG.MON_AGGRO = 4.2 tile)
attack    → đánh khi gần (trong attack range)
return    → về spawn khi bị kéo quá xa (leash: CFG.MON_LEASH = 11 tile)
dead      → chờ respawn
```

---

## Backend Data Structure

```json
// Trong map.npcs hoặc map.monsters (từ /api/worlds/by-code)
{
  "id": "YEU_LANG_1",
  "name": "Yêu Lang",
  "icon": "🐺",
  "type": "ELITE",
  "level": 12,
  "nguHanh": ["KIM", "AM"],
  "color": "#8855cc",
  "spawnX": 15,
  "spawnY": 20,
  "lootTableId": "YEU_LANG"
}
```
