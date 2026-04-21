# 💊 SYSTEM — Vật Phẩm (Items)

---

## Phân Loại Vật Phẩm

| Type Code | Tên | Mô tả |
|-----------|-----|-------|
| `STONE` | Linh Thạch | Hấp thụ → tăng tu vi |
| `DAN_TUVI` | Đan Dược Tu Vi | Hiệu quả cao hơn linh thạch |
| `DAN_PHÁ_CANH` | Đan Phá Cảnh | Điều kiện đột phá đại cảnh giới |
| `DAN_LINH_CAN` | Ngũ Hành Linh Đan | Tăng tu vi linh căn |
| `ELEMSTONE` | Đá Nguyên Tố | Tăng 1 stat cơ bản |
| `CONSUME` | Tiêu Hao | HP potion, MP potion... |
| `MAT_DAN` | Nguyên Liệu Luyện Đan | Craft đan dược |
| `MAT_CRAFT` | Nguyên Liệu Nâng Cấp Đồ | Nâng chỉ số / thăng phẩm |
| `EQUIP` | Trang Bị | Vũ khí, giáp, phụ kiện |
| `QUEST` | Nhiệm Vụ | Không thể bán/bỏ |
| `SPECIAL` | Đặc Biệt | Sự kiện, bang phái... |

---

## Chi Tiết Từng Loại

### 💎 Linh Thạch (STONE)

| ID | Tên | Tu vi tăng | Rơi từ |
|----|-----|-----------|--------|
| `STONE_NHO` | Linh Thạch Nhỏ | 50 | Quái thường |
| `STONE_THUONG` | Linh Thạch Thường | 200 | Quái thường/Elite |
| `STONE_LON` | Linh Thạch Lớn | 800 | Elite, Boss |
| `STONE_TINH_KHI` | Tinh Khí Thạch | 3,000 | Boss vùng |
| `STONE_LINH_TINH` | Linh Tinh Thạch | 10,000 | Boss sự kiện, hiếm |

---

### 💊 Đan Dược Tu Vi (DAN_TUVI)

| ID | Tên | Tu vi tăng | Luyện từ | Mua NPC |
|----|-----|-----------|---------|--------|
| `DAN_TU_1` | Hồi Linh Đan | 500 | Nguyên liệu cấp 1 | 200 xu |
| `DAN_TU_2` | Tụ Khí Đan | 2,000 | NL cấp 2 | Không |
| `DAN_TU_3` | Ngưng Thần Đan | 8,000 | NL cấp 3 | Không |
| `DAN_TU_4` | Chân Nguyên Đan | 30,000 | NL hiếm | Không |
| `DAN_TU_5` | Đại Thành Đan | 120,000 | Boss loot | Không |

---

### 🌟 Đan Phá Cảnh (DAN_PHÁ_CANH)

Xem `SYSTEM_CULTIVATION.md` — danh sách đầy đủ 12 loại đan phá cảnh

---

### 🔮 Ngũ Hành Linh Đan (DAN_LINH_CAN)

| ID | Tên | Linh căn | Tu vi linh căn tăng |
|----|-----|---------|---------------------|
| `DAN_KIM_1` | Kim Nguyên Đan | KIM | 100 |
| `DAN_MOC_1` | Mộc Linh Đan | MOC | 100 |
| `DAN_THUY_1` | Thủy Tinh Đan | THUY | 100 |
| `DAN_HOA_1` | Hỏa Tinh Đan | HOA | 100 |
| `DAN_THO_1` | Thổ Nguyên Đan | THO | 100 |
| `DAN_QUANG_1` | Quang Minh Đan | QUANG | 100 |
| `DAN_AM_1` | Huyền Ám Đan | AM | 100 |
| `DAN_LOI_1` | Lôi Ẩn Đan | LOI | 100 |
| `DAN_PHONG_1` | Phong Linh Đan | PHONG | 100 |

---

### 🧪 Đá Nguyên Tố (ELEMSTONE)

| ID | Tên | Stat tăng | Lượng |
|----|-----|-----------|-------|
| `ELEM_STR` | Lực Nguyên Thạch | str +1 | Nhỏ |
| `ELEM_AGI` | Tốc Nguyên Thạch | agi +1 | Nhỏ |
| `ELEM_VIT` | Thể Nguyên Thạch | vit +1 | Nhỏ |
| `ELEM_ENE` | Linh Nguyên Thạch | ene +1 | Nhỏ |
| `ELEM_STR_L` | Lực Nguyên Thạch (Lớn) | str +5 | Hiếm |

---

### 🩹 Tiêu Hao (CONSUME)

| ID | Tên | Hiệu ứng | Mua NPC |
|----|-----|----------|--------|
| `HP_POT_S` | Huyết Ngọc Nhỏ | HP +50% maxHP | 50 xu |
| `HP_POT_L` | Huyết Ngọc Lớn | HP +100% maxHP | 150 xu |
| `MP_POT_S` | Tinh Lực Ngọc Nhỏ | MP +50% maxMP | 40 xu |
| `MP_POT_L` | Tinh Lực Ngọc Lớn | MP +100% maxMP | 120 xu |
| `BUFF_TANHU` | Buff Tân Thủ | +30% all stats 30p | Miễn phí |

---

### ⚗️ Nguyên Liệu Luyện Đan (MAT_DAN)

| ID | Tên | Nguồn | Dùng craft |
|----|-----|-------|-----------|
| `MAT_THAO_1` | Linh Thảo | Drop quái Mộc, hái trên map | Hồi Linh Đan |
| `MAT_THAO_2` | Hoa Lưu Ly | Elite Mộc | Tụ Khí Đan |
| `MAT_QUANG_1` | Ánh Tinh Thạch | Boss Quang | Quang Minh Đan |
| `MAT_LONG_1` | Long Vảy | Boss Dragon-type | Đại Thành Đan |
| `MAT_HOA_1` | Hỏa Tinh | Drop quái Hỏa | Hỏa Tinh Đan |

---

### 🔨 Nguyên Liệu Nâng Cấp Đồ (MAT_CRAFT)

| ID | Tên | Dùng cho | Nguồn |
|----|-----|---------|-------|
| `CRAFT_STONE` | Nâng Cấp Thạch Nhỏ | Enhance +1 đến +5 | Shop, drop |
| `CRAFT_STONE_L` | Nâng Cấp Thạch Lớn | Enhance +6 đến +10 | Boss drop |
| `CRAFT_THANG_1` | Tinh Hoa Rèn Thăng | Thăng phẩm Thường→Bảo Khí | Drop, craft |
| `CRAFT_THANG_2` | Tinh Hoa Thần Linh | Thăng phẩm Bảo Khí→Linh Khí | Boss hiếm |

---

## Backend Data Structure

```json
// GET /api/items — mẫu
{
  "id": 1,
  "maDo": "STONE_NHO",
  "tenDo": "Linh Thạch Nhỏ",
  "icon": "💎",
  "loai": "STONE",
  "giaTriTuVi": 50,
  "giaMua": 0,
  "giaBan": 10,
  "moTa": "Linh thạch nhỏ chứa đựng linh khí cơ bản"
}
```

```json
{
  "id": 10,
  "maDo": "ELEM_STR",
  "tenDo": "Lực Nguyên Thạch",
  "icon": "🔴",
  "loai": "ELEMSTONE",
  "str": true,
  "giaTriTang": 1,
  "statKey": "str",
  "giaMua": 0,
  "giaBan": 50,
  "moTa": "Tăng 1 điểm Sức Mạnh vĩnh viễn"
}
```

---

## Inventory Rules

- Tối đa **40 slot** (`CFG.INV_MAX = 40`)
- Stack: Linh thạch, đan dược, nguyên liệu có thể stack (max 99/stack)
- Trang bị: không stack (mỗi item 1 slot)
- Full inventory: loot rơi xuống đất (groundItems)

---

## Shop NPC Sell List

NPC ở thành trấn bán:
- HP/MP potion (mọi cấp)
- Linh thạch nhỏ (giá cao hơn drop)
- Buff Tân Thủ (1 lần/ngày miễn phí)
- Nguyên liệu nâng cấp cơ bản
