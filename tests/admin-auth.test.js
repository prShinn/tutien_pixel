"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const authSource = fs.readFileSync(path.join(__dirname, "..", "public", "admin", "admin-auth.js"), "utf8");
const accessKey = "tu_tien_admin_access_token";
const refreshKey = "tu_tien_admin_refresh_token";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function createElement() {
  return {
    hidden: false,
    textContent: "",
    value: "",
    disabled: false,
    open: false,
    handlers: new Map(),
    addEventListener(type, handler) { this.handlers.set(type, handler); },
    showModal() { this.open = true; },
    close() { this.open = false; },
    setAttribute(name) { if (name === "open") this.open = true; },
    focus() {},
    select() {},
  };
}

function createHarness({ fetchImpl, initialSession = {} }) {
  const values = new Map(Object.entries(initialSession));
  const sessionStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  const elements = new Map([
    "admin-auth-dialog", "admin-auth-form", "admin-username", "admin-password",
    "admin-auth-error", "admin-auth-submit", "admin-user-label", "admin-logout",
  ].map((id) => [id, createElement()]));
  const events = [];
  const window = {
    location: { href: "http://localhost:3000/admin", origin: "http://localhost:3000" },
    sessionStorage,
    addEventListener() {},
    dispatchEvent(event) { events.push(event.type); },
  };
  const document = {
    body: { classList: { add() {}, toggle() {} } },
    getElementById(id) { return elements.get(id) || null; },
  };
  const context = vm.createContext({
    API: {
      BASE: "http://localhost:3800",
      PATHS: { auth: { login: "/api/auth/login", me: "/api/auth/me", refresh: "/api/auth/refresh", logout: "/api/auth/logout" } },
    },
    window,
    document,
    fetch: fetchImpl,
    Headers,
    Response,
    URL,
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  });
  vm.runInContext(authSource, context, { filename: "admin-auth.js" });
  return { auth: window.AdminAuth, values, elements, events };
}

test("Admin login verifies role and sends only a Bearer token to protected calls", async () => {
  const calls = [];
  const harness = createHarness({
    initialSession: { tu_tien_token: "game-access", tu_tien_refresh_token: "game-refresh" },
    fetchImpl: async (url, options = {}) => {
      const headers = new Headers(options.headers || {});
      calls.push({ url, method: options.method || "GET", authorization: headers.get("Authorization"), legacyKey: headers.get("x-admin-key") });
      if (url.endsWith("/api/auth/login")) return jsonResponse({ accessToken: "gm-access", refreshToken: "gm-refresh" });
      if (url.endsWith("/api/auth/me")) return jsonResponse({ user: { id: "u-gm", username: "mapmaker", role: "GM" } });
      if (url.endsWith("/api/admin/worlds")) return jsonResponse([]);
      return jsonResponse({ ok: true });
    },
  });

  assert.equal(await harness.auth.ready, false);
  const user = await harness.auth.login("mapmaker", "correct-password");
  assert.equal(user.role, "GM");
  assert.equal((await harness.auth.fetch("http://localhost:3800/api/player/me")).status, 400);
  assert.equal((await harness.auth.fetch("https://attacker.example/api/admin/worlds")).status, 400);
  const response = await harness.auth.fetch("http://localhost:3800/api/admin/worlds", { headers: { "content-type": "application/json" } });
  assert.equal(response.status, 200);
  assert.equal(harness.values.get(accessKey), "gm-access");
  assert.equal(harness.values.get(refreshKey), "gm-refresh");
  assert.equal(harness.values.get("tu_tien_token"), "game-access");
  assert.equal(harness.values.get("tu_tien_refresh_token"), "game-refresh");
  const adminCall = calls.find((call) => call.url.endsWith("/api/admin/worlds"));
  assert.equal(adminCall.authorization, "Bearer gm-access");
  assert.equal(adminCall.legacyKey, null);
  assert.deepEqual(harness.events, ["admin:authenticated"]);
});

test("Admin login rejects PLAYER role and revokes the temporary login session", async () => {
  const calls = [];
  const harness = createHarness({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, body: options.body });
      if (url.endsWith("/api/auth/login")) return jsonResponse({ accessToken: "player-access", refreshToken: "player-refresh" });
      if (url.endsWith("/api/auth/me")) return jsonResponse({ user: { id: "u-player", username: "player", role: "PLAYER" } });
      if (url.endsWith("/api/auth/logout")) return jsonResponse({ ok: true });
      return jsonResponse({ ok: true });
    },
  });

  await assert.rejects(harness.auth.login("player", "correct-password"), /không có quyền GM\/ADMIN/i);
  assert.equal(harness.values.has(accessKey), false);
  assert.equal(harness.values.has(refreshKey), false);
  assert.equal(calls.some((call) => call.url.endsWith("/api/auth/logout")), true);
  assert.equal(calls.some((call) => call.url.includes("/api/admin/")), false);
});

test("Admin logout revokes only the admin session and preserves gameplay credentials", async () => {
  const calls = [];
  const harness = createHarness({
    initialSession: { tu_tien_token: "game-access", tu_tien_refresh_token: "game-refresh" },
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, body: options.body });
      if (url.endsWith("/api/auth/login")) return jsonResponse({ accessToken: "gm-access", refreshToken: "gm-refresh" });
      if (url.endsWith("/api/auth/me")) return jsonResponse({ user: { id: "u-gm", username: "operator", role: "ADMIN" } });
      return jsonResponse({ ok: true });
    },
  });

  await harness.auth.ready;
  await harness.auth.login("operator", "correct-password");
  await harness.auth.logout();

  assert.equal(harness.values.has(accessKey), false);
  assert.equal(harness.values.has(refreshKey), false);
  assert.equal(harness.values.get("tu_tien_token"), "game-access");
  assert.equal(harness.values.get("tu_tien_refresh_token"), "game-refresh");
  const revocation = calls.find((call) => call.url.endsWith("/api/auth/logout"));
  assert.deepEqual(JSON.parse(revocation.body), { refreshToken: "gm-refresh" });
  assert.deepEqual(harness.events, ["admin:authenticated", "admin:unauthenticated"]);
});

test("concurrent 401 admin responses rotate the refresh token once and retry", async () => {
  let refreshCalls = 0;
  let protectedCalls = 0;
  const authorizations = [];
  const harness = createHarness({
    initialSession: { [accessKey]: "old-access", [refreshKey]: "old-refresh" },
    fetchImpl: async (url, options = {}) => {
      const headers = new Headers(options.headers || {});
      if (url.endsWith("/api/auth/me")) {
        return jsonResponse({ user: { id: "u-admin", username: "operator", role: "ADMIN" } });
      }
      if (url.endsWith("/api/auth/refresh")) {
        refreshCalls += 1;
        assert.equal(JSON.parse(options.body).refreshToken, "old-refresh");
        return jsonResponse({ accessToken: "new-access", refreshToken: "new-refresh" });
      }
      if (url.endsWith("/api/admin/worlds")) {
        protectedCalls += 1;
        authorizations.push(headers.get("Authorization"));
        if (protectedCalls <= 2) return jsonResponse({ error: "expired" }, 401);
        return jsonResponse([]);
      }
      return jsonResponse({ ok: true });
    },
  });

  assert.equal(await harness.auth.ready, true);
  const results = await Promise.all([
    harness.auth.fetch("http://localhost:3800/api/admin/worlds"),
    harness.auth.fetch("http://localhost:3800/api/admin/worlds"),
  ]);
  assert.deepEqual(results.map((response) => response.status), [200, 200]);
  assert.equal(refreshCalls, 1, "rotating refresh tokens must be serialized across simultaneous 401s");
  assert.deepEqual(authorizations, ["Bearer old-access", "Bearer old-access", "Bearer new-access", "Bearer new-access"]);
  assert.equal(harness.values.get(accessKey), "new-access");
  assert.equal(harness.values.get(refreshKey), "new-refresh");
});

test("Admin pages contain no static-key field or header", () => {
  const files = ["public/admin/index.html", "public/admin/map-editor.html", "public/admin/admin.js", "public/admin/map-editor.js"];
  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.doesNotMatch(source, /x-admin-key|admin-key/);
  }
});
