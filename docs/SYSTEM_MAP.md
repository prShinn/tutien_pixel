# SYSTEM MAP - Dai chau luc phan tang

## 1. Mo hinh the gioi

Game khong dung mot canvas duy nhat cho ca chau luc. The gioi duoc chia thanh 4 tang:

```text
Continent
└── Region / Chau / Phu
    └── World map nho
        └── Landmark, NPC, bai quai, tai nguyen, portal
```

- **Dai chau luc**: graph dieu huong, lore, cac vung lon va tuyen duong.
- **Vung dia ly**: Thanh tri, thon da, vung nui, day nui, man hoang.
- **Map runtime**: terrain, collision, entity va portal; chi map nay duoc tai vao client.
- **Dia danh**: cong thanh, quan dao, son coc, di tich, bai quai; la point/zone trong map runtime.

Nguon graph mock hien tai: `data/world-structure.js`.

## 2. Châu lục mẫu

Chau luc dau tien la **Cuu Thien Dai Luc**:

```text
Thanh Van Phu
  → Trung Nguyen Hoang Da
  → Thien Linh Son Mach
  → Man Hoang Cuc Bac
```

Tuyen phat trien gameplay:

```text
Thanh tri
→ Thon da
→ Ngoai vuc / dong bang
→ Vung chan nui
→ Son coc
→ Day nui
→ Man hoang bien
→ Co dia / vuc sau
```

Map `thanh_van_tran` va `binh_nguyen` dang `ACTIVE`. Cac map con lai dang `PLANNED`: da co ma, ten, cap do, vai tro va ket noi, nhung chua cho nguoi choi di vao khi chua co terrain va noi dung.

## 3. Map runtime va graph la hai lop doc lap

`world-structure` khong duoc dung lam collision hay spawn. Moi world runtime van co contract:

```js
{
  code, tenMap, type, biome, version, w, h,
  spawnX, spawnY,
  jsonMap,
  layers: { ground, objects, elevation },
  portals, monsterSpawns, npcs, rules
}
```

Graph chi tra loi: map nam o vung nao, thu tu nao, da mo chua, map nao ket noi va cap de xuat. Runtime tra loi: nguoi choi co di duoc o day khong, vi tri nao walkable va entity nao dang ton tai.

## 4. Portal va tuyen duong

Portal la mot canh co huong giua hai map. Portal quan trong phai co cap nguoc lai:

```text
map A portal → map B arrival edge
map B portal → map A arrival edge
```

Huong den duoc mo ta boi `toX/toY`, nhung UX nen dat diem den theo bien tuong ung:

- Cong phia phai → vao bien trai map moi.
- Cong phia trai → vao bien phai.
- Cong phia tren → vao bien duoi.
- Cong phia duoi → vao bien tren.

Server van tim diem walkable gan toa do dich truoc khi cho phep join map. Client chi hien thi tran phap/portal va loading state.

## 5. Quy mo va streaming

Map con chuan hien tai khoang `600x400 world-pixel`, actor nho hon nhieu so voi map. Khi chau luc mo rong:

- Khong tai toan bo chau luc vao client.
- API tra graph nhe; API world tra map hien tai theo `code/version`.
- Socket dung room theo `mapId` va chunk/AOI cho entity.
- Terrain co the cache theo `mapCode/version`; entity chi broadcast trong vung lan can.
- Di chuyen giua map la doi room, khong phai keo dai mot canvas vo han.

## 6. Cap do noi dung

Moi map phai co `tier`, `level`, `role` va `status` trong graph. Level chi la goi y; server van quyet dinh combat va dieu kien portal.

- `CITY`, `VILLAGE`: an toan, giao dich, huong dan.
- `PLAIN`, `WILDERNESS_EDGE`: farm co ban, bai quai nho.
- `MOUNTAIN_FOOTHILL`, `MOUNTAIN`: dia hinh kho, quai manh hon.
- `MOUNTAIN_RANGE`, `MOUNTAIN_PASS`: tuyen tien trinh va cua ai.
- `ANCIENT_WILDERNESS`, `ABYSS`: man hoang/endgame, boss va di tich sau nay.

## 7. API va Admin

- `GET /api/world-structure`: tra graph dai chau luc, co `playable` va `runtime.version`.
- `GET /api/worlds/by-code?code=...`: tra world runtime cua map dang choi.
- Admin map editor tao terrain/world; sau nay map moi duoc gan vao graph bang `code`.

Database, version publish, unlock theo quest va multi-instance van de sau khi chot version gameplay.
