# Trạng thái MVP realtime - 2026-10-14

## Phạm vi đã chốt

MVP hiện tại dùng RAM/mock data, chưa dùng database. Server giữ state gameplay; client chỉ gửi intent và render kết quả. Khi restart process, dữ liệu mock reset là chủ đích.

## Contract gameplay hiện tại

### Server authoritative

- `attack_request`: client gửi `targetId`, `skillCode` tùy chọn; `skillCode` canonical là `code`, server vẫn tương thích `id` số. Server kiểm tra khoảng cách, cooldown, MP, damage, hit, HP và loot.
- `skill_request`: server xử lý skill hồi phục/buff; skill offensive đi qua `attack_request`.
- `monster_update`: server định kỳ gửi vị trí, HP, state, target, status effect và dead state của toàn bộ monster trong map.
- `player_combat_result`: server gửi sát thương monster gây lên player.
- `combat_result`: server gửi kết quả player đánh monster, gồm hit, damage, MP/cooldown và loot trực tiếp vào inventory.
- Skill tấn công (`satThuong > 0`) đi qua `attack_request`; skill tự thân/hỗ trợ (`heal`, `restore_mp`, `shield`, `speed`, `cleanse`) đi qua `skill_request`.
- Combat có GCD ngắn dùng chung, nhưng cooldown đánh thường và cooldown từng skill được tách riêng.
- Ngân sách sát thương tách riêng trong `BALANCE.damage`: đánh thường dùng `basicMultiplier=0.5` và `basicStatScale=0.5`; skill dùng `satThuong*skillMultiplier` với `skillMultiplier=1.25` và `skillStatScale=1.5`. Vì vậy AGI/STR chỉ tăng nền, không thể biến đánh thường thành skill; skill là burst có MP, cooldown và hiệu ứng.
- `monster_sync` là event cũ, bị bỏ qua để client không thể điều khiển vị trí monster.
- Client khóa request combat kế tiếp trong lúc chờ kết quả, sau đó mở lại cả khi nhận kết quả thành công hoặc `action_error`.

### Skill bank MVP

- Buff identity belongs to linh căn, not the common bank: `KIM=buff_atk`, `HOA=buff_crit`, `MOC=buff_hp_regen`, `THUY/THO=buff_vitals`, `THO=buff_def`, `PHONG/QUANG=buff_spd`, `AM=buff_cast`; `LOI` keeps its chain/stun identity.
- Mỗi linh căn có ít nhất một đòn đơn và một đòn diện rộng. Skill chung `Thiền Cảnh` chỉ hồi MP; hồi HP là lợi thế bản sắc của Mộc/Quang, tránh việc hệ công kích vừa burst cao vừa sustain cao.
- Ngũ hành dùng quan hệ sinh và khắc động: khắc bắt đầu `1.12/0.94`, sinh `0.98/1.02`, đồng hành `0.92`; server điều chỉnh theo chênh lệch `linhCanStrength`, không áp dụng hard-counter tuyệt đối.
- `linhCanStrength` MVP lấy từ tu vi linh căn, cảnh giới, tầng tu vi; quái dùng cấp độ làm nền. Linh căn bị khắc nhưng tu luyện đủ mạnh vẫn có thể đưa hệ số về trung tính.
- Bên có quan hệ `khắc` được cộng crit động: cơ bản `2%`, tối đa `4%`; bên bị khắc không nhận bonus crit.
- Buffs are stored server-side with `value`, `duration`, `expiresAt`; server applies combat, cooldown and regeneration effects, client only renders the returned state.
- HP/MP regeneration is server-ticked and delivered through `player_state_update`, so multiple tabs remain consistent.

### Monster MVP

- Monster có aggro, chase, leash, attack cooldown, respawn và collision cơ bản.
- Status effect MVP gồm `burn`, `slow`, `root`, `stun`, `armor_break`; server hết hạn và tick damage.
- Loot table theo monster có item drop + xu. Ground item/loot reservation chưa nằm trong MVP.

### Inventory/equipment MVP

- `POST /api/player/equipment/equip` nhận item trong inventory, trả item cũ về inventory và cập nhật combat power.
- `POST /api/player/equipment/unequip` tháo item về inventory.
- Equipment được đưa vào player snapshot và payload save; chưa bền vững qua restart vì chưa có DB.

## Luồng kiểm tra bắt buộc

```text
client intent -> server validate -> server mutate state -> socket result -> client render
```

Không thêm damage, HP, loot hoặc vị trí monster từ client vào payload tin cậy.

## Việc tiếp theo

1. Thêm test combat loot/status/equipment tự động.
2. Chuẩn hóa toàn bộ API_REFERENCE theo event thực tế, loại dần legacy event.
3. Khi gameplay chốt, tách repository RAM sang DB/Redis mà không đổi contract client.
