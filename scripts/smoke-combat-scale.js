const { io } = require("socket.io-client");

const BASE = process.env.DEMO_URL || "http://localhost:3000";

async function api(path, token, method = "GET", body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${data.error || response.status}`);
  return data;
}

async function main() {
  const auth = await api("/api/auth/demo", null, "POST");
  await api("/api/player", auth.token, "POST", {
    userId: auth.user.id, name: "Scale Combat", linhCan: "KIM", stats: { str: 8, agi: 7, vit: 7, ene: 8 },
    tangTuVi: 1, realm: 1, hp: 220, maxHp: 220, mp: 130, maxMp: 130, x: 150, y: 125,
    mapCode: "binh_nguyen", mapId: "binh_nguyen", jsonIventory: "[]",
  });
  const socket = io(BASE, { auth: { token: auth.token }, reconnection: false });
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("combat scale timeout")), 8000);
    socket.on("connect", () => socket.emit("join_world", { mapCode: "binh_nguyen", x: 150, y: 125 }));
    socket.on("world_init", ({ monsters }) => {
      const target = [...(monsters || [])].sort((a, b) => Math.hypot(a.x - 150, a.y - 125) - Math.hypot(b.x - 150, b.y - 125))[0];
      if (!target) return reject(new Error("no monster near scale test"));
      socket.emit("attack_request", { targetId: target.id, skillCode: "KIM_KICH", mapId: "binh_nguyen" });
    });
    socket.on("combat_result", (payload) => {
      if (payload.attackerId !== socket.id) return;
      clearTimeout(timer);
      resolve(payload);
    });
    socket.on("action_error", ({ error }) => { clearTimeout(timer); reject(new Error(error)); });
    socket.on("connect_error", reject);
  });
  socket.disconnect();
  const valid = result.skillCode === "KIM_KICH" && Number(result.damage) > 0 && Number(result.cooldownMs) > 0;
  console.log(JSON.stringify({ skill: result.skillCode, damage: result.damage, rangeModel: "5x6=30px", valid }));
  if (!valid) process.exitCode = 1;
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
