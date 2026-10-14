# Thiết kế cân bằng Linh Căn

## Mục tiêu

Linh căn là bản sắc và hướng chơi, không phải lựa chọn khiến người chơi chọn sai là hỏng nhân vật. Mỗi linh căn có điểm mạnh rõ ràng, điểm yếu có thể khắc chế, và tổng ngân sách sức mạnh tương đương.

## Khung sức mạnh chung

- Mỗi linh căn có 5 kỹ năng trong pool: 2 nhập môn, 2 bản sắc, 1 tuyệt kỹ; loadout MVP hiện kích hoạt 4 kỹ năng theo client cũ.
- Bộ kỹ năng dùng cùng khung chi phí MP, hồi chiêu, tầm đánh và hệ số sát thương.
- Kỹ năng khống chế hoặc duy trì được giảm sát thương trực tiếp để đổi lấy giá trị hiệu ứng.
- Mỗi linh căn bắt buộc có ít nhất 1 đòn đơn và 1 đòn diện rộng có sát thương; không có hệ nào bị khóa khả năng train quái, đi bí cảnh hoặc solo.
- Hồi HP không nằm trong skill chung. MVP chỉ để Mộc và Quang có hồi HP rõ ràng; các hệ công kích đổi giá trị sang damage, chí mạng, xuyên/giảm giáp hoặc khống chế.
- Skill chung `Thiền Cảnh` hồi MP, không hồi HP, để mọi hệ có công cụ duy trì nhưng không xóa nhược điểm vai trò.
- Đánh trúng linh căn bị bản thân khắc chế được cộng chí mạng động `2%` ở cùng lực; bonus tăng/giảm theo chênh lệch linh căn và tối đa `4%`.
- Hiệu ứng mạnh có thời hạn, giới hạn mục tiêu và diminishing return ở server.
- Linh căn không cộng lượng chỉ số thô quá lớn; chỉ số đến từ cảnh giới, trang bị và tu luyện.

## Vai trò 9 linh căn

| Linh căn | Vai trò | Điểm mạnh | Điểm yếu |
|---|---|---|---|
| Kim | Đơn mục tiêu | Xuyên giáp, kết liễu | Ít AoE |
| Mộc | Sustain | Hồi phục, trói | Burst thấp |
| Thủy | Control | Tầm xa, làm chậm | Sát thương trung bình |
| Hỏa | Burst | Dồn damage, thiêu đốt | Phòng thủ thấp |
| Thổ | Defender | Khiên, chống chịu | Chậm |
| Quang | Support | Thanh tẩy, tăng tốc | Phụ thuộc đồng đội |
| Ám | Attrition | Nguyền, suy yếu | Cần thời gian tích hiệu ứng |
| Phong | Mobility | Cơ động, né, đẩy nhịp | Kết liễu vừa |
| Lôi | Chain burst | Liên kích, choáng ngắn | Yếu khi bị tách mục tiêu |

## Quy tắc kiểm thử

1. So sánh cùng cảnh giới, trang bị chuẩn, lượng MP và thời gian giao tranh.
2. Đo DPS đơn mục tiêu, hiệu quả AoE, sống sót và giá trị khống chế/hỗ trợ.
3. Mục tiêu MVP: mỗi linh căn nằm trong khoảng ±10–15% theo từng nhóm; không linh căn nào đứng đầu cả 4 nhóm.
4. Kiểm thử 1v1, đánh quái 30 giây, hộ tống đồng đội và giao tranh 3v3.
5. Nếu lệch, chỉnh MP, hồi chiêu hoặc thời lượng trước khi chỉnh sát thương.
6. Không dùng bảng khắc cứng: hệ số khắc là điểm xuất phát, sau đó điều chỉnh theo sức mạnh linh căn của hai bên; mục tiêu là tạo lợi thế khoảng 5–15%, không khóa lối chơi.

## Lộ trình

- Giai đoạn 1: server cung cấp metadata và 45 kỹ năng mock; client tải và hiển thị.
- Giai đoạn 2: chuẩn hóa effect registry trên server (`heal`, `shield`, `slow`, `root`, `burn`, `stun`, `cleanse`, `curse`, `speed`).
- Giai đoạn 3: server authoritative combat, log trận đấu và benchmark tự động.
- Giai đoạn 4: playtest, thu thập tỷ lệ chọn/thắng và cân chỉnh theo dữ liệu thật.
