"use strict";

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const backend = path.resolve(process.env.GAME_BACKEND_DIR || path.join(root, '../tutien_pixel_be'));
if (typeof process.loadEnvFile !== 'function') throw new Error('Use Node.js 24, matching BE.');
if (fs.existsSync(path.join(backend, '.env'))) process.loadEnvFile(path.join(backend, '.env'));
const beRequire = createRequire(path.join(backend, 'package.json'));
const mysql = beRequire('mysql2/promise');
const { db } = beRequire('./src/config');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/monsters/catalog-v1/manifest.json'), 'utf8'));

async function main() {
  if (manifest.assets.length !== 40 || new Set(manifest.assets.map((entry) => entry.code)).size !== 40) throw new Error('Expected 40 unique monster assets');
  for (const entry of manifest.assets) {
    if (!entry.img || !fs.existsSync(path.join(root, 'public', entry.img))) throw new Error(`Missing packaged sprite: ${entry.code}`);
  }
  const connection = await mysql.createConnection({ host: db.host, port: db.port, database: db.database, user: db.user, password: db.password });
  let updated = 0;
  try {
    await connection.beginTransaction();
    for (const entry of manifest.assets) {
      const [[row]] = await connection.execute("SELECT document_json AS doc, version, is_deleted AS deleted FROM admin_content_records WHERE collection_name = 'monsters' AND record_id = ? FOR UPDATE", [entry.code]);
      if (!row || row.deleted) throw new Error(`Missing or deleted monster: ${entry.code}`);
      const before = typeof row.doc === 'string' ? JSON.parse(row.doc) : row.doc;
      if (before.type === 'BOSS') throw new Error(`Refusing to modify boss: ${entry.code}`);
      if (before.img === entry.img && JSON.stringify(before.animation) === JSON.stringify(entry.animation)) continue;
      const after = { ...before, img: entry.img, animation: entry.animation, description: String(before.description || '').replace('; dùng sprite animation 4×4 hiện có.', '; sprite pixel riêng, animation 4×4 idle/walk/attack/hit.') };
      await connection.execute("UPDATE admin_content_records SET document_json = ?, version = version + 1, updated_by = 'seed-monster-sprites-v1' WHERE collection_name = 'monsters' AND record_id = ?", [JSON.stringify(after), entry.code]);
      await connection.execute("INSERT INTO admin_audit_logs (id, actor_id, action, resource, before_json, after_json, request_id) VALUES (?, 'seed-monster-sprites-v1', 'CONTENT_UPDATE', ?, ?, ?, 'seed-monster-sprites-v1')", [crypto.randomUUID(), `content:monsters:${entry.code}`, JSON.stringify(before), JSON.stringify(after)]);
      updated++;
    }
    await connection.commit();
    const [[count]] = await connection.query("SELECT COUNT(*) AS total, COUNT(DISTINCT JSON_UNQUOTE(JSON_EXTRACT(document_json, '$.img'))) AS distinctImages FROM admin_content_records WHERE collection_name = 'monsters' AND is_deleted = 0 AND JSON_UNQUOTE(JSON_EXTRACT(document_json, '$.img')) LIKE './assets/monsters/catalog-v1/%'");
    console.log(JSON.stringify({ persisted: true, updated, ...count }));
  } catch (error) { await connection.rollback(); throw error; }
  finally { await connection.end(); }
}
main().catch((error) => { console.error(`Sprite sync failed: ${error.code || error.message}`); process.exitCode = 1; });
