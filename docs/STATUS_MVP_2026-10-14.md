# Trạng thái MVP realtime — cập nhật 2026-10-19

## Phạm vi thực tế

MVP đang chạy bằng mockdata và state RAM. Server là nguồn sự thật trong suốt vòng đời process; restart server sẽ mất users/players/session runtime. Map admin có file snapshot riêng, nhưng player progression chưa có database bền vững.

## Đã hoàn thành

- Auth register/login/demo và session riêng theo tab bằng `sessionStorage`.
- Tạo nhân vật có tên, giới tính, linh căn, chỉ số và skill khởi đầu.
- REST catalog: worlds, realms/stages, roots, items, skills, monsters, balance.
- Socket room theo map/chunk, player join/move/leave, chat.
- Movement server-authoritative: bounds, collision, path, tốc độ và correction.
- Portal server-authoritative, kiểm tra vị trí và điểm đến hợp lệ.
- Combat server-authoritative: basic attack, active skill, MP, cooldown, GCD, damage, crit, defense, affinity, status, loot.
- Passive skill tự áp dụng; active skill phải học và gán tối đa 4 ô.
- Tu vi, hấp thụ vật phẩm, tích lũy vượt mốc, OVR và đột phá thủ công.
- Quái thường/elite/boss, pack spawn, patrol, aggro riêng, chase, leash, attack, respawn.
- HUD PC, target HUD, skill bar ngang, minimap, chat, inventory, animation/effect cơ bản.

## Contract gameplay

```text
client intent
→ server validate
→ server mutate state
→ socket result
→ client state/render
```

Client không được quyết định damage, HP, loot, tọa độ hợp lệ hoặc trạng thái quái.

## Chưa hoàn thành

- Database user/player/inventory/progression.
- Save contract đầy đủ và transaction/rollback.
- Redis adapter, scale nhiều process, queue và telemetry.
- Quest, party, guild, PvP/faction, dungeon/bí cảnh.
- Boss phase/AOE/threat/loot contribution.
- Mobile input chuyên biệt.

## Kiểm thử đã chạy

- Balance/root/assets/world validators.
- Server state smoke.
- Monster pack và individual aggro smoke.
- Portal hai chiều smoke.
- Movement normal move và speed-hack rejection smoke.
