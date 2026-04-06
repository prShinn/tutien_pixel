const mysql = require("mysql2/promise");
const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "", // nếu bạn dùng XAMPP mặc định thì để trống
  database: "tutien_pixel",
});

// ================================================================
// USER CRUD (auth accounts)
// ================================================================
const UserDB = {
  async findByUsername(username) {
    const [rows] = await db.query(
      "SELECT * FROM users WHERE username = ? LIMIT 1",
      [username],
    );
    return rows[0] || null;
  },

  async findById(id) {
    const [rows] = await db.query("SELECT * FROM users WHERE id = ? LIMIT 1", [
      id,
    ]);
    return rows[0] || null;
  },

  async create({ username, passwordHash }) {
    const now = Date.now();
    const [result] = await db.query(
      "INSERT INTO users (id, username, password, createDate) VALUES (?, ?, ?, ?)",
      [null, username, passwordHash, now],
    );
    return {
      id: result.insertId,
      username: username,
      createDate: now,
      lastLogin: now,
    };
  },

  async updateLastLogin(id) {
    await db.query("UPDATE users SET lastLogin = ? WHERE id = ?", [
      Date.now(),
      id,
    ]);
  },

  async count() {
    const [rows] = await db.query("SELECT COUNT(*) AS c FROM users");
    return rows[0].c;
  },
};

// ================================================================
// PLAYER CRUD (game data — separate from auth)
// ================================================================
const PlayerDB = {
  async findByUserId(userId) {
    const [rows] = await db.query(
      "SELECT * FROM players WHERE userId = ? LIMIT 1",
      [userId],
    );
    if (!rows[0]) return null;

    // parse JSON fields
    return {
      ...rows[0],
      root: JSON.parse(rows[0].root || ""),
      stats: JSON.parse(rows[0].stats || ""),
      inventory: JSON.parse(rows[0].inventory || ""),
    };
  },

  async findByUsername(username) {
    const [rows] = await db.query(
      "SELECT * FROM players WHERE username =?  LIMIT 1",
      [username],
    );
    if (!rows[0]) return null;

    return {
      ...rows[0],
      root: JSON.parse(rows[0].root),
      stats: JSON.parse(rows[0].stats),
      inventory: JSON.parse(rows[0].inventory),
    };
  },

  async create(player) {
    const now = Date.now();

    await db.query(
      `INSERT INTO players (
        userId, username, name,
        root, stats, inventory,
        realm, stage,
        hp, maxHp, mp, maxMp,
        xu, tuExp, tuNeeded,
        mapId, mapX, mapY,
        createdAt, updatedAt, tuSkill, tuSkillCount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0 ,0)`,
      [
        player.userId,
        player.username,
        player.name ?? "shinn",
        JSON.stringify(player.root),
        JSON.stringify(player.stats),
        JSON.stringify(player.inventory),
        player.realm,
        player.stage,
        player.hp,
        player.maxHp,
        player.mp,
        player.maxMp,
        player.xu,
        player.tuExp,
        player.tuNeeded,
        player.mapId,
        player.mapX,
        player.mapY,
        now,
        now,
      ],
    );

    return player;
  },

  async save(userId, data) {
    const now = Date.now();
    const existing = await this.findByUserId(userId);

    if (!existing) {
      return await this.create({ userId, ...data });
    }

    await db.query(
      `UPDATE players SET
        username=?, name=?,
        root=?, stats=?, inventory=?,
        realm=?, stage=?,
        hp=?, maxHp=?, mp=?, maxMp=?,
        xu=?, tuExp=?, tuNeeded=?,
        mapId=?, mapX=?, mapY=?,
        updatedAt=?, tuSkill=?, tuSkillCount=?
      WHERE userId=?`,
      [
        data.username,
        data.name,
        JSON.stringify(data.root),
        JSON.stringify(data.stats),
        JSON.stringify(data.inventory),
        data.realm,
        data.stage,
        data.hp,
        data.maxHp,
        data.mp,
        data.maxMp,
        data.xu,
        data.tuExp,
        data.tuNeeded,
        data.mapId,
        data.mapX,
        data.mapY,
        now,
        userId,
        data.tuSkill,
        data.tuSkillCount,
      ],
    );
  },

  async listOnline() {
    const [rows] = await db.query(
      "SELECT username, realm, stage, mapId FROM players WHERE isOnline = 1",
    );
    return rows;
  },
};

// ================================================================
// WORLD STATE (shared world events — future: map state, guilds...)
// ================================================================
const WorldDB = {
  async logEvent(type, data) {
    const now = Date.now();

    const [rows] = await db.query("SELECT events FROM world WHERE id=1");
    let events = JSON.parse(rows[0].events || "[]");

    events.push({ type, data, ts: now });

    if (events.length > 500) events = events.slice(-500);

    await db.query("UPDATE world SET events=? WHERE id=1", [
      JSON.stringify(events),
    ]);
  },

  async recentEvents(limit = 20) {
    const [rows] = await db.query("SELECT events FROM world WHERE id=1");
    const events = JSON.parse(rows[0].events || "[]");
    return events.slice(-limit);
  },
};

module.exports = { UserDB, PlayerDB, WorldDB };
