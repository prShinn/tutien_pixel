# GAME DESIGN — Vạn Cổ Đế Tôn (bản bám code)

> Đây là design đã đối chiếu với implementation hiện tại. Mục “Mở rộng sau MVP” không được xem là tính năng đã chạy.

## 1. Bối cảnh và kịch bản MVP

Người chơi bắt đầu tại **Thanh Vân Trấn**, một thành phố an toàn có NPC hướng dẫn và shop. Sau khi chọn tên, giới tính và linh căn, người chơi đi qua trận pháp không gian tới **Bình Nguyên Hoang Dã**.

Tại Bình Nguyên, người chơi khám phá địa hình, tìm bãi quái, đánh quái để nhận xu/vật phẩm, hấp thụ linh thạch, tích lũy linh lực và tự quyết định thời điểm đột phá. Người chơi có thể giữ linh lực vượt mốc để tạo lợi thế khiêu chiến vượt tầng, nhưng cảnh giới vẫn là nền sức mạnh lớn nhất.

## 2. Vòng lặp gameplay đã chạy

```text
Đăng nhập/demo
  → tạo nhân vật
  → vào Thanh Vân Trấn
  → đi tới portal
  → sang Bình Nguyên Hoang Dã
  → khóa quái và áp sát
  → đánh thường/kỹ năng
  → nhận loot/xu
  → dùng vật phẩm tăng tu vi
  → tích lũy hoặc đột phá thủ công
  → tiếp tục khám phá bãi quái
```

## 3. Điều khiển PC webgame

| Thao tác | Chức năng |
|---|---|
| WASD/mũi tên | Di chuyển |
| Click nền | Đi tới vị trí chỉ định |
| Click quái | Khóa mục tiêu và tự áp sát |
| Space | Đánh thường |
| 1–4 | Dùng skill chủ động đã trang bị |
| F | Tương tác NPC |
| Enter | Mở chat |
| Esc | Bỏ mục tiêu/đóng thao tác |

## 4. Nhân vật và linh căn

MVP có 9 linh căn: KIM, MOC, THUY, HOA, THO, QUANG, AM, PHONG, LOI.

Mỗi linh căn có:

- Skill tấn công đơn mục tiêu.
- Skill tấn công diện rộng.
- Skill đặc trưng/buff/debuff.
- Skill bị động tự động áp dụng sau khi học.
- Tương sinh/tương khắc mềm, không áp chế tuyệt đối.

Catalog hiện có 66 skill. Chỉ skill chủ động đã học và gán vào loadout mới xuất hiện trên thanh kỹ năng. Passive không chiếm ô.

## 5. Tu vi, OVR và đột phá

```text
tuViCan = floor(1000 × 1.24 ^ ((realm - 1) × 10 + stage - 1))
```

- Đột phá do người chơi chủ động kích hoạt.
- Tầng 9 cần ngưỡng `tuViCan × 1.5` và điều kiện OVR/đan phá cảnh.
- Tầng 1 cảnh giới mới luôn có nền cao hơn ngưỡng đột phá tầng 9 cũ.
- Tu vi dư sau đột phá được giữ lại.
- Cảnh giới: `1000 OVR` mỗi bậc.
- Tầng: `90 OVR` mỗi tầng.
- Tiến độ trong mốc: tối đa `70 OVR`.
- Linh lực vượt mốc: tối đa `360 OVR`.
- Tu vi linh căn từ thiên tài địa bảo: tối đa 1000 điểm, ảnh hưởng tối đa 8% sức mạnh linh căn và 40 OVR.

## 6. Combat

Combat online chạy theo luồng:

```text
client intent
  → server kiểm tra player/map/target/range/cooldown/MP
  → server tính damage/crit/defense/affinity
  → server cập nhật HP/loot/status
  → combat_result/player_combat_result
  → client render animation, số damage, buff và log
```

Đánh thường là damage duy trì. Skill có burst cao hơn, tiêu MP, cooldown và hiệu ứng riêng. Server là nguồn sự thật; client không được quyết định damage hoặc loot.

## 7. Quái và bản đồ

Hiện có 6 template quái, 17 instance trong các bãi Bình Nguyên:

- Quái thường: Hoang Sói, Thổ Heo, Độc Thảo Yêu.
- Elite: Xích Luyện Hổ.
- Boss: Huyết Nguyệt Lang.

Mỗi quái có tuần tra, aggro riêng từng con, truy đuổi theo thời gian/khoảng cách, quay về bãi, tấn công người chơi và respawn.

Hiện có 2 map:

- Thanh Vân Trấn: CITY, an toàn, NPC/shop, không farm quái chính.
- Bình Nguyên Hoang Dã: PLAIN/RIVER_VALLEY, bãi quái và boss.

## 8. Trạng thái online

Đã chạy:

- Login nhiều tab/người chơi.
- Socket room theo map/chunk.
- Đồng bộ player/quái/chat/combat.
- Server kiểm tra movement, collision, tốc độ và portal.
- Portal tới map mới đặt người chơi ở điểm đối diện.

## 9. Mở rộng sau MVP

Các nội dung sau chưa xem là đã hoàn thành:

- Database bền vững và Redis adapter.
- Quest tree/NPC quest.
- Party, guild, PvP, faction war.
- Dungeon/bí cảnh và nhiều cảnh giới/map.
- Boss phase, skill boss, threat table và loot contribution.
- Craft, enhance, marketplace.
- Mobile input adapter.
