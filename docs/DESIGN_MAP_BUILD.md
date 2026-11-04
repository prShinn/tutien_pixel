# Thiết kế lại cơ chế build map

## Nguyên tắc

Map phải là dữ liệu, không phải logic rải trong renderer. Một map gồm:

```text
MapDefinition
├── metadata: code, name, size, biome, recommendedRealm
├── layers: ground, decoration, collision
├── points: spawn, portals, npcs, monster spawns, resource nodes
└── rules: pvp, weather, encounter, safeZone
```

## Giai đoạn mock hiện tại

- `jsonMap` tiếp tục là nguồn tile duy nhất cho render và collision.
- `World.loadMap()` chỉ chuẩn hóa dữ liệu, nạp entity và spawn.
- Minimap đọc lại `S.tiles`, không duy trì bản đồ thứ hai ở client.
- Server/socket về sau chỉ gửi `map snapshot` và entity state; client render.

## Giai đoạn kế tiếp

1. Tách tile layer khỏi `jsonMap` để decoration không ảnh hưởng collision.
2. Dùng `mapId/version` để client cache asset và server kiểm tra phiên bản.
3. Định nghĩa vùng `safe`, `combat`, `gather`, `boss` bằng rectangle/polygon.
4. Server xác thực movement theo collision layer và portal point.
5. Khi map lớn, chia chunk; socket chỉ broadcast entity trong chunk lân cận.

## Gợi ý mỹ thuật

Mỗi biome nên có palette, tile rules và landmark riêng. Không tăng kích thước tile để làm map đẹp hơn; dùng layer decoration, ánh sáng, fog và landmark để tạo chiều sâu mà vẫn giữ pixel readability.

## Map Admin MVP

Truy cập `/admin`, dùng `ADMIN_MAP_KEY` từ môi trường (demo mặc định: `demo-admin`). Editor hỗ trợ:

- Sinh địa hình có seed bằng value-noise/fBm; cùng seed cho cùng kết quả.
- Preset sơn thủy, thảo nguyên, rừng cổ, quần sơn và thành trì.
- Điều chỉnh mật độ cây, độ hiểm trở, độ rộng sông.
- Vẽ tay theo lớp nền, vật thể, cao độ; đặt điểm xuất hiện.
- Lưu server vào `data/admin-worlds.json`; map có hiệu lực với API/socket như map seed.

### Data contract tương thích ngược

```js
{
  code, tenMap, type, biome, seed, version, w, h,
  spawnX, spawnY,
  jsonMap, // collision tổng hợp, server vẫn dùng trực tiếp
  layers: {
    ground,    // 0 cỏ, 1 đá, 2 nước, 4 đường, 7 sân
    objects,   // -1 trống, 3 tường, 5 cây, 6 núi
    elevation, // 0..3, tạo sắc độ và chiều sâu
  },
  portals, monsterSpawns, npcs, rules,
}
```

`jsonMap[y][x] = objects[y][x] >= 0 ? objects[y][x] : ground[y][x]`. Vì vậy server xác thực di chuyển bằng dữ liệu tổng hợp, còn client render theo layer để bờ sông, thảm rừng và sườn núi liền mạch hơn.

## Tỷ lệ micro-grid v2

- `1 ô map = 1 logical pixel`, không còn xem một ô là cả cây hay cả ngọn núi.
- Map chuẩn `600×400`; Admin cho phép `320×240` đến `1024×1024`.
- Nhân vật `14×18px`; quái phổ thông `16–21px`; footprint collision bán kính `2.5px`.
- Canvas hiển thị ở scale `3×` để tăng tầm nhìn; tốc độ cơ bản `44 world-pixel/giây`.
- Sông rộng `12–40px`, rừng và núi là các mảng noise liên tục gồm nhiều trăm pixel.
- Tầm đánh thường `24px`; range skill trong data nhân hệ số `6`; aggro quái khoảng `40px`.

Renderer raster hóa toàn bộ địa hình vào offscreen canvas đúng một lần khi load map. Mỗi frame chỉ cắt vùng camera đang nhìn; minimap cũng dùng cache riêng. Socket dùng `mapVersion` để không gửi lại payload map nếu client đã tải đúng phiên bản qua API.

### Hướng phát triển

1. Bổ sung công cụ đặt portal, NPC, bãi quái và vùng polygon trực tiếp trên canvas.
2. Tách decoration/vật cản có chiều cao khỏi terrain cache để renderer đưa chúng vào cùng danh sách Y-sort với nhân vật.
3. Chuẩn bị autotile atlas 16/47-mask như một lớp mỹ thuật độc lập trên micro-grid hiện tại. Bản đồ hiện có `CFG.TS = 1`, một ô dữ liệu là một world pixel; không được coi mỗi ô là một tile 16×16 hoặc đổi kích thước ô nếu chưa migrate collision, editor và tọa độ entity.
4. Chia map lớn thành chunk 32×32, version từng chunk và chỉ broadcast vùng lân cận.
5. Thêm draft/publish để map đang sửa không thay đổi world online trước khi duyệt.

### Hoàn thiện client runtime (đã triển khai)

- Gameplay chạy fixed update 60Hz; `requestAnimationFrame` chỉ render và nội suy vị trí player cục bộ. Khung hình bị treo được giới hạn tối đa 5 tick bù.
- Player/monster từ socket được đưa vào buffer tối đa 3 snapshot và render chậm 100ms; gói cũ bị bỏ, teleport xa reset buffer.
- HUD nhận event `player:vitals_changed`, `player:position_changed` và `target:changed`; DOM chỉ cập nhật khi giá trị đang hiển thị đổi.
- Dynamic drawables (loot, NPC, monster, người chơi) dùng Y-sort ổn định theo điểm chân. Portal và terrain vẫn ở lớp nền.

Autotile atlas và Y-sort vật cản chưa bật trong client: map chưa có atlas/decoration sprite và các cây, vách hiện được raster hóa trong terrain cache. Muốn che khuất nhân vật đúng 2.5D, cần thêm object render layer với footprint/điểm chân; chỉ đổi thứ tự vẽ entity sẽ không làm cây trong cache che nhân vật.
