const { io } = require("socket.io-client");

const BASE = process.env.DEMO_URL || "http://localhost:3000";

async function register() {
  const username = `move_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
  const response = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "demo1234" }),
  });
  if (!response.ok) throw new Error(`register failed: ${response.status}`);
  return response.json();
}

async function main() {
  const user = await register();
  const socket = io(BASE, { auth: { token: user.token }, reconnection: false });
  const result = { normalMove: false, speedHackRejected: false, correctedTo: null };

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("movement authority smoke timeout")), 7000);
    socket.on("connect", () => socket.emit("join_world", { mapCode: "thanh_van_tran", x: 300, y: 200 }));
    socket.on("world_init", () => {
      socket.emit("move", { x: 301, y: 200, mapId: "thanh_van_tran" });
      setTimeout(() => socket.emit("move", { x: 450, y: 350, mapId: "thanh_van_tran" }), 80);
    });
    socket.on("movement_corrected", ({ x, y }) => {
      result.normalMove = Number(x) === 301 && Number(y) === 200;
      result.speedHackRejected = true;
      result.correctedTo = [x, y];
      clearTimeout(timeout);
      resolve();
    });
  });

  socket.disconnect();
  result.valid = result.normalMove && result.speedHackRejected;
  console.log(JSON.stringify(result));
  if (!result.valid) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
