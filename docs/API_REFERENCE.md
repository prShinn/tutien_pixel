# 🔌 API REFERENCE — FE ↔ Modular BE

> Local BE URL: `http://localhost:3800` (FE API origin remains configurable)
> Auth: `Bearer <token>` trong header `Authorization`

---

## 🔐 Auth

| Method | Endpoint | Body | Response | Auth |
|--------|----------|------|----------|------|
| POST | `/api/auth/register` | `{username, password}` | `{token, user}` | ❌ |
| POST | `/api/auth/login` | `{username, password}` | `{user: {id, username, role}, token, accessToken, refreshToken}` | ❌ |
| GET | `/api/auth/me` | — | `{user: {id, username, role}}` | ✅ |
| POST | `/api/auth/refresh` | `{refreshToken}` | `{user: {id, username, role}, token, accessToken, refreshToken}` | ❌ |
| POST | `/api/auth/logout` | `{refreshToken}` | `{ok: true}` | ❌ |

Đăng ký mới dùng username 3-20 ký tự (chữ, số, `_`, `-`) và password 8-72 byte UTF-8.
BE cấp access token 15 phút và refresh token 30 ngày; mỗi lần refresh xoay vòng token cũ. Endpoint demo chỉ hoạt động ngoài production. Đăng ký công khai không cấp role quản trị; role `GM`/`ADMIN` phải do BE cấp.

---

## 🧑 Player

| Method | Endpoint | Body | Response | Auth |
|--------|----------|------|----------|------|
| GET | `/api/player/me` | — | PlayerData | ✅ |
| GET | `/api/player/state` | — | PlayerData (tương thích cũ) | ✅ |
| GET | `/api/player/by-user/:userId` | — | PlayerData | ✅ |
| POST | `/api/player` | `{userId, name, gender, linhCan, stats, mapCode?}` | PlayerData do server khởi tạo | ✅ |
| PUT | `/api/player/:id` | `{name?, gender?, img?}` | PlayerData | ✅ |

Server tự cấp inventory/equipment ban đầu và tự chọn điểm sinh từ map khởi đầu đã xuất bản.
Các trường `inventory`, `jsonIventory`, `equipment`, `x` và `y` trong request tạo nhân vật
không được dùng làm nguồn state. Trang bị và inventory chỉ thay đổi qua endpoint gameplay
chuyên biệt; vị trí online được cập nhật bởi socket server.

### PlayerData Fields

```typescript
{
  id: number;
  userId: number;
  name: string;
  linhCan: string;           // "KIM" | "MOC" | ...
  maCanhGioi: string;        // "LUYEN_THE" | ...
  tangTuVi: number;          // 1-9
  tuViHienTai: number;
  tuViLenCap: number;
  tuViLinhCan: number;
  stats: { str, agi, vit, ene: number };
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  xu: number;
  x: number;
  y: number;
  mapCode: string;
  mapId: string;
  jsonIventory: string;      // JSON.stringify([...items])
  skills: string;            // JSON.stringify([...skills])
  equip_slot: string;        // JSON.stringify({weapon, armor, ...})
  faction: "CHINH" | "MA";
  guildId: number | null;
  crit: string;
  speed: number;
}
```

---

## 🌍 Worlds (Maps)

| Method | Endpoint | Query | Response | Auth |
|--------|----------|-------|----------|------|
| GET | `/api/worlds/default` | — | WorldData | ❌ |
| GET | `/api/worlds/by-code` | `?code=xxx` | WorldData | ❌ |
| GET | `/api/worlds` | — | WorldSummary[] (không chứa lưới địa hình) | ❌ |
| POST | `/api/worlds` | WorldData | WorldData+id | Admin |
| PUT | `/api/worlds/:id` | WorldData | WorldData | Admin |

Admin FE đăng nhập qua `POST /api/auth/login`, xác minh role bằng `GET /api/auth/me`, rồi gửi `Authorization: Bearer <accessToken>` cho các endpoint quản trị. Chỉ role `GM` và `ADMIN` được phép; FE lưu phiên trong `sessionStorage`, refresh token khi access token hết hạn và gọi logout để thu hồi refresh token. FE không gửi `x-admin-key`.

Các endpoint quản trị map gồm:

- `GET /api/admin/worlds`: danh sách map và phiên bản.
- `POST /api/admin/worlds`: tạo map mới.
- `PUT /api/admin/worlds/:code`: cập nhật map và tăng version.
- `DELETE /api/admin/worlds/:code`: xóa map do Admin tạo; không xóa map seed.

### WorldData Fields

```typescript
{
  id: number;
  code: string;
  tenMap: string;
  type: "CITY"|"VILLAGE"|"PLAIN"|"PLATEAU"|"ICE_MOUNTAIN"|"VOLCANO"|"DUNGEON"|"WARZONE";
  w: number;
  h: number;
  isDefault: boolean;
  spawnX: number;
  spawnY: number;
  jsonMap: number[][];       // 2D tile array
  portals: Portal[];
  monsters: MonsterDef[];
  npcs: NpcDef[];
}
```

---

## 🌌 Cảnh Giới (Realms)

| Method | Endpoint | Response |
|--------|----------|----------|
| GET | `/api/canh-gioi` | Realm[] (tất cả, sorted by stt) |
| GET | `/api/canh-gioi/stt/:stt` | Realm |
| GET | `/api/canh-gioi/:id` | Realm |

```typescript
{
  id: number;
  stt: number;               // 1-13
  code: string;
  tenCanhGioi: string;
  soTang: number;            // 9 hoặc 1
  tuViTienCap: number;       // base tu vi để bắt đầu realm này
  tangTuVi: Array<{           // bảng tầng do server công bố
    id: string;
    stt: number;
    tenTang: string;
    tuViCan: number;
    nguongDotPha: number;
    mucTieu: string;
    tuViCanMucTieuTiepTheo: number;
    tangDich: number;
    canhGioiDich: number;
    ovrToiThieu: number;
    daiCanhGioi: boolean;
  }>;
  heSoTang: number;          // >= 1.2
  moTa: string;
  danPhaCanh: string | null; // item ID của đan phá cảnh
}
```

---

## 💎 Items

| Method | Endpoint | Response |
|--------|----------|----------|
| GET | `/api/items` | Item[] (tất cả) |
| GET | `/api/items/:id` | Item |
| GET | `/api/items?type=STONE` | Item[] filtered |

```typescript
{
  id: number;
  maDo: string;             // item code
  tenDo: string;
  icon: string;
  loai: string;             // type code
  giaTriTuVi?: number;
  giaTriTang?: number;
  statKey?: string;
  str?: boolean; agi?: boolean; vit?: boolean; ene?: boolean;
  healHp?: number;
  healMp?: number;
  linhCan?: string;
  tuViLinhCanVal?: number;
  giaMua: number;
  giaBan: number;
  moTa: string;
  // Equipment fields:
  grade?: number;
  weaponType?: string;
  reqRealm?: number;
  stats?: Record<string, number>;
  effects?: string[];
}
```

---

## ⚡ Skills

| Method | Endpoint | Response |
|--------|----------|----------|
| GET | `/api/skills` | Skill[] (tất cả) |
| GET | `/api/skills?linhCan=KIM` | Skill[] filtered |
| GET | `/api/skills?tier=1` | Skill[] filtered |

```typescript
{
  id: number;
  code: string;
  name: string;
  icon: string;
  linhCan: string;          // "KIM" | "NORMAL" | ...
  tier: number;             // 1-3
  mpTieuHao: number;
  hoiChieu: number;         // cooldown seconds
  range: number;
  aoe: boolean;
  aoeR: number;             // aoe radius in tiles
  type: string;             // "damage" | "buff" | "debuff" | "heal"
  effect: string;           // effect code
  effectVal: number;
  thoiGianBuff: number;     // buff duration seconds
  satThuong: number;        // damage % of pAtk/mAtk
  moTa: string;
}
```

---

## 🐺 Monsters

| Method | Endpoint | Response |
|--------|----------|----------|
| GET | `/api/monsters` | MonsterDef[] |
| GET | `/api/monsters/:code` | MonsterDef |

---

## 🏯 Guild (Tương lai)

| Method | Endpoint | Response |
|--------|----------|----------|
| GET | `/api/guilds/:id` | GuildData |
| POST | `/api/guilds` | GuildData |
| PUT | `/api/guilds/:id/member` | — |

---

## 🎯 Quests (Tương lai)

| Method | Endpoint | Response |
|--------|----------|----------|
| GET | `/api/quests` | Quest[] |
| POST | `/api/quest/accept/:id` | — |
| POST | `/api/quest/complete/:id` | Reward |

---

## 🔌 Socket.io Events

### Server → Client
| Event | Data | Mô tả |
|-------|------|-------|
| `world_state` | `{players}` | Danh sách player cùng map |
| `player_join` | PlayerInfo | Có player vào map |
| `player_leave` | `{id}` | Có player rời map |
| `player_move` | `{id, x, y}` | Player khác di chuyển |
| `player_map` | `{id, mapCode, x, y}` | Player đổi map |
| `chat_message` | `{username, message, id}` | Tin nhắn chat |
| `faction_chat` | `{username, message, faction}` | Chat kênh phe |
| `server_msg` | `{text}` | Thông báo hệ thống |
| `war_start` | `{mapCode, duration}` | Bắt đầu chiến tranh |
| `war_score` | `{chinh, ma, timeLeft}` | Cập nhật điểm chiến tranh |
| `attack_fx` | `{attackerName, targetId, damage}` | Hiệu ứng tấn công |

### Client → Server
| Event | Data | Mô tả |
|-------|------|-------|
| `join_world` | `{mapId, x, y}` | Tham gia map |
| `move` | `{x, y, mapId}` | Player di chuyển |
| `map_change` | `{mapId, x, y}` | Đổi map |
| `chat` | `{message}` | Gửi chat global |
| `faction_chat` | `{message}` | Gửi chat phe |
| `attack_player` | `{targetId, damage}` | PvP attack (chiến trường) |

Trong production, `join_world` dùng map và vị trí đã lưu ở server; `mapId`, `mapCode`, `x`
và `y` từ client không thể chọn map hay đặt tọa độ. Tài khoản demo ở môi trường dev vẫn
được phép chọn map/tọa độ để kiểm tra nội dung, nhưng vị trí luôn được hiệu chỉnh về ô đi được.

### Command contract chuẩn

Gameplay realtime mới dùng một event duy nhất:

```js
socket.emit("game_command", {
  requestId: "unique-request-id",
  type: "movement.intent",
  payload: { x: 301, y: 200, mapCode: "thanh_van_tran" }
}, (ack) => {});
```

Command hợp lệ: `world.join`, `movement.intent`, `map.change`, `combat.attack`,
`combat.skill`, `loot.pickup`, `chat.send`, `world.resync`.

Ack thành công có dạng `{ ok: true, requestId, command, serverTime, result }`.
Ack lỗi có dạng `{ ok: false, requestId, command, serverTime, error: { code, message } }`.
`requestId` được deduplicate trong 30 giây trên mỗi socket; `world.resync` giới hạn một lần/giây.
Các event cũ vẫn được server nhận tạm thời và chuyển vào cùng handler để tương thích demo.
