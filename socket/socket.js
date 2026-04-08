// /**
//  * socket/game.js
//  * Real-time layer — Socket.io
//  *
//  * Events client → server:
//  *   join_world   { token, mapId, x, y }
//  *   move         { x, y, mapId }
//  *   chat         { message }
//  *   attack_effect { targetId, damage, mapId }
//  *   map_change   { mapId, x, y }
//  *
//  * Events server → client:
//  *   world_state  { players: [...] }  — on join
//  *   player_join  { id, username, ... }
//  *   player_leave { id }
//  *   player_move  { id, x, y }
//  *   player_map   { id, mapId, x, y }
//  *   chat_message { id, username, message, ts }
//  *   attack_fx    { attackerId, targetId, damage }
//  *   server_msg   { text }
//  */

// const jwt = require("jsonwebtoken");
// const { JWT_SECRET } = require("../middleware/auth");

// // In-memory session store: socketId → session
// // Production: Redis pub/sub ở đây
// const sessions = new Map();

// function setupSocket(io) {
//   // ── Auth middleware cho Socket.io ──────────────────────────────
//   io.use((socket, next) => {
//     const token = socket.handshake.auth?.token;
//     if (!token) return next(new Error("Không có token"));
//     try {
//       const decoded = jwt.verify(token, JWT_SECRET);
//       socket.userId = decoded.userId;
//       socket.username = decoded.username;
//       next();
//     } catch {
//       next(new Error("Token không hợp lệ"));
//     }
//   });

//   io.on("connection", (socket) => {
//     console.log(`[Socket] Connect: ${socket.username} (${socket.id})`);

//     // ── join_world ────────────────────────────────────────────────
//     socket.on("join_world", ({ mapId = "wilderness", x = 26, y = 30 } = {}) => {
//       const session = {
//         id: socket.id,
//         userId: socket.userId,
//         username: socket.username,
//         mapId,
//         x,
//         y,
//         joinedAt: Date.now(),
//       };
//       sessions.set(socket.id, session);

//       // Join map room
//       socket.join(`map:${mapId}`);

//       // Send current world state to this client
//       const worldPlayers = [...sessions.values()].filter(
//         (s) => s.id !== socket.id,
//       );
//       socket.emit("world_state", { players: worldPlayers });

//       // Notify others on same map
//       socket.to(`map:${mapId}`).emit("player_join", session);

//       console.log(`[Socket] ${socket.username} joined ${mapId} (${x},${y})`);
//     });

//     // ── move ──────────────────────────────────────────────────────
//     socket.on("move", ({ x, y, mapId }) => {
//       const session = sessions.get(socket.id);
//       if (!session) return;
//       session.x = x;
//       session.y = y;
//       session.mapId = mapId;
//       // Broadcast to same map only (không gửi cho chính mình)
//       socket.to(`map:${mapId}`).emit("player_move", { id: socket.id, x, y });
//     });

//     // ── map_change ────────────────────────────────────────────────
//     socket.on("map_change", ({ mapId, x, y }) => {
//       const session = sessions.get(socket.id);
//       if (!session) return;

//       // Leave old room
//       socket.leave(`map:${session.mapId}`);
//       socket.to(`map:${session.mapId}`).emit("player_leave", { id: socket.id });

//       // Join new room
//       session.mapId = mapId;
//       session.x = x;
//       session.y = y;
//       socket.join(`map:${mapId}`);
//       socket.to(`map:${mapId}`).emit("player_join", { ...session });

//       // Send updated world state (players on new map)
//       const mapPlayers = [...sessions.values()].filter(
//         (s) => s.mapId === mapId && s.id !== socket.id,
//       );
//       socket.emit("world_state", { players: mapPlayers });
//     });

//     // ── chat ──────────────────────────────────────────────────────
//     socket.on("chat", ({ message }) => {
//       if (!message || typeof message !== "string") return;
//       const clean = message.slice(0, 100).trim();
//       if (!clean) return;
//       const session = sessions.get(socket.id);
//       if (!session) return;

//       const payload = {
//         id: socket.id,
//         username: socket.username,
//         message: clean,
//         ts: Date.now(),
//       };

//       // Broadcast to same map
//       socket.to(`map:${session.mapId}`).emit("chat_message", payload);
//       socket.emit("chat_message", payload); // echo back to self
//     });

//     // ── attack_effect (visual sync only — damage tính server-side sau) ─
//     socket.on("attack_effect", ({ targetId, damage, mapId }) => {
//       const session = sessions.get(socket.id);
//       if (!session) return;
//       socket.to(`map:${mapId}`).emit("attack_fx", {
//         attackerId: socket.id,
//         attackerName: socket.username,
//         targetId,
//         damage,
//       });
//     });

//     // ── disconnect ────────────────────────────────────────────────
//     socket.on("disconnect", () => {
//       const session = sessions.get(socket.id);
//       if (session) {
//         socket
//           .to(`map:${session.mapId}`)
//           .emit("player_leave", { id: socket.id });
//         sessions.delete(socket.id);
//         console.log(`[Socket] Disconnect: ${socket.username}`);
//       }
//     });
//   });

//   // ── Server broadcast (có thể gọi từ nơi khác) ─────────────────
//   function broadcast(event, data) {
//     io.emit(event, data);
//   }

//   function mapBroadcast(mapId, event, data) {
//     io.to(`map:${mapId}`).emit(event, data);
//   }

//   return { broadcast, mapBroadcast, sessions };
// }

// module.exports = { setupSocket };

const { ApiService } = require("./api-service.js");
module.exports.setupSocket = (io) => {
  io.on("connection", (socket) => {
    console.log("connect", new Date());

    // Player join world
    socket.on("join", async (data) => {
      const { userId, token } = data; // Giả sử token lấy từ client gửi lên

      // 1) Load thông tin Player
      const resPlayer = await ApiService.get(`player/${userId}`, token);

      // KIỂM TRA: Nếu resPlayer hoặc resPlayer.data bị null
      if (!resPlayer || !resPlayer.data) {
        console.error(`Không tìm thấy Player với ID: player/${userId}`);
        socket.emit("error_message", {
          message: "Dữ liệu người chơi không hợp lệ",
        });
        return; // Dừng hàm tại đây, không chạy xuống phần mapCode nữa
      }

      const player = resPlayer.data;

      // 2) Load map tương ứng (Lúc này chắc chắn player đã tồn tại)

      const resMap = await ApiService.get(
        `worlds/by-code?code=${player.mapCode}`,
        token,
      );

      if (!resMap) {
        console.error(`Không tìm thấy Map với Code: ${player.mapCode}`);
        return;
      }

      const map = resMap.data;

      // 3) Lưu vào socket và emit
      socket.player = player;
      socket.map = map;
      socket.emit("spawn", { player, map });
      socket.broadcast.emit("player_join", player);
    });

    // Player move
    socket.on("move", async ({ x, y }) => {
      if (!socket.player) return;

      socket.player.x = x;
      socket.player.y = y;

      // Update MySQL via Spring Boot
      await axios.post("http://localhost:8090/api/player/pos", {
        userId: socket.player.userId,
        x,
        y,
      });

      socket.broadcast.emit("player_move", {
        id: socket.player.userId,
        x,
        y,
      });
    });

    socket.on("disconnect", () => {
      if (!socket.player) return;
      socket.broadcast.emit("player_leave", socket.player.userId);
    });
  });
};
