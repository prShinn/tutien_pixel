# Roadmap phát triển webgame online

## Kết luận hiện tại

Project đã có nền tảng đúng cho webgame online:

- Express cung cấp REST API và static client.
- Socket.IO đồng bộ player, quái, combat, loot, chat và portal theo room/map.
- Server đã kiểm tra movement, collision và combat; client chủ yếu hiển thị.
- JWT, rate-limit cơ bản, `.env` và admin key đã tồn tại.

Hiện tại phù hợp demo/test nhóm nhỏ, chưa nên public production. Player, session,
quái và loot runtime đang lưu trong RAM; restart hoặc chạy nhiều process sẽ làm lệch
trạng thái. Tiến trình nhân vật cũng chưa được persist đầy đủ.

## Nguyên tắc kiến trúc bắt buộc

1. Server authoritative: client chỉ gửi ý định (`move`, `attack`, `skill`, `pickup`),
   server kiểm tra và phát kết quả.
2. Database là nguồn sự thật cho tài khoản, nhân vật, inventory, equipment, skill,
   tu vi và map metadata.
3. Redis là nguồn dùng chung cho session, presence, rate-limit, lock và Socket.IO
   adapter khi chạy nhiều instance.
4. Mỗi map là một room độc lập; không broadcast dữ liệu của map khác.
5. Combat phải xác định bằng `requestId`/server tick để chống gửi lặp và gian lận.
6. Client không lưu progression trong `localStorage`; chỉ giữ token phiên và cache
   hiển thị có thể xóa.

## Lộ trình thực hiện

### Phase 0 — Demo ổn định (đang thực hiện)

- Giữ mockdata/in-memory để chốt gameplay.
- Hoàn thiện một map chuẩn: di chuyển, collision, monster, combat, loot, portal.
- Giữ smoke test cho multiplayer, movement authority, combat, map và loot.
- Không thêm tính năng lớn nếu chưa có test tương ứng.

### Phase 1 — Persist dữ liệu

- Chọn PostgreSQL cho production.
- Tách repository khỏi `server.js`/`socket/game.js`.
- Bổ sung bảng `users`, `characters`, `character_stats`, `inventory`, `equipment`,
  `skills`, `cultivation`, `worlds`, `portals`, `audit_events`.
- Autosave theo event quan trọng và checkpoint định kỳ; ghi atomic, có version.
- Migration, seed data và backup/restore trước khi mở public.

### Phase 2 — Online nhiều instance

- Redis adapter cho Socket.IO.
- Redis presence/session và distributed rate-limit.
- Worker riêng cho respawn quái, expire loot, tick buff và scheduled jobs.
- Idempotency cho giao dịch, nhặt loot, mua bán và đột phá.
- Health check, graceful shutdown và reconnect/resync world state.

### Phase 3 — Bảo mật public

- HTTPS, CORS allowlist, security headers, request body limits.
- Không dùng secret mặc định; xoay JWT secret và admin key.
- Refresh token/revoke session, password policy và khóa brute-force.
- Validate schema toàn bộ REST/socket payload; log audit cho admin và giao dịch.
- Chống speed hack, packet spam, replay request và duplicate reward.

### Phase 4 — Vận hành

- Docker + reverse proxy; CI chạy syntax, validator và smoke test.
- Monitoring CPU/RAM, tick latency, socket count, error rate và DB latency.
- Structured logs, alert, backup định kỳ và staging trước production.
- Load test theo mốc 50 → 200 → 1.000 người chơi đồng thời.

## Tiêu chí được phép public

- Restart server không mất tiến trình nhân vật.
- Hai instance vẫn thấy cùng player/combat/loot.
- Không thể tự sửa damage, vị trí, item hoặc tu vi từ DevTools.
- Có backup/restore và rollback migration.
- Load test đạt mục tiêu latency đã chốt.
- Có staging, domain HTTPS, monitoring và quy trình xử lý sự cố.

## Việc ưu tiên tiếp theo

Không xây database ngay trong lúc gameplay còn thay đổi. Trước mắt chốt schema từ
mockdata, gom mọi thao tác thay đổi state thành command server, sau đó mới thay
repository RAM bằng PostgreSQL mà không đổi contract của client.
