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
  const player = await api("/api/player", "POST", auth.token, { userId: auth.user.id, name: "Ground Loot", linhCan: "KIM", stats: { str: 8, agi: 7, vit: 7, ene: 8 }, hp: 500, maxHp: 500, mp: 100, maxMp: 100, mapCode: "binh_nguyen", jsonIventory: "[]" });
  const socket = io(BASE, { auth: { token: auth.token }, reconnection: false, transports: ["websocket"] });
  activeSocket = socket;
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ground loot timeout")), 8000);
    let commandSequence = 0;
    let combatStarted = false;
    let targetId = null;
    let currentPosition = { x: Number(player.x), y: Number(player.y) };
    const command = (type, payload) => new Promise((resolve) => {
      commandSequence += 1;
      socket.emit("game_command", { requestId: `ground-loot-${commandSequence}`, type, payload }, resolve);
    });
    const approachTarget = async (target) => {
      while (Math.hypot(Number(target.x) - currentPosition.x, Number(target.y) - currentPosition.y) > 20) {
        const dx = Number(target.x) - currentPosition.x;
        const dy = Number(target.y) - currentPosition.y;
        const distance = Math.hypot(dx, dy);
        const step = Math.min(3, distance - 18);
        const next = { x: currentPosition.x + dx / distance * step, y: currentPosition.y + dy / distance * step };
        const response = await command("movement.intent", { ...next, mapId: player.mapCode });
        if (response?.ok && response.result?.throttled) { await sleep(55); continue; }
        if (!response?.ok || !response.result?.accepted) throw new Error(response?.error?.message || response?.result?.reason || "movement rejected");
        currentPosition = { x: Number(response.result.x), y: Number(response.result.y) };
        await sleep(55);
      }
    };
    socket.on("connect", () => socket.emit("join_world", { mapCode: player.mapCode, x: player.x, y: player.y }));
    socket.on("world_init", async ({ monsters }) => {
      if (combatStarted) return;
      combatStarted = true;
      const target = [...(monsters || [])].filter((monster) => !monster.dead).sort((a, b) => Math.hypot(a.x - currentPosition.x, a.y - currentPosition.y) - Math.hypot(b.x - currentPosition.x, b.y - currentPosition.y))[0];
      if (!target) return reject(new Error("no monster"));
      targetId = target.id;
      try {
        await approachTarget(target);
        socket.emit("attack_request", { targetId, mapId: player.mapCode });
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
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
