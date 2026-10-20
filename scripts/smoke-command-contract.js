const { io } = require("socket.io-client");

const BASE = process.env.DEMO_URL || "http://localhost:3000";

async function register(prefix) {
  const username = `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
  const response = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "demo1234" }),
  });
  if (!response.ok) throw new Error(`register failed: ${response.status}`);
  return response.json();
}

function command(socket, requestId, type, payload) {
  return new Promise((resolve) => socket.emit("game_command", { requestId, type, payload }, resolve));
}

async function main() {
  const user = await register("command");
  const socket = io(BASE, { auth: { token: user.token }, reconnection: false });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("command connect timeout")), 5000);
    socket.once("connect", () => { clearTimeout(timer); resolve(); });
  });

  const init = new Promise((resolve) => socket.once("world_init", resolve));
  const joined = await command(socket, "join-1", "world.join", { mapCode: "thanh_van_tran", x: 300, y: 200 });
  const world = await init;
  const moved = await command(socket, "move-1", "movement.intent", { x: 301, y: 200, mapCode: "thanh_van_tran" });
  const duplicate = await command(socket, "move-1", "movement.intent", { x: 450, y: 350, mapCode: "thanh_van_tran" });
  const chatted = await command(socket, "chat-1", "chat.send", { message: "command ok" });
  const invalid = await command(socket, "invalid-1", "unknown.command", {});
  const result = {
    joined: joined?.ok === true && world?.mapCode === "thanh_van_tran",
    moved: moved?.ok === true && moved.result?.accepted === true,
    idempotent: duplicate?.ok === true && duplicate.result?.x === moved.result?.x,
    chatted: chatted?.ok === true,
    invalidRejected: invalid?.ok === false && invalid.error?.code === "UNKNOWN_COMMAND",
  };
  result.valid = Object.values(result).every(Boolean);
  console.log(JSON.stringify(result));
  socket.disconnect();
  if (!result.valid) throw new Error("command contract mismatch");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
