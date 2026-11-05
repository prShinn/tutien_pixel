# Danh mục quái MySQL — 2026-11-05

Đã insert 46 bản ghi vào DB local `tu_tien_pixel`, bảng `admin_content_records`, collection `monsters`: 43 NORMAL, 2 ELITE, 1 BOSS cũ. Tổng 45 loại không phải boss, trong đó 40 loại mới. Mỗi lần insert có một bản ghi trong `admin_audit_logs` với actor/request `seed-monsters-v1`.

## Contract và phạm vi

- Business key: `code`, đồng nhất `id`; khóa DB `(collection_name, record_id)`.
- `document_json` giữ definition: tên, type, level, linh căn, HP/MP, atk/def/speed, attackType, respawnMs, sprite grid 4×4 và lootTableId.
- Loot tham chiếu các bảng rơi đồ có sẵn theo họ sói/heo/thảo yêu. Runtime HP/vị trí của từng con không thuộc catalog này.
- 40 loại mới trải trên 8 linh căn, cấp 2–20; mỗi loại có sprite sheet pixel riêng trong `public/assets/monsters/catalog-v1/`. Mỗi PNG 256×256, lưới 4×4, frame 64×64: idle, walk, attack, hit. Nền alpha trong suốt, 16 tư thế mỗi sheet. Chỉ số là bộ khởi đầu cần cân bằng qua gameplay.
- Không tự thêm bãi quái hoặc thay đổi map đang chơi. Map vẫn dùng `monsters` và `monsterSpawns` riêng; cần chọn definition và đặt spawn bằng Map Editor khi xây nội dung map.

## Đường đọc BE

Project liên kết: `D:\Setup\mine\tutien_pixel_be`.

`createApp → store.listAdminContentRecords('monsters') → mergeContentOverrides → catalog.applyAdminCollection → GET /api/monsters`.

`GET /api/admin/content/monsters` cho GM/ADMIN đọc danh mục theo middleware Admin hiện có; chưa mở mutation API cho collection này. BE cần khởi động lại để nạp catalog mới. Ba file BE được chỉnh là `src/server.js`, `src/catalog/catalog-service.js`, `src/admin/admin-content-service.js`.

## Nạp lại

Chạy bằng Node 24 tại project FE:

```powershell
node scripts/seed-monster-catalog.js --apply
```

Không có `--apply` chỉ xuất danh mục dự kiến. Mặc định đọc cấu hình `.env` của BE ở thư mục cùng cấp; có thể chỉ định `GAME_BACKEND_DIR`. Không in credential.

Seed dùng một transaction, câu lệnh có tham số, chỉ insert mã chưa có; giữ nguyên bản ghi Admin đã sửa hoặc đánh dấu xóa. Không có DDL/migration. Rollback dữ liệu phải chọn đúng các bản ghi do `seed-monsters-v1` tạo, đối chiếu audit và phiên bản trước khi xóa; không xóa toàn bộ collection.

## Artwork riêng và cập nhật DB

Ảnh được tạo bằng built-in `image_gen`; prompt của từng mã quái, nguồn ảnh và mapping `img`/`animation` nằm trong `public/assets/monsters/catalog-v1/manifest.json`. Công cụ `scripts/package-monster-sprites.py` dùng Pillow đóng gói theo lưới 4×4, resize nearest-neighbor và giữ alpha; không thay sprite bằng ảnh tô màu lại từ ba sheet cũ.

`scripts/sync-monster-sprites.js` chạy bằng Node 24 để cập nhật các bản ghi đã seed: khóa bản ghi trong transaction, chỉ thay `img`, `animation`, mô tả ảnh và tăng version. Giữ các chỉ số chiến đấu. Chặn bản ghi thiếu, đã xóa hoặc BOSS; chạy lại không ghi khi mapping không đổi. Mỗi thay đổi có before/after trong audit với actor `seed-monster-sprites-v1`, dùng để khôi phục khi cần.

Seed mới bắt buộc có mapping ảnh riêng cho cả 40 mã. Năm quái không phải boss có từ trước tiếp tục dùng ảnh cũ. Preview tổng thể: `public/assets/monsters/catalog-v1/preview.png`; preview động 8 loài: `preview-animation.gif`.

## Evidence

Lần chạy ghi DB trả `persisted: true`, `inserted: 46`; readback GROUP BY type trả BOSS=1, ELITE=2, NORMAL=43. Trước khi ghi, script kiểm tra mã không trùng, sprite tồn tại và lootTableId hợp lệ. Diff BE đã được đọc lại và `git diff --check` đạt. Chưa chạy build/unit test, chưa xác minh response HTTP sau khi khởi động BE hoặc cân bằng quái trong gameplay.

Lần bổ sung artwork trả `persisted: true`, `updated: 40`, `total: 40`, `distinctImages: 40` từ MySQL. Đóng gói đủ 40 sheet, kiểm tra alpha và ô ảnh không rỗng cho toàn bộ 640 frame; đã xem bảng preview 40 loài và sample sheet. Đây là kiểm tra asset và readback thao tác ghi dữ liệu, chưa thay thế nghiệm thu animation trong game.
