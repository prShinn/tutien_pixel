# 🏯 SYSTEM — Môn Phái / Bang Phái (Guild)

---

## Điều Kiện Thành Lập Bang

| Yêu cầu | Điều kiện |
|---------|-----------|
| Tu vi | Tối thiểu **Chân Nguyên Cảnh** (đại cảnh giới 4) |
| Vật phẩm | **Bang Lệnh Bài** × 1 (item đặc biệt, mua từ NPC Guild hoặc boss drop) |
| Xu | 10,000 xu phí thành lập |
| Thành viên | Tối thiểu 1 người (người thành lập = Bang Chủ) |

---

## Cấp Bậc Bang

| Cấp Bậc | Tên | Quyền Hạn |
|---------|-----|-----------|
| 1 | Bang Chủ | Toàn quyền, giải thể bang |
| 2 | Phó Bang Chủ | Mời/đuổi thành viên, quản lý quỹ |
| 3 | Trưởng Lão | Tham gia quyết định bang |
| 4 | Tinh Anh | Thành viên kỳ cựu |
| 5 | Tân Thủ | Thành viên mới |

---

## Tính Năng Bang

### Bang Kho (Guild Vault)
- Kho chung để chia sẻ vật phẩm giữa thành viên
- Cấp bậc khác nhau có quyền truy cập khác nhau

### Bang Chiến (Guild War)
- Trong sự kiện Chiến Tranh Chính-Ma, bang có thể tổ chức raid team
- Bang có nhiều kill nhất trong sự kiện: danh hiệu "Thiên Hạ Đệ Nhất Bang"

### Bang Nhiệm Vụ
- Mỗi ngày có nhiệm vụ bang riêng (kill X quái, donate X vật phẩm)
- Hoàn thành: nhận điểm công hiến → đổi phần thưởng

---

## Bang Data Structure

```json
{
  "id": 1,
  "name": "Thanh Long Các",
  "faction": "CHINH",
  "leaderId": 5,
  "members": [
    { "playerId": 5, "rank": 1, "joinDate": "2026-04-01" },
    { "playerId": 12, "rank": 3, "joinDate": "2026-04-05" }
  ],
  "level": 2,
  "xu": 50000,
  "notice": "Chào mừng đến Thanh Long Các!",
  "createdAt": "2026-04-01"
}
```

---

## UI Bang Phái (Tương Lai)

```
╔══════ BANG PHÁI ══════╗
║ Thanh Long Các  ☀️    ║
║ Bang Chủ: Huyền Thiên ║
║ Thành viên: 15/50     ║
║ Quỹ Bang: 50,000 xu   ║
╠═══════════════════════╣
║ [Thành Viên] [Kho]   ║
║ [Nhiệm Vụ]  [Lịch Sử]║
╚═══════════════════════╝
```

---

> **Priority**: Hệ thống bang phái là **phase 3** — sau khi hoàn thiện combat, map, và faction war trước.
