# 🔌 API REFERENCE — Backend :8090

> Base URL: `http://localhost:8090`  
> Auth: `Bearer <token>` trong header `Authorization`

---

## 🔐 Auth

| Method | Endpoint | Body | Response | Auth |
|--------|----------|------|----------|------|
| POST | `/api/auth/register` | `{username, password}` | `{token, user}` | ❌ |
| POST | `/api/auth/login` | `{username, password}` | `{token, user}` | ❌ |
| GET | `/api/auth/me` | — | `{user}` | ✅ |

---

## 🧑 Player

| Method | Endpoint | Body | Response | Auth |
|--------|----------|------|----------|------|
| GET | `/api/player/:id` | — | PlayerData | ✅ |
| GET | `/api/player/by-user/:userId` | — | PlayerData | ✅ |
| POST | `/api/player` | PlayerData | PlayerData+id | ✅ |
| PUT | `/api/player/:id` | PlayerData | PlayerData | ✅ |

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
| GET | `/api/worlds` | — | WorldData[] | ❌ |
| POST | `/api/worlds` | WorldData | WorldData+id | Admin |
| PUT | `/api/worlds/:id` | WorldData | WorldData | Admin |

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
