"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SCHEMA_VERSION = 1;
const MAX_STATE_BYTES = 64 * 1024 * 1024;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error(`Invalid ${label} in game state`);
  return id;
}

function normalizeGameState(input) {
  if (!isRecord(input) || Number(input.schemaVersion) !== SCHEMA_VERSION) {
    throw new Error("Unsupported or invalid game state schema");
  }
  if (!Array.isArray(input.users) || !Array.isArray(input.players)) {
    throw new Error("Invalid game state collections");
  }

  const userIds = new Set();
  const usernames = new Set();
  const users = input.users.map((user) => {
    if (!isRecord(user) || user.isDemo === true) throw new Error("Invalid persisted user");
    const id = requireId(user.id, "user id");
    const username = String(user.username || "").trim();
    const passwordHash = String(user.passwordHash || "");
    const usernameKey = username.toLowerCase();
    if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(username) || passwordHash.length < 20 || passwordHash.length > 255) {
      throw new Error("Invalid persisted user credentials");
    }
    if (userIds.has(id) || usernames.has(usernameKey)) throw new Error("Duplicate persisted user");
    userIds.add(id);
    usernames.add(usernameKey);
    return { id, username, passwordHash };
  });

  const playerIds = new Set();
  const playerOwners = new Set();
  const players = input.players.map((player) => {
    if (!isRecord(player)) throw new Error("Invalid persisted player");
    const id = requireId(player.id, "player id");
    const userId = requireId(player.userId, "player owner id");
    if (!userIds.has(userId) || playerIds.has(id) || playerOwners.has(userId)) {
      throw new Error("Invalid or duplicate persisted player owner");
    }
    if (!String(player.name || "").trim()) throw new Error("Invalid persisted player name");
    playerIds.add(id);
    playerOwners.add(userId);
    let serialized;
    try {
      serialized = JSON.stringify(player);
    } catch {
      throw new Error("Persisted player is not serializable");
    }
    if (!serialized || Buffer.byteLength(serialized, "utf8") > 2 * 1024 * 1024) {
      throw new Error("Persisted player exceeds the allowed size");
    }
    return JSON.parse(serialized);
  });

  return { schemaVersion: SCHEMA_VERSION, users, players };
}

class GameStateStore {
  constructor(filename, options = {}) {
    this.filename = filename;
    this.writeDelayMs = Number.isFinite(options.writeDelayMs) ? Math.max(0, options.writeDelayMs) : 300;
    this.onError = typeof options.onError === "function" ? options.onError : () => {};
    this.revision = 0;
    this.persistedRevision = 0;
    this.snapshotProvider = null;
    this.timer = null;
    this.writePromise = null;
  }

  load() {
    if (!fs.existsSync(this.filename)) return { schemaVersion: SCHEMA_VERSION, users: [], players: [] };
    const stat = fs.statSync(this.filename);
    if (stat.size > MAX_STATE_BYTES) throw new Error("Game state file exceeds the allowed size");
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(this.filename, "utf8"));
    } catch {
      throw new Error("Game state file is unreadable or invalid JSON; restore it before starting the server");
    }
    return normalizeGameState(parsed);
  }

  schedule(snapshotProvider) {
    if (typeof snapshotProvider !== "function") throw new TypeError("A game state snapshot provider is required");
    this.snapshotProvider = snapshotProvider;
    this.revision += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush().catch((error) => {
        this.onError(error);
        this.retryLater();
      });
    }, this.writeDelayMs);
    this.timer.unref?.();
  }

  retryLater() {
    if (this.timer || this.persistedRevision >= this.revision) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush().catch((error) => {
        this.onError(error);
        this.retryLater();
      });
    }, Math.max(1000, this.writeDelayMs));
    this.timer.unref?.();
  }

  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (this.persistedRevision < this.revision) {
      if (this.writePromise) {
        await this.writePromise;
        continue;
      }
      const revision = this.revision;
      const snapshot = normalizeGameState(this.snapshotProvider());
      this.writePromise = this.writeSnapshot(snapshot)
        .then(() => { this.persistedRevision = revision; })
        .finally(() => { this.writePromise = null; });
      await this.writePromise;
    }
  }

  async writeSnapshot(snapshot) {
    const serialized = JSON.stringify(snapshot, null, 2);
    const bytes = Buffer.byteLength(serialized, "utf8");
    if (bytes > MAX_STATE_BYTES) throw new Error("Game state exceeds the allowed size");
    await fs.promises.mkdir(path.dirname(this.filename), { recursive: true });
    const tempFile = `${this.filename}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.promises.writeFile(tempFile, serialized, { encoding: "utf8", mode: 0o600 });
      await fs.promises.rename(tempFile, this.filename);
    } catch (error) {
      await fs.promises.rm(tempFile, { force: true }).catch(() => {});
      throw error;
    }
  }
}

module.exports = GameStateStore;
module.exports.normalizeGameState = normalizeGameState;
