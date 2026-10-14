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

## 4. Âm dương và tương sinh tương khắc động

Ngũ hành không phải công tắc thắng thua. Mỗi nhân vật có `linhCanStrength`, lấy từ tu vi linh căn, cảnh giới, tầng tu vi; quái dùng cấp độ làm nền. Hệ số được điều chỉnh theo chênh lệch:

```text
strengthGap = clamp((sức_mạnh_attacker - sức_mạnh_defender) / max(sức_mạnh_hai_bên), -1, 1)
modifier = baseRelation + strengthGap × 0.08
```

- Khắc: Kim → Mộc → Thổ → Thủy → Hỏa → Kim. Ở cùng sức mạnh, bên khắc dùng `1.12`, bên bị khắc khi tấn công dùng `0.94`.
- Thổ khắc Thủy không áp chế tuyệt đối: Thủy yếu hơn sẽ bị giảm damage, nhưng Thủy mạnh hơn có thể kéo hệ số về `1.00` hoặc cao hơn.
- Đồng hành cùng hành dùng `0.92`: Thủy có thể chặn Thủy bằng cộng hưởng bản mệnh.
- Tương sinh: Kim → Thủy → Mộc → Hỏa → Thổ → Kim. Bên sinh ra hành kia dùng `0.98`, bên được sinh dùng `1.02`; đây là dao động nhẹ.
- Quang–Ám và Lôi–Phong là cặp đặc biệt, vẫn chịu cùng quy tắc chênh lệch sức mạnh.
- Khi thật sự ở phía `khắc`, người tấn công được thêm `2%` tỷ lệ chí mạng ở cùng sức mạnh; chênh lệch linh căn điều chỉnh bonus trong khoảng `0–4%`. Phần lớn crit vẫn đến từ AGI, trang bị và buff riêng.

Server xét quan hệ khắc trước, rồi mới xét tương sinh nếu không có quan hệ khắc trực tiếp. Build, trang bị, cảnh giới và tu vi linh căn vẫn quyết định kết quả cuối.

Đây là một phần ngân sách skill, không cộng thêm một bonus lớn khác. Tổng chênh lệch thực chiến mục tiêu giữ trong ±10–15%.

## 5. Quy tắc chống lạm phát

- Cap chí mạng 50%, né 35% ở MVP.
- Một skill chỉ có một hiệu ứng mạnh chính; hiệu ứng phụ phải giảm damage hoặc tăng cooldown.
- Không đưa hồi HP vào skill chung; sustain là ngân sách bản sắc của Mộc/Quang, còn hệ khác phải trả giá bằng MP, CD hoặc điều kiện kích hoạt.
- Skill diện rộng gây 100% damage lên mục tiêu chính và 72% lên mục tiêu phụ để không vượt ngân sách chỉ vì gom nhiều quái.
- Ngân sách skill theo tầng: T1 là công cụ duy trì, T2 đổi damage lấy bản sắc/khống chế, T3 là burst hoặc AoE có MP và hồi chiêu lớn; không dùng T3 vừa burst tối đa vừa có mọi buff mạnh.
- Mọi thay đổi combat phải kiểm thử cùng một bộ stat chuẩn ở 1v1, PvE 30 giây và 3v3.
- Server sẽ là nơi tính damage cuối cùng; client chỉ hiển thị kết quả.
