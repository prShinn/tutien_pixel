# ROADMAP — Vạn Cổ Đế Tôn

> Thứ tự ưu tiên được khóa theo trải nghiệm cốt lõi: nhân vật → di chuyển → chiến đấu → quái vật → thế giới → cân bằng → tu vi.

## Nguyên tắc triển khai

- Mỗi giai đoạn phải hoàn chỉnh một lát cắt gồm: dữ liệu, logic server, socket, hiển thị client và smoke test.
- Server quyết định vị trí hợp lệ, HP, damage, phòng thủ, trạng thái, quái và tu vi. Client gửi ý định rồi hiển thị kết quả.
- Không mở rộng nội dung khi hành động cơ bản chưa có phản hồi rõ ràng và chưa qua test.
- Combat được làm hai lượt: cơ chế đánh/nhận đòn trước; công thức cân bằng damage/def được chốt sau map theo đúng thứ tự ưu tiên.

## P01 — Nhân vật

**Mục tiêu:** nhân vật là một entity thống nhất, có hình ảnh và trạng thái rõ ràng.

- Chuẩn hóa model: identity, appearance, transform, movement, combat, vitals và progression.
- Chuẩn hóa giới tính, sprite sheet, kích thước, tâm chân và hitbox.
- State machine: `idle`, `walk`, `attack`, `cast`, `hurt`, `dead`.
- Hướng nhìn: `up`, `down`, `left`, `right`; không để animation tự làm trôi vị trí.
- Đồng bộ đúng state/action của người chơi khác qua socket.

**Nghiệm thu:** hai tab nhìn thấy đúng giới tính, hướng, trạng thái và animation của nhau; refresh không tạo bản sao nhân vật.

## P02 — Di chuyển nhân vật

**Mục tiêu:** di chuyển mượt, không xuyên địa hình và không thể chỉnh client để tăng tốc.

- Client prediction và interpolation cho người chơi khác.
- Server xác thực tốc độ theo thời gian, collision, biên map và trạng thái khóa di chuyển.
- Server gửi correction khi vị trí client sai; client hòa vị trí thay vì giật mạnh.
- Tách movement speed khỏi animation speed.
- Kiểm tra reconnect, lag, diagonal movement và chuyển chunk/AOI.

**Nghiệm thu:** không wall-hack/speed-hack bằng payload socket; hai tab thấy chuyển động ổn định khi có độ trễ.

## P03 — Nhân vật tấn công

**Mục tiêu:** đánh thường và kỹ năng đều dễ dùng, có mục tiêu hợp lệ và phản hồi tức thời.

- Chuẩn hóa input: click mục tiêu, Space đánh thường, phím 1–4 dùng skill.
- Server xác thực target, khoảng cách, cooldown, MP, trạng thái và loại skill.
- Hỗ trợ single-target, cone/line/circle AOE và self/buff.
- Đồng bộ animation, tên skill, cast time, hit frame, effect và combat result.
- Skill phải nổi bật hơn đánh thường bằng burst, utility hoặc phạm vi; không chỉ đổi màu damage.

**Nghiệm thu:** đứng trong range luôn gây hit hợp lệ; ngoài range báo đúng nguyên nhân; client sửa damage không có tác dụng.

## P04 — Nhân vật bị tấn công

**Mục tiêu:** người chơi hiểu rõ mình vừa bị gì và còn khả năng phản ứng.

- State `hurt`, hit flash, knockback hợp lệ, floating damage và thanh HP.
- Server xử lý né, block/shield, status effect, chết và hồi sinh.
- Không tự hồi sinh HP ở client; server phát snapshot cuối cùng.
- Thêm combat log ngắn gọn: nguồn, damage, crit, effect và lượng hấp thụ.

**Nghiệm thu:** hai tab cùng thấy một kết quả HP/state; mất kết nối rồi vào lại không khôi phục HP sai.

## P05 — Quái vật

**Mục tiêu:** quái là entity server-owned có template và runtime state tách biệt.

- Chuẩn hóa template: hình ảnh, hitbox, level, hệ, HP, attack, defense, speed, skill và loot table.
- Runtime: spawn point, pack, HP, state, target, status effect, cooldown, dead/respawn.
- Sprite/state machine tương thích nhân vật: idle, walk, attack, hurt, dead.

**Nghiệm thu:** mọi client nhìn thấy cùng một quái, cùng HP và trạng thái; client không tạo/sửa được quái.

## P06 — Quái vật di chuyển

**Mục tiêu:** từng con tự phản ứng, không kéo cả bầy vô lý và luôn quay được về bãi.

- State AI: idle → aggro → chase → attack → return → idle.
- Chỉ cá thể phát hiện người chơi mới đuổi; dùng aggro range, leash range và chase timeout.
- Server kiểm tra collision/path; tránh đứng chồng lên quái khác.
- Client chỉ nội suy snapshot, không mô phỏng AI authoritative.

**Nghiệm thu:** dụ một con không kéo cả bầy; chạy đủ xa thì quái quay về đúng bãi và hồi trạng thái.

## P07 — Quái vật tấn công

**Mục tiêu:** đòn quái đọc được, tránh được và đồng bộ realtime.

- Attack wind-up, hit frame, recovery và cooldown.
- Đòn cận chiến, projectile và vùng cảnh báo AOE.
- Server chốt mục tiêu/range tại thời điểm hit; client chỉ render telegraph/effect.
- Có thể mở rộng skill theo loại quái nhưng dùng chung combat pipeline.

**Nghiệm thu:** người chơi thấy cảnh báo trước khi mất HP; không bị đánh khi quái đã ngoài range tại hit frame.

## P08 — Quái vật bị tấn công

**Mục tiêu:** hit registration ổn định và phản hồi rõ ràng.

- Hurt state, hit flash, thanh HP, crit/status text và hit-stop nhẹ phía client.
- Server xử lý damage, status, aggro theo nguồn sát thương, chết, loot và respawn.
- AOE trả về danh sách hit thống nhất; mỗi target chỉ nhận một lần cho mỗi cast.

**Nghiệm thu:** đánh sát quái không còn miss sai; skill đơn/AOE trừ đúng HP trên mọi client.

## P09 — Map

**Mục tiêu:** map lớn nhưng có cấu trúc dữ liệu rõ ràng và thân thiện gameplay.

- Tách ground, object, elevation, collision và point/entity layer.
- Chuẩn hóa spawn, portal, NPC, monster pack, resource và safe zone.
- Camera, minimap, culling và tọa độ thế giới dùng chung một quy ước.
- Portal do server xác thực và quyết định đích đến.

**Nghiệm thu:** đi hết map, qua portal hai chiều, va chạm và camera không sai tọa độ.

## P10 — Quái spawn trên map

**Mục tiêu:** Admin cấu hình được bãi quái, server duy trì population ổn định.

- Pack template: vùng spawn, số lượng, bán kính, respawn, level range và điều kiện.
- Kiểm tra vị trí walkable trước khi spawn.
- Runtime cap theo map/zone; không spawn khi room không có người nếu không cần thiết.
- Publish map phải invalidation runtime đúng version.

**Nghiệm thu:** lưu Admin → publish → quái xuất hiện đúng bãi; chết và respawn không nhân bản.

## P11 — Tối ưu map

**Mục tiêu:** map lớn không gây nghẽn mạng, RAM hoặc main thread.

- Chunk map, AOI entity, cache version, gzip/brotli và ETag.
- Chỉ cập nhật chunk thay đổi; không gửi lại static map qua socket.
- Ghi map bất đồng bộ/atomic; loại thao tác sync nhiều MB khỏi request path.
- Đo event-loop lag, payload, FPS, memory và bandwidth.

**Nghiệm thu:** benchmark 100 client trước beta; pan camera và đổi map không tạo frame spike lớn.

## P12 — Render map

**Mục tiêu:** địa hình pixel 1×1 ghép thành vùng tự nhiên, mượt và dễ đọc.

- Terrain cache theo chunk/layer; chỉ redraw vùng bẩn.
- Auto-tiling/transition cho sông, bờ, rừng, núi và độ cao.
- Render order: ground → decoration → portal/NPC → entity → effect → overlay.
- Giữ pixel-art sắc nét nhưng tránh địa hình răng cưa ngẫu nhiên.

**Nghiệm thu:** map 600×400 hiển thị ổn định, zoom/camera không nhòe và biên biome tự nhiên.

## P13 — Tạo map

**Mục tiêu:** Admin tạo được map hoàn chỉnh mà không sửa code.

- Generator seed/biome, brush layer, spawn/portal/monster pack editor.
- Validate kích thước, collision, spawn, portal đích và mã map.
- Quy trình `draft → preview → validate → publish` có version.
- Preview dùng cùng renderer với game để tránh sai khác.

**Nghiệm thu:** tạo hai map mới, nối portal, publish và chơi xuyên suốt bằng UI Admin.

## P14 — Logic damage/phòng thủ

**Mục tiêu:** một công thức server duy nhất, dễ cân bằng và không để đánh thường lấn át kỹ năng.

- Tách physical/magic attack và defense; mitigation có diminishing return.
- Skill coefficient, scaling stat, crit, AOE penalty, buff/debuff và elemental relation.
- Ngũ hành chỉ tạo lợi thế mềm; sức mạnh linh căn và build vẫn có thể đảo chiều khắc chế.
- Equipment, cảnh giới và thời gian tu luyện cùng đi qua power budget.
- Client dùng endpoint/metadata để dự báo, không tự quyết định kết quả.

**Nghiệm thu:** bộ test ma trận build/linh căn; sai lệch sức mạnh nằm trong ngân sách đã định.

## P15 — Logic tu vi

**Mục tiêu:** progression có chiều sâu nhưng không phá cân bằng combat.

- Tu vi hiện tại, tầng, cảnh giới, căn cơ/tích lũy và điều kiện đột phá.
- Người tu lâu cùng cảnh giới có lợi thế hữu hạn; người mới đột phá với trang bị/build tốt vẫn có thể thắng.
- Mọi hấp thụ vật phẩm, thưởng train quái và đột phá là transaction server-side.
- Khóa API cộng tu vi tự do; thêm inventory cost, idempotency và audit log.

**Nghiệm thu:** refresh/reconnect không mất hoặc nhân tu vi; spam request không nhận thưởng hai lần.

## Thứ tự thực thi hiện tại

1. **Đang làm:** P01–P02 — chuẩn hóa character state và movement authoritative.
2. **Kế tiếp:** P03–P04 — player combat hoàn chỉnh.
3. P05–P08 — toàn bộ vòng đời quái và tương tác chiến đấu.
4. P09–P13 — pipeline map từ runtime tới Admin.
5. P14–P15 — chốt balance damage/def và progression tu vi.

## Gate chung trước khi đánh dấu hoàn thành

- Syntax/fast-check sạch.
- Smoke test cho cả happy path và payload gian lận.
- Hai tab/trình duyệt cho kết quả giống nhau.
- Không tin dữ liệu gameplay do client tự tính.
- Tài liệu contract và trạng thái roadmap được cập nhật cùng code.
## PHẠM VI NỀN TẢNG HIỆN TẠI

- Ưu tiên PC webgame: canvas/map trung tâm, HUD desktop, chuột + bàn phím, skill bar ngang và panel thông tin.
- Không đổi gameplay server, Socket.io, combat hay state để chạy mobile trong các phase hiện tại.
- Mobile responsive, touch joystick, safe-area và landscape là phase cuối sau khi PC webgame hoàn thiện.

## P16 — MOBILE WEBGAME (PHASE CUỐI)

- Thêm touch joystick bên trái; nút đánh, skill và thao tác nhanh bên phải.
- Hỗ trợ portrait cho menu và landscape cho map; xử lý safe-area, notch và khóa cuộn trang.
- Tái sử dụng cùng socket/event contract, server state và combat pipeline của PC.
- Kiểm tra FPS, reconnect, đổi orientation và PC/mobile cùng map realtime.
