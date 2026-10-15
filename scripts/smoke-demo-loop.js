const { io } = require("socket.io-client");

const BASE = process.env.DEMO_URL || "http://localhost:3000";
// Runtime hiện chỉ chặn nước (tile 2); cây/núi là decoration đi xuyên được.
const SOLID = new Set([2]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: ${data.error || response.status}`);
  return data;
}

async function createFighter(name) {
  const auth = await request("/api/auth/demo", { method: "POST" });
  await request("/api/player", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({
      userId: auth.user.id, name, linhCan: "KIM", stats: { str: 8, agi: 7, vit: 7, ene: 8 },
      tangTuVi: 1, realm: 1, hp: 220, maxHp: 220, mp: 130, maxMp: 130,
      x: 80, y: 200, mapCode: "binh_nguyen", mapId: "binh_nguyen", jsonIventory: "[]",
    }),
  });
  return auth.token;
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
  const token = await createFighter("Va chạm demo");
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

async function moveToPortal(socket, observer) {
  for (let x = 76; x >= 28; x -= 4) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`move was not confirmed at ${x},200`)), 1500);
      const onCorrection = ({ reason }) => {
        clearTimeout(timer);
        socket.off("movement_corrected", onCorrection);
        reject(new Error(`move corrected at ${x},200: ${reason}`));
      };
      const onMove = (payload) => {
        if (Number(payload.x) !== x || Number(payload.y) !== 200) return;
        clearTimeout(timer);
        socket.off("movement_corrected", onCorrection);
        observer.off("player_move", onMove);
        resolve();
      };
      socket.once("movement_corrected", onCorrection);
      observer.on("player_move", onMove);
      socket.emit("move", { x, y: 200, mapId: "binh_nguyen" });
    });
    await sleep(55);
  }
}

async function verifyCombatAndPortal(portal) {
  const token = await createFighter("Hành trình demo");
  const observerToken = (await request("/api/auth/demo", { method: "POST" })).token;
  const observerConn = connect(observerToken, 20, 200);
  const observer = observerConn.socket;
  const { socket, init } = connect(token, 80, 200);
  try {
    await observerConn.init;
    const initial = await init;
    const target = [...(initial.monsters || [])]
      .filter((monster) => !monster.dead)
      .sort((a, b) => Math.hypot(a.x - 80, a.y - 200) - Math.hypot(b.x - 80, b.y - 200))[0];
    if (!target || Math.hypot(target.x - 80, target.y - 200) > 24) throw new Error("no monster in basic attack range");

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

    await moveToPortal(socket, observer);
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
