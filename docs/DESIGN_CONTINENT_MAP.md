# DESIGN - Cuu Thien Dai Luc

## Muc tieu trai nghiem

Nguoi choi phai cam nhan minh dang di qua mot chau luc co lich su, khong phai chuyen giua cac man hinh roi rac. Cam giac lien tuc den tu:

- dia hinh chuyen tiep tu thanh tri ra dong bang, chan nui, day nui va man hoang;
- quan dao, song, cong thanh, tram dich va tran phap co huong;
- map con co landmark rieng, palette rieng va bai quai rieng;
- moi vung mo dan theo tu vi, quest va kha nang sinh ton.

## Bo cuc vung lon

| Vung | Canh quan | Vai tro gameplay | Trang thai |
|---|---|---|---|
| Thanh Van Phu | Thanh tri, thon, ruong, quan dao | Bat dau, NPC, shop, huong dan | Co khung |
| Trung Nguyen Hoang Da | Dong bang, song, rung thap | Farm, loot, gap quai | Dang choi |
| Thien Linh Son Mach | Chan nui, son coc, day nui | Tich luy, khai pha, quai he nui | Co khung |
| Man Hoang Cuc Bac | Co rung, di tich, vuc sau | Noi dung cap cao/endgame | Co khung |

## Quy tac thiet ke map con

1. Moi map co mot silhouette de nhan ra tu minimap.
2. Moi map co mot landmark lon lam moc dinh huong.
3. Khong dat portal sat nhau neu khong co ly do lore.
4. Luon co vung dem walkable quanh portal.
5. Bai quai khong chan duong chinh.
6. Song/nui/rung tao bien gioi tu nhien, khong dung tuong vuong lam ranh gioi duy nhat.
7. Map moi phai co du lieu terrain va test di chuyen truoc khi gan `ACTIVE`.

## Luong mo rong

```text
Graph map
→ tao world runtime
→ sinh terrain/landmark
→ dat spawn va portal
→ validate collision/arrival
→ test movement/combat
→ publish ACTIVE
```

Ban mock hien tai chi lam buoc graph + hai map runtime dau tien. Khong sinh hang chuc map rong nhung thieu noi dung, tranh lam phinh client va lam sai cam giac tien trinh.
