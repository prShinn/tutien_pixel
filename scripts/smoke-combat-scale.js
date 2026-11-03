const { io } = require("socket.io-client");

const BASE = process.env.DEMO_URL || "http://localhost:3000";
let moveSequence = 0;

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

async function approachTarget(socket, position, target, stopRange = 22) {
  let x = Number(position.x);
  let y = Number(position.y);
  for (let step = 0; step < 40; step += 1) {
    const dx = Number(target.x) - x;
    const dy = Number(target.y) - y;
    const distance = Math.hypot(dx, dy);
    if (distance <= stopRange) return { x, y };
    const amount = Math.min(3.5, Math.max(0, Math.abs(dx) - 8));
    if (!amount) return { x, y };
    const response = await new Promise((resolve) => socket.emit("game_command", {
      requestId: `combat-scale-move-${++moveSequence}`,
      type: "movement.intent",
      payload: { x: x + Math.sign(dx) * amount, y, mapCode: "binh_nguyen" },
    }, resolve));
    if (!response?.ok || !response.result?.accepted) throw new Error(response?.error?.message || "could not approach the combat target");
    x = Number(response.result.x);
    y = Number(response.result.y);
    await new Promise((resolve) => setTimeout(resolve, 55));
  }
  throw new Error("combat target remained outside skill range after approaching");
}

async function main() {
  const auth = await api("/api/auth/demo", null, "POST");
  const created = await api("/api/player", auth.token, "POST", {
    userId: auth.user.id, name: "Scale Combat", linhCan: "KIM", stats: { str: 8, agi: 7, vit: 7, ene: 8 },
    tangTuVi: 1, realm: 1, hp: 220, maxHp: 220, mp: 130, maxMp: 130, x: 80, y: 200,
    mapCode: "binh_nguyen", mapId: "binh_nguyen", jsonIventory: "[]",
  });
  const socket = io(BASE, { auth: { token: auth.token }, reconnection: false });
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("combat scale timeout")), 8000);
    socket.on("connect", () => socket.emit("join_world", { mapCode: "binh_nguyen", x: created.x, y: created.y }));
    socket.once("world_init", ({ monsters, player }) => {
      (async () => {
        const start = { x: Number(player?.x ?? created.x), y: Number(player?.y ?? created.y) };
        const target = [...(monsters || [])].filter((monster) => !monster.dead)
          .sort((a, b) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y))[0];
        if (!target) throw new Error("no monster near scale test");
        await approachTarget(socket, start, target);
        socket.emit("attack_request", { targetId: target.id, skillCode: "KIM_KICH", mapId: "binh_nguyen" });
      })().catch((error) => { clearTimeout(timer); reject(error); });
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
