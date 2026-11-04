# Đánh giá roadmap gameplay realtime

## Kết luận

Các đầu việc trong ảnh đều có lý do thực hiện. Truy vết source xác nhận lỗi click NPC và áp sát quái chưa đi theo A*, quái hồi hang có thể đứng ở vật cản, `attack_effect` cho client tự chọn map/mục tiêu/sát thương để phát broadcast, và API trang bị chưa kiểm tra cảnh giới.

## Trạng thái

| Hạng mục | Đánh giá | Kết quả hiện tại |
| --- | --- | --- |
| Click xa NPC | Cần làm | Click NPC xa sẽ đi theo đường an toàn; chỉ mở cửa hàng/hội thoại/rương khi vào tầm. Đi bộ tay, click nền, click quái và đổi map hủy tương tác đang chờ. |
| Combat pathfinding | Cần làm | Áp sát quái dùng A* đang có của client, cập nhật đường khi mục tiêu đổi vị trí đủ lớn; dừng trong tầm đánh. |
| Monster return | Cần làm | Server tính đường hồi hang có chặn cắt góc, giữ đường trên quái và đi lại nếu bước kế tiếp bị địa hình chặn. |
| Chặn `attack_effect` giả mạo | Cần làm | Đã bỏ endpoint broadcast và các emit/listener cũ; client lấy kết quả combat từ `combat_result` do server phát. |
| Dọn room trống | Cần làm | Không chạy AI/respawn khi không có người chơi; giữ room 120 giây, đồng thời đợi loot hết hạn trước khi xóa toàn bộ state. |
| Kiểm tra cảnh giới trang bị | Cần làm | `requiredRealmStt` được kiểm tra từ catalog server-side; admin validation chặn dữ liệu thiếu/sai. Kiếm nhập môn hiện yêu cầu cảnh giới 1. |
| Claim loot nguyên tử | Hiện trạng đã an toàn một tiến trình | Handler vẫn giữ kiểm tra, cộng túi và xóa drop trong cùng lượt đồng bộ; đã thêm test retry và hai request giành cùng một drop. |
| `git diff --check` | Đã kiểm tra | Không phát hiện whitespace lỗi. |

## Phần backend còn lại

State gameplay hiện nằm trong `Map` của một tiến trình. Nếu bật nhiều instance hoặc chuyển loot/player sang cơ sở dữ liệu, claim đồ cần một transaction/conditional delete và idempotency key lưu bền vững; cơ chế đồng bộ hiện tại không thay thế khóa phân tán.

## Kiểm thử

Đã thêm test cho điều hướng NPC/quái, đường hồi hang, yêu cầu cảnh giới, lifecycle room, loại bỏ broadcast combat giả và tranh chấp claim loot. `npm test` chạy thành công: 86/86. Chưa kiểm thử bằng trình duyệt hoặc nhiều client thật; nên chạy gameplay smoke trước khi đưa nhánh vào demo/beta.
