/**
 * db.js — Database module
 *
 * Dùng lowdb (JSON file) để dễ setup local.
 * Khi scale production: thay thế bằng PostgreSQL/MongoDB
 * chỉ cần đổi các hàm trong module này, code còn lại không thay đổi.
 *
 * PostgreSQL migration path:
 *   npm install pg
 *   Thay low.get().value() → pool.query('SELECT ...')
 */

const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const path = require("path");
const fs = require("fs");

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// ── Adapters (one file per collection — easy to inspect/backup) ──
const usersDb = low(new FileSync(path.join(DATA_DIR, "users.json")));
const playersDb = low(new FileSync(path.join(DATA_DIR, "players.json")));
const worldDb = low(new FileSync(path.join(DATA_DIR, "world.json")));

// ── Default schemas ──
usersDb.defaults({ users: [] }).write();
playersDb.defaults({ players: [] }).write();
worldDb.defaults({ onlineCount: 0, events: [] }).write();

// ================================================================
// USER CRUD (auth accounts)
// ================================================================
const UserDB = {
  findByUsername(username) {
    return usersDb.get("users").find({ username }).value();
  },
  findById(id) {
    return usersDb.get("users").find({ id }).value();
  },
  create({ id, username, passwordHash }) {
    const now = Date.now();
    const user = { id, username, passwordHash, createdAt: now, lastLogin: now };
    usersDb.get("users").push(user).write();
    return user;
  },
  updateLastLogin(id) {
    usersDb.get("users").find({ id }).assign({ lastLogin: Date.now() }).write();
  },
  count() {
    return usersDb.get("users").value().length;
  },
};

// ================================================================
// PLAYER CRUD (game data — separate from auth)
// ================================================================
const PlayerDB = {
  findByUserId(userId) {
    return playersDb.get("players").find({ userId }).value();
  },
  findByUsername(username) {
    return playersDb.get("players").find({ username }).value();
  },
  create(data) {
    playersDb
      .get("players")
      .push({ ...data, createdAt: Date.now(), updatedAt: Date.now() })
      .write();
    return data;
  },
  save(userId, data) {
    const exists = playersDb.get("players").find({ userId }).value();
    if (exists) {
      playersDb
        .get("players")
        .find({ userId })
        .assign({ ...data, updatedAt: Date.now() })
        .write();
    } else {
      PlayerDB.create({ userId, ...data });
    }
  },
  listOnline() {
    // Returns all player usernames (full list — online status tracked via Socket.io)
    return playersDb
      .get("players")
      .map((p) => ({
        username: p.username,
        realm: p.realm,
        stage: p.stage,
        mapId: p.mapId,
      }))
      .value();
  },
};

// ================================================================
// WORLD STATE (shared world events — future: map state, guilds...)
// ================================================================
const WorldDB = {
  logEvent(type, data) {
    const ev = { type, data, ts: Date.now() };
    worldDb.get("events").push(ev).write();
    // Keep only last 500 events
    const evs = worldDb.get("events").value();
    if (evs.length > 500) {
      worldDb.set("events", evs.slice(-500)).write();
    }
  },
  recentEvents(limit = 20) {
    const evs = worldDb.get("events").value();
    return evs.slice(-limit);
  },
};

module.exports = { UserDB, PlayerDB, WorldDB };
