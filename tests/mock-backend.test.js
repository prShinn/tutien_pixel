"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const fixtureRoot = path.join(root, "public", "mock-api");
const readJson = (filename) => fs.readFileSync(path.join(fixtureRoot, filename), "utf8");

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

async function harness(search = "?mockBackend=1") {
  const origin = "http://game.test";
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, origin);
    calls.push({ pathname: url.pathname, method: init.method || "GET" });
    if (url.pathname === "/mock-api/catalog.json") return new Response(readJson("catalog.json"));
    if (url.pathname.startsWith("/mock-api/worlds/")) {
      const code = path.basename(url.pathname).replace(/\.json$/, "");
      const filename = path.join(fixtureRoot, "worlds", `${code}.json`);
      return fs.existsSync(filename) ? new Response(fs.readFileSync(filename, "utf8")) : new Response("not found", { status: 404 });
    }
    return new Response("native response", { status: 200 });
  };
  const scope = {
    fetch: fetchImpl,
    location: { search, origin, href: `${origin}/${search}` },
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
    Response,
    Headers,
  };
  const { installMockBackend } = await import("../public/js/core/mock-backend.mjs");
  const backend = installMockBackend({ scope, storage: scope.localStorage, session: scope.sessionStorage, fixtureRoot: `${origin}/mock-api/` });
  return { backend, scope, calls, origin };
}

test("mock API flag leaves normal requests untouched when disabled", async () => {
  const { backend, scope, calls, origin } = await harness("");
  assert.equal(backend.enabled, false);
  const response = await scope.fetch(`${origin}/api/items`);
  assert.equal(await response.text(), "native response");
  assert.deepEqual(calls.map((entry) => entry.pathname), ["/api/items"]);
});
