"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const apiSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "api.js"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const gameHtml = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("client realm catalog route matches the server and both shells load the bumped API contract", () => {
  const context = vm.createContext({ window: { location: { origin: "http://game.test" } } });
  vm.runInContext(`${apiSource}\nglobalThis.__API = API;`, context, { filename: "api.js" });

  assert.equal(context.__API.PATHS.data.realms, "/api/canh-gioi");
  assert.match(serverSource, /app\.get\(["']\/api\/canh-gioi["']/);
  assert.match(gameHtml, /js\/api\.js\?v=3/);
});
