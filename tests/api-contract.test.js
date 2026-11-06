"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const apiSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "api.js"), "utf8");
const bootstrapSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "bootstrap.js"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const gameHtml = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("client realm catalog route matches the server and game bootstrap loads the API contract", () => {
  const context = vm.createContext({ window: { location: { origin: "http://game.test" } } });
  vm.runInContext(`${apiSource}\nglobalThis.__API = API;`, context, { filename: "api.js" });

  assert.equal(context.__API.PATHS.data.realms, "/api/canh-gioi");
  assert.equal(context.__API.BASE, "http://game.test");
  assert.match(serverSource, /app\.get\(["']\/api\/canh-gioi["']/);
  assert.match(bootstrapSource, /js\/api\.js\?v=6/);
  assert.match(bootstrapSource, /core\/config\.mjs/);
  assert.match(bootstrapSource, /core\/state\.mjs/);
  assert.doesNotMatch(bootstrapSource, /js\/(?:config|state)\.js/);
  assert.match(gameHtml, /js\/bootstrap\.js\?v=27/);
});

test("API can target a separate local BE and rejects an untrusted API host", () => {
  const sessionValues = new Map();
  const sessionStorage = {
    getItem(key) { return sessionValues.get(key) || null; },
    setItem(key, value) { sessionValues.set(key, String(value)); },
  };
  const localContext = vm.createContext({
    URL,
    URLSearchParams,
    console,
    window: { sessionStorage, location: { origin: "http://localhost:3001", search: "?apiBase=http%3A%2F%2Flocalhost%3A3000" } },
  });
  vm.runInContext(`${apiSource}\nglobalThis.__API = API;`, localContext, { filename: "api-local.js" });
  assert.equal(localContext.__API.BASE, "http://localhost:3000");
  assert.equal(localContext.__API.SOCKET_URL, "http://localhost:3000");
  const navigatedContext = vm.createContext({
    URL,
    URLSearchParams,
    console,
    window: { sessionStorage, location: { origin: "http://localhost:3001", search: "" } },
  });
  vm.runInContext(`${apiSource}\nglobalThis.__API = API;`, navigatedContext, { filename: "api-navigation.js" });
  assert.equal(navigatedContext.__API.BASE, "http://localhost:3000");

  const noRememberedApiBase = { getItem: () => null };
  const localAdminContext = vm.createContext({
    URL,
    URLSearchParams,
    console,
    window: { sessionStorage: noRememberedApiBase, location: { origin: "http://localhost:3000", pathname: "/admin", search: "" } },
  });
  vm.runInContext(`${apiSource}\nglobalThis.__API = API;`, localAdminContext, { filename: "api-admin-local.js" });
  assert.equal(localAdminContext.__API.BASE, "http://localhost:3800");

  const staleRememberedApiBase = { getItem: () => "http://localhost:3000" };
  const localAdminWithStaleGameConfig = vm.createContext({
    URL,
    URLSearchParams,
    console,
    window: { sessionStorage: staleRememberedApiBase, location: { origin: "http://localhost:3000", pathname: "/admin/map-editor", search: "" } },
  });
  vm.runInContext(`${apiSource}\nglobalThis.__API = API;`, localAdminWithStaleGameConfig, { filename: "api-admin-stale.js" });
  assert.equal(localAdminWithStaleGameConfig.__API.BASE, "http://localhost:3800");

  const localGameContext = vm.createContext({
    URL,
    URLSearchParams,
    console,
    window: { sessionStorage: noRememberedApiBase, location: { origin: "http://localhost:3000", pathname: "/", search: "" } },
  });
  vm.runInContext(`${apiSource}\nglobalThis.__API = API;`, localGameContext, { filename: "api-game-local.js" });
  assert.equal(localGameContext.__API.BASE, "http://localhost:3800");

  const legacyGameContext = vm.createContext({
    URL,
    URLSearchParams,
    console,
    window: { sessionStorage: staleRememberedApiBase, location: { origin: "http://localhost:3000", pathname: "/", search: "" } },
  });
  vm.runInContext(`${apiSource}\nglobalThis.__API = API;`, legacyGameContext, { filename: "api-game-stale.js" });
  assert.equal(legacyGameContext.__API.BASE, "http://localhost:3800");

  const untrustedContext = vm.createContext({
    URL,
    URLSearchParams,
    console,
    window: { location: { origin: "https://game.example", search: "?apiBase=https%3A%2F%2Fattacker.example" } },
  });
  vm.runInContext(`${apiSource}\nglobalThis.__API = API;`, untrustedContext, { filename: "api-untrusted.js" });
  assert.equal(untrustedContext.__API.BASE, "https://game.example");

  const differentPortContext = vm.createContext({
    URL,
    URLSearchParams,
    console,
    window: { location: { origin: "https://game.example", search: "?apiBase=https%3A%2F%2Fgame.example%3A4444" } },
  });
  vm.runInContext(`${apiSource}\nglobalThis.__API = API;`, differentPortContext, { filename: "api-port.js" });
  assert.equal(differentPortContext.__API.BASE, "https://game.example");

  const deploymentContext = vm.createContext({
    URL,
    URLSearchParams,
    console,
    window: { TuTienConfig: { apiBase: "https://api.game.example" }, location: { origin: "https://game.example", search: "" } },
  });
  vm.runInContext(`${apiSource}\nglobalThis.__API = API;`, deploymentContext, { filename: "api-deployment.js" });
  assert.equal(deploymentContext.__API.BASE, "https://api.game.example");
});
