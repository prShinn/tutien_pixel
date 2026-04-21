# 🌌 SYSTEM — Cảnh Giới (Realm)

---

## Danh Sách Đại Cảnh Giới

| STT | Mã Code | Tên Cảnh Giới | Số Tầng Nhỏ | Ghi Chú |
|-----|---------|---------------|-------------|---------|
| 1 | LUYEN_THE | Luyện Thể Cảnh | 9 | Khởi đầu — rèn luyện thân thể |
| 2 | KHI_DONG | Khí Động Cảnh | 9 | Vận hành linh khí lần đầu |
| 3 | LY_HOP | Ly Hợp Cảnh | 9 | Ly khai thân xác, hợp nhất linh khí |
| 4 | CHAN_NGUYEN | Chân Nguyên Cảnh | 9 | Ngưng tụ chân nguyên |
| 5 | THAN_DU | Thần Du Cảnh | 9 | Thần thức du lịch ngoài thân |
| 6 | SIEU_PHAM | Siêu Phàm Cảnh | 9 | Vượt qua giới hạn phàm nhân |
| 7 | NHAP_THANH | Nhập Thánh Cảnh | 9 | Bước vào cửa Thánh |
| 8 | THANH_VUONG | Thánh Vương Cảnh | 9 | Thống lĩnh các Thánh |
| 9 | DONG_HU | Động Hư Cảnh | 9 | Thông hiểu hư vô |
| 10 | HU_VUONG | Hư Vương Cảnh | 9 | Vương giữa hư không |
| 11 | DAO_NGUYEN | Đạo Nguyên Cảnh | 9 | Truy cầu nguồn gốc Đại Đạo |
| 12 | DE_TON | Đế Tôn Cảnh | 9 | Đế vương được tôn kính muôn đời |
| 13 | DAI_DE | Đại Đế | **1** | Đỉnh cao tuyệt đối — duy nhất 1 tầng |

> **Tổng cộng**: 12 × 9 + 1 = **109 tầng**

---

## Cơ Chế Phá Cảnh Giới

### Điều kiện đột phá tầng nhỏ (trong cùng đại cảnh giới)
- Đạt đủ **tu vi ngưỡng** của tầng hiện tại
- Dùng **linh thạch** hoặc **đan dược tu vi thường**

### Điều kiện đột phá đại cảnh giới (sang đại cảnh giới kế tiếp)
- Đang ở **Tầng 9** của đại cảnh giới hiện tại
- Đạt đủ tu vi ngưỡng **đặc biệt** (cao hơn tầng 9 thường)
- Cần **đan dược phá cảnh đặc thù** (xem `SYSTEM_ITEMS.md`)
- Thời gian "cày" ở đỉnh phong (tầng 9) phải **lâu hơn đáng kể**

---

## Công Thức Tu Vi

### Ngưỡng tu vi mỗi tầng nhỏ

```
base_tu_vi(realm, stage) = base × multiplier ^ (realm_idx × 9 + stage - 1)

Trong đó:
- base = 1000 (tu vi khởi điểm tầng 1)
- multiplier = 1.25 (mỗi tầng tăng 25%)
- realm_idx = 0..11 (0 = Luyện Thể, 11 = Đế Tôn)
- stage = 1..9
```

### Ví dụ ngưỡng tu vi (chuẩn)

| Cảnh giới | Tầng | Tu vi cần | Ghi chú |
|-----------|------|-----------|---------|
| Luyện Thể 1 | 1 | 1,000 | Start |
| Luyện Thể 5 | 5 | ~3,052 | |
| Luyện Thể 9 | 9 | ~7,451 | |
| Khí Động 1 | 10 | ~9,313 | Phá đại cảnh giới |
| Khí Động 9 | 18 | ~35,527 | |
| Chân Nguyên 1 | 28 | ~135,525 | |
| Đế Tôn 9 | 108 | ~massive | |
| Đại Đế | 109 | ~∞ | 1 tầng duy nhất, không có threshold |

### Hệ số phá đại cảnh giới
- Ngưỡng phá đại cảnh giới = tu vi tầng 9 của đại cảnh × **1.5** (50% thêm)
- `đỉnh phong extra = 1.5× bình thường`

---

## Backend Data Structure

```json
// GET /api/canh-gioi
[
  {
    "stt": 1,
    "code": "LUYEN_THE",
    "tenCanhGioi": "Luyện Thể Cảnh",
    "soTang": 9,
    "tuViTienCap": 1000,
    "heSoTang": 1.25,
    "moTa": "Khởi đầu của vạn dặm tu tiên",
    "danPhaCanh": null
  },
  {
    "stt": 2,
    "code": "KHI_DONG",
    "tenCanhGioi": "Khí Động Cảnh",
    "soTang": 9,
    "tuViTienCap": 9313,
    "heSoTang": 1.25,
    "moTa": "Vận hành linh khí, khai phá kinh mạch",
    "danPhaCanh": "PHI_THANG_DAN"
  }
]
```

### Field giải thích
- `stt`: Thứ tự (1-13)
- `code`: Mã định danh
- `tenCanhGioi`: Tên hiển thị
- `soTang`: Số tầng nhỏ (9 hoặc 1 cho Đại Đế)
- `tuViTienCap`: Tu vi base cần để BẮT ĐẦU cảnh giới này
- `heSoTang`: Hệ số nhân tu vi mỗi tầng (≥ 1.2)
- `danPhaCanh`: ID đan dược cần để phá đại cảnh giới (null = không cần)

---

## Hiển Thị UI

```
Cảnh giới: [Chân Nguyên Cảnh]  Tầng [3]
Tu vi: [████████░░] 45,230 / 67,890
```

- Màu sắc cảnh giới theo rank:
  - Luyện Thể → Ly Hợp: `#aaaaaa` (xám)
  - Chân Nguyên → Siêu Phàm: `#55cc55` (xanh lá)
  - Nhập Thánh → Thánh Vương: `#4499ff` (xanh dương)
  - Động Hư → Hư Vương: `#cc44ff` (tím)
  - Đạo Nguyên → Đế Tôn: `#ff8800` (cam)
  - Đại Đế: `#ff3333` với glow effect (đỏ rực)

---

## Ảnh Hưởng Đến Chiến Lực

Mỗi tầng cảnh giới tăng chiến lực:
```
cp_realm_bonus = realm_stt × 150 + stage × 20
```

Xem `SYSTEM_CHARACTER.md` để biết công thức tổng chiến lực.
