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

Migration `20261104_player_progression.sql` thêm bảng và cột, đồng thời đổi `players.x/y` sang `DOUBLE` và khởi tạo HP/MP từ stats. Migration `20261107_respawn_position_version.sql` thêm bộ đếm phiên bản vị trí để ngăn vị trí cũ ghi đè sau hồi sinh. Chạy migration theo thứ tự sau khi backup. Nếu rollback cần hoàn nguyên dữ liệu, dừng BE và restore snapshot đó; không chạy `DROP` thủ công trên production vì migration sau có thể đã ghi thêm state vào các bảng mới.

## Runtime boundary

Account, player, wallet/ledger, inventory/equipment/skills, quest, admin override/audit, refresh token, loot claim và action idempotency commit trong MySQL. Redis giữ lease owner theo map, chuyển tiếp command giữa BE instance và lưu snapshot runtime định kỳ; process đang giữ lease là nguồn authoritative cho map đó. Snapshot khôi phục trạng thái quái, ground drop, buff và cooldown khi owner mới tiếp quản. Người chơi đang ở map bị failover sẽ bị ngắt socket để kết nối lại và được ghép vào runtime mới.

Để chạy nhiều BE instance, cấu hình cùng `REDIS_URL` cho Socket.IO adapter và map-owner coordinator trên mọi node, dùng Redis có ACL/TLS và bật sticky sessions nếu load balancer cho phép Socket.IO polling. `/api/health/ready` báo `realtime: redis-room-owners` khi chế độ này hoạt động, hoặc `single-process` khi không cấu hình Redis. Không ghép một node có Redis với node không Redis trong cùng pool. Mỗi map chỉ có một owner tại một thời điểm; các map khác nhau có thể chạy trên các process khác nhau.

Lease owner có TTL và được gia hạn định kỳ. Khi owner mất lease, node cũ ngừng nhận lệnh/tick; node tiếp theo khôi phục snapshot Redis trước khi xử lý. Snapshot được ghi mỗi giây khi room thay đổi và khi shutdown. Redis giữ replay key cho combat/loot/map-change/chat; lệnh còn ở trạng thái in-flight khi owner mất sẽ không được thực thi lần hai và trả `COMMAND_OUTCOME_UNKNOWN`. Nếu Redis mất dữ liệu hoặc không sẵn sàng, readiness chuyển 503; không đưa traffic gameplay vào pool cho tới khi Redis hồi phục. Runtime owner không phải database: các mutation HP/MP, vị trí đã flush, loot claim và quest vẫn lấy MySQL làm nguồn bền vững.

`SIGINT`/`SIGTERM` đóng Socket.IO/HTTP listener, ghi snapshot và nhả lease, đóng Redis clients rồi mới đóng pool MySQL. Redis room adapter và runtime coordinator dùng kết nối riêng nhưng cùng `REDIS_URL`.

`ADMIN_API_KEY` không còn được đọc; xóa biến này khỏi secret/environment của BE sau khi cập nhật FE admin sang JWT Bearer. Role `GM`/`ADMIN` do vận hành cấp trong MySQL, không qua đăng ký public.

## Capacity posture

The repository has no published or measured online-player capacity. Redis room ownership enables multiple BE processes for different maps, but does not define a supported player count; each busy map still has one authoritative owner. `DB_POOL_SIZE` controls active MySQL connections per process; `DB_QUEUE_LIMIT` bounds queued DB work (default 100) and overload returns 503 `SERVICE_BUSY`. Tune these only from measurements against the target MySQL host.

The FE sends movement at 20 Hz. Same-map `player_move` broadcasts still fan out to every other socket in that map, so a crowded map can become network-bound even after AI packet batching. Before increasing the supported online count, load-test two or more BE nodes with Redis, movement, combat/AI, map transfer, owner loss/rejoin, duplicate commands and DB saturation while measuring event-loop lag, Socket.IO bytes/events, Redis latency, MySQL pool wait time and p95/p99 command latency. Redis room broadcast alone does not make gameplay multi-instance safe; verify map-owner routing and snapshot takeover on the target deployment.
