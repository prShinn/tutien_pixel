# Vận hành và phục hồi dữ liệu

## Trước khi deploy

1. Dừng ghi gameplay/admin hoặc đưa API vào maintenance mode.
2. Tạo snapshot MySQL trước migration/deploy.
3. Xác nhận `.env` có `JWT_SECRET` riêng đủ mạnh, DB đúng môi trường, `CORS_ORIGIN` đúng origin FE; đặt `TRUST_PROXY_HOPS` đúng số reverse proxy tin cậy.
4. Dùng Node 24, import `schema.sql` cho database mới hoặc chạy migration đang phát hành đúng một lần.
5. Kiểm tra `/api/health` và `/api/health/ready`; endpoint readiness phải trả 503 khi MySQL không sẵn sàng.

## Backup và restore MySQL

Chạy lệnh trong `cmd.exe` để backup nhất quán cho InnoDB, gồm schema và dữ liệu:

```bat
set DB_USER=your_db_user
mysqldump --single-transaction --routines --triggers --databases tu_tien_pixel --user=%DB_USER% -p > backup-tu-tien-pixel.sql
```

MySQL hỏi password tương tác. Lưu backup ngoài thư mục public của BE, mã hóa theo chính sách hạ tầng và kiểm tra checksum sau khi chép.

Restore yêu cầu dừng BE và mọi worker đang ghi:

```bat
set DB_USER=your_db_user
mysql --user=%DB_USER% -p < backup-tu-tien-pixel.sql
```

Sau restore, khởi động BE, kiểm tra readiness, đăng nhập bằng tài khoản kiểm thử và xác nhận player, wallet, inventory, quest, admin content/version còn đúng trước khi mở traffic.

## Rollback migration

Migration `20261104_player_progression.sql` thêm bảng và cột, đồng thời đổi `players.x/y` sang `DOUBLE` và khởi tạo HP/MP từ stats. Trước deploy phải giữ backup trước migration. Nếu rollback cần hoàn nguyên dữ liệu, dừng BE và restore snapshot đó; không chạy `DROP` thủ công trên production vì migration sau có thể đã ghi thêm state vào các bảng mới.

## Runtime boundary

Account, player, wallet/ledger, inventory/equipment/skills, quest, admin override/audit, refresh token, loot claim và idempotency commit trong MySQL. Online presence, quái HP/respawn, ground drops, buffs, cooldowns và combat command cache ở memory process. Chưa được chạy nhiều BE instance: Socket.IO adapter chỉ chuyển tiếp room broadcasts, không chia sẻ authoritative monster/drop/combat runtime; cần shared runtime owner/state và kiểm tra reconnect/duplicate liên instance trước khi mở scale-out.

`SIGINT`/`SIGTERM` đóng Socket.IO/HTTP listener, Redis adapter clients (nếu đã bật) và pool MySQL một cách tuần tự. Có thể bật adapter room-broadcast bằng `REDIS_URL`; cấu hình Redis ACL/TLS trên mạng riêng. Socket.IO polling cần sticky sessions tại load balancer. Adapter không chia sẻ runtime game, vì vậy vẫn giữ một BE instance cho tới khi có world-state owner dùng chung và kiểm tra liên instance.

`ADMIN_API_KEY` không còn được đọc; xóa biến này khỏi secret/environment của BE sau khi cập nhật FE admin sang JWT Bearer. Role `GM`/`ADMIN` do vận hành cấp trong MySQL, không qua đăng ký public.

## Capacity posture

The repository has no published or measured online-player capacity. Keep gameplay on one BE instance while room, monster, cooldown and drop state remain process-local. `DB_POOL_SIZE` controls active MySQL connections per process; `DB_QUEUE_LIMIT` bounds queued DB work (default 100) and overload returns 503 `SERVICE_BUSY`. Tune these only from measurements against the target MySQL host.

The FE sends movement at 20 Hz. Same-map `player_move` broadcasts still fan out to every other socket in that map, so a crowded map can become network-bound even after AI packet batching. Before increasing the supported online count, load-test movement, combat/AI, reconnect and DB saturation while measuring event-loop lag, Socket.IO bytes/events, MySQL pool wait time and p95/p99 command latency. Redis room broadcast alone does not make gameplay multi-instance safe.
