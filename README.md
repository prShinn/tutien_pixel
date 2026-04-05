# Tu Tiên · Vạn Cổ Đế Tôn — Backend Server

## Stack
- **Express** — REST API (auth, save/load)
- **Socket.io** — Real-time co-op (move sync, chat, combat fx)
- **lowdb** — JSON file DB (local, zero-config)
- **bcryptjs** — Password hashing
- **JWT** — Auth tokens (7 ngày)

---

## Setup nhanh (5 phút)

```bash
# 1. Cài dependencies
cd tu-tien-server
npm install

# 2. Copy env
cp .env.example .env
# Đổi JWT_SECRET trong .env trước khi deploy!

# 3. Chạy server
node server.js
# → http://localhost:3000
```

Game client sẽ có tại **http://localhost:3000** (file `public/index.html`)

---

## API Endpoints

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| POST | `/api/auth/register` | ❌ | Đăng ký tài khoản |
| POST | `/api/auth/login` | ❌ | Đăng nhập → nhận JWT |
| GET | `/api/auth/me` | ✅ | Verify token |
| GET | `/api/player` | ✅ | Load nhân vật |
| POST | `/api/player/save` | ✅ | Lưu nhân vật |
| GET | `/api/player/list` | ❌ | Danh sách người chơi |
| GET | `/api/player/events` | ❌ | World events feed |
| GET | `/api/health` | ❌ | Server health check |

---

## Socket.io Events

### Client → Server
| Event | Payload | Mô tả |
|-------|---------|-------|
| `join_world` | `{mapId, x, y}` | Vào game |
| `move` | `{x, y, mapId}` | Di chuyển |
| `map_change` | `{mapId, x, y}` | Đổi map |
| `chat` | `{message}` | Chat |
| `attack_effect` | `{targetId, damage, mapId}` | Hiệu ứng đánh |

### Server → Client
| Event | Payload | Mô tả |
|-------|---------|-------|
| `world_state` | `{players:[...]}` | Danh sách players trên map |
| `player_join` | `{id, username, x, y, ...}` | Player mới vào map |
| `player_leave` | `{id}` | Player rời map |
| `player_move` | `{id, x, y}` | Player khác di chuyển |
| `chat_message` | `{username, message, ts}` | Tin nhắn chat |
| `attack_fx` | `{attackerName, damage}` | Hiệu ứng đánh từ player khác |
| `server_msg` | `{text}` | Thông báo hệ thống |

---

## Cấu trúc file

```
tu-tien-server/
├── server.js          ← Entry point
├── db.js              ← Database module (thay thế khi scale)
├── .env.example       ← Config template
├── middleware/
│   └── auth.js        ← JWT middleware
├── routes/
│   ├── auth.js        ← Đăng ký / Đăng nhập
│   └── player.js      ← Save / Load nhân vật
├── socket/
│   └── game.js        ← Real-time events
├── public/
│   └── index.html     ← Game client (standalone)
└── data/              ← Auto-created
    ├── users.json     ← Tài khoản
    ├── players.json   ← Dữ liệu nhân vật
    └── world.json     ← World events
```

---

## Migrate lên Production DB

### PostgreSQL (khuyên dùng khi >100 user đồng thời)
```bash
npm install pg
```
Trong `db.js`, thay `low()` bằng `pg.Pool()`:
```js
// Ví dụ thay UserDB.findByUsername:
async findByUsername(username) {
  const res = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
  return res.rows[0];
}
```

### MongoDB (nếu muốn schema linh hoạt hơn)
```bash
npm install mongoose
```

---

## Triển khai (Deploy)

### Railway / Render / Fly.io (khuyên dùng cho beginner)
```bash
# Thêm Procfile
echo "web: node server.js" > Procfile

# Set env vars trên dashboard:
# PORT=3000
# JWT_SECRET=<random 64 chars>
# NODE_ENV=production
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

---

## Angular Integration

Trong Angular, tạo các services tương ứng:

```
src/app/
├── services/
│   ├── auth.service.ts      ← HTTP calls đến /api/auth/*
│   ├── player.service.ts    ← HTTP calls đến /api/player/*
│   └── socket.service.ts    ← Socket.io wrapper (inject vào components)
├── guards/
│   └── auth.guard.ts        ← CanActivate dùng AuthService
└── interceptors/
    └── jwt.interceptor.ts   ← Tự động gắn Bearer token vào mọi request
```

```typescript
// jwt.interceptor.ts
intercept(req: HttpRequest<any>, next: HttpHandler) {
  const token = localStorage.getItem('tu_tien_token');
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next.handle(req);
}
```
