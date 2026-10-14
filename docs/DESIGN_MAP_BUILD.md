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
- Nhân vật `20×25px`; quái phổ thông `20–28px`; footprint collision bán kính `4px`.
- Sông rộng `12–40px`, rừng và núi là các mảng noise liên tục gồm nhiều trăm pixel.
- Tầm đánh thường `24px`; range skill trong data nhân hệ số `6`; aggro quái khoảng `40px`.

Renderer raster hóa toàn bộ địa hình vào offscreen canvas đúng một lần khi load map. Mỗi frame chỉ cắt vùng camera đang nhìn; minimap cũng dùng cache riêng. Socket dùng `mapVersion` để không gửi lại payload map nếu client đã tải đúng phiên bản qua API.

### Hướng phát triển

1. Bổ sung công cụ đặt portal, NPC, bãi quái và vùng polygon trực tiếp trên canvas.
2. Thay primitive canvas bằng tileset atlas 16/47-mask; neighbor mask chọn sprite autotile.
3. Chia map lớn thành chunk 32×32, version từng chunk và chỉ broadcast vùng lân cận.
4. Thêm draft/publish để map đang sửa không thay đổi world online trước khi duyệt.
