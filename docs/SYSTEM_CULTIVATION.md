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
## Quy tắc cân bằng mới

- Linh lực được lũy tiến xuyên suốt các đại cảnh giới; tầng 1 cảnh giới sau luôn cao hơn tầng 9 cảnh giới trước.
- Tầng nhỏ cần đủ linh lực và OVR tối thiểu.
- Tầng 9 dùng ngưỡng cao hơn 1.5 lần để chuẩn bị phá đại cảnh giới; tầng 1 của cảnh giới mới luôn có nền linh lực cao hơn ngưỡng này.
- Đại cảnh giới cần linh lực, OVR và đan phá cảnh; thiếu một điều kiện thì server từ chối.
- Hấp thụ tu vi bắt buộc đi qua `itemId` trong inventory, không nhận giá trị tu vi tự khai từ client.
## Tu vi linh căn và tài nguyên (MVP)

Tu vi linh căn không còn là nguồn tăng sức mạnh tuyến tính lớn. Sức mạnh thuộc tính được tách thành:

- Nền cảnh giới/tầng: `1 + (cảnh giới - 1) * 0.012 + (tầng - 1) * 0.002`.
- Thiên tài địa bảo: `min(1000, tuViLinhCan) * 0.00008`, tối đa `+8%` sức mạnh linh căn.
- OVR chỉ nhận tối đa `40` điểm từ phần tài nguyên này; cảnh giới, tầng, tu vi hiện tại, thuộc tính và trang bị vẫn là trụ cột chính.

API sử dụng vật phẩm là nguồn sự thật. Client không được tự gửi số lượng tu vi muốn cộng; server lấy `tuViLinhCanVal` từ item trong túi, chặn vượt trần 1000 và chỉ trừ item khi cộng thành công. Như vậy người vừa đột phá vẫn có nền tăng hợp lý, còn muốn vượt nền phải farm hoặc dùng thiên tài địa bảo có kiểm soát.

### Tích lũy vượt mốc và đột phá thủ công

Người chơi không tự động đột phá khi đủ tu vi. Có thể giữ linh lực vượt `tuViLenCap` để khiêu chiến vượt cấp:

- OVR cơ bản nhận tối đa 70 điểm từ phần tu vi trong mốc hiện tại.
- Phần vượt mốc cộng thêm tối đa 360 OVR, theo tỷ lệ giảm dần (`180 × (tuViHienTai / tuViLenCap - 1)`).
- Một đại cảnh giới có trọng số 1000 OVR, trong khi một tầng chỉ có trọng số 90 OVR; vì vậy tích lũy giúp vượt vài tầng nhưng không thể thay thế đột phá đại cảnh giới.
- Sức mạnh linh căn nhận tối đa thêm 8% từ linh lực trong cơ thể.
- Khi đột phá, server chỉ trừ đúng ngưỡng đột phá; phần linh lực dư vẫn giữ lại.
