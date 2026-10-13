# Character animation contract

## Sprite sheet hiện tại

`public/assets/char_male_anim-source.png` là sheet 4x4, nền xanh chroma-key để renderer tự tách nền khi load:

```text
row 0: idle  (4 frames)
row 1: walk  (4 frames)
row 2: attack (4 frames)
row 3: cast  (4 frames)
```

Renderer tự crop theo `row/col`, không scale cả sheet. Nhân vật nam luôn dùng sheet này theo gender; nhân vật nữ tiếp tục fallback asset đơn cho tới khi có sheet tương ứng.

## Animation state

- `idle`: mặc định, nhịp chậm.
- `walk`: lấy từ `actor.isMoving`.
- `attack`: `Combat.attack()` đặt `animState` trong 360ms.
- `cast`: `SkillSystem.useSkill()` đặt `animState` trong 520ms.

## Quy tắc mở rộng

Asset mới phải giữ đúng 4 cột/4 hàng và cùng framing. Chỉ đổi asset hoặc metadata animation; không rải điều kiện frame trong combat/network.
