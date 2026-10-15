const { io } = require("socket.io-client");

const BASE = process.env.DEMO_URL || "http://localhost:3000";
const ADMIN_KEY = process.env.ADMIN_MAP_KEY || "demo-admin";
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const sourceCode = `portal_a_${suffix}`;
const targetCode = `portal_b_${suffix}`;
const headers = { "content-type": "application/json", "x-admin-key": ADMIN_KEY };
let testStage = "setup";

function grid(width, height, value) {
  return Array.from({ length: height }, () => Array(width).fill(value));
}

function world(code, name, spawnX, spawnY) {
  const width = 320, height = 240;
  const ground = grid(width, height, 0);
  const objects = grid(width, height, -1);
  const elevation = grid(width, height, 0);
  return { code, tenMap: name, type: "PLAIN", biome: "PLAINS", w: width, h: height, spawnX, spawnY, layers: { ground, objects, elevation }, portals: [] };
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: ${data.error || response.status}`);
  return data;
}

async function token() {
  return (await request("/api/auth/demo", { method: "POST" })).token;
}

function connect(authToken, mapCode, x, y) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token: authToken }, reconnection: false, transports: ["websocket"] });
    const timeout = setTimeout(() => reject(new Error(`join timeout: ${mapCode}`)), 8000);
    socket.on("connect_error", reject);
    socket.on("world_init", (payload) => {
      clearTimeout(timeout);
      resolve({ socket, payload });
    });
    socket.on("connect", () => socket.emit("join_world", { mapCode, x, y, hasMap: true, mapVersion: 1 }));
  });
}

async function waitForWorld(socket, expectedCode, trigger) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`transition timeout: ${expectedCode}`)), 8000);
    const onError = ({ error }) => { clearTimeout(timeout); reject(new Error(error)); };
    socket.once("action_error", onError);
    socket.on("world_init", function handler(payload) {
      if (payload.mapCode !== expectedCode) return;
      clearTimeout(timeout);
      socket.off("action_error", onError);
      socket.off("world_init", handler);
      resolve(payload);
    });
    trigger();
  });
}

async function moveTo(socket, fromX, toX, y, mapId) {
  const step = toX > fromX ? 2 : -2;
  for (let x = fromX; step > 0 ? x < toX : x > toX; x += step) {
    socket.emit("move", { x: step > 0 ? Math.min(toX, x + step) : Math.max(toX, x + step), y, mapId });
    await new Promise((resolve) => setTimeout(resolve, 52));
  }
}

async function main() {
  let traveler, observer;
  try {
    await request("/api/admin/worlds", { method: "POST", headers, body: JSON.stringify(world(sourceCode, "Portal Test A", 300, 120)) });
    await request("/api/admin/worlds", { method: "POST", headers, body: JSON.stringify(world(targetCode, "Portal Test B", 40, 120)) });
    const link = await request("/api/admin/portals/link", {
      method: "POST",
      headers,
      body: JSON.stringify({ sourceCode, targetCode, sourceX: 307, sourceY: 120, targetX: 80, targetY: 120, twoWay: true }),
    });
    if (link.source?.toX !== 36 || link.source?.toY !== 120 || link.reverse?.x !== 12 || link.reverse?.y !== 120 || link.reverse?.toX !== 283 || link.reverse?.toY !== 120) {
      throw new Error(`portal link has wrong directional layout: ${JSON.stringify(link)}`);
    }

    const [travelerAuth, observerAuth] = await Promise.all([token(), token()]);
    ({ socket: observer } = await connect(observerAuth, targetCode, 38, 120));
    ({ socket: traveler } = await connect(travelerAuth, sourceCode, 307, 120));

    const arrived = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("observer did not see portal arrival")), 8000);
      observer.on("player_join", function handler(player) {
        if (player.mapId !== targetCode) return;
        clearTimeout(timeout);
        observer.off("player_join", handler);
        resolve(player);
      });
    });
    testStage = "forward";
    await waitForWorld(traveler, targetCode, () => traveler.emit("map_change", { mapCode: targetCode, x: 1, y: 1 }));
    const arrival = await arrived;
    let observedX = arrival.x;
    observer.on("player_move", (player) => { if (player.id === traveler.id) observedX = player.x; });
    await moveTo(traveler, 36, 12, 120, targetCode);
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (observedX !== 12) throw new Error(`return approach was not accepted by server: ${observedX},120`);
    testStage = "return";
    const returned = await waitForWorld(traveler, sourceCode, () => traveler.emit("map_change", { mapCode: sourceCode, x: 1, y: 1 }));

    if (arrival.x !== 36 || arrival.y !== 120) throw new Error(`server did not enforce directional portal destination: ${arrival.x},${arrival.y}`);
    if (returned.mapCode !== sourceCode) throw new Error("server did not complete directional portal return");
    if (!link.source || !link.reverse) throw new Error("two-way portal was not created");
    console.log(JSON.stringify({ sourceCode, targetCode, sourcePortal: link.source.id, reversePortal: link.reverse.id, arrival: [arrival.x, arrival.y], returned: [link.reverse.toX, link.reverse.toY], valid: true }));
  } finally {
    traveler?.disconnect();
    observer?.disconnect();
    for (const code of [sourceCode, targetCode]) {
      try { await request(`/api/admin/worlds/${encodeURIComponent(code)}`, { method: "DELETE", headers: { "x-admin-key": ADMIN_KEY } }); } catch { }
    }
  }
}

main().catch((error) => {
  console.error(`${testStage}: ${error.message}`);
  process.exitCode = 1;
});
