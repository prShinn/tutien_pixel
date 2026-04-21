# ⚔️ SYSTEM — Phe Phái & Chiến Tranh (Faction)

---

## Hai Phe Phái

| Phe | Code | Biểu Tượng | Màu | Mô Tả |
|-----|------|-----------|-----|-------|
| Chính Đạo | `CHINH` | ☀️ | `#c8a84b` vàng | Tu tiên chân chính, bảo vệ thương dân |
| Ma Đạo | `MA` | 🌑 | `#cc44ff` tím | Truy cầu sức mạnh, không màng đạo đức |

> Cả hai phe vẫn tu tiên bình thường — chỉ khác nhau trong **sự kiện chiến tranh** hàng tuần

---

## Chọn Phe

- Khi tạo nhân vật → chọn phe **1 lần duy nhất**
- Không thể đổi phe sau khi đã chọn (hoặc cần điều kiện rất đặc biệt)
- Ảnh hưởng:
  - Tag tên hiển thị: `[☀️ Tên]` hoặc `[🌑 Tên]`
  - Kênh chat phe
  - Tham gia sự kiện theo phe
  - Nhận loot khác nhau từ sự kiện

---

## Sự Kiện Chiến Tranh Chính-Ma

### Lịch
- **Thời gian**: Mỗi Thứ 7, 20:00 - 22:00 (2 tiếng / tuần)
- **Thông báo**: 30 phút trước sự kiện có thông báo server
- **Địa điểm**: Bản đồ đặc biệt `chien_truong` (Chiến Trường)

### Cơ Chế

```
1. Mỗi phe có một "Tinh Tháp" cần bảo vệ
2. Player tiêu diệt player phe đối thủ → tích điểm cho phe
3. Phá hủy Tinh Tháp đối thủ = chiến thắng tức thì
4. Hết 2 tiếng → phe nhiều điểm hơn = chiến thắng

Điểm:
  - Kill 1 player đối thủ: +1 điểm
  - Kill Boss Chiến Trường: +5 điểm
  - Chiếm điểm chiến lược: +3 điểm / phút
```

### PvP Rules
- **Chỉ trong Chiến Trường** mới có PvP giữa 2 phe
- Bên ngoài sự kiện: không PvP
- Chết trong Chiến Trường: hồi sinh tại spawn phe, không mất đồ
- Drop rate tăng gấp đôi trong Chiến Trường

### Phần Thưởng

| Kết quả | Phần thưởng |
|---------|-------------|
| Phe thắng | 3× chiến tranh xu + Hòm Loot Sự Kiện + Danh hiệu "Chiến Thần tuần X" |
| Phe thua | 1× chiến tranh xu + Hòm Loot Nhỏ |
| MVP (kill nhiều nhất) | Thêm 1 Đan Phá Cảnh ngẫu nhiên |

---

## Chat Kênh Phe

```
[☀️] Huyền Thiên: Tập kết ở cổng Bắc!
[🌑] Lý Ma Vương: San bằng Tinh Tháp của chúng nó!
```

- Kênh `faction_chat` qua Socket.io
- Chỉ người cùng phe thấy

---

## Backend Data

```json
// Player field
{
  "faction": "CHINH"  // hoặc "MA"
}

// Socket events
// Khi sự kiện bắt đầu:
socket.emit('war_start', { mapCode: 'chien_truong', duration: 7200000 });

// Kill event:
socket.emit('war_kill', { killerId: socketId, victimId: socketId, faction: 'CHINH' });

// Score update:
socket.broadcast('war_score', { chinh: 45, ma: 38, timeLeft: 3600 });
```

---

## UI Chiến Tranh

```
═════════ CUỘC CHIẾN CHÍNH-MA ════════
  ☀️ CHÍNH: 45 điểm    |   🌑 MA: 38 điểm
  Thời gian còn lại: 01:02:45
  
  [Tinh Tháp Chính HP: ██████████ 100%]
  [Tinh Tháp Ma HP:    ████░░░░░░  40%]
══════════════════════════════════════
```

---

## Leaderboard Phe

- Sau mỗi sự kiện: lưu lịch sử thắng/thua theo tuần
- Hiển thị tỷ số tích lũy phe (mùa)
- Top 10 sát thủ mỗi tuần
