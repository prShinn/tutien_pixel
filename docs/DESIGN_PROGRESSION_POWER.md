# Thiết kế sức mạnh theo cảnh giới và tu luyện

## Nguyên tắc

Không dùng một con số OVR duy nhất để quyết định thắng thua. Sức mạnh gồm 5 lớp:

1. **Cảnh giới**: nền sức mạnh, tạo khoảng cách lớn giữa các đại cảnh giới.
2. **Tầng tu vi**: lợi thế trong cùng đại cảnh giới.
3. **Tu luyện dang dở**: phần trăm tiến độ giữa hai lần đột phá.
4. **Thuộc tính**: hướng build công/thủ/pháp/cơ động.
5. **Trang bị và thần thông**: lợi thế có thể giúp người mới đột phá vượt người cũ build kém.

## Công thức OVR

```text
OVR = cảnhGiới×1000
    + tầng×90
    + tiếnĐộTuLuyện×70
    + (pAtk + mAtk + 1.5×(pDef + mDef) + 0.1×maxHP + 0.1×maxMP)
    + điểmTrangBị
    + sốSkillĐãHọc×18
```

`tiếnĐộTuLuyện = tuViHienTai / tuViLenCap`, giới hạn 0..1. Vì vậy:

- Cùng cảnh giới, người ở tầng cao hơn hoặc gần đột phá hơn chắc chắn có OVR cao hơn nếu các phần còn lại tương đương.
- Người vừa đột phá có thể vượt người tu lâu nhưng thuộc tính/trang bị thấp.
- Trang bị tốt tạo lợi thế thật, nhưng không thay thế được cảnh giới.

## Khi tu luyện và đột phá

- Hấp thụ tài nguyên tăng `tuViHienTai`, từ đó tăng dần phần `tiếnĐộTuLuyện×70`; không cộng stat ảo theo từng viên đá.
- Mỗi tầng nhỏ nhận ngân sách stat: `4 + floor(cảnhGiới×0.75) + floor(tầng×0.25)`.
- Phá đại cảnh giới nhận ngân sách lớn hơn: `10 + floor(cảnhGiới×0.75) + floor(tầng×0.25)`.
- Sau đột phá, tiến độ về 0 nhưng cảnh giới tăng 1. Stat đã nhận và trang bị vẫn giữ nguyên.
- Về sau có thể cho người chơi tự chia ngân sách; server phải giữ `unspentStatPoints` và xác thực mỗi lần cộng.

## Ví dụ hành vi mong muốn

- A: cùng cảnh giới, tầng 1, 0% tu luyện < B: tầng 1, 90% tu luyện.
- C: vừa đột phá cảnh giới kế tiếp, trang bị tốt < D: cảnh giới cũ, build stat/trang bị rất mạnh có thể xảy ra trong PvP nhỏ, nhưng C vẫn có nền OVR cảnh giới cao hơn.
- Không cho một stat tăng vô hạn: chí mạng tối đa 50%, né tối đa 35%; skill và trang bị dùng ngân sách riêng.

