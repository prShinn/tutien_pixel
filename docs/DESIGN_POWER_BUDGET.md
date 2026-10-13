# Khung thuộc tính và ngân sách sức mạnh

## 1. Điểm khởi tạo

Nhân vật bắt đầu với 4 chỉ số nền 5 và được phân bổ thêm 20 điểm. Tổng stat hợp lệ là 40. Server kiểm tra tổng này khi tạo nhân vật; client không được tự tăng vượt ngân sách.

| Chỉ số | Giá trị mỗi điểm | Vai trò |
|---|---:|---|
| STR | +4 pAtk | sát thương vật lý |
| AGI | +0.5 pAtk, +0.3% chí mạng, +0.4% né | cơ động và nhịp đánh |
| VIT | +2 pDef, +12 HP tối đa | chống chịu |
| ENE | +4 mAtk, +1.5 mDef, +8 MP tối đa | pháp thuật và tài nguyên |

Không có chỉ số “vô dụng”: AGI thấp damage hơn nhưng đổi lấy né/chí mạng; VIT không tạo damage trực tiếp; ENE có phòng thủ phép.

## 2. Tăng trưởng

- Tăng tầng nhỏ: nhận ngân sách `4 + floor(cảnh_giới × 0.75) + floor(tầng × 0.25)` điểm.
- Phá đại cảnh giới: nhận ngân sách `10 + floor(cảnh_giới × 0.75) + floor(tầng × 0.25)` điểm.
- MVP chia đều ngân sách để không có hướng build bắt buộc. Giai đoạn sau cho người chơi chọn stat, nhưng server vẫn trừ đúng `unspentStatPoints`.
- Trang bị, tâm pháp và linh căn tăng hệ số/hiệu ứng, không được nhân thẳng toàn bộ stat quá lớn.

## 3. Công thức dẫn xuất

```text
pAtk = 8 + STR×4 + AGI×0.5 + equipment.pAtk
mAtk = 8 + ENE×4 + AGI×0.5 + equipment.mAtk
pDef = 3 + VIT×2 + AGI×0.25 + equipment.pDef
mDef = 3 + ENE×1.5 + VIT×0.25 + equipment.mDef
maxHP = 100 + VIT×12 + equipment.maxHP
maxMP = 50 + ENE×8 + equipment.maxMP
```

Sát thương không trừ thẳng phòng thủ:

```text
raw = (attack × skill倍率 + scalingStat × 1.5) × affinity
damage = raw × 100 / (100 + defense)
crit = damage × 1.5
```

Phòng thủ vì thế luôn hữu ích nhưng không thể biến damage thành 0. Skill có khống chế, hồi phục hoặc AoE phải đổi lại bằng damage, MP hoặc hồi chiêu.

## 4. Tương sinh tương khắc

Ngũ hành dùng chu kỳ: Kim → Thủy → Mộc → Hỏa → Thổ → Kim. Quan hệ khắc dùng hệ số `1.12` khi tấn công đúng điểm khắc và `0.90` khi bị khắc. Quang–Ám là cặp đối lập `1.10/0.90`; Lôi–Phong là cặp nhịp độ `1.08/0.92`.

Đây là một phần ngân sách skill, không cộng thêm một bonus lớn khác. Tổng chênh lệch thực chiến mục tiêu giữ trong ±10–15%.

## 5. Quy tắc chống lạm phát

- Cap chí mạng 50%, né 35% ở MVP.
- Một skill chỉ có một hiệu ứng mạnh chính; hiệu ứng phụ phải giảm damage hoặc tăng cooldown.
- Mọi thay đổi combat phải kiểm thử cùng một bộ stat chuẩn ở 1v1, PvE 30 giây và 3v3.
- Server sẽ là nơi tính damage cuối cùng; client chỉ hiển thị kết quả.
