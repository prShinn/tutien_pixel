const { io } = require("socket.io-client");
const BASE = process.env.DEMO_URL || "http://localhost:3000";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let activeSocket = null;

async function api(path, method = "GET", token, body) {
  const response = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || response.status);
  return data;
}

async function main() {
  const auth = await api("/api/auth/demo", "POST");
  await api("/api/player", "POST", auth.token, { userId: auth.user.id, name: "Ground Loot", linhCan: "KIM", stats: { str: 8, agi: 7, vit: 7, ene: 8 }, hp: 500, maxHp: 500, mp: 100, maxMp: 100, x: 80, y: 200, mapCode: "binh_nguyen", mapId: "binh_nguyen", jsonIventory: "[]" });
  const socket = io(BASE, { auth: { token: auth.token }, reconnection: false, transports: ["websocket"] });
  activeSocket = socket;
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ground loot timeout")), 8000);
    socket.on("connect", () => socket.emit("join_world", { mapCode: "binh_nguyen", x: 80, y: 200 }));
    let targetId = null;
    socket.on("world_init", ({ monsters }) => {
      const target = [...(monsters || [])].filter((monster) => !monster.dead).sort((a, b) => Math.hypot(a.x - 80, a.y - 200) - Math.hypot(b.x - 80, b.y - 200))[0];
      if (!target) return reject(new Error("no monster"));
      targetId = target.id;
      socket.emit("attack_request", { targetId, mapId: "binh_nguyen" });
    });
    socket.on("action_error", ({ error }) => {
      if (String(error).includes("hồi chiêu")) return setTimeout(() => socket.emit("attack_request", { targetId, mapId: "binh_nguyen" }), 850);
      clearTimeout(timer); reject(new Error(error));
    });
    socket.on("combat_result", (payload) => {
      if (payload.attackerId !== socket.id) return;
      if (!payload.groundDrops?.length) return setTimeout(() => socket.emit("attack_request", { targetId, mapId: "binh_nguyen" }), 1100);
      const drop = payload.groundDrops[0];
      socket.once("ground_loot_picked", ({ loot }) => { clearTimeout(timer); resolve({ dropped: payload.groundDrops.length, picked: Boolean(loot), kind: drop.kind }); });
      socket.emit("pickup_ground_item", { itemId: drop.id });
    });
  });
  socket.disconnect();
  const valid = result.dropped > 0 && result.picked;
  console.log(JSON.stringify({ ...result, valid }));
  if (!valid) process.exitCode = 1;
}

main().catch((error) => { activeSocket?.disconnect(); console.error(error.message); process.exitCode = 1; });
