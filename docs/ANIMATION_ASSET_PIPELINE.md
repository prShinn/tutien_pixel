# Pipeline animation asset

Đưa một ảnh bất kỳ vào game bằng một lệnh:

```powershell
npm run animate:asset -- --input "C:\\Users\\nguye\\Pictures\\quai.png" --name "quai_moi" --kind procedural --width 20 --height 20
```

Lệnh tạo:

- `public/assets/generated/quai_moi.png`
- `public/assets/generated/quai_moi.animation.json`

`procedural` dành cho một ảnh đơn: renderer tự tạo idle, walk, attack và hit bằng bob, sway, squash/stretch, xoay nhẹ và lật hướng. `grid` dành cho sprite-sheet, mặc định 4 cột × 4 hàng theo thứ tự `idle`, `walk`, `attack`, `hit`. Nhân vật nam/nữ mặc định trong game cũng dùng cùng quy ước 4x4.

Sau đó chỉ cần đưa `img` vào monster/player data. Nếu không khai báo `animation`, ảnh đơn sẽ tự dùng animation procedural.
