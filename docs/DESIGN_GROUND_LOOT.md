# DESIGN - Ground Loot MVP

## Luong hien tai

```text
Monster death
→ server roll loot
→ server tao ground item tai toa do quai
→ socket broadcast ground_loot_spawn
→ client render icon vat pham
→ nguoi choi click vat pham
→ server kiem tra map/khoang cach/tui do
→ ground_loot_picked + inventory state
```

Loot tu dong het han sau 60 giay. Ban kinh nhat hien tai la 5 world-tile de tranh cam giac click trung ma khong nhat duoc.

## Authority

Client chi hien thi va gui `pickup_ground_item`. Client khong tu tao loot, khong tu cong xu/item va khong tu xoa drop. Server quan ly `roomGroundItems` theo map runtime.

## Gioi han demo

- Loot dang o RAM, restart server se mat drop.
- Chua co loot owner/party distribution.
- Chua co animation nhat do rieng; hien tai dung icon tren map, toast va inventory update.
- Database, transaction va persistence de sau khi chot version.
