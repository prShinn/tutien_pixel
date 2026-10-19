# SYSTEM MONSTERS - code-aligned MVP

Nguon chuan: `data/mock-data.js` va `socket/game.js`.

## Pham vi hien tai

- 6 mau quai: MOC_NHAN, HOANG_SOI, THO_HEO, DOC_THAO, XICH_LUYEN_HO, HUYET_NGUYET_LANG.
- Phan loai dang dung: `NORMAL`, `ELITE`, `BOSS`; chua co `MINI_BOSS` hay `EVENT_BOSS`.
- Map binh nguyen co 5 bai, tong 17 instance quai. Moi instance co vi tri spawn va `packId`.
- Elite/Boss co `respawnMs` rieng; quai chet, roi loot va respawn theo server state.

## AI va aggro

Trang thai thuc te: idle/patrol -> chase -> attack -> return -> dead/respawn.

- Quai chi aggro nguoi choi nam trong pham vi; khong tu dong keo ca bai.
- Moi instance giu `targetPlayerId` rieng, nen hai nguoi choi co the bi cac quai khac nhau bam.
- Quai bo cuoc khi vuot leash, sau do quay ve tam bai.
- Server cap nhat vi tri, va cham, damage va trang thai; client chi render snapshot.

## Combat va loot

Nguoi choi gui y dinh attack/skill. Server kiem tra muc tieu con song, cung world, range va cooldown, sau do tinh damage theo stat, linh can, skill va phong thu. Damage khong duoc quyet dinh boi hit animation client.

Loot hien tai gom xu, linh thach, vat lieu va mot so item mau/catalog. Quai la nguon farm tu vi thong qua loot tai nguyen; khong tu dong cong tu vi khi quai chet.

## Mo rong sau MVP

Boss phase, skill quai, chain aggro, co-op scaling, boss event, quest drop va loot table phuc tap chua duoc coi la da implement. Khi them phai giu nguyen tac server-authoritative va test aggro rieng tung instance.
