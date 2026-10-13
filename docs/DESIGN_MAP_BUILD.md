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
