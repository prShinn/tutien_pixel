const { io } = require("socket.io-client");

const BASE = process.env.DEMO_URL || "http://localhost:3000";
const CLIENTS = Math.max(10, Number(process.env.LOAD_CLIENTS || 40));

async function demoToken() {
  const response = await fetch(`${BASE}/api/auth/demo`, { method: "POST" });
  if (!response.ok) throw new Error(`demo login failed: ${response.status}`);
  return (await response.json()).token;
}

function connectClient(token, index, counters) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, reconnection: false, transports: ["websocket"] });
    const timeout = setTimeout(() => reject(new Error(`client ${index} join timeout`)), 10000);
    socket.on("player_move", () => { counters.moveEvents += 1; });
    socket.on("connect_error", reject);
    socket.on("world_init", (payload) => {
      clearTimeout(timeout);
      counters.maxSnapshotPlayers = Math.max(counters.maxSnapshotPlayers, payload.players?.length || 0);
      if (payload.map !== null) counters.unexpectedMaps += 1;
      resolve(socket);
    });
    socket.on("connect", () => {
      const nearGroup = index < CLIENTS / 2;
      const baseX = nearGroup ? 75 : 495;
      const baseY = nearGroup ? 195 : 105;
      socket.emit("join_world", {
        mapCode: "binh_nguyen",
        x: baseX + (index % 5),
        y: baseY + (index % 4),
        hasMap: true,
        mapVersion: 2,
      });
    });
  });
}

async function main() {
  const startedAt = Date.now();
  const counters = { moveEvents: 0, maxSnapshotPlayers: 0, unexpectedMaps: 0 };
  const tokens = await Promise.all(Array.from({ length: CLIENTS }, demoToken));
  const sockets = await Promise.all(tokens.map((token, index) => connectClient(token, index, counters)));

  sockets.forEach((socket, index) => {
    const nearGroup = index < CLIENTS / 2;
    socket.emit("move", {
      mapId: "binh_nguyen",
      x: (nearGroup ? 75 : 495) + (index % 5) + 0.5,
      y: (nearGroup ? 195 : 105) + (index % 4),
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 700));
  const health = await (await fetch(`${BASE}/api/health`)).json();

  const groupSize = Math.ceil(CLIENTS / 2);
  if (counters.unexpectedMaps) throw new Error(`${counters.unexpectedMaps} clients received duplicate map payload`);
  if (counters.maxSnapshotPlayers >= CLIENTS - 1) throw new Error("AOI failed: snapshot still contains the whole map");
  if (counters.maxSnapshotPlayers > groupSize) throw new Error(`AOI snapshot too large: ${counters.maxSnapshotPlayers}`);
  if (counters.moveEvents <= 0) throw new Error("No nearby movement was delivered");
  if (Number(health.sessions) < CLIENTS) throw new Error(`Health reports only ${health.sessions}/${CLIENTS} sessions`);

  sockets.forEach((socket) => socket.disconnect());
  console.log(JSON.stringify({
    clients: CLIENTS,
    elapsedMs: Date.now() - startedAt,
    maxSnapshotPlayers: counters.maxSnapshotPlayers,
    moveEvents: counters.moveEvents,
    memoryMb: health.memoryMb,
    valid: true,
  }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
