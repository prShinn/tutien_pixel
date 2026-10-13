# Plan triển khai Linh Căn cân bằng

Phần thuộc tính, sát thương, phòng thủ và ngân sách tương sinh/tương khắc được chuẩn hóa tại [DESIGN_POWER_BUDGET.md](./DESIGN_POWER_BUDGET.md).

Phần tiến độ tu luyện, OVR và quan hệ giữa cảnh giới–stat–trang bị được chuẩn hóa tại [DESIGN_PROGRESSION_POWER.md](./DESIGN_PROGRESSION_POWER.md).

## Đã thiết kế

- Chốt 9 vai trò không trùng nhau nhưng dùng chung ngân sách sức mạnh.
- Mỗi linh căn có pool 5 kỹ năng theo cấu trúc nhập môn → bản sắc → tuyệt kỹ; MVP giữ loadout 4 kỹ năng để tương thích giao diện hiện tại.
- Server giữ dữ liệu gốc; client chỉ tải, gán và hiển thị kỹ năng.

## Đã thực hiện trong MVP

- Bổ sung metadata vai trò, bản sắc và nội tại cho 9 linh căn trong mock server.
- Thay bộ 4 kỹ năng mẫu bằng 45 kỹ năng chủ động, 6 kỹ năng chung và 9 kỹ năng bị động.
- Thêm catalog server, học skill qua sách/ngọc mock và trang bị tối đa 4 skill chủ động.
- Giữ schema API hiện tại: `tier`, `mpTieuHao`, `hoiChieu`, `satThuong`, `effect`, `effectVal`.
- Thêm validator phát hiện thiếu linh căn, tier hoặc sai số lượng kỹ năng.

## Việc tiếp theo

- Hiển thị vai trò và nội tại ở màn chọn linh căn.
- Đăng ký effect server, không cho client tự quyết định damage.
- Thêm bot benchmark và telemetry theo trận.

## Contract skill hiện tại

- `GET /api/skills/catalog`: trả catalog, `learnedSkills`, `equippedSkills`.
- `POST /api/player/skills/learn`: body `{ skillCode, source }`; server kiểm tra skill chung hoặc đúng linh căn.
- `PUT /api/player/skills/equip`: body `{ skillCodes }`; server giới hạn 4 skill chủ động và chỉ nhận skill đã học.
- Skill bị động không chiếm loadout; khi combat authoritative hoàn thiện, server sẽ áp dụng passive vào stat/effect.
