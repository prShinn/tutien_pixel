# 🧘 SYSTEM — Tu Luyện (Cultivation)

---

## Nguyên Tắc Cốt Lõi

> **Đánh quái KHÔNG tăng tu vi, KHÔNG lên cấp**  
> Tu vi chỉ tăng qua: Linh thạch, Đan dược, Linh đan

---

## Nguồn Tăng Tu Vi

| Nguồn | Loại vật phẩm | Tu vi tăng | Ghi chú |
|-------|---------------|-----------|---------|
| Linh thạch | `STONE` | `giaTriTuVi` | Vật phẩm phổ biến nhất |
| Linh đan tu vi | `DAN_TUVI` | `giaTriTuVi` | Hiệu quả cao hơn |
| Linh đan cảnh giới | `DAN_PHÁ_CANH` | Cho phép đột phá đại cảnh giới | Đặc thù |
| Ngũ Hành Đan | `DAN_NHANH` | Tu vi theo linh căn | Chỉ dùng được với linh căn khớp |

### Nguồn Tăng Stat Thuộc Tính
| Nguồn | Stat tăng |
|-------|-----------|
| Đá Nguyên Tố (ELEMSTONE) | str / agi / vit / ene theo loại |
| Ngũ Hành Linh Đan | Tăng `tuViLinhCan` |

---

## Công Thức Ngưỡng Tu Vi

```javascript
// Trong cultivation.js
function calcTuNeeded(realm, stage) {
  // realm: object cảnh giới { stt, tuViTienCap, heSoTang }
  // stage: tầng nhỏ 1-9
  const base = realm.tuViTienCap || 1000;
  const mult = realm.heSoTang || 1.25;
  // Tầng 1 = base, tầng 2 = base * mult, tầng 3 = base * mult^2...
  return Math.floor(base * Math.pow(mult, stage - 1));
}

function calcBreakthroughThreshold(realm, stage) {
  // Đỉnh phong (tầng 9): khó hơn 50%
  if (stage === 9) {
    return Math.floor(calcTuNeeded(realm, 9) * 1.5);
  }
  return calcTuNeeded(realm, stage);
}
```

### Ví dụ ngưỡng Luyện Thể (base=1000, mult=1.25)

| Tầng | Tu vi cần | Ghi chú |
|------|-----------|---------|
| 1 | 1,000 | |
| 2 | 1,250 | |
| 3 | 1,563 | |
| 4 | 1,953 | |
| 5 | 2,441 | |
| 6 | 3,052 | |
| 7 | 3,815 | |
| 8 | 4,768 | |
| 9 | **8,941** | ×1.5 đỉnh phong |

---

## Luồng Đột Phá Cảnh Giới

### Đột phá tầng nhỏ
```
1. Hấp thụ linh thạch/đan → tuViHienTai tăng
2. tuViHienTai >= tuViLenCap?
      YES → Đột phá tự động
           tangTuVi += 1
           tuViHienTai = 0
           tuViLenCap = calcTuNeeded(realm, tangTuVi_mới)
      NO  → Tiếp tục hấp thụ
```

### Đột phá đại cảnh giới (từ tầng 9 → tầng 1 cảnh giới mới)
```
1. Hiện tại: tangTuVi = 9, tuViHienTai >= breakthresholdTầng9
2. Cần kiểm tra: có "đan phá cảnh" trong inventory không?
3. Xác nhận từ người chơi
4. Dùng hết 1 đan phá cảnh
5. Chuyển sang đại cảnh giới tiếp theo
   maCanhGioi = next_realm.code
   tangTuVi = 1
   tuViHienTai = 0
   tuViLenCap = calcTuNeeded(next_realm, 1)
6. Hiển thị animation + UI log
7. Bonus: +5 điểm stat phân bổ + thông báo global
```

---

## Hấp Thu Linh Thạch

```javascript
// cultivation.js - absorbStone()
absorbStone() {
  const stones = S.inventory.filter(i => i.type === 'STONE' && i.giaTriTuVi > 0);
  if (!stones.length) { UI.log('Không có linh thạch', 'system'); return; }
  
  const stone = stones[0];
  S.player.tuViHienTai += stone.giaTriTuVi;
  UI.log(`+${stone.giaTriTuVi} tu vi`, 'success');
  
  Inventory.remove(stone.id, 1);
  Cultivation.checkBreakthrough();
}
```

---

## Đan Phá Cảnh Giới

| Đan Dược | Phá từ → vào | ID |
|----------|-------------|-----|
| Phi Thăng Đan | Luyện Thể → Khí Động | `DAN_PHI_THANG` |
| Khí Ngưng Đan | Khí Động → Ly Hợp | `DAN_KHI_NGUNG` |
| Ly Hợp Đan | Ly Hợp → Chân Nguyên | `DAN_LY_HOP` |
| Chân Nguyên Đan | Chân Nguyên → Thần Du | `DAN_CHAN_NGUYEN` |
| Thần Hành Đan | Thần Du → Siêu Phàm | `DAN_THAN_HANH` |
| Siêu Phàm Đan | Siêu Phàm → Nhập Thánh | `DAN_SIEU_PHAM` |
| Thánh Vị Đan | Nhập Thánh → Thánh Vương | `DAN_THANH_VI` |
| Hư Không Đan | Thánh Vương → Động Hư | `DAN_HU_KHONG` |
| Hư Vương Đan | Động Hư → Hư Vương | `DAN_HU_VUONG` |
| Đại Đạo Nguyên Đan | Hư Vương → Đạo Nguyên | `DAN_DAI_DAO` |
| Đế Nguyên Đan | Đạo Nguyên → Đế Tôn | `DAN_DE_NGUYEN` |
| Đại Đế Hóa Thân | Đế Tôn → Đại Đế | `DAN_DAI_DE` |

> Đan phá cảnh DROP từ boss cấp cao, hoặc craft từ nguyên liệu hiếm.

---

## Auto-Cultivation (Offline progress — tương lai)

Người chơi có thể để game tự động hấp thụ linh thạch khi offline nếu bật **Auto Luyện**:
- Backend tính thời gian offline × regen rate
- Khi login lại nhận tu vi tương ứng (cap offline 24h)

---

## UI Cultivation

```
[Hấp Thu Linh Thạch] [Phá Cảnh] [Tự Động Luyện ●]

Tu vi: [████████░░] 4,230 / 8,941  (Luyện Thể Tầng 9 - Đỉnh Phong)
Tu Vi Linh Căn: 1,234

⚠ Cần: Phi Thăng Đan × 1 để đột phá đại cảnh giới
```
