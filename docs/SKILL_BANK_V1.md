# Ngân hàng kỹ năng và ảnh — v1

## Phạm vi

Mở rộng 66 kỹ năng lên 102: thêm 36 chiêu chủ động, mỗi linh căn KIM/MOC/THUY/HOA/THO/QUANG/AM/PHONG/LOI thêm 4 chiêu. Tổng dự kiến 93 ACTIVE, 9 PASSIVE. Mỗi nhóm mới có tấn công đơn mục tiêu tier 1, diện rộng tier 2, hỗ trợ tier 2 và tuyệt kỹ diện rộng tier 3. COMMON tiếp tục dùng 3 kỹ năng hiện có.

`data/skill-bank-v1.json` chứa danh sách đầy đủ, chỉ số, mô tả, ảnh và 36 code mới. Giữ nguyên code cũ và các chỉnh sửa Admin đã lưu. Kỹ năng mới sử dụng các cơ chế BE đã hỗ trợ: PHYS/MAGIC, AoE, heal, shield, buff và trạng thái; không thêm cơ chế chiến đấu chưa triển khai.

## Contract

- `code`: business key không đổi; DB dùng `(collection_name='skills', record_id=code)`.
- `img`: đường dẫn PNG local `./assets/skills/bank-v1/<code>.png`, khác nhau cho từng kỹ năng; icon hiển thị là 64×64 pixel.
- `icon`: emoji cũ vẫn giữ để tương thích log dạng text; giao diện dùng `img`.
- `vfxForm`: cấu hình hình thức hiệu ứng trình diễn cho 36 chiêu mới; chỉ nhận các form đã có trong SkillVFX. Ưu tiên profile Admin → vfxForm hợp lệ → form mặc định theo code/effect. Không quyết định sát thương hoặc trạng thái BE.
- `hoiChieu`, `thoiGianBuff`: giây ở BE, mapper FE chuyển sang tick. `satThuong`: hệ số; `mpTieuHao`: MP; `dienRong`: bán kính AoE; `tier`: điều kiện cảnh giới hiện có.
- `targetType`: SELF với chiêu hỗ trợ hệ số 0, ENEMY với tấn công. Học qua `/api/player/skills/learn` theo route hiện hành; trang bị tối đa 4 chiêu ACTIVE. BE tiếp tục kiểm tra đã học và linh căn.

## Asset và FE

Ảnh được tạo bằng built-in `image_gen`, theo atlas từng linh căn, cắt thành PNG riêng bằng `scripts/package-skill-icons.py` (Pillow, nearest-neighbor). Prompt đầy đủ, thứ tự ô ảnh và nguồn atlas ở `public/assets/skills/bank-v1/manifest.json`; bảng preview ở `preview.png`.

Trace: MySQL → catalog startup → `/api/skills` hoặc `/api/skills/catalog` → GameData/mapBESkillToFE → `img` và `vfxForm` → UI.createPixelIcon / thanh kỹ năng / tooltip / buff HUD / SkillVFX.profile. Mapper FE→BE cũng giữ hai trường này. UI chỉ nhận ảnh PNG trong cây local assets.

Đây là icon minh họa kỹ năng và cấu hình dùng các hiệu ứng có sẵn; chưa tạo thêm sprite animation hiệu ứng chiến đấu mới.

## Ghi dữ liệu

Chạy Node 24, dùng cấu hình `.env` của BE liên kết (hoặc `GAME_BACKEND_DIR`):

```powershell
node scripts/expand-skill-bank.js --prepare
# Tạo/cắt artwork theo manifest trước khi ghi DB.
node scripts/expand-skill-bank.js --apply
```

Prepare đọc DB, hợp nhất catalog hiện tại và xuất kế hoạch; không phục hồi tombstone. Apply kiểm tra đường dẫn ảnh, mã/ảnh không trùng, khóa từng record trong một transaction và ghi audit actor `skill-bank-v1`. Với record hiện có chỉ thêm ảnh, không ghi đè chỉ số Admin. Bản ghi mới dùng definition đầy đủ. Chạy lại không ghi nếu document không đổi. Không có DDL hoặc xóa dữ liệu.

Before/after trong `admin_audit_logs` là căn cứ rollback từng record; đối chiếu version trước khi phục hồi để không ghi đè chỉnh sửa mới hơn. BE cần khởi động lại để nạp catalog DB. Chỉ số mới cần nghiệm thu cân bằng gameplay.

## Xác minh

Đã rà source và diff theo luồng API→mapper→consumer. Tác vụ hiện tại không yêu cầu chạy build/unit test; các kiểm tra đó và nghiệm thu trong game chưa thực hiện. Readback DB và kết quả đóng gói artwork được ghi bổ sung sau khi apply hoàn tất.

Kết quả apply thực tế: `persisted: true, inserted: 102, updated: 0, total: 102, images: 102`. DB trước đó chưa có skill override, nên ghi cả 66 định nghĩa gốc có ảnh và 36 chiêu mới; không phải thêm 102 chiêu mới. Đã đóng gói 102 PNG, xem bảng preview và đọc lại diff. Ví dụ `TU_DIEN_XUYEN_TAM`: hệ LOI, tier 1, hệ số 1.15, MP 7, hồi 4 giây, form `thunder-strike`, ảnh `./assets/skills/bank-v1/tu_dien_xuyen_tam.png`; mapper giữ nguyên ảnh/form tới thanh kỹ năng và SkillVFX.
