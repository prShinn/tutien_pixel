# SYSTEM ITEMS - code-aligned MVP

Nguon chuan: `data/mock-data.js`, route item/player trong `server.js`, va logic su dung trong `socket/game.js`.

## Item dang co trong catalog

| Code | Nhom | Cong dung hien tai |
|---|---|---|
| `STONE_LINH_NHO` | STONE | cong tu vi co ban |
| `HUYET_NGOC_NHO` | POTION | hoi HP |
| `LINH_CAN_NGOC_TUY` | LINDAN | tang tien trinh linh can |
| `THIEN_TAI_DIA_BAO` | BREAKTHROUGH_PILL | tai nguyen/phuong an ho tro dot pha |
| `MAT_LANG_NANH` | MATERIAL | vat lieu roi tu quai |
| `SWORD_BAO_KHI_1` | EQUIPMENT | trang bi mau, dong vao stat |
| `DAN_KHI_DONG` | BREAKTHROUGH_PILL | vat pham lien quan dot pha |

Ten hien thi, icon, mo ta va gia tri phai lay tu catalog server; client khong tu tao item ngoai catalog.

## Quy tac gameplay

- Quai roi loot theo server; item va xu cap nhat trong session state.
- Hoi HP/MP la thao tac co dieu kien, khong phai regen vo han.
- Trang bi anh huong stat/OVR theo balance server.
- Tu vi tang qua tai nguyen; linh luc du thua duoc giu lai khi dot pha neu server cho phep.
- Inventory hien tai la state demo trong memory; chua co DB transaction, stack policy day du hay craft.

## Chua co trong MVP

Shop/NPC mua ban, crafting, enhance, set item, phan ra do, quest item, nhieu bac dan duoc va kinh te server la thiet ke tuong lai. Khong dung cac ID cu trong tai lieu ly thuyet lam API contract.
