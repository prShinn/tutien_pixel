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

async function main() {
  const [user1, user2] = await Promise.all([register("smoke1"), register("smoke2")]);
  const first = io(BASE, { auth: { token: user1.token }, reconnection: false });
  const second = io(BASE, { auth: { token: user2.token }, reconnection: false });
  const result = { joined: false, moved: false, chatted: false };

  const done = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("multiplayer smoke timeout")), 7000);
    const check = () => {
      if (result.joined && result.moved && result.chatted) {
        clearTimeout(timeout);
        resolve();
      }
    };
    first.on("player_join", () => {
      result.joined = true;
      first.emit("move", { x: 21, y: 15, mapId: "thanh_van_tran" });
      first.emit("chat", { message: "hello" });
      check();
    });
    second.on("player_move", () => { result.moved = true; check(); });
    second.on("chat_message", () => { result.chatted = true; check(); });
  });

  first.on("connect", () => first.emit("join_world", { mapCode: "thanh_van_tran", x: 20, y: 15 }));
  second.on("connect", () => second.emit("join_world", { mapCode: "thanh_van_tran", x: 20, y: 15 }));
  await done;
  console.log(JSON.stringify(result));
  first.disconnect();
  second.disconnect();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
