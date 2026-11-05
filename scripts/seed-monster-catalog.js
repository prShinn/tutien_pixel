"use strict";

// Persist catalog definitions only; map spawn placement remains an explicit editor action.
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
const backend = path.resolve(process.env.GAME_BACKEND_DIR || path.join(__dirname, "../../tutien_pixel_be"));
const beRequire = createRequire(path.join(backend, "package.json"));
if (typeof process.loadEnvFile !== "function") throw new Error("Run this seed with Node.js 24, matching the BE runtime.");
if (fs.existsSync(path.join(backend, ".env"))) process.loadEnvFile(path.join(backend, ".env"));
const { db } = beRequire("./src/config");
const seed = beRequire("./src/data/mock-data");
const mysql = beRequire("mysql2/promise");
const spriteManifestPath = path.resolve(__dirname, '../public/assets/monsters/catalog-v1/manifest.json');
const spriteManifest = JSON.parse(fs.readFileSync(spriteManifestPath, 'utf8')).assets;

const roster = [
  ["THIET_NHA_LANG", "Thiết Nha Lang", "KIM", 2, "HOANG_SOI"],
  ["KIM_MAO_TRU", "Kim Mao Trư", "KIM", 4, "THO_HEO"],
  ["NGAN_DIEP_YEU", "Ngân Diệp Yêu", "KIM", 7, "DOC_THAO"],
  ["BACH_NHAN_LANG", "Bạch Nhận Lang", "KIM", 11, "HOANG_SOI"],
  ["THIET_GIAP_TRU", "Thiết Giáp Trư", "KIM", 16, "THO_HEO"],
  ["THANH_DIEP_YEU", "Thanh Diệp Yêu", "MOC", 2, "DOC_THAO"],
  ["DOC_NHA_LANG", "Độc Nha Lang", "MOC", 5, "HOANG_SOI"],
  ["CO_DANG_QUAI", "Cổ Đằng Quái", "MOC", 8, "DOC_THAO"],
  ["THANH_MAO_TRU", "Thanh Mao Trư", "MOC", 12, "THO_HEO"],
  ["HUYEN_CAN_MOC_YEU", "Huyền Căn Mộc Yêu", "MOC", 17, "DOC_THAO"],
  ["THUY_LINH_THAO", "Thủy Linh Thảo", "THUY", 3, "DOC_THAO"],
  ["BANG_NHA_LANG", "Băng Nha Lang", "THUY", 5, "HOANG_SOI"],
  ["HAN_BANG_TRU", "Hàn Băng Trư", "THUY", 9, "THO_HEO"],
  ["SUONG_DIEP_YEU", "Sương Diệp Yêu", "THUY", 13, "DOC_THAO"],
  ["HUYEN_THUY_LANG", "Huyền Thủy Lang", "THUY", 18, "HOANG_SOI"],
  ["HOA_TINH_THAO", "Hỏa Tinh Thảo", "HOA", 3, "DOC_THAO"],
  ["XICH_MAO_TRU", "Xích Mao Trư", "HOA", 6, "THO_HEO"],
  ["DUNG_NHAM_LANG", "Dung Nham Lang", "HOA", 9, "HOANG_SOI"],
  ["PHAN_DIEP_YEU", "Phần Diệp Yêu", "HOA", 14, "DOC_THAO"],
  ["VIEM_NHA_THU", "Viêm Nha Thú", "HOA", 19, "THO_HEO"],
  ["SA_DIA_TRU", "Sa Địa Trư", "THO", 2, "THO_HEO"],
  ["THACH_BI_LANG", "Thạch Bì Lang", "THO", 6, "HOANG_SOI"],
  ["HOANG_SA_MOC_YEU", "Hoàng Sa Mộc Yêu", "THO", 10, "DOC_THAO"],
  ["NHAM_GIAP_TRU", "Nham Giáp Trư", "THO", 14, "THO_HEO"],
  ["DIA_MACH_THU", "Địa Mạch Thú", "THO", 20, "THO_HEO"],
  ["AM_ANH_LANG", "Ám Ảnh Lang", "AM", 4, "HOANG_SOI"],
  ["U_HON_THAO", "U Hồn Thảo", "AM", 7, "DOC_THAO"],
  ["DA_HANH_TRU", "Dạ Hành Trư", "AM", 10, "THO_HEO"],
  ["TU_DANG_YEU", "Tử Đằng Yêu", "AM", 15, "DOC_THAO"],
  ["HUYEN_DA_LANG", "Huyền Dạ Lang", "AM", 20, "HOANG_SOI"],
  ["TAT_PHONG_LANG", "Tật Phong Lang", "PHONG", 3, "HOANG_SOI"],
  ["PHONG_LINH_THAO", "Phong Linh Thảo", "PHONG", 6, "DOC_THAO"],
  ["VAN_MAO_TRU", "Vân Mao Trư", "PHONG", 10, "THO_HEO"],
  ["BAO_PHONG_LANG", "Bạo Phong Lang", "PHONG", 15, "HOANG_SOI"],
  ["THIEN_PHONG_YEU", "Thiên Phong Yêu", "PHONG", 19, "DOC_THAO"],
  ["DIEN_NHA_LANG", "Điện Nha Lang", "LOI", 4, "HOANG_SOI"],
  ["LOI_LINH_THAO", "Lôi Linh Thảo", "LOI", 7, "DOC_THAO"],
  ["TU_DIEN_TRU", "Tử Điện Trư", "LOI", 11, "THO_HEO"],
  ["KINH_LOI_LANG", "Kinh Lôi Lang", "LOI", 16, "HOANG_SOI"],
  ["THIEN_DIEN_MOC_YEU", "Thiên Điện Mộc Yêu", "LOI", 20, "DOC_THAO"],
];
const colors = { KIM: "#d7c687", MOC: "#71b96e", THUY: "#65b4d8", HOA: "#e87947", THO: "#b89a6a", AM: "#ab79ce", PHONG: "#7dd6c1", LOI: "#edcf67" };
const additions = roster.map(([code, name, linhCan, level, family]) => {
  const base = seed.monsterDefs.find((m) => m.code === family);
  if (!base) throw new Error(`Missing family ${family}`);
  const hp = 60 + level * 28 + level * level * 2;
  const mp = 20 + level * 5;
  const sprite = spriteManifest.find((entry) => entry.code === code);
  if (!sprite?.img || !sprite.animation) throw new Error(`Missing dedicated monster sprite: ${code}`);
  return {
    ...base, id: code, code, name, type: "NORMAL", level, linhCan, nguHanh: [linhCan],
    img: sprite.img, animation: sprite.animation,
    color: colors[linhCan], hp, maxHp: hp, mp, maxMp: mp,
    atk: 6 + level * 4, def: 1 + level * 2,
    speed: family === "DOC_THAO" ? 0.8 : (linhCan === "PHONG" ? 1.35 : family === "HOANG_SOI" ? 1.2 : 0.95),
    attackType: family === "DOC_THAO" ? "MAGIC" : "PHYSICAL",
    respawnMs: 20000 + level * 1000,
    description: `${name} hệ ${linhCan}, cấp ${level}. Quái thường thuộc họ ${family}; sprite pixel riêng, animation 4×4 idle/walk/attack/hit.`,
  };
});

async function main() {
  const definitions = [...seed.monsterDefs, ...additions];
  const codes = new Set();
  for (const monster of definitions) {
    if (codes.has(monster.code)) throw new Error(`Duplicate code ${monster.code}`);
    codes.add(monster.code);
    if (!seed.lootTables[monster.lootTableId]) throw new Error(`Missing loot table ${monster.code}`);
    if (!fs.existsSync(path.resolve(__dirname, "../public", monster.img))) throw new Error(`Missing sprite ${monster.code}`);
  }
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ mode: "preview", nonBoss: definitions.filter((m) => m.type !== "BOSS").length, bosses: definitions.filter((m) => m.type === "BOSS").length, additions: additions.map((m) => ({ code: m.code, name: m.name, level: m.level })) }, null, 2));
    return;
  }
  const connection = await mysql.createConnection({ host: db.host, port: db.port, user: db.user, password: db.password, database: db.database });
  let inserted = 0;
  try {
    await connection.beginTransaction();
    for (const monster of definitions) {
      const [existing] = await connection.execute("SELECT record_id FROM admin_content_records WHERE collection_name = 'monsters' AND record_id = ? FOR UPDATE", [monster.code]);
      if (existing.length) continue; // Preserve Admin edits and tombstones on rerun.
      const json = JSON.stringify(monster);
      await connection.execute("INSERT INTO admin_content_records (collection_name, record_id, document_json, is_deleted, version, updated_by) VALUES ('monsters', ?, ?, 0, 1, 'seed-monsters-v1')", [monster.code, json]);
      await connection.execute("INSERT INTO admin_audit_logs (id, actor_id, action, resource, before_json, after_json, request_id) VALUES (?, 'seed-monsters-v1', 'CONTENT_CREATE', ?, NULL, ?, 'seed-monsters-v1')", [crypto.randomUUID(), `content:monsters:${monster.code}`, json]);
      inserted++;
    }
    await connection.commit();
    const [rows] = await connection.query("SELECT JSON_UNQUOTE(JSON_EXTRACT(document_json, '$.type')) AS type, COUNT(*) AS total FROM admin_content_records WHERE collection_name = 'monsters' AND is_deleted = 0 GROUP BY type");
    console.log(JSON.stringify({ persisted: true, inserted, counts: rows }));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { await connection.end(); }
}
main().catch((error) => { console.error(`Monster seed failed: ${error.code || error.message}`); process.exitCode = 1; });
