# 🧑‍💼 SYSTEM — NPC

---

## Loại NPC

| type | Tên | Tương tác | Có ở đâu |
|------|-----|-----------|---------|
| `dialog` | NPC Hội Thoại | Chuỗi dialog | Thành trì, làng |
| `shop` | Thương Nhân | Mở shop modal | Thành trì |
| `chest` | Rương Báu | Mở 1 lần → loot | Hang động, bản đồ ẩn |
| `quest` | Quest NPC | Nhận/nộp nhiệm vụ | Thành trì, làng |
| `craft` | Luyện Đan Sư | UI craft đan dược | Thành trì |
| `enhance` | Thợ Rèn | UI nâng cấp trang bị | Thành trì |
| `guild` | Bang Chủ NPC | Thành lập bang | Thành trì lớn |

---

## NPC Tân Thủ (Mặc Định Tại Thanh Vân Trấn)

### Trưởng Lão Thanh Vân
- **Type**: `dialog`
- **Nhiệm vụ**: Giải thích game, tặng buff tân thủ
- **Dialog tree**:
```
"Chào mừng tu sĩ trẻ đến Thanh Vân Trấn!"
  → [Xin buff giúp đỡ] → Tặng Buff Tân Thủ 30p + 5 Linh Thạch Nhỏ
  → [Hỏi về con đường tu tiên] → Thông tin hệ thống
  → [Đóng]
```

### Lão Thương (Shop)
- **Type**: `shop`
- **Bán**: HP potion, MP potion, Linh Thạch Nhỏ, Nâng Cấp Thạch
- **Mua lại**: Tất cả vật phẩm của player với giá `giaBan`

### Thợ Rèn Thiết Kim
- **Type**: `enhance`
- **Chức năng**: Nâng cấp chỉ số trang bị (+1 đến +10/20)
- **UI**: Chọn trang bị + nguyên liệu → confirm → roll tỷ lệ thành công

---

## Shop System

### Shop Modal Layout
```
┌────────────────────────────────────────┐
│ 🏪 Lão Thương          💰 1,230 xu  ✕ │
├─────────────────────┬──────────────────┤
│  MUA VẬT PHẨM       │  BÁN VẬT PHẨM  │
│  💊 Huyết Ngọc Nhỏ  │  💎 Linh Thạch  │
│     50 xu           │     ×3 | Bán: 30 │
│  [Mua]              │                  │
│  🧪 Tinh Lực Ngọc   │  ⚔ Luyện Thể Kiếm│
│     40 xu           │     | Bán: 50    │
│  [Mua]              │  [Bán]           │
└─────────────────────┴──────────────────┘
```

### Logic Mua
```javascript
// shop.js - buy(itemId)
buy(itemId) {
  const item = CFG.ITEMS[itemId];
  if (!item || item.giaMua <= 0) return;
  if (S.player.xu < item.giaMua) { UI.log('Không đủ xu', 'err'); return; }
  if (S.inventory.length >= CFG.INV_MAX) { UI.log('Túi đồ đầy', 'err'); return; }
  S.player.xu -= item.giaMua;
  Inventory.add({ ...item, count: 1 });
  UI.log(`Mua ${item.name} - ${item.giaMua} xu`, 'success');
}
```

---

## Dialog System

```json
// NPC dialog tree trong map data
{
  "id": "NPC_TRUONG_LAO",
  "name": "Trưởng Lão Thanh Vân",
  "type": "dialog",
  "dialogTree": [
    {
      "id": "root",
      "text": "Chào mừng tu sĩ trẻ đến Thanh Vân Trấn! Đây là nơi bắt đầu hành trình tu tiên của ngươi.",
      "options": [
        { "text": "Xin Trưởng Lão ban cho ta sức mạnh", "next": "buff" },
        { "text": "Hỏi về tu tiên", "next": "info" },
        { "text": "Đóng", "action": "close" }
      ]
    },
    {
      "id": "buff",
      "text": "Tốt! Ta sẽ ban cho ngươi Buff Tân Thủ. Hãy tận dụng tốt!",
      "action": "give_buff_tanhu",
      "options": [
        { "text": "Cảm ơn Trưởng Lão", "action": "close" }
      ]
    }
  ]
}
```

---

## NPC Backend Data

```json
// Trong map.npcs
{
  "id": "NPC_LAO_THUONG",
  "name": "Lão Thương",
  "type": "shop",
  "color": "#c8a84b",
  "x": 25,
  "y": 22,
  "px": 816,
  "py": 720,
  "shopItems": ["HP_POT_S", "HP_POT_L", "MP_POT_S", "MP_POT_L", "STONE_NHO", "BUFF_TANHU"]
}
```

---

## Rương Báu (Chest)

- Xuất hiện trên bản đồ với animation nhấp nháy
- Tương tác 1 lần (per-player, không reset)
- Có thể chứa: linh thạch, linh đan, trang bị ngẫu nhiên theo khu vực
- Trạng thái `used = true` sau khi mở

```javascript
// world.js - checkNpcInteract()
Chest.open(npc) {
  if (npc.used) { UI.log('Rương đã trống', 'system'); return; }
  npc.used = true;
  const loot = rollLoot(npc.lootTable);
  loot.forEach(item => Inventory.add(item));
  UI.log(`Tìm thấy: ${loot.map(i=>i.name).join(', ')}`, 'loot');
}
```

---

## Craft NPC (Luyện Đan Sư)

```
[Chọn công thức]  |  [Nguyên liệu cần]    |  [Sản phẩm]
Hồi Linh Đan     |  Linh Thảo ×2          |  Hồi Linh Đan ×1
                 |  Tinh Khí Thạch ×1     |  
[Luyện Đan]      |  Tỷ lệ thành công: 90% |
```
