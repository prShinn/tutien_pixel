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
  assert.match(serverSource, /app\.get\(["']\/api\/canh-gioi["']/);
  assert.match(bootstrapSource, /js\/api\.js\?v=3/);
  assert.match(bootstrapSource, /core\/config\.mjs/);
  assert.match(bootstrapSource, /core\/state\.mjs/);
  assert.doesNotMatch(bootstrapSource, /js\/(?:config|state)\.js/);
  assert.match(gameHtml, /js\/bootstrap\.js\?v=2/);
});
