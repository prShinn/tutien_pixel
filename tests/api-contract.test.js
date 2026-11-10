"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const apiSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "api.js"), "utf8");
const utilsSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "utils.js"), "utf8");
const bootstrapSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "bootstrap.js"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const gameHtml = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function loadApi(windowValue, filename) {
  const context = vm.createContext({ URL, window: windowValue });
  vm.runInContext(`${apiSource}\nglobalThis.__API = API;`, context, { filename });
  return context.__API;
}

test("client realm catalog route matches the server and game bootstrap loads the API contract", () => {
  // Địa chỉ BE chỉ đến từ /runtime-config.js (window.TuTienConfig, sinh từ .env); FE không tự suy ra từ URL.
  const api = loadApi({ TuTienConfig: { dataMode: "real", apiBase: "http://localhost:3800" }, location: { origin: "http://game.test" } }, "api.js");

  assert.equal(api.PATHS.data.realms, "/api/canh-gioi");
  assert.equal(api.BASE, "http://localhost:3800");
  assert.equal(api.SOCKET_URL, "http://localhost:3800");
  assert.equal(api.REAL_BACKEND_ONLY, true);
  // FE chỉ chuyển tiếp REST/Socket.IO; route /api/canh-gioi thuộc BE.
  assert.match(serverSource, /app\.use\(\["\/api", "\/socket\.io"\], proxyToBackend\)/);
  assert.match(bootstrapSource, /js\/api\.js\?v=\d+/);
  assert.match(bootstrapSource, /core\/config\.mjs/);
  assert.match(bootstrapSource, /core\/state\.mjs/);
  assert.doesNotMatch(bootstrapSource, /js\/(?:config|state)\.js/);
  assert.match(gameHtml, /js\/bootstrap\.js\?v=\d+/);
});

test("API refuses to start without a real BE config or with an unsafe BE origin", () => {
  const origin = { location: { origin: "https://game.example" } };
  assert.throws(() => loadApi({ ...origin }, "api-missing.js"), /Thiếu cấu hình BE thật/);
  assert.throws(() => loadApi({ ...origin, TuTienConfig: { dataMode: "mock", apiBase: "https://api.game.example" } }, "api-mock.js"), /Thiếu cấu hình BE thật/);
  assert.throws(() => loadApi({ ...origin, TuTienConfig: { dataMode: "real", apiBase: "https://user:pass@api.game.example" } }, "api-cred.js"), /HTTP\(S\) origin/);
  assert.throws(() => loadApi({ ...origin, TuTienConfig: { dataMode: "real", apiBase: "https://api.game.example/v1" } }, "api-path.js"), /HTTP\(S\) origin/);
});

test("world normalization preserves runtime fields when a published map is refreshed", () => {
  const context = vm.createContext({ console });
  vm.runInContext(`${utilsSource}\nglobalThis.__normalizeWorld = normalizeWorldDto;`, context, { filename: "utils.js" });
  const map = context.__normalizeWorld({
    code: "field_test", type: "CITY", version: 8, w: 1, h: 1, jsonMap: [[0]],
    rules: { noMonsters: true, monsterPacksOnly: true },
  });

  assert.equal(map.type, "CITY");
  assert.deepEqual({ ...map.rules }, { noMonsters: true, monsterPacksOnly: true });
});
