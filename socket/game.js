// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: socket/game.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Máy chủ thời gian thực (Server-Authoritative Game Server): Quản lý các phòng chơi (Rooms/Maps),
//      xác thực di chuyển của người chơi (chống wall-hack và speed-hack), quản lý vòng lặp AI quái vật
//      (Monster Spawns, Aggro, Chase, Leash, Return), tính toán và phân phối sát thương/chiến đấu,
//      rơi đồ (Loot Tables), broadcast định kỳ snapshot thế giới cho toàn bộ client.
// 2. CẤU HÌNH LIÊN QUAN:
//    - MAX_SPEED, MONSTER_AGGRO_RANGE, MONSTER_LEASH_RANGE, MONSTER_CHASE_DURATION_MS, TICK_RATE (20Hz).
//    - Phụ thuộc: data/mock-data (monsterDefs, lootTables, worlds), data/balance.
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Chống cheat client: Kiểm tra va chạm bản đồ server-side (canSpawnAt/canMoveTo), gửi movement_corrected
//      khi phát hiện hack tọa độ hoặc đi xuyên vật cản.
//    - Quản lý quái theo bầy đàn (Pack AI), tự động quay về hang khi người chơi chạy quá xa.
// ════════════════════════════════════════════════════════════════════════════════════════

const http = require("http");
const https = require("https");
const { URL } = require("url");
const jwt = require("jsonwebtoken");
const ENV = require("../config/env");
const { JWT_SECRET } = require("../middleware/auth");
const AUTH_BACKEND = ENV.authBackend;
const { skills, monsterDefs, items, lootTables } = require("../data/mock-data");
const { BALANCE, deriveStats, affinityCritBonus, affinityProfile, elementalStrength, mitigateDamage } = require("../data/balance");

// In-memory session store: socketId → session
// Production: Redis pub/sub ở đây
const sessions = new Map();
const roomMonsters = new Map();
const roomRuntime = new Map();
const MONSTER_ROOM_CAP = 9;
const MONSTER_MIN_ON_JOIN = 3;
const MONSTER_AGGRO_RANGE = 40;
const MONSTER_LEASH_RANGE = 72;
const MONSTER_CHASE_DURATION_MS = 7000;
const MONSTER_ATTACK_RANGE = 18;
const MONSTER_MOVE_SPEED = 1.1;
const BASIC_ATTACK_RANGE = 24;
const SKILL_RANGE_SCALE = 6;
const COMBAT_GCD_MS = 350;
const AOI_CHUNK_SIZE = 96;
const AOI_RADIUS = 150;
const MOVE_MIN_INTERVAL_MS = 45;
const PLAYER_MAX_MOVE_SPEED = 58;
const MOVE_BURST_TOLERANCE = 2.5;
const PLAYER_COLLISION_RADIUS = 0.45;
const PORTAL_ACTIVATION_RANGE = 18;

function isSolidTile(world, tx, ty) {
  if (!world || tx < 0 || ty < 0 || tx >= Number(world.w || 0) || ty >= Number(world.h || 0)) return true;
  const tiles = world.jsonMap || world.tiles;
  // Tạm thời chỉ chặn sông nước ao hồ (tile = 2)
  return Number(tiles?.[ty]?.[tx]) === 2;
}

function positionCollides(world, x, y) {
  if (!world) return false;
  const cx = Number(x) + 0.5;
  const cy = Number(y) + 0.5;
  const minX = Math.floor(cx - PLAYER_COLLISION_RADIUS);
  const maxX = Math.floor(cx + PLAYER_COLLISION_RADIUS - 1e-9);
  const minY = Math.floor(cy - PLAYER_COLLISION_RADIUS);
  const maxY = Math.floor(cy + PLAYER_COLLISION_RADIUS - 1e-9);
  for (let ty = minY; ty <= maxY; ty += 1) {
    for (let tx = minX; tx <= maxX; tx += 1) {
      if (isSolidTile(world, tx, ty)) return true;
    }
  }
  return false;
}

function movementPathCollides(world, fromX, fromY, toX, toY) {
  const distance = Math.hypot(toX - fromX, toY - fromY);
  const steps = Math.max(1, Math.ceil(distance / 0.5));
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    if (positionCollides(world, fromX + (toX - fromX) * progress, fromY + (toY - fromY) * progress)) return true;
  }
  return false;
}

function findSkill(skillRef) {
  if (skillRef === undefined || skillRef === null || skillRef === "") return null;
  const ref = String(skillRef);
  return skills.find((item) => String(item.code) === ref || String(item.id) === ref) || null;
}

function isPassiveSkill(skill) {
  return String(skill?.category || "ACTIVE").toUpperCase() === "PASSIVE";
}

function playerHasSkill(player, skill) {
  if (!skill) return false;
  const learned = Array.isArray(player.learnedSkills) ? player.learnedSkills : [];
  const equipped = Array.isArray(player.skills) ? player.skills : [];
  const refs = [...learned, ...equipped.flatMap((item) => [item.code, item.id])]
    .filter((value) => value !== undefined && value !== null)
    .map(String);
  return refs.includes(String(skill.code)) || refs.includes(String(skill.id));
}

function passiveProfile(player) {
  const profile = {
    maxHpPct: 0, maxMpPct: 0, defensePct: 0, critPct: 0, cooldownPct: 0,
    hpRegenPct: 0, skillDamageByRoot: {}, statusEffectPct: 0,
  };
  for (const skill of skills) {
    if (!isPassiveSkill(skill) || !playerHasSkill(player, skill)) continue;
    const modifiers = skill.passiveModifiers || {};
    for (const key of ["maxHpPct", "maxMpPct", "defensePct", "critPct", "cooldownPct", "hpRegenPct", "statusEffectPct"]) {
      profile[key] += Number(modifiers[key] || 0);
    }
    if (Number(modifiers.skillDamagePct || 0) > 0 && skill.linhCan) {
      profile.skillDamageByRoot[skill.linhCan] = (profile.skillDamageByRoot[skill.linhCan] || 0) + Number(modifiers.skillDamagePct);
    }
  }
  return profile;
}

function isOffensiveSkill(skill) {
  if (!skill) return false;
  return Number(skill.satThuong || 0) > 0 && !["heal", "shield", "cleanse", "speed"].includes(String(skill.effect || ""));
}

function activePlayerBuff(player, keys, now = Date.now()) {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    const buff = player?.buffs?.[key];
    if (!buff) continue;
    if (!buff.expiresAt || Number(buff.expiresAt) > now) return buff;
  }
  return null;
}

function playerBuffValue(player, keys, now = Date.now()) {
  return Number(activePlayerBuff(player, keys, now)?.value || 0);
}

function skillCooldownMs(player, skill, now = Date.now()) {
  const base = Math.max(1, Number(skill?.hoiChieu || 1)) * 1000;
  const passive = passiveProfile(player);
  const castSpeed = Math.min(60, Math.max(0, playerBuffValue(player, "buff_cast", now) + passive.cooldownPct * 100));
  return Math.max(250, Math.round(base * (1 - castSpeed / 100)));
}

function applyPlayerBuff(player, skill, now) {
  if (!skill?.effect) return;
  const duration = Math.max(1000, Number(skill.thoiGianBuff || 4) * 1000);
  player.buffs = {
    ...(player.buffs || {}),
    [skill.effect]: { value: Number(skill.effectVal || 0), duration, expiresAt: now + duration },
  };
}

function refreshPlayerVitals(player, now = Date.now()) {
  const baseHp = Number(player.baseMaxHp || player.maxHp || 100);
  const baseMp = Number(player.baseMaxMp || player.maxMp || 50);
  player.baseMaxHp = baseHp;
  player.baseMaxMp = baseMp;
  const passive = passiveProfile(player);
  const vitalRate = Math.max(0, playerBuffValue(player, "buff_vitals", now));
  const nextMaxHp = Math.floor(baseHp * (1 + vitalRate / 100 + passive.maxHpPct));
  const nextMaxMp = Math.floor(baseMp * (1 + vitalRate / 100 + passive.maxMpPct));
  const oldMaxHp = Number(player.maxHp || baseHp);
  const oldMaxMp = Number(player.maxMp || baseMp);
  player.maxHp = nextMaxHp;
  player.maxMp = nextMaxMp;
  if (nextMaxHp > oldMaxHp) player.hp = Number(player.hp || 0) + nextMaxHp - oldMaxHp;
  if (nextMaxMp > oldMaxMp) player.mp = Number(player.mp || 0) + nextMaxMp - oldMaxMp;
  player.hp = Math.min(nextMaxHp, Number(player.hp || 0));
  player.mp = Math.min(nextMaxMp, Number(player.mp || 0));
}

function canSpawnAt(world, x, y) {
  const tiles = world?.jsonMap || world?.tiles;
  const tile = Array.isArray(tiles) ? tiles[y]?.[x] : 0;
  return x >= 1 && y >= 1 && x < Number(world?.w || 0) - 1 && y < Number(world?.h || 0) - 1
    && Number(tile) !== 2;
}

function nearestWalkablePoint(world, x, y) {
  const centerX = Math.round(Number(x));
  const centerY = Math.round(Number(y));
  if (canSpawnAt(world, centerX, centerY)) return { x: centerX, y: centerY };
  for (let radius = 1; radius <= 16; radius += 1) {
    for (let oy = -radius; oy <= radius; oy += 1) {
      for (let ox = -radius; ox <= radius; ox += 1) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
        const candidateX = centerX + ox;
        const candidateY = centerY + oy;
        if (canSpawnAt(world, candidateX, candidateY)) return { x: candidateX, y: candidateY };
      }
    }
  }
  return null;
}

function randomPackPosition(world, centerX, centerY, radius) {
  let x = Math.round(centerX), y = Math.round(centerY);
  for (let i = 0; i < 30; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * Math.max(0, Number(radius || 0));
    const candidateX = Math.round(Number(centerX) + Math.cos(angle) * distance);
    const candidateY = Math.round(Number(centerY) + Math.sin(angle) * distance);
    if (canSpawnAt(world, candidateX, candidateY)) { x = candidateX; y = candidateY; break; }
  }
  return { x, y };
}

function createRoomMonster(roomId, world, serial, pack = null) {
  const template = pack
    ? monsterDefs.find((item) => item.id === pack.templateId || item.code === pack.templateId) || monsterDefs[serial % monsterDefs.length]
    : monsterDefs[serial % monsterDefs.length];
  const centerX = Number(pack?.centerX ?? template.spawnX ?? Number(world?.w || 40) / 2);
  const centerY = Number(pack?.centerY ?? template.spawnY ?? Number(world?.h || 30) / 2);
  const position = randomPackPosition(world, centerX, centerY, pack?.radius ?? 0);
  const packId = pack?.packId || template.packId || `PACK_${template.code || template.id || serial}`;
  const maxHp = Number(template.maxHp || template.hp || 1);
  return {
    ...template,
    id: `mon_${roomId}_${Date.now().toString(36)}_${serial}`,
    x: position.x,
    y: position.y,
    spawnX: position.x,
    spawnY: position.y,
    packId,
    packCenterX: centerX,
    packCenterY: centerY,
    packRadius: Number(pack?.radius ?? 0),
    aggroRange: Number(pack?.aggroRange ?? MONSTER_AGGRO_RANGE),
    leashDistance: Number(pack?.leashDistance ?? MONSTER_LEASH_RANGE),
    chaseDurationMs: Number(pack?.chaseDurationMs ?? MONSTER_CHASE_DURATION_MS),
    chaseTargetId: null,
    chaseStartedAt: 0,
    reaggroAt: 0,
    hp: maxHp, maxHp, dead: false,
  };
}

function createPackMonsters(roomId, world) {
  const packs = Array.isArray(world?.monsterSpawns) ? world.monsterSpawns : [];
  return packs.flatMap((pack, packIndex) => Array.from({ length: Math.max(0, Number(pack.count || 0)) }, (_, index) => (
    createRoomMonster(roomId, world, packIndex * 100 + index, pack)
  )));
}

function ensureRoomMonsters(roomId, world) {
  const isCity = String(world?.type || "").toUpperCase() === "CITY" || Boolean(world?.rules?.noMonsters);
  if (!roomMonsters.has(roomId)) {
    let seeded = [];
    if (!isCity) {
      if (Array.isArray(world?.monsterSpawns) && world.monsterSpawns.length) {
        seeded = createPackMonsters(roomId, world);
      } else if (Array.isArray(world?.monsters) && world.monsters.length) {
        const packs = world.monsters.map((m, idx) => ({
          packId: `PACK_${m.code || m.id || idx}`,
          templateId: m.id || m.code,
          centerX: Number(m.spawnX ?? Math.floor(Number(world?.w || 40) / 2)),
          centerY: Number(m.spawnY ?? Math.floor(Number(world?.h || 30) / 2)),
          count: 4,
          radius: 24,
          aggroRange: MONSTER_AGGRO_RANGE,
          leashDistance: MONSTER_LEASH_RANGE,
          chaseDurationMs: MONSTER_CHASE_DURATION_MS,
        }));
        seeded = packs.flatMap((pack, packIndex) => Array.from({ length: pack.count }, (_, index) => (
          createRoomMonster(roomId, world, packIndex * 100 + index, pack)
        )));
      }
    }
    roomMonsters.set(roomId, seeded);
  }
  const monsters = roomMonsters.get(roomId);
  if (!roomRuntime.has(roomId)) roomRuntime.set(roomId, { lastSpawnAt: Date.now(), lastBroadcastAt: 0 });
  monsters.forEach((monster, index) => {
    monster.id = monster.id || `mon_${roomId}_seed_${index}`;
    monster.x = Number(monster.x ?? monster.spawnX ?? Math.floor(Number(world?.w || 40) / 2));
    monster.y = Number(monster.y ?? monster.spawnY ?? Math.floor(Number(world?.h || 30) / 2));
    monster.spawnX = Number(monster.spawnX ?? monster.x);
    monster.spawnY = Number(monster.spawnY ?? monster.y);
    monster.packId = monster.packId || `PACK_${monster.id}`;
    monster.packCenterX = Number(monster.packCenterX ?? monster.spawnX);
    monster.packCenterY = Number(monster.packCenterY ?? monster.spawnY);
    monster.aggroRange = Number(monster.aggroRange ?? MONSTER_AGGRO_RANGE);
    monster.leashDistance = Number(monster.leashDistance ?? MONSTER_LEASH_RANGE);
    monster.chaseDurationMs = Number(monster.chaseDurationMs ?? MONSTER_CHASE_DURATION_MS);
    monster.chaseTargetId = monster.chaseTargetId || null;
    monster.chaseStartedAt = Number(monster.chaseStartedAt || 0);
    monster.reaggroAt = Number(monster.reaggroAt || 0);
    monster.maxHp = Number(monster.maxHp || monster.hp || 1);
    monster.hp = Number(monster.hp ?? monster.maxHp);
    monster.dead = !!monster.dead;
  });
  let serial = monsters.length;
  while (!isCity && !world?.monsterSpawns?.length && !world?.monsters?.length && monsters.length < MONSTER_MIN_ON_JOIN && serial < MONSTER_ROOM_CAP + 2) {
    monsters.push(createRoomMonster(roomId, world, serial++));
  }
  return monsters;
}

function monsterDistanceTiles(session, monster) {
  const mx = Number(monster.x ?? monster.spawnX ?? 0);
  const my = Number(monster.y ?? monster.spawnY ?? 0);
  return Math.hypot(mx - Number(session.x || 0), my - Number(session.y || 0));
}

function readInventory(player) {
  try {
    const value = typeof player.jsonIventory === "string" ? JSON.parse(player.jsonIventory || "[]") : player.inventory;
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeInventory(player, inventory) {
  player.inventory = inventory;
  player.jsonIventory = JSON.stringify(inventory);
}

function rollMonsterLoot(monster) {
  const table = lootTables[monster.lootTableId] || [];
  const itemsDropped = [];
  for (const entry of table) {
    if (Math.random() > Number(entry.chance || 0)) continue;
    const item = items.find((candidate) => candidate.id === entry.itemId);
    if (!item) continue;
    const count = Math.max(1, Math.floor(Number(entry.min || 1) + Math.random() * (Number(entry.max || entry.min || 1) - Number(entry.min || 1) + 1)));
    itemsDropped.push({ ...item, count });
  }
  const level = Math.max(1, Number(monster.level || 1));
  return { xu: level * 5 + Math.floor(Math.random() * (level * 5 + 1)), items: itemsDropped };
}

function addLootToPlayer(player, loot) {
  if (!loot) return;
  player.xu = Number(player.xu || 0) + Number(loot.xu || 0);
  const inventory = readInventory(player);
  for (const drop of loot.items || []) {
    const existing = inventory.find((item) => item.id === drop.id);
    if (existing) existing.count = Math.min(99, Number(existing.count || 0) + Number(drop.count || 1));
    else if (inventory.length < 40) inventory.push({ ...drop });
  }
  writeInventory(player, inventory);
}

function applySkillEffect(monster, skill, now, passive = {}) {
  if (!skill?.effect || skill.effect === "heal" || String(skill.effect).startsWith("buff_")) return;
  const effect = skill.effect;
  const duration = Math.max(1000, Number(skill.thoiGianBuff || 4) * 1000);
  const statuses = Array.isArray(monster.statusEffects) ? monster.statusEffects.filter((entry) => entry.type !== effect) : [];
  const effectValue = Number(skill.effectVal || 0) * (1 + Number(passive.statusEffectPct || 0));
  statuses.push({ type: effect, value: effectValue, expiresAt: now + duration, nextTickAt: now + 1000 });
  monster.statusEffects = statuses;
}

function activeStatus(monster, type, now = Date.now()) {
  return (monster.statusEffects || []).find((entry) => entry.type === type && Number(entry.expiresAt) > now);
}

function resolveMonsterAttack(player, monster, skillCode, session) {
  const skill = findSkill(skillCode);
  if (skillCode && (!skill || isPassiveSkill(skill))) return { error: "Skill không hợp lệ hoặc là kỹ năng bị động" };
  if (skillCode && !playerHasSkill(player, skill)) return { error: "Skill chưa học" };
  if (skillCode && !isOffensiveSkill(skill)) return { error: "Skill hỗ trợ không phải kỹ năng gây sát thương" };
  const now = Date.now();
  const cooldownMs = skillCooldownMs(player, skill);
  const skillKey = skill?.code || "__basic_attack";
  const bypassCooldown = session.bypassCooldown === true;
  const skillCooldowns = session.skillCooldowns || (session.skillCooldowns = {});
  if (!bypassCooldown && Number(session.combatGcdUntil || 0) > now) return { error: "Đang thao tác" };
  if (!bypassCooldown && Number(skillCooldowns[skillKey] || 0) > now) return { error: skill ? "Kỹ năng đang hồi chiêu" : "Đánh thường đang hồi chiêu" };
  const cost = Number(skill?.mpTieuHao || 0);
  if (Number(player.mp || 0) < cost) return { error: "Không đủ linh lực" };
  const derived = deriveStats(player.stats, player.equipment);
  const passive = passiveProfile(player);
  const magic = skill?.type === "MAGIC";
  const attack = magic ? derived.mAtk : derived.pAtk;
  // Đánh thường là sustained damage; skill mới dùng hệ số burst trong data.
  const scale = skill
    ? Number(skill.satThuong || 1) * BALANCE.damage.skillMultiplier * (1 + Number(passive.skillDamageByRoot[skill.linhCan] || 0))
    : BALANCE.damage.basicMultiplier;
  const primaryStat = Number(player.stats?.[magic ? "ene" : "str"] || 0);
  const statScale = skill ? BALANCE.damage.skillStatScale : BALANCE.damage.basicStatScale;
  const defenderElement = monster.linhCan || monster.element || monster.nguHanh?.[0];
  const affinityProfileResult = affinityProfile(player.linhCan, defenderElement, elementalStrength(player), elementalStrength(monster));
  const affinity = affinityProfileResult.multiplier;
  const defenseBase = magic ? Number(monster.mDef ?? monster.def ?? 0) : Number(monster.pDef ?? monster.def ?? 0);
  const defense = activeStatus(monster, "armor_break") ? defenseBase * 0.75 : defenseBase;
  const handDamage = skill ? 1 : 1 + Math.max(0, playerBuffValue(player, "buff_atk")) / 100;
  const counterCritBonus = affinityCritBonus(affinityProfileResult);
  const critChance = Math.min(0.75, Number(derived.crit || 0) + Math.max(0, playerBuffValue(player, "buff_crit")) / 100 + passive.critPct + counterCritBonus);
  const critical = Math.random() < critChance;
  const critMultiplier = critical ? BALANCE.damage.critMultiplier : 1;
  const areaMultiplier = session.areaSecondary ? BALANCE.damage.areaSecondaryMultiplier : 1;
  const damage = Math.max(1, Math.floor(mitigateDamage((attack * scale + primaryStat * statScale) * affinity * handDamage * critMultiplier * areaMultiplier, defense)));
  player.mp = Math.max(0, Number(player.mp || 0) - cost);
  if (!bypassCooldown) {
    session.combatGcdUntil = now + COMBAT_GCD_MS;
    skillCooldowns[skillKey] = now + cooldownMs;
  }
  monster.hp = Math.max(0, Number(monster.hp || monster.maxHp || 1) - damage);
  applySkillEffect(monster, skill, now, passive);
  monster.dead = monster.hp <= 0;
  let loot = null;
  if (monster.dead) {
    monster.respawnAt = now + Number(monster.respawnMs || 10000);
    loot = rollMonsterLoot(monster);
  }
  return { damage, critical, hp: monster.hp, maxHp: monster.maxHp, dead: monster.dead, skillCode: skill?.code || null, mp: player.mp, cooldownMs, gcdMs: COMBAT_GCD_MS, loot, statusEffects: monster.statusEffects || [], affinityRelation: affinityProfileResult.relation, affinityMultiplier: affinity, affinityStrengthGap: affinityProfileResult.strengthGap, affinityCritBonus: counterCritBonus };
}

function resolveSelfSkill(player, skillCode, session) {
  const skill = findSkill(skillCode);
  if (!skill || isPassiveSkill(skill)) return { error: "Skill không hợp lệ hoặc là kỹ năng bị động" };
  if (!playerHasSkill(player, skill)) return { error: "Skill chưa học" };
  if (isOffensiveSkill(skill)) return { error: "Skill tấn công cần chỉ định mục tiêu" };
  const now = Date.now();
  const cooldownMs = skillCooldownMs(player, skill);
  const skillCooldowns = session.skillCooldowns || (session.skillCooldowns = {});
  if (Number(session.combatGcdUntil || 0) > now) return { error: "Đang thao tác" };
  if (Number(skillCooldowns[skill.code] || 0) > now) return { error: "Kỹ năng đang hồi chiêu" };
  const cost = Number(skill.mpTieuHao || 0);
  if (Number(player.mp || 0) < cost) return { error: "Không đủ linh lực" };
  const derived = deriveStats(player.stats, player.equipment);
  player.mp = Math.max(0, Number(player.mp || 0) - cost);
  let heal = 0;
  let mpRestore = 0;
  if (skill.effect === "heal") {
    heal = Math.floor(derived.mAtk * 0.5 + Number(player.tuViLinhCan || 0) * 0.3 + Number(skill.effectVal || 0));
    player.hp = Math.min(Number(player.maxHp || 100), Number(player.hp || 0) + heal);
  }
  if (skill.effect === "restore_mp") {
    mpRestore = Math.max(0, Number(skill.effectVal || 0));
    player.mp = Math.min(Number(player.maxMp || derived.maxMp || 50), player.mp + mpRestore);
  }
  if (skill.effect?.startsWith("buff_") || ["shield", "speed"].includes(String(skill.effect || ""))) {
    applyPlayerBuff(player, skill, now);
    refreshPlayerVitals(player, now);
  }
  if (skill.effect === "cleanse") player.debuffs = {};
  session.combatGcdUntil = now + COMBAT_GCD_MS;
  skillCooldowns[skill.code] = now + cooldownMs;
  return { skillCode: skill.code, skillName: skill.name, effect: skill.effect || null, effectVal: Number(skill.effectVal || 0), effectDurationMs: Number(skill.thoiGianBuff || 4) * 1000, hp: player.hp, maxHp: player.maxHp, mp: player.mp, maxMp: player.maxMp, heal, mpRestore, buffs: player.buffs || {}, cooldownMs, gcdMs: COMBAT_GCD_MS };
}

async function requestJson(urlString, headers = {}) {
  const url = new URL(urlString);
  const lib = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: "GET",
        headers,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(body || "{}");
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              json,
            });
          } catch (err) {
            reject(err);
          }
        });
      },
    );

    req.on("error", reject);
    req.end();
  });

}

function setupSocket(io, players = new Map(), options = {}) {
  // ── Auth middleware cho Socket.io ──────────────────────────────
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Không có token"));

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      return next();
    } catch (jwtError) {
      try {
        const authUrl = `${AUTH_BACKEND.replace(/\/+$/, "")}/api/auth/me`;
        const res = await requestJson(authUrl, {
          Authorization: `Bearer ${token}`,
        });
        if (!res.ok) throw new Error(`Remote auth failed: ${res.status}`);
        const data = res.json;
        if (!data?.user?.id || !data?.user?.username)
          throw new Error("Remote auth response missing user");
        socket.userId = data.user.id;
        socket.username = data.user.username;
        return next();
      } catch (remoteError) {
        console.warn(
          "Socket auth failed:",
          jwtError.message,
          remoteError.message,
        );
        return next(new Error("Token không hợp lệ"));
      }
    }
  });

  const mapCache = new Map();
  const playerRegenRuntime = new Map();
  const getPlayerByUserId = options.getPlayerByUserId || ((userId) => [...players.values()].find((player) => player.userId === userId));

  function chunkPosition(x, y) {
    return {
      cx: Math.floor(Number(x || 0) / AOI_CHUNK_SIZE),
      cy: Math.floor(Number(y || 0) / AOI_CHUNK_SIZE),
    };
  }

  function chunkRoom(mapId, cx, cy) {
    return `aoi:${mapId}:${cx}:${cy}`;
  }

  function nearbyChunkRooms(mapId, x, y) {
    const { cx, cy } = chunkPosition(x, y);
    const rooms = [];
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) rooms.push(chunkRoom(mapId, cx + ox, cy + oy));
    }
    return rooms;
  }

  function sessionChunkRoom(session) {
    const { cx, cy } = chunkPosition(session.x, session.y);
    return chunkRoom(session.mapId, cx, cy);
  }

  function nearbySessions(mapId, x, y, excludeId = null) {
    return [...sessions.values()].filter((session) => session.mapId === mapId
      && session.id !== excludeId
      && Math.hypot(Number(session.x) - Number(x), Number(session.y) - Number(y)) <= AOI_RADIUS);
  }

  function emitNear(mapId, x, y, event, payload, exceptId = null) {
    let target = io.to(nearbyChunkRooms(mapId, x, y));
    if (exceptId) target = target.except(exceptId);
    target.emit(event, payload);
  }

  function resolveWorld(code) {
    const normalized = String(code || "").toLowerCase();
    let world = normalized ? options.getWorldByCode?.(normalized) : options.getDefaultWorld?.();
    if (!world && normalized) world = mapCache.get(normalized);
    if (world) mapCache.set(String(world.code || normalized).toLowerCase(), world);
    return world || null;
  }

  function publicMonsterState(monster, now) {
    return {
      id: monster.id,
      name: monster.name || "Yêu thú",
      icon: monster.icon || "👾",
      img: monster.img || null,
      animation: monster.animation || null,
      type: monster.type || "NORMAL",
      level: Number(monster.level || 1),
      nguHanh: monster.nguHanh || [],
      x: Number(monster.x || 0),
      y: Number(monster.y || 0),
      hp: Number(monster.hp || 0),
      maxHp: Number(monster.maxHp || monster.hp || 1),
      state: monster.state || "idle",
      targetId: monster.targetId || null,
      speed: Number(monster.speed || MONSTER_MOVE_SPEED),
      packId: monster.packId || null,
      packCenterX: Number(monster.packCenterX ?? monster.spawnX ?? 0),
      packCenterY: Number(monster.packCenterY ?? monster.spawnY ?? 0),
      dead: !!monster.dead,
      statusEffects: (monster.statusEffects || [])
        .filter((effect) => Number(effect.expiresAt || 0) > now)
        .map((effect) => ({ type: effect.type, value: effect.value || 0, remainingMs: Math.max(0, effect.expiresAt - now) })),
    };
  }

  function damagePlayerFromMonster(roomId, monster, targetSession, now) {
    if (monster.nextAttackAt && monster.nextAttackAt > now) return;
    const player = getPlayerByUserId(targetSession.userId);
    if (!player) return;
    refreshPlayerVitals(player, now);
    const derived = deriveStats(player.stats, player.equipment);
    monster.nextAttackAt = now + 1200;
    if (Math.random() < Number(derived.evasion || 0)) {
      emitNear(roomId, targetSession.x, targetSession.y, "player_combat_result", { targetId: targetSession.id, attackerId: monster.id, damage: 0, miss: true, hp: player.hp, maxHp: player.maxHp });
      return;
    }
    const passive = passiveProfile(player);
    const defenseBuff = playerBuffValue(player, ["buff_def", "shield"]);
    const effectiveDefense = Number(derived.pDef || 0) * (1 + Math.max(0, defenseBuff) / 100 + passive.defensePct);
    const damage = Math.max(1, Math.floor(Number(monster.atk || 1) - effectiveDefense + Math.random() * 3));
    player.hp = Math.max(0, Number(player.hp || player.maxHp || 100) - damage);
    if (player.hp <= 0) player.hp = Math.floor(Number(player.maxHp || 100) * 0.25);
    players.set(player.id, player);
    emitNear(roomId, targetSession.x, targetSession.y, "player_combat_result", { targetId: targetSession.id, attackerId: monster.id, damage, miss: false, hp: player.hp, maxHp: player.maxHp });
  }

  function updatePlayerRegeneration(now) {
    const seen = new Set();
    for (const session of sessions.values()) {
      const player = getPlayerByUserId(session.userId);
      if (!player || seen.has(player.id)) continue;
      seen.add(player.id);
      let buffChanged = false;
      for (const [key, buff] of Object.entries(player.buffs || {})) {
        if (buff?.expiresAt && Number(buff.expiresAt) <= now) {
          delete player.buffs[key];
          buffChanged = true;
        }
      }
      const oldMaxHp = Number(player.maxHp || 0), oldMaxMp = Number(player.maxMp || 0);
      refreshPlayerVitals(player, now);
      if (player.maxHp !== oldMaxHp || player.maxMp !== oldMaxMp) buffChanged = true;
      const passive = passiveProfile(player);
      const hpRate = Math.max(0, playerBuffValue(player, "buff_hp_regen", now) + Number(player.maxHp || 0) * passive.hpRegenPct);
      const mpRate = Math.max(0, playerBuffValue(player, "buff_mp_regen", now));
      if (!hpRate && !mpRate) {
        playerRegenRuntime.delete(player.id);
        if (buffChanged) players.set(player.id, player);
        continue;
      }
      const runtime = playerRegenRuntime.get(player.id) || { at: now, hp: 0, mp: 0 };
      const elapsed = Math.max(0, Math.min(1000, now - runtime.at));
      runtime.at = now;
      runtime.hp += hpRate * elapsed / 1000;
      runtime.mp += mpRate * elapsed / 1000;
      const hpGain = Math.floor(runtime.hp);
      const mpGain = Math.floor(runtime.mp);
      runtime.hp -= hpGain;
      runtime.mp -= mpGain;
      const oldHp = Number(player.hp || 0), oldMp = Number(player.mp || 0);
      player.hp = Math.min(Number(player.maxHp || 100), oldHp + hpGain);
      player.mp = Math.min(Number(player.maxMp || 50), oldMp + mpGain);
      playerRegenRuntime.set(player.id, runtime);
      const changed = buffChanged || player.hp !== oldHp || player.mp !== oldMp;
      if (!changed) continue;
      players.set(player.id, player);
      for (const target of sessions.values()) {
        if (target.userId === session.userId) io.to(target.id).emit("player_state_update", { hp: player.hp, maxHp: player.maxHp, mp: player.mp, maxMp: player.maxMp, buffs: player.buffs || {} });
      }
    }
  }

  function updateRoomMonsters(roomId, world, monsters, now) {
    const roomPlayers = [...sessions.values()].filter((session) => session.mapId === roomId);
    if (!roomPlayers.length) return;
    const playerBuckets = new Map();
    for (const session of roomPlayers) {
      const { cx, cy } = chunkPosition(session.x, session.y);
      const key = `${cx}:${cy}`;
      if (!playerBuckets.has(key)) playerBuckets.set(key, []);
      playerBuckets.get(key).push(session);
    }
    let changed = false;
    for (const monster of monsters) {
      if (monster.dead) continue;
      const effects = (monster.statusEffects || []).filter((effect) => Number(effect.expiresAt || 0) > now);
      if (effects.length !== (monster.statusEffects || []).length) { monster.statusEffects = effects; changed = true; }
      for (const effect of effects) {
        if (effect.type !== "burn" || Number(effect.nextTickAt || 0) > now) continue;
        monster.hp = Math.max(0, Number(monster.hp || 0) - Math.max(1, Number(effect.value || 5)));
        effect.nextTickAt = now + 1000;
        changed = true;
        if (monster.hp <= 0) {
          monster.dead = true;
          monster.respawnAt = now + Number(monster.respawnMs || 10000);
          break;
        }
      }
      if (monster.dead) continue;

      const aggroRange = Number(monster.aggroRange || MONSTER_AGGRO_RANGE);
      const leashDistance = Number(monster.leashDistance || MONSTER_LEASH_RANGE);
      const chaseDurationMs = Number(monster.chaseDurationMs || MONSTER_CHASE_DURATION_MS);
      const monsterChunk = chunkPosition(monster.x, monster.y);
      const chunkReach = Math.max(1, Math.ceil(aggroRange / AOI_CHUNK_SIZE));
      const candidates = [];
      for (let oy = -chunkReach; oy <= chunkReach; oy += 1) {
        for (let ox = -chunkReach; ox <= chunkReach; ox += 1) {
          candidates.push(...(playerBuckets.get(`${monsterChunk.cx + ox}:${monsterChunk.cy + oy}`) || []));
        }
      }
      const target = candidates
        .map((session) => ({ session, distance: monsterDistanceTiles(session, monster) }))
        .filter((entry) => entry.distance <= aggroRange)
        .sort((a, b) => a.distance - b.distance)[0];
      let targetSession = null;
      if (monster.chaseTargetId) {
        targetSession = roomPlayers.find((session) => session.id === monster.chaseTargetId) || null;
        const chaseDistance = Math.hypot(Number(monster.x || 0) - Number(monster.spawnX || 0), Number(monster.y || 0) - Number(monster.spawnY || 0));
        const chaseExpired = now - Number(monster.chaseStartedAt || 0) >= chaseDurationMs;
        if (!targetSession || chaseExpired || chaseDistance > leashDistance) {
          monster.chaseTargetId = null;
          monster.chaseStartedAt = 0;
          monster.reaggroAt = now + 2500;
          targetSession = null;
          changed = true;
        }
      }
      if (!targetSession && target && now >= Number(monster.reaggroAt || 0)) {
        targetSession = target.session;
        monster.chaseTargetId = target.session.id;
        monster.chaseStartedAt = now;
        monster.patrolTarget = null;
        changed = true;
      }

      if (!targetSession) {
        if (!monster.nextPatrolAt) monster.nextPatrolAt = now + 1500 + Math.random() * 3000;
        if (now >= Number(monster.nextPatrolAt || 0)) {
          monster.nextPatrolAt = now + 3500 + Math.random() * 4500;
          const pAngle = Math.random() * Math.PI * 2;
          const pRadius = 6 + Math.random() * 12;
          const candX = Math.round(Number(monster.spawnX || 0) + Math.cos(pAngle) * pRadius);
          const candY = Math.round(Number(monster.spawnY || 0) + Math.sin(pAngle) * pRadius);
          if (canSpawnAt(world, candX, candY)) {
            monster.patrolTarget = { x: candX, y: candY };
          }
        }
      }

      const destination = targetSession
        ? { x: Number(targetSession.x), y: Number(targetSession.y) }
        : (monster.patrolTarget || { x: Number(monster.spawnX || 0), y: Number(monster.spawnY || 0) });
      const dx = destination.x - Number(monster.x || 0);
      const dy = destination.y - Number(monster.y || 0);
      const distance = Math.hypot(dx, dy);
      const frozen = activeStatus(monster, "root", now) || activeStatus(monster, "stun", now);
      if (targetSession && distance <= MONSTER_ATTACK_RANGE) {
        monster.state = "attack";
        monster.targetId = targetSession.id;
        if (!frozen) damagePlayerFromMonster(roomId, monster, targetSession, now);
      } else if (!frozen && distance > 0.15) {
        const slow = activeStatus(monster, "slow", now) ? 0.55 : 1;
        const baseSpeed = targetSession ? Number(monster.speed || MONSTER_MOVE_SPEED) : Number(monster.speed || MONSTER_MOVE_SPEED) * 0.45;
        const step = Math.min(distance, baseSpeed * slow);
        const nextX = Number(monster.x || 0) + (dx / distance) * step;
        const nextY = Number(monster.y || 0) + (dy / distance) * step;
        const tileX = Math.floor(nextX), tileY = Math.floor(nextY);
        if (canSpawnAt(world, tileX, tileY)) {
          monster.x = nextX;
          monster.y = nextY;
          changed = true;
        }
        monster.state = targetSession ? "chase" : (monster.patrolTarget ? "patrol" : "return");
        monster.targetId = targetSession?.id || null;
      } else {
        if (!targetSession && monster.patrolTarget) {
          monster.patrolTarget = null;
          monster.nextPatrolAt = now + 2000 + Math.random() * 3000;
        }
        monster.state = targetSession ? "attack" : "idle";
        monster.targetId = targetSession?.id || null;
        if (!targetSession) {
          monster.chaseTargetId = null;
          monster.chaseStartedAt = 0;
        }
      }
    }
    const runtime = roomRuntime.get(roomId);
    if (changed || now - Number(runtime?.lastBroadcastAt || 0) >= 500) {
      if (runtime) runtime.lastBroadcastAt = now;
      const viewersByChunk = new Map();
      for (const session of roomPlayers) {
        const room = session.chunkRoom || sessionChunkRoom(session);
        if (!viewersByChunk.has(room)) viewersByChunk.set(room, []);
        viewersByChunk.get(room).push(session);
      }
      for (const [room, viewers] of viewersByChunk) {
        const visible = monsters
          .filter((monster) => viewers.some((viewer) => monsterDistanceTiles(viewer, monster) <= AOI_RADIUS))
          .map((monster) => publicMonsterState(monster, now));
        io.to(room).emit("monster_update", { monsters: visible });
      }
    }
  }

  io.on("connection", (socket) => {
    // ── join_world ────────────────────────────────────────────────
    socket.on("join_world", async ({ mapCode, x = 26, y = 30, mapVersion = 0, hasMap = false } = {}) => {
      if (sessions.has(socket.id)) return;
      let roomId = (mapCode || "").trim().toLowerCase();
      console.log(`[Socket] ${socket.username} gia nhập. MapCode nhận được: "${roomId || "RỖNG"}"`);

      let worldData = resolveWorld(roomId);
      if (worldData) roomId = String(worldData.code || worldData.maMap || worldData.id || roomId).toLowerCase();
      if (!worldData) {
        console.error(`[Socket] Lỗi: Không có dữ liệu bản đồ cho ${socket.username}.`);
        return;
      }

      const monsters = ensureRoomMonsters(roomId, worldData);

      // Lấy tên nhân vật từ player data
      const playerData = getPlayerByUserId(socket.userId);
      const session = {
        id: socket.id,
        userId: socket.userId,
        username: socket.username,
        name: playerData?.name || socket.username,
        gender: playerData?.gender || "MALE",
        img: playerData?.img || null,
        realm: playerData?.realm || 0,
        stage: playerData?.stage || playerData?.tangTuVi || 1,
        mapId: roomId,
        mapCode: roomId,
        x,
        y,
        joinedAt: Date.now(),
        lastMoveAt: 0,
        lastAcceptedMoveAt: Date.now(),
        lastChatAt: 0,
      };
      sessions.set(socket.id, session);

      // Join map room
      socket.join(`map:${roomId}`);
      session.chunkRoom = sessionChunkRoom(session);
      socket.join(session.chunkRoom);

      // Gửi toàn bộ thông tin thế giới cho người chơi vừa vào
      const worldPlayers = nearbySessions(roomId, x, y, socket.id);

      socket.emit("world_init", {
        map: null,
        mapCode: roomId,
        mapVersion: Number(worldData.version || 0),
        player: playerData || null,
        players: worldPlayers,
        monsters
      });

      // Notify others on same map
      emitNear(roomId, x, y, "player_join", session, socket.id);
    });

    // ── move ──────────────────────────────────────────────────────
    socket.on("move", ({ x, y, mapId, mapCode }) => {
      const session = sessions.get(socket.id);
      if (!session) return;
      const now = Date.now();
      if (now - Number(session.lastMoveAt || 0) < MOVE_MIN_INTERVAL_MS) return;
      session.lastMoveAt = now;
      const roomId = session.mapId;
      const rawX = Number(x);
      const rawY = Number(y);
      const nextX = Math.floor(rawX);
      const nextY = Math.floor(rawY);
      const world = mapCache.get(roomId);
      const oldX = Number(session.x);
      const oldY = Number(session.y);
      const elapsedMs = Math.max(MOVE_MIN_INTERVAL_MS, Math.min(250, now - Number(session.lastAcceptedMoveAt || now)));
      const maxDistance = MOVE_BURST_TOLERANCE + PLAYER_MAX_MOVE_SPEED * elapsedMs / 1000;
      const moveDistance = Math.hypot(rawX - oldX, rawY - oldY);
      const validBounds = !world || (nextX >= 0 && nextY >= 0 && nextX < Number(world.w || 999) && nextY < Number(world.h || 999));
      const validSpeed = moveDistance <= maxDistance;
      const blocked = world ? movementPathCollides(world, oldX, oldY, rawX, rawY) : false;
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY) || !validBounds || !validSpeed || blocked) {
        const reason = blocked ? "Vị trí bị địa hình chặn" : (!validSpeed ? "Tốc độ di chuyển không hợp lệ" : "Tọa độ di chuyển không hợp lệ");
        socket.emit("movement_corrected", { x: oldX, y: oldY, reason });
        return;
      }
      const oldChunkRoom = session.chunkRoom || sessionChunkRoom(session);
      session.x = rawX;
      session.y = rawY;
      session.lastAcceptedMoveAt = now;
      session.mapId = roomId;
      session.mapCode = roomId;
      const nextChunkRoom = sessionChunkRoom(session);
      if (nextChunkRoom !== oldChunkRoom) {
        socket.leave(oldChunkRoom);
        socket.join(nextChunkRoom);
        session.chunkRoom = nextChunkRoom;
        const oldRooms = nearbyChunkRooms(roomId, oldX, oldY);
        const newRooms = nearbyChunkRooms(roomId, rawX, rawY);
        const oldOnly = oldRooms.filter((room) => !newRooms.includes(room));
        const newOnly = newRooms.filter((room) => !oldRooms.includes(room));
        if (oldOnly.length) socket.to(oldOnly).emit("player_leave", { id: socket.id });
        if (newOnly.length) socket.to(newOnly).emit("player_join", { ...session });
      }
      const playerData = getPlayerByUserId(socket.userId);
      if (playerData) { playerData.x = rawX; playerData.y = rawY; playerData.mapCode = roomId; playerData.mapId = roomId; players.set(playerData.id, playerData); }
      // Broadcast to same map only (không gửi cho chính mình)
      emitNear(roomId, rawX, rawY, "player_move", { ...session }, socket.id);
    });

    // ── map_change ────────────────────────────────────────────────
    socket.on("map_change", async ({ mapId, mapCode, x, y }) => {
      const session = sessions.get(socket.id);
      if (!session) return;
      const roomId = (mapId || mapCode || session.mapId).toLowerCase();
      const oldMapId = session.mapId;
      const sourceWorld = resolveWorld(oldMapId);
      const requestedWorld = resolveWorld(roomId);
      if (!requestedWorld) return socket.emit("action_error", { action: "map_change", error: "Bản đồ không tồn tại" });
      const portal = (sourceWorld?.portals || []).find((item) => {
        const destination = String(item.denMap || item.toMap || "").toLowerCase();
        return destination === roomId
          && Math.hypot(Number(session.x) - Number(item.x), Number(session.y) - Number(item.y)) <= PORTAL_ACTIVATION_RANGE;
      });
      if (!portal) return socket.emit("action_error", { action: "map_change", error: "Bạn chưa đứng trong phạm vi portal hợp lệ" });
      const arrival = nearestWalkablePoint(requestedWorld, portal.toX, portal.toY);
      if (!arrival) return socket.emit("action_error", { action: "map_change", error: "Điểm đến portal không thể đặt nhân vật" });

      // Leave old room
      if (session.mapId) {
        emitNear(session.mapId, session.x, session.y, "player_leave", { id: socket.id }, socket.id);
        socket.leave(`map:${session.mapId}`);
        if (session.chunkRoom) socket.leave(session.chunkRoom);
      }

      session.mapId = roomId;
      session.mapCode = roomId;
      session.x = arrival.x;
      session.y = arrival.y;
      socket.join(`map:${roomId}`);
      session.chunkRoom = sessionChunkRoom(session);
      socket.join(session.chunkRoom);

      const playerData = getPlayerByUserId(socket.userId);
      if (playerData) {
        playerData.x = arrival.x;
        playerData.y = arrival.y;
        playerData.mapCode = roomId;
        playerData.mapId = roomId;
        players.set(playerData.id, playerData);
      }

      if (![...sessions.values()].some((item) => item.mapId === oldMapId)) {
        roomMonsters.delete(oldMapId);
        roomRuntime.delete(oldMapId);
      }

      const worldData = requestedWorld;

      const worldPlayers = nearbySessions(roomId, arrival.x, arrival.y, socket.id);

      // Gửi dữ liệu map và state cho người chơi
      socket.emit("world_init", {
        map: null,
        mapCode: roomId,
        mapVersion: Number(worldData.version || 0),
        player: playerData || null,
        players: worldPlayers,
        monsters: ensureRoomMonsters(roomId, worldData)
      });

      emitNear(roomId, arrival.x, arrival.y, "player_join", { ...session }, socket.id);
    });

    // ── chat ──────────────────────────────────────────────────────
    socket.on("chat", ({ message }) => {
      if (!message || typeof message !== "string") return;
      const clean = message.slice(0, 100).trim();
      if (!clean) return;
      const session = sessions.get(socket.id);
      if (!session) return;
      const now = Date.now();
      if (now - Number(session.lastChatAt || 0) < 500) return;
      session.lastChatAt = now;

      const payload = {
        id: socket.id,
        username: socket.username,
        message: clean,
        ts: now,
      };

      // Broadcast to same map
      socket.to(`map:${session.mapId}`).emit("chat_message", payload);
      socket.emit("chat_message", payload); // echo back to self
    });

    // ── attack_effect (visual sync only — damage tính server-side sau) ─
    socket.on("skill_request", ({ skillCode }) => {
      const session = sessions.get(socket.id);
      const player = getPlayerByUserId(socket.userId);
      if (!session || !player) return;
      const result = resolveSelfSkill(player, skillCode, session);
      if (result.error) return socket.emit("action_error", { action: "skill", error: result.error });
      players.set(player.id, player);
      socket.emit("skill_result", result);
    });

    socket.on("attack_request", ({ targetId, skillCode, mapId }) => {
      const session = sessions.get(socket.id);
      const player = getPlayerByUserId(socket.userId);
      if (!session) return socket.emit("action_error", { action: "combat", error: "Phiên chơi chưa sẵn sàng" });
      if (!player) return socket.emit("action_error", { action: "combat", error: "Không tìm thấy nhân vật" });
      const roomId = String(session.mapId || mapId || "").toLowerCase();
      const monsters = roomMonsters.get(roomId) || [];
      const monster = monsters.find((item) => String(item.id) === String(targetId));
      if (!monster) return socket.emit("action_error", { action: "combat", error: "Quái không còn trong bản đồ hiện tại" });
      if (monster.dead) return socket.emit("action_error", { action: "combat", error: "Quái đang hồi sinh" });
      const skill = findSkill(skillCode);
      // Bù sai số tâm actor giữa client render và tọa độ tile authoritative.
      const attackRange = skill
        ? Number(skill.range || 5) * SKILL_RANGE_SCALE
        : BASIC_ATTACK_RANGE + 2;
      if (monsterDistanceTiles(session, monster) > attackRange) {
        return socket.emit("action_error", { action: "combat", error: "Mục tiêu ngoài phạm vi kỹ năng" });
      }
      const result = resolveMonsterAttack(player, monster, skillCode, session);
      if (result.error) return socket.emit("action_error", { action: "combat", error: result.error });
      const hits = [{ targetId: monster.id, ...result }];
      let bonusXu = Number(result.loot?.xu || 0);
      const droppedItems = [...(result.loot?.items || [])];
      if (result.loot) addLootToPlayer(player, result.loot);
      const aoeRange = Number(skill?.dienRong || 0) * SKILL_RANGE_SCALE;
      if (aoeRange > 0) {
        for (const nearby of monsters) {
          if (nearby.id === monster.id || nearby.dead) continue;
          const distance = Math.hypot(Number(nearby.x ?? nearby.spawnX ?? 0) - Number(monster.x ?? monster.spawnX ?? 0), Number(nearby.y ?? nearby.spawnY ?? 0) - Number(monster.y ?? monster.spawnY ?? 0));
          if (distance > aoeRange) continue;
          const extraPlayer = { ...player, mp: Number(player.mp || 0) + Number(skill.mpTieuHao || 0) };
          const extra = resolveMonsterAttack(extraPlayer, nearby, skillCode, { ...session, bypassCooldown: true, areaSecondary: true });
          if (!extra.error) {
            hits.push({ targetId: nearby.id, ...extra });
            bonusXu += Number(extra.loot?.xu || 0);
            droppedItems.push(...(extra.loot?.items || []));
            if (extra.loot) addLootToPlayer(player, extra.loot);
          }
        }
      }
      player.combatPower = player.combatPower || 0;
      players.set(player.id, player);
      emitNear(roomId, session.x, session.y, "combat_result", { attackerId: socket.id, attackerName: socket.username, targetId, ...result, skillName: skill?.name || null, hits, loot: (bonusXu || droppedItems.length) ? { xu: bonusXu, items: droppedItems } : null });
    });

    socket.on("attack_effect", ({ targetId, damage, mapId }) => {
      const session = sessions.get(socket.id);
      if (!session) return;
      socket.to(`map:${mapId}`).emit("attack_fx", {
        attackerId: socket.id,
        attackerName: socket.username,
        targetId,
        damage,
      });
    });

    // ── monster_sync (Host syncs monster positions to others) ──
    socket.on("monster_sync", () => {
      // Deprecated: server tự điều khiển vị trí và trạng thái monster.
    });

    // ── disconnect ────────────────────────────────────────────────
    socket.on("disconnect", () => {
      const session = sessions.get(socket.id);
      if (session) {
        emitNear(session.mapId, session.x, session.y, "player_leave", { id: socket.id }, socket.id);
        sessions.delete(socket.id);

        // Dọn dẹp nếu không còn ai trong map
        const leftInRoom = [...sessions.values()].filter(s => s.mapId === session.mapId).length;
        if (leftInRoom === 0) {
          roomMonsters.delete(session.mapId);
          roomRuntime.delete(session.mapId);
        }
      }
    });
  });

  // ── Server broadcast (có thể gọi từ nơi khác) ─────────────────
  const respawnTimer = setInterval(() => {
    const now = Date.now();
    updatePlayerRegeneration(now);
    for (const [mapId, monsters] of roomMonsters.entries()) {
      for (const monster of monsters) {
        if (!monster.dead || !monster.respawnAt || monster.respawnAt > now) continue;
        monster.dead = false;
        monster.hp = monster.maxHp || monster.hp || 1;
        monster.x = Number(monster.spawnX ?? monster.x ?? 0);
        monster.y = Number(monster.spawnY ?? monster.y ?? 0);
        monster.statusEffects = [];
        monster.nextAttackAt = 0;
        monster.chaseTargetId = null;
        monster.chaseStartedAt = 0;
        monster.reaggroAt = 0;
        delete monster.respawnAt;
        io.to(`map:${mapId}`).emit("monster_spawn", { monster });
      }
      const activePlayers = [...sessions.values()].some((session) => session.mapId === mapId);
      const world = mapCache.get(mapId);
      const runtime = roomRuntime.get(mapId) || { lastSpawnAt: now, lastBroadcastAt: 0 };
      roomRuntime.set(mapId, runtime);
      const isCity = String(world?.type || "").toUpperCase() === "CITY" || Boolean(world?.rules?.noMonsters);
      if (activePlayers && !isCity && !world?.monsterSpawns?.length && !world?.monsters?.length && monsters.length < MONSTER_ROOM_CAP && now - Number(runtime.lastSpawnAt || 0) >= 5000) {
        const monster = createRoomMonster(mapId, world, monsters.length);
        monsters.push(monster);
        runtime.lastSpawnAt = now;
        io.to(`map:${mapId}`).emit("monster_spawn", { monster });
      }
      if (activePlayers) updateRoomMonsters(mapId, world, monsters, now);
    }
  }, 250);

  function broadcast(event, data) {
    io.emit(event, data);
  }

  function mapBroadcast(mapId, event, data) {
    io.to(`map:${mapId}`).emit(event, data);
  }

  return { broadcast, mapBroadcast, sessions, respawnTimer };
}

module.exports = { setupSocket };
