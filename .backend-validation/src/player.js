const { DomainError } = require('./domain');
const crypto = require('node:crypto');
const { breakthroughThreshold } = require('./data/balance');
const { validateRequestId } = require('./inventory/inventory-service');

const statKeys = ['str', 'agi', 'vit', 'ene'];
const minCreationStat = 5;
const creationBonusPoints = 10;

function normalizeCreationStats(value) {
  if (value == null) return Object.fromEntries(statKeys.map((key) => [key, minCreationStat]));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DomainError('INVALID_STATS', 'Thuộc tính nhân vật không hợp lệ');
  const stats = Object.fromEntries(statKeys.map((key) => [key, value[key]]));
  if (statKeys.some((key) => !Number.isSafeInteger(stats[key]) || stats[key] < minCreationStat)
      || statKeys.reduce((sum, key) => sum + stats[key], 0) !== minCreationStat * statKeys.length + creationBonusPoints) {
    throw new DomainError('INVALID_STATS', `Phân bổ thuộc tính phải đủ ${creationBonusPoints} điểm, mỗi chỉ số tối thiểu ${minCreationStat}`);
  }
  return stats;
}

function createPlayerService({ store, catalog, world }) {
  async function create(userId, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DomainError('INVALID_PAYLOAD', 'Dữ liệu nhân vật không hợp lệ');
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!/^[\p{L}0-9_ ]{2,24}$/u.test(name)) throw new DomainError('INVALID_PLAYER_NAME', 'Tên nhân vật dài 2-24 ký tự');
    const realm = catalog.getRealmByStt(1);
    const gender = String(input.gender || 'MALE').toUpperCase();
    if (!['MALE', 'FEMALE'].includes(gender)) throw new DomainError('INVALID_GENDER', 'Giới tính nhân vật không hợp lệ');
    const root = catalog.getRootByCode(String(input.linhCan || 'KIM').toUpperCase());
    if (!root) throw new DomainError('INVALID_ROOT', 'Linh căn không tồn tại trong catalog');
    const startingWorld = world.getDefault();
    const spawnTile = startingWorld?.jsonMap?.[startingWorld.spawnY]?.[startingWorld.spawnX];
    if (!realm || !startingWorld || !Number.isSafeInteger(startingWorld.spawnX) || !Number.isSafeInteger(startingWorld.spawnY)
        || spawnTile == null || Number(spawnTile) === 2) {
      throw new DomainError('STARTING_CONTENT_UNAVAILABLE', 'Chưa có cảnh giới hoặc bản đồ khởi đầu hợp lệ', 503);
    }
    const stats = normalizeCreationStats(input.stats);
    const allSkills = catalog.listSkills();
    const rootSkills = allSkills.filter((skill) => skill.linhCan === root.id && String(skill.category || 'ACTIVE').toUpperCase() !== 'PASSIVE');
    const initialLearnedSkills = [
      ...allSkills.filter((skill) => skill.linhCan === 'COMMON'),
      ...rootSkills.slice(0, 2),
      ...allSkills.filter((skill) => skill.linhCan === root.id && String(skill.category || '').toUpperCase() === 'PASSIVE'),
    ].map((skill) => skill.code);
    const initialEquippedSkills = rootSkills.slice(0, 4).map((skill) => skill.code);
    const created = await store.createPlayer(userId, {
      id: `plr_${crypto.randomUUID()}`,
      name,
      gender,
      linhCan: root.id,
      stats,
      initialLearnedSkills,
      initialEquippedSkills,
      realmCode: realm.code,
      realmStage: 1,
      tuVi: 0,
      tuViLinhCan: 0,
      hp: 100 + stats.vit * 12,
      maxHp: 100 + stats.vit * 12,
      mp: 50 + stats.ene * 8,
      maxMp: 50 + stats.ene * 8,
      mapCode: startingWorld.code,
      x: startingWorld.spawnX,
      y: startingWorld.spawnY,
      version: 1,
    });
    return decorate(created);
  }

  function decorate(player) {
    const realm = catalog.getRealmByCode(player.realmCode)
      || (player.realmCode === 'PHAM_NHAN' ? catalog.getRealmByStt(1) : null);
    const startingWorld = world.getByCode(player.mapCode)
      || (player.mapCode === 'tan_thu_thon' ? world.getDefault() : null);
    if (!realm || !startingWorld) throw new DomainError('PLAYER_CONTENT_STALE', 'Cảnh giới hoặc bản đồ nhân vật không còn trong catalog', 409);
    const stage = realm.tangTuVi?.find((entry) => entry.stt === player.realmStage);
    const tuViLenCap = stage ? breakthroughThreshold(realm, player.realmStage) : realm.tuViTienCap;
    return catalog.decoratePlayer({
      ...player,
      gender: player.gender || 'MALE',
      linhCan: player.linhCan || 'KIM',
      img: player.gender === 'FEMALE' ? './assets/char_female_anim-source.png' : './assets/char_male_anim-source.png',
      realmCode: realm.code,
      maCanhGioi: realm.code,
      realmStage: player.realmStage,
      tangTuVi: player.realmStage,
      tuViHienTai: player.tuVi,
      mapCode: startingWorld.code,
      mapId: startingWorld.code,
      canhGioi: realm,
      tenCanhGioi: realm.tenCanhGioi,
      tuViLenCap,
      root: catalog.getRootByCode(player.linhCan || 'KIM'),
    });
  }

  async function snapshot(userId) { return decorate(await store.playerSnapshot(userId)); }

  async function power(userId) {
    const player = await snapshot(userId);
    return { combatPower: player.combatPower };
  }

  async function allocateStats(userId, input) {
    validateRequestId(input?.requestId);
    const stat = String(input?.stat || '').toLowerCase();
    if (!statKeys.includes(stat)) throw new DomainError('INVALID_STAT', 'Thuộc tính không hợp lệ');
    const amount = input?.amount == null ? 1 : input.amount;
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000) throw new DomainError('INVALID_AMOUNT', 'Số điểm phải là số nguyên từ 1 đến 1000');
    const mutation = await store.allocateStats(userId, input.requestId, stat, amount);
    const player = decorate(mutation.player);
    return { ...mutation.result, derivedStats: player.derivedStats, player };
  }

  async function update(userId, playerId, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DomainError('INVALID_PAYLOAD', 'Dữ liệu cập nhật không hợp lệ');
    const allowed = new Set(['name']);
    if (Object.keys(input).some((key) => !allowed.has(key))) {
      throw new DomainError('PLAYER_SNAPSHOT_WRITE_FORBIDDEN', 'Không được lưu player snapshot từ client; hãy dùng mutation API tương ứng', 409);
    }
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!/^[\p{L}0-9_ ]{2,24}$/u.test(name)) throw new DomainError('INVALID_PLAYER_NAME', 'Tên nhân vật dài 2-24 ký tự');
    return decorate(await store.updatePlayerName(userId, playerId, name));
  }

  function respawnPoint(map) {
    if (!map || !Number.isSafeInteger(map.spawnX) || !Number.isSafeInteger(map.spawnY)) {
      throw new DomainError('WORLD_NO_WALKABLE_SPAWN', 'Chưa có điểm hồi sinh hợp lệ', 503);
    }
    const walkable = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0
      && x < Number(map.w) && y < Number(map.h)
      && Number(map.jsonMap?.[Math.floor(y)]?.[Math.floor(x)] ?? 0) !== 2;
    if (walkable(map.spawnX, map.spawnY)) return { x: map.spawnX, y: map.spawnY };
    for (let radius = 1; radius <= 12; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = Math.floor(map.spawnX + dx) + 0.5;
          const y = Math.floor(map.spawnY + dy) + 0.5;
          if (walkable(x, y)) return { x, y };
        }
      }
    }
    throw new DomainError('WORLD_NO_WALKABLE_SPAWN', 'Bản đồ không có ô đi được gần điểm hồi sinh', 503);
  }

  async function respawn(userId, input) {
    validateRequestId(input?.requestId);
    const startingWorld = world.getDefault();
    const point = respawnPoint(startingWorld);
    const mutation = await store.respawn(userId, input.requestId, startingWorld.code, point.x, point.y);
    return { ok: true, player: decorate(mutation.player), result: mutation.result };
  }

  return { create, snapshot, decorate, power, allocateStats, update, respawn };
}

module.exports = { createPlayerService };
