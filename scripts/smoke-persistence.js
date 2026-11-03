"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { io } = require("socket.io-client");

const projectRoot = path.join(__dirname, "..");
const timeoutMs = 15000;

async function findFreePort() {
  const probe = http.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(port, child, output) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`Server exited early (${child.exitCode}):\n${output()}`);
    try {
      const response = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not become healthy:\n${output()}`);
}

function startServer(port, stateFile) {
  let logs = "";
  const child = spawn(process.execPath, [path.join(projectRoot, "server.js")], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      GAME_STATE_FILE: stateFile,
      JWT_SECRET: crypto.randomBytes(48).toString("hex"),
      ADMIN_MAP_KEY: "persistence-smoke-admin-key",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  child.stdout.on("data", (chunk) => { logs = `${logs}${chunk}`.slice(-8000); });
  child.stderr.on("data", (chunk) => { logs = `${logs}${chunk}`.slice(-8000); });
  return { child, output: () => logs };
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  if (child.connected) child.send({ type: "shutdown" });
  else child.kill("SIGINT");
  const exited = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
  ]);
  if (!exited) {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

async function api(port, route, { method = "GET", token, body } = {}) {
  const response = await fetch(`http://localhost:${port}${route}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${method} ${route} failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload;
}

async function waitForSavedPlayer(stateFile, predicate) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const state = JSON.parse(await fs.readFile(stateFile, "utf8"));
      if (state.players?.[0] && predicate(state.players[0])) return state;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Player changes were not written to the isolated game state file");
}

async function moveOneTile(port, token) {
  const socket = io(`http://localhost:${port}`, { auth: { token }, reconnection: false, timeout: 5000 });
  try {
    const initial = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Socket world join timed out")), 7000);
      socket.once("connect_error", (error) => { clearTimeout(timer); reject(error); });
      socket.once("world_init", (world) => {
        clearTimeout(timer);
        resolve(world.player);
      });
      socket.once("connect", () => socket.emit("join_world", {}));
    });
    if (!initial || !Number.isFinite(Number(initial.x)) || !Number.isFinite(Number(initial.y))) {
      throw new Error("Socket world snapshot did not contain the player's authoritative position");
    }
    const start = { x: Number(initial.x), y: Number(initial.y) };
    const candidates = [
      { x: start.x + 1, y: start.y },
      { x: start.x - 1, y: start.y },
      { x: start.x, y: start.y + 1 },
      { x: start.x, y: start.y - 1 },
    ];
    for (const position of candidates) {
      socket.emit("move", { ...position, mapCode: initial.mapCode || initial.mapId });
      await new Promise((resolve) => setTimeout(resolve, 120));
      const current = await api(port, "/api/player/me", { token });
      if (Number(current.x) !== start.x || Number(current.y) !== start.y) {
        return { x: Number(current.x), y: Number(current.y) };
      }
    }
    throw new Error("No adjacent walkable tile accepted by the authoritative movement handler");
  } finally {
    socket.disconnect();
  }
}

async function main() {
  const scratchRoot = path.join(projectRoot, "scratch");
  await fs.mkdir(scratchRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(scratchRoot, "tutien-persistence-smoke-"));
  const stateFile = path.join(directory, "game-state.json");
  const port = await findFreePort();
  let currentServer = null;
  try {
    currentServer = startServer(port, stateFile);
    await waitForHealth(port, currentServer.child, currentServer.output);

    const username = `p${Date.now().toString(36).slice(-5)}${crypto.randomBytes(4).toString("hex")}`;
    const password = crypto.randomBytes(12).toString("hex");
    const registration = await api(port, "/api/auth/register", { method: "POST", body: { username, password } });
    const token = registration.token;
    const demoSession = await api(port, "/api/auth/demo", { method: "POST" });
    const created = await api(port, "/api/player", {
      method: "POST",
      token,
      body: { userId: registration.user.id, name: "Smoke Tu Sĩ", gender: "MALE", linhCan: "KIM", stats: { str: 15, agi: 5, vit: 5, ene: 5 } },
    });
    assert.equal(created.name, "Smoke Tu Sĩ");
    const movedPosition = await moveOneTile(port, token);

    await api(port, "/api/player/shop/buy", { method: "POST", token, body: { itemId: "STONE_LINH_NHO" } });
    await api(port, "/api/player/shop/buy", { method: "POST", token, body: { itemId: "STONE_LINH_NHO" } });
    await api(port, "/api/player/cultivation/absorb", { method: "POST", token, body: { itemId: "STONE_LINH_NHO" } });
    const saved = await waitForSavedPlayer(stateFile, (player) => player.tuViHienTai > 0
      && player.inventory?.[0]?.count === 1
      && Number(player.x) === movedPosition.x
      && Number(player.y) === movedPosition.y);
    assert.equal(saved.users.length, 1);
    assert.equal(saved.users.some((user) => user.id === demoSession.user.id), false);
    assert.equal(saved.players[0].xu, 10);
    assert.equal(saved.players[0].inventory[0].count, 1);
    assert.equal(Number(saved.players[0].x), movedPosition.x);
    assert.equal(Number(saved.players[0].y), movedPosition.y);
    assert.equal(saved.users[0].passwordHash.includes(password), false);
    await stopServer(currentServer.child);
    currentServer = null;

    currentServer = startServer(port, stateFile);
    const health = await waitForHealth(port, currentServer.child, currentServer.output);
    assert.equal(health.users, 1);
    assert.equal(health.players, 1);
    const login = await api(port, "/api/auth/login", { method: "POST", body: { username, password } });
    const restored = await api(port, "/api/player/me", { token: login.token });
    assert.equal(restored.name, "Smoke Tu Sĩ");
    assert.equal(restored.xu, 10);
    assert.ok(restored.tuViHienTai > 0);
    assert.equal(restored.inventory[0].id, "STONE_LINH_NHO");
    assert.equal(restored.inventory[0].count, 1);
    assert.equal(Number(restored.x), movedPosition.x);
    assert.equal(Number(restored.y), movedPosition.y);
    console.log("Persistence smoke passed: account, character, inventory, currency, cultivation and Socket.IO position survived restart.");
  } finally {
    if (currentServer) await stopServer(currentServer.child);
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
