# ĐẶC TẢ THIẾT KẾ GIAO DIỆN: GIẢI PHÓNG TRỤC GIỮA (CLEAN-CENTER 4-CORNER HUD SPEC)

* **Dự án**: Tu Tiên Pixel Webgame
* **Phiên bản tài liệu**: 1.0.0 (Chốt phương án thiết kế)
* **Trạng thái**: Đã phê duyệt (Approved)
* **Mục tiêu**: Xóa bỏ điểm mù ở trục giữa màn hình, giải phóng 100% tầm nhìn hướng Nam (cầu, sông, đường đi, cổng dịch chuyển), gom gọn và làm mờ các thành phần HUD vào 4 góc màn hình.

---

## 1. TỔNG QUAN BỐ CỤC KHUNG NHÌN (MASTER WIREFRAME)

Toàn bộ giao diện game 16:9 được phân bổ theo nguyên tắc **"4-Corner Clean Dock"**:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [GÓC TRÊN TRÁI: THÔNG TIN NHÂN VẬT]                  [GIỮA TRÊN: TARGET]         [GÓC TRÊN PHẢI: MAP] │
│ ┌─────────────────────────────┐                      ┌───────────────────┐       ┌───────────────────┐│
│ │ [Avt] Thuần Dương Đạo Giả   │                      │ 👾 Xích Luyện Hổ  │       │ 🗺 Bản đồ thu nhỏ ││
│ │ HP ███████████████ 196/196  │                      │ HP ████████ 80/80 │       │ Sơn Cốc Thanh Vân ││
│ │ MP ████████████░░░ 106/106  │                      └───────────────────┘       │ 💰 50 Xu   [⚙][?] ││
│ │ Linh Căn: Kim | Luyện Thể 1 │                                                  └───────────────────┘│
│ └─────────────────────────────┘                                                                       │
│ ┌─────────────────────────────┐                                                                       │
│ │ 📜 Nhiệm vụ (Q)         [-] │                                                                       │
│ │ • Thử sức ở Bình Nguyên     │                                                                       │
│ │   Đánh bại yêu thú: 0/5     │                                                                       │
│ └─────────────────────────────┘                                                                       │
│                                                                                                       │
│                                           (PLAYER)                                                    │
│                                      Thuần Dương Đạo Giả                                              │
│                                               │                                                       │
│                                               │                                                       │
│                                       [CẦU GỖ QUA SÔNG]                                               │
│                                               │                                                       │
│                                               ▼                                                       │
│ ┌─────────────────────────────┐                                                  ┌──────────────────┐ │
│ │ [GÓC DƯỚI TRÁI: CHAT & MENU]│     ═══════════════════════════════════════      │ [GÓC DƯỚI PHẢI]  │ │
│ │ 💬 [Hệ thống] Đi tới Sơn Cốc│                                                  │ [CỤM KỸ NĂNG]    │ │
│ │ 💬 [Bang] Chào các đạo hữu! │         TRỤC CHÍNH GIỮA ĐÁY MÀN HÌNH             │                  │ │
│ │ ─────────────────────────── │                                                  │ ┌───┐ ┌─┐ ┌─┐ ┌─┐│ │
│ │ [Nhập chat...]         [Gửi]│             HOÀN TOÀN TRỐNG 100%                 │ │SPC│ │1│ │2│ │3││ │
│ │ ─────────────────────────── │                                                  │ │ĐÁNH││ ⚝ │ │ ☯ │ │ ⚔ ││ │
│ │ [Túi B] [Q] [Map M] [Auto Z]│       ===> NHÌN THẤY TOÀN BỘ CẦU <===            │ └───┘ └─┘ └─┘ └─┘│ │
│ │ [Nhặt:BẬT] [FX:BẬT] [Âm:BẬT]│       ===> VÀ CỔNG DỊCH CHUYỂN <===              │ Gọn gàng góc phải│ │
│ └─────────────────────────────┘     ═══════════════════════════════════════      └──────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. QUY CÁCH CHI TIẾT TỪNG THÀNH PHẦN

### 2.1. Trục giữa đáy màn hình (Bottom-Center Zone)
* **Trạng thái**: **Trống 100% (No UI Elements)**.
* **Thay đổi**:
  * Dời cụm `#kpah-hud-bottomright` ra khỏi tọa độ `left: 50%`.
  * Gỡ bỏ thanh gợi ý `#game-controls-hint` (thu nhỏ thành icon `[?]` tại cụm Minimap).
* **Mục đích**: Người chơi di chuyển xuống hướng Nam bằng phím WASD hoặc click chuột không bao giờ bị che khuất vật thể (cầu gỗ, mép nước, quái vật, NPC và cổng dịch chuyển).

---

### 2.2. Cụm kỹ năng góc phải (Bottom-Right Skill Dock)
* **Bộ chọn CSS**: `#kpah-hud-bottomright`
* **Vị trí**:
  * `position: fixed; right: 18px; bottom: 18px; left: auto; transform: none; z-index: 40;`
* **Kích thước**:
  * Chiều cao thu gọn: ~50px (hiện tại là 70px + margin).
  * Chiều rộng: ~280px (gọn gàng, vừa vặn góc phải).
* **Cấu trúc nút bấm**:
  * **Nút Đánh Thường (`.sk-main`)**: Kích thước `50px x 50px`, màu nhấn đồng đỏ `#542b34`, viền `#e7a17d`. Phím tắt `Space` hiển thị góc trên trái.
  * **4 Ô Kỹ Năng (`.sk-sub`)**: Kích thước `42px x 42px`, màu nền xanh thẫm `#182943`, viền `#6fabb7`. Các phím `1`, `2`, `3`, `4` đặt nhỏ góc trên.
* **Hiệu ứng Kính Mờ (Glassmorphism)**:
  * Nền: `rgba(12, 16, 26, 0.65)` kèm `backdrop-filter: blur(8px)`.
  * Viền: `1px solid rgba(215, 182, 90, 0.35)`.
  * Bo góc: `6px`.

---

### 2.3. Cụm Chat & Menu góc trái (Bottom-Left Smart Console)
* **Bộ chọn CSS**: `#kpah-hud-bottomleft`
* **Vị trí**: `position: fixed; left: 18px; bottom: 18px; z-index: 40; width: 320px;`
* **Các thành phần hợp nhất**:
  1. **Khung Thông báo / Chat (`#kpah-chat-log`, `#log-area`)**:
     * Chiều cao giới hạn: `80px` (hiển thị 3–4 dòng tin nhắn gần nhất).
     * **Cơ chế Tự động mờ (Auto-Fade)**:
       * Sau **6 giây** không có tin nhắn mới hoặc không di chuột vào: Nền chuyển thành trong suốt 100% (`background: transparent`), chữ mờ xuống `opacity: 0.35`.
       * Khi có tin nhắn mới hoặc người chơi rê chuột vào: Lập tức phục hồi `opacity: 1` và nền kính mờ `rgba(10, 14, 24, 0.75)`.
  2. **Thanh Nhập Chat (`#chat-bar`)**:
     * Mặc định ẩn (`display: none`), chỉ bật lên khi bấm nút `[Chat]` hoặc phím `Enter`.
  3. **Dải nút chức năng một dòng (Unified Menu Strip - `.bottom-btns`)**:
     * Thay vì chia 2 hàng nút cồng kềnh, xếp gọn thành 1 hàng ribbon mỏng cao `32px`:
     * Các nút chính: `[🎒 Túi (B)]` `[📜 Q]` `[🗺 Map]` `[⚔ Auto]` `[⚙ Cài Đặt]`.
     * Nút `[⚙ Cài Đặt]` gom popup 3 nút gạt: Âm thanh, Tự nhặt và FX chiêu thức.

---

### 2.4. Bảng Nhiệm vụ Mép trái (Collapsible Quest Tracker)
* **Bộ chọn CSS**: `#quest-tracker`
* **Vị trí**: `position: fixed; left: 18px; top: 110px; width: 220px; z-index: 30;`
* **Tính năng Thu Gọn**:
  * Thêm nút gạt `[-]` ở tiêu đề.
  * Khi bấm `[-]`: Bảng co lại thành một tab mỏng rộng 36px hoặc chỉ còn 1 dòng tiêu đề `📜 Nhiệm vụ (1/3)`.
  * Mở rộng lại khi click vào tab.
* **Hiệu ứng**: Nền kính mờ bán trong suốt `rgba(15, 18, 28, 0.55)`, viền mảnh.

---

### 2.5. Thanh Thông tin Nhân vật (Top-Left Status)
* **Bộ chọn CSS**: `#kpah-hud-topleft`
* **Vị trí**: `position: fixed; left: 18px; top: 14px; z-index: 30;`
* **Quy chuẩn**: Giữ nguyên thông tin nhưng tinh giản độ dày của thanh máu HP và linh lực MP (chiều cao 8px, thanh thoát hiện đại).

---

### 2.6. Hiển thị & Tương tác Cổng Dịch Chuyển (Portal Enhancements)
* **Trên Canvas (`render.js`)**:
  * **Cột sáng thần tiên (Light Beacon)**: Vẽ cột sáng xanh ngọc phát quang thẳng đứng chiếu lên trời cao ~40px từ tâm cổng. Dù chân cổng sát mép map, cột sáng vẫn luôn nổi lên trên mắt nhìn.
  * **Bảng tên nổi (World Label)**: Vẽ nhãn chữ vàng kim viền đen lơ lửng `[ ⛩ Thanh Vân Trấn ]` tại tọa độ `(portal.x, portal.y - 25)`.
* **Tương tác**:
  * Tăng nhẹ bán kính tiếp nhận va chạm từ 14px lên **22px** (`CFG.PORTAL_RADIUS`), giúp người chơi vừa bước tới chân cầu là cổng đã kích hoạt mượt mà.
  * Hỗ trợ click chuột thẳng vào bảng tên cổng để nhân vật tự động tìm đường bước qua.

---

## 3. LỘ TRÌNH TRIỂN KHAI KỸ THUẬT (ROADMAP)

1. **Giai đoạn 1 (CSS Restructure)**:
   - Cập nhật `style.css` và `game-hub.css`:
     - Di chuyển `#kpah-hud-bottomright` sang góc phải (`right: 18px; bottom: 18px`).
     - Thu gọn kích thước nút kỹ năng và chuyển sang nền kính mờ `backdrop-filter: blur(8px)`.
     - Ẩn `#game-controls-hint` giữa màn hình, thêm nút toggle trợ giúp nhỏ cạnh Minimap.
     - Gom hàng nút chức năng `.bottom-btns` thành 1 hàng tinh gọn.
2. **Giai đoạn 2 (Interactive JS Logic)**:
   - Thêm bộ đếm tự động làm mờ (Auto-fade timer 6s) cho `#kpah-chat-log` trong `ui.js`.
   - Thêm nút thu gọn toggle collapse cho `#quest-tracker` trong `quest-ui.js`.
3. **Giai đoạn 3 (Canvas Portal Polish)**:
   - Nâng cấp hàm `Render.portal` trong `render.js` để vẽ cột sáng Beacon và bảng tên map đến lơ lửng.
4. **Giai đoạn 4 (Verification & Regression Tests)**:
   - Chạy toàn bộ test suite `140/140 tests` bảo đảm không ảnh hưởng đến API contract và game logic.
   - Kiểm tra hiển thị thực tế trên màn hình chuẩn 1920x1080 và responsive.

