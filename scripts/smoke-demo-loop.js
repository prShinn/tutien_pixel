const { io } = require("socket.io-client");

const BASE = process.env.DEMO_URL || "http://localhost:3000";
let moveSequence = 0;
// Runtime hiện chỉ chặn nước (tile 2); cây/núi là decoration đi xuyên được.
const SOLID = new Set([2]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: ${data.error || response.status}`);
  return data;
}

async function createDemoToken() {
  const auth = await request("/api/auth/demo", { method: "POST" });
  return auth.token;
}

async function createFighter(name) {
  const auth = await request("/api/auth/demo", { method: "POST" });
  const created = await request("/api/player", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({
      userId: auth.user.id, name, linhCan: "KIM", stats: { str: 8, agi: 7, vit: 7, ene: 8 },
      tangTuVi: 1, realm: 1, hp: 220, maxHp: 220, mp: 130, maxMp: 130,
      x: 80, y: 200, mapCode: "binh_nguyen", mapId: "binh_nguyen", jsonIventory: "[]",
    }),
  });
  return { token: auth.token, player: created };
}

function findCollisionProbe(world) {
  const tiles = world.jsonMap;
  const width = Number(world.w);
  const height = Number(world.h);
  const clearFootprint = (x, y) => x >= 1 && y >= 1 && x < width - 1 && y < height - 1
    && !SOLID.has(Number(tiles[y]?.[x]));
  for (let y = 8; y < height - 8; y += 1) {
    for (let x = 8; x < width - 8; x += 1) {
      if (!SOLID.has(Number(tiles[y]?.[x]))) continue;
      if (clearFootprint(x - 1, y)) return { startX: x - 1, startY: y, blockedX: x, blockedY: y };
    }
  }
  throw new Error("no collision probe found");
}

function connect(token, x, y) {
  const socket = io(BASE, { auth: { token }, reconnection: false, transports: ["websocket"] });
  const init = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("world_init timeout")), 8000);
    socket.on("connect_error", reject);
    socket.on("world_init", (payload) => { clearTimeout(timer); resolve(payload); });
    socket.on("connect", () => socket.emit("join_world", { mapCode: "binh_nguyen", x, y }));
  });
  return { socket, init };
}

async function verifyCollision(world) {
  const probe = findCollisionProbe(world);
  const token = await createDemoToken();
  const { socket, init } = connect(token, probe.startX, probe.startY);
  try {
    await init;
    await sleep(60);
    const corrected = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("collision correction timeout")), 5000);
      socket.once("movement_corrected", (payload) => { clearTimeout(timer); resolve(payload); });
      socket.emit("move", { x: probe.blockedX, y: probe.blockedY, mapId: "binh_nguyen" });
    });
    const result = await corrected;
    if (Number(result.x) !== probe.startX || Number(result.y) !== probe.startY) throw new Error("collision returned an incorrect authoritative position");
    return true;
  } finally {
    socket.disconnect();
  }
}

async function moveStep(socket, x, y, mapCode = "binh_nguyen") {
  const response = await new Promise((resolve) => socket.emit("game_command", {
    requestId: `demo-loop-move-${++moveSequence}`,
    type: "movement.intent",
    payload: { x, y, mapCode },
  }, resolve));
  if (!response?.ok || !response.result?.accepted) throw new Error(response?.error?.message || `move was not accepted at ${x},${y}`);
  await sleep(55);
  return { x: Number(response.result.x), y: Number(response.result.y) };
}

async function moveIntoCombatRange(socket, start, target) {
  let position = { x: Number(start.x), y: Number(start.y) };
  for (let step = 0; step < 40; step += 1) {
    const dx = Number(target.x) - position.x;
    const dy = Number(target.y) - position.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 21) return position;
    const amount = Math.min(3.5, Math.max(0, Math.abs(dx) - 8));
    if (!amount) return position;
    position = await moveStep(socket, position.x + Math.sign(dx) * amount, position.y);
  }
  throw new Error("could not enter attack range from the server spawn");
}

async function moveToPortal(socket, startX) {
  let x = Number(startX);
  while (x > 12) {
    x = Math.max(12, x - 3.5);
    const position = await moveStep(socket, x, 200);
    x = position.x;
  }
}

async function verifyCombatAndPortal(portal) {
  const fighter = await createFighter("Hành trình demo");
  const observerToken = (await request("/api/auth/demo", { method: "POST" })).token;
  const observerConn = connect(observerToken, 20, 200);
  const observer = observerConn.socket;
  const { socket, init } = connect(fighter.token, fighter.player.x, fighter.player.y);
  try {
    await observerConn.init;
    const initial = await init;
    const start = { x: Number(initial.player?.x ?? fighter.player.x), y: Number(initial.player?.y ?? fighter.player.y) };
    const target = [...(initial.monsters || [])]
      .filter((monster) => !monster.dead)
      .sort((a, b) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y))[0];
    if (!target) throw new Error("no monster near the server spawn");
    const combatPosition = await moveIntoCombatRange(socket, start, target);

    const combat = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("combat result timeout")), 5000);
      socket.once("action_error", ({ error }) => { clearTimeout(timer); reject(new Error(error)); });
      socket.on("combat_result", function handler(payload) {
        if (payload.attackerId !== socket.id) return;
        clearTimeout(timer);
        socket.off("combat_result", handler);
        resolve(payload);
      });
      socket.emit("attack_request", { targetId: target.id, mapId: "binh_nguyen" });
    });
    const combatResult = await combat;
    if (Number(combatResult.damage) < 1) throw new Error("basic attack caused no damage");

    await moveToPortal(socket, combatPosition.x);
    const transitioned = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("portal transition timeout")), 6000);
      socket.once("action_error", ({ error }) => { clearTimeout(timer); reject(new Error(error)); });
      socket.on("world_init", function handler(payload) {
        if (payload.mapCode !== "thanh_van_tran") return;
        clearTimeout(timer);
        socket.off("world_init", handler);
        resolve(payload);
      });
      socket.emit("map_change", { mapCode: "thanh_van_tran", x: 0, y: 0 });
    });
    const moved = await transitioned;
    return { damage: combatResult.damage, arrival: [moved.player?.x, moved.player?.y], expectedArrival: [portal.toX, portal.toY] };
  } finally {
    socket.disconnect();
    observer.disconnect();
  }
}

async function main() {
  const wilderness = await request("/api/worlds/by-code?code=binh_nguyen");
  const portal = (wilderness.portals || []).find((item) => String(item.denMap || item.toMap).toLowerCase() === "thanh_van_tran");
  if (!portal) throw new Error("wilderness portal to Thanh Vân Trấn is missing");
  const [collision, flow] = await Promise.all([verifyCollision(wilderness), verifyCombatAndPortal(portal)]);
  const valid = collision && Number(flow.damage) > 0 && flow.arrival[0] === portal.toX && flow.arrival[1] === portal.toY;
  console.log(JSON.stringify({ collision, combatDamage: flow.damage, portalArrival: flow.arrival, valid }));
  if (!valid) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
