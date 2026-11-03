"use strict";

const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const smokeScripts = [
  "smoke-client-shell.js",
  "smoke-command-contract.js",
  "smoke-movement-authority.js",
  "smoke-demo-loop.js",
  "smoke-combat-scale.js",
  "smoke-multiplayer.js",
  "smoke-server-state.js",
  "smoke-concurrency.js",
  "smoke-ground-loot.js",
  "smoke-admin-content.js",
];

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
      ADMIN_MAP_KEY: "demo-suite-admin-key",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  child.stdout.on("data", (chunk) => { logs = `${logs}${chunk}`.slice(-8000); });
  child.stderr.on("data", (chunk) => { logs = `${logs}${chunk}`.slice(-8000); });
  child.on("error", (error) => { logs = `${logs}${error.message}`.slice(-8000); });
  return { child, output: () => logs };
}

async function waitForHealth(port, child, output) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    if (child.exitCode !== null) throw new Error(`Server exited early (${child.exitCode}):\n${output()}`);
    try {
      const response = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not become healthy:\n${output()}`);
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

async function runSmoke(name, baseUrl) {
  let output = "";
  const child = spawn(process.execPath, [path.join(__dirname, name)], {
    cwd: projectRoot,
    env: { ...process.env, DEMO_URL: baseUrl, ADMIN_MAP_KEY: "demo-suite-admin-key" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12000); });
  child.stderr.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12000); });
  const timer = setTimeout(() => child.kill(), 60000);
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  }).finally(() => clearTimeout(timer));
  if (exitCode !== 0) throw new Error(`${name} failed with exit code ${exitCode}:\n${output}`);
  console.log(`${name}: passed${output.trim() ? `\n${output.trim()}` : ""}`);
}

async function main() {
  const scratchRoot = path.join(projectRoot, "scratch");
  await fs.mkdir(scratchRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(scratchRoot, "tutien-demo-suite-"));
  const stateFile = path.join(directory, "game-state.json");
  const port = await findFreePort();
  let server = null;
  try {
    server = startServer(port, stateFile);
    await waitForHealth(port, server.child, server.output);
    const baseUrl = `http://localhost:${port}`;
    for (const script of smokeScripts) await runSmoke(script, baseUrl);
    console.log(`Demo suite passed: ${smokeScripts.length} integration smoke tests on isolated port ${port}.`);
  } finally {
    if (server) await stopServer(server.child);
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
