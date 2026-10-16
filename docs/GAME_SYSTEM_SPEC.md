# Đặc tả chốt hệ thống game — MVP webgame tu tiên

## Trải nghiệm người chơi

- Click nền để di chuyển; click quái để khóa mục tiêu và tự áp sát.
- `Space` đánh thường; `1–4` dùng kỹ năng đã trang bị; `Esc` bỏ mục tiêu.
- Target HUD hiển thị HP, hệ, cấp và nút đánh.
- Thanh kỹ năng chỉ hiển thị kỹ năng chủ động đã học/gán; kỹ năng bị động áp dụng tự động.
- Thành phố an toàn; bản đồ hoang dã có bãi quái, elite và boss.

## Nguồn sự thật

Server giữ player, tọa độ hợp lệ, HP/MP, tu vi, inventory, combat, loot, monster AI và portal.
Client chỉ gửi ý định, nội suy hiển thị và cập nhật HUD. Socket.io dùng room theo map/chunk để đồng bộ người chơi và quái gần nhau.

## Tu vi và đột phá

`tuViCan = floor(1000 × 1.24 ^ ((cảnhGiới - 1) × 10 + (tầng - 1)))`.

- Đột phá là thao tác thủ công, không tự động.
- Tầng 9 có ngưỡng đột phá bằng `tuViCan × 1.5` và cần OVR/đan phá cảnh.
- Tầng 1 cảnh giới mới luôn cao hơn ngưỡng phá tầng 9 cũ.
- Tu vi dư sau đột phá được giữ lại.
- OVR: cảnh giới `×1000`, tầng `×90`, tiến độ trong mốc `×70`, linh lực vượt mốc tối đa `360`.
- Thiên tài địa bảo tăng tu vi linh căn tối đa 1000 điểm, tác động tối đa 8% sức mạnh linh căn và 40 OVR.

## Chiến đấu và ngũ hành

Server tính sát thương, phòng thủ, crit, cooldown, phạm vi và tương sinh/tương khắc.
Quan hệ khắc chế không áp chế tuyệt đối: chênh lệch sức mạnh linh căn điều chỉnh trong biên giới hạn.
Đánh thường là sát thương duy trì; kỹ năng có burst, MP, cooldown, mục tiêu đơn/AOE và hiệu ứng riêng.

## Quái và phiêu lưu

Quái có bãi spawn, tuần tra, phát hiện riêng từng con, truy đuổi trong thời gian/khoảng cách giới hạn rồi quay về.
`NORMAL`, `ELITE`, `BOSS` có chỉ số, loot và thời gian hồi sinh khác nhau. MVP hiện có Hoang Sói, Thổ Heo, Độc Thảo Yêu, Xích Luyện Hổ và Huyết Nguyệt Lang.

## Ranh giới MVP

Đã có: đăng nhập demo, nhiều tab/người chơi, realtime socket, movement validation, combat server-authoritative, monster AI, loot, inventory, map/portal, admin map mock và responsive HUD cơ bản.

Chưa production: database bền vững, scale nhiều process/Redis adapter, quest tree, party/guild/PvP hoàn chỉnh, boss phase/AOE riêng, anti-cheat nâng cao, mobile input chuyên biệt và telemetry.
