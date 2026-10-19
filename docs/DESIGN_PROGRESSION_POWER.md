# DESIGN PROGRESSION POWER - code-aligned MVP

Nguon chuan: `data/balance.js` va `socket/game.js`.

## Thu tu dong gop OVR

```text
OVR = realm * 1000
    + stage * 90
    + masteryContribution
    + overflowContribution
    + stat/equipment/skill contribution
    + linhCan item contribution
```

Tien trinh tu luyen duoc tinh theo `currentTuVi / tuViCanMucTieuTiepTheo`, gioi han phan co ban toi 1.0:

- `masteryContribution = min(1, progress) * 70`
- Neu linh luc vuot nguong, phan du co the dong gop them toi da 360 OVR theo trong so overflow 180.
- Canh gioi va tang van dong gop lon hon tich luy; tich luy giup vuot nguoi vua dot pha nhung khong vuot vo han.

## Tich luy va dot pha

- Nguoi choi co the tiep tuc tich luy hoac bam dot pha khi du dieu kien.
- Dot pha khong xoa linh luc ve 0; phan linh luc hop le duoc giu lai theo server.
- Dieu kien gom nguong tu vi, OVR toi thieu va tai nguyen/phuong an dot pha neu realm yeu cau.
- Tang stat va trang bi giu nguyen sau dot pha.
- Nguong tu vi duoc sinh luy tien theo 2 realm x 9 tang trong mock data, voi he so tang hien tai 1.24.

## Y nghia can bang

Canh gioi la nen, tang va linh luc la loi the trong cung canh gioi, con stat/trang bi/skill tao build. Vi vay mot nguoi tu lau co the manh hon nguoi vua dot pha neu build tot, nhung khong bien viec tich luy thanh cach bo qua toan bo canh gioi.

## Gioi han hien tai

Phan bo stat tu do, reset stat, failure table chi tiet, dan duoc theo realm va nhieu loai tai nguyen dot pha chua hoan thien. Day la phan se mo rong sau khi chot economy va database.
