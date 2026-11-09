const crypto = require('node:crypto');
const { DomainError } = require('../domain');
const { isMonsterSpawnTile } = require('../world/world-service');

function clone(value) { return structuredClone(value); }

function validateWorld(world, allWorlds) {
  const errors = [];
  const warnings = [];
  if (!/^[a-z0-9_]{2,64}$/i.test(String(world.code || ''))) errors.push('code phải dài 2-64 ký tự, chỉ gồm chữ, số và dấu gạch dưới');
  if (!Number.isSafeInteger(Number(world.w)) || Number(world.w) < 1 || !Number.isSafeInteger(Number(world.h)) || Number(world.h) < 1) errors.push('w/h phải là số nguyên dương');
  else if (Number(world.w) * Number(world.h) > 1000000) errors.push('bản đồ không được vượt quá 1.000.000 ô');
  if (!Number.isSafeInteger(Number(world.spawnX)) || !Number.isSafeInteger(Number(world.spawnY))
      || Number(world.spawnX) < 0 || Number(world.spawnY) < 0 || Number(world.spawnX) >= Number(world.w) || Number(world.spawnY) >= Number(world.h)) {
    errors.push('tọa độ spawn phải nằm trong bản đồ');
  }
  const layers = world.layers;
  if (layers && typeof layers === 'object') {
    for (const key of ['ground', 'objects', 'elevation']) {
      const grid = layers[key];
      if (grid != null && (!Array.isArray(grid) || grid.length !== Number(world.h) || grid.some((row) => !Array.isArray(row) || row.length !== Number(world.w)))) {
        errors.push(`layers.${key} phải có đúng kích thước h × w`);
      }
    }
  }
  const collision = world.jsonMap;
  if (collision != null && (!Array.isArray(collision) || collision.length !== Number(world.h)
      || collision.some((row) => !Array.isArray(row) || row.length !== Number(world.w)))) {
    errors.push('jsonMap phải có đúng kích thước h × w');
  }
  if (Array.isArray(collision) && collision[Number(world.spawnY)]?.[Number(world.spawnX)] === 2) errors.push('ô spawn bị chặn');
  for (const portal of world.portals || []) {
    if (!Number.isSafeInteger(Number(portal.x)) || !Number.isSafeInteger(Number(portal.y))
        || Number(portal.x) < 0 || Number(portal.y) < 0 || Number(portal.x) >= Number(world.w) || Number(portal.y) >= Number(world.h)) {
      errors.push(`portal ${portal.id || '(chưa có id)'} nằm ngoài bản đồ`);
    }
    if (Array.isArray(collision) && collision[Number(portal.y)]?.[Number(portal.x)] === 2) errors.push(`portal ${portal.id || ''} nằm trên ô bị chặn`);
    const targetCode = portal.toMap || portal.denMap;
    const target = allWorlds.find((entry) => entry.code === targetCode);
    if (!targetCode || !target) warnings.push(`portal ${portal.id || ''} trỏ tới map chưa có trong catalog`);
    else if (!Number.isSafeInteger(Number(portal.toX)) || !Number.isSafeInteger(Number(portal.toY))
        || Number(portal.toX) < 0 || Number(portal.toY) < 0 || Number(portal.toX) >= Number(target.w) || Number(portal.toY) >= Number(target.h)) {
      errors.push(`điểm đến portal ${portal.id || ''} nằm ngoài bản đồ đích`);
    } else if (Array.isArray(target.jsonMap) && target.jsonMap[Number(portal.toY)]?.[Number(portal.toX)] === 2) {
      errors.push(`điểm đến portal ${portal.id || ''} nằm trên ô bị chặn`);
    }
  }
  for (const npc of world.npcs || []) {
    if (!npc || typeof npc.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(npc.id)
        || !String(npc.name || '').trim() || !String(npc.role || '').trim()
        || !['dialog', 'shop', 'chest'].includes(npc.type)
        || !Number.isInteger(npc.x) || !Number.isInteger(npc.y)
        || !isMonsterSpawnTile(world, npc.x, npc.y)
        || (npc.enabled != null && typeof npc.enabled !== 'boolean')) {
      errors.push('NPC cần mã, tên, vai trò, kiểu tương tác và vị trí hợp lệ');
    }
  }
  if (world.rules?.monsterPacksOnly && !world.rules.noMonsters && world.type !== 'CITY') {
    const packs = world.monsterSpawns;
    const definitions = Array.isArray(world.monsters) ? world.monsters : [];
    const seen = new Set();
    if (!Array.isArray(packs)) errors.push('monsterSpawns phải là danh sách bãi quái');
    else for (const pack of packs) {
      if (!pack || typeof pack.packId !== 'string' || !pack.packId || seen.has(pack.packId)
          || !definitions.some((entry) => entry && (entry.id === pack.templateId || entry.code === pack.templateId))) {
        errors.push('Bãi quái cần mã riêng và một mẫu quái hợp lệ');
        continue;
      }
      seen.add(pack.packId);
      if (!Number.isInteger(pack.count) || pack.count < 1 || pack.count > 20
          || !Number.isInteger(pack.radius) || pack.radius < 1 || pack.radius > 80
          || !isMonsterSpawnTile(world, pack.centerX, pack.centerY)) {
        errors.push('Bãi ' + pack.packId + ' cần tâm trên ô đi được, 1–20 quái và bán kính 1–80 ô');
      }
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

function createAdminWorldService({ store, world }) {
  function findRaw(code) {
    const document = world.listAdminWorlds().find((entry) => entry.code === code);
    if (!document) throw new DomainError('WORLD_NOT_FOUND', 'Bản đồ không tồn tại', 404);
    return document;
  }

  function get(code) {
    const document = findRaw(code);
    return { ...document, validation: validateWorld(document, world.listAdminWorlds()) };
  }

  async function persist(actorId, documents, action, req) {
    const saved = await store.saveAdminWorlds(actorId, documents, action, req?.requestId || req?.get?.('x-request-id') || null);
    for (const document of saved) world.setWorld(document);
    return saved;
  }

  async function create(input, actorId, req) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DomainError('INVALID_PAYLOAD', 'Dữ liệu bản đồ không hợp lệ');
    const code = String(input.code || '').trim().toLowerCase();
    if (world.listAdminWorlds().some((entry) => entry.code === code)) throw new DomainError('WORLD_EXISTS', 'Mã bản đồ đã tồn tại', 409);
    const document = { ...input, id: input.id || code, code, status: String(input.status || 'DRAFT').toUpperCase(), version: 1 };
    const validation = validateWorld(document, world.listAdminWorlds());
    if (!validation.valid) throw new DomainError('WORLD_INVALID', 'Bản đồ không hợp lệ', 400, validation);
    return (await persist(actorId, [document], 'WORLD_CREATE', req))[0];
  }

  async function update(code, input, actorId, req) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DomainError('INVALID_PAYLOAD', 'Dữ liệu bản đồ không hợp lệ');
    const before = findRaw(code);
    if (input.code != null && String(input.code).toLowerCase() !== code) throw new DomainError('WORLD_CODE_IMMUTABLE', 'Không thể đổi code bản đồ qua endpoint cập nhật', 400);
    const document = { ...before, ...input, code, id: before.id || code, version: Number(before.version || 0) + 1 };
    const validation = validateWorld(document, world.listAdminWorlds());
    if (!validation.valid) throw new DomainError('WORLD_INVALID', 'Bản đồ không hợp lệ', 400, validation);
    return (await persist(actorId, [document], 'WORLD_UPDATE', req))[0];
  }

  function validate(code) {
    return validateWorld(findRaw(code), world.listAdminWorlds());
  }

  async function publish(code, actorId, req) {
    const document = findRaw(code);
    const validation = validateWorld(document, world.listAdminWorlds());
    if (!validation.valid) throw new DomainError('WORLD_INVALID', 'Không thể publish bản đồ chưa hợp lệ', 409, validation);
    const saved = (await persist(actorId, [{ ...document, status: 'PUBLISHED', version: Number(document.version || 0) + 1 }], 'WORLD_PUBLISH', req))[0];
    return { world: saved, validation };
  }

  async function remove(code, actorId, req) {
    const document = findRaw(code);
    if (document.isDefault && !world.listAdminWorlds().some((entry) => entry.code !== code && String(entry.status || 'PUBLISHED').toUpperCase() === 'PUBLISHED')) {
      throw new DomainError('WORLD_DEFAULT_REQUIRED', 'Cần có ít nhất một map published làm mặc định', 409);
    }
    const incoming = world.listAdminWorlds().filter((entry) => entry.code !== code && (entry.portals || []).some((portal) => (portal.toMap || portal.denMap) === code));
    if (incoming.length) throw new DomainError('WORLD_IN_USE', 'Không thể xóa map đang được portal khác tham chiếu', 409, { worlds: incoming.map((entry) => entry.code) });
    await store.deleteAdminWorld(actorId, code, req?.requestId || req?.get?.('x-request-id') || null);
    world.removeWorld(code);
    return { removed: document.code };
  }

  async function linkPortal(input, actorId, req) {
    const source = findRaw(String(input?.sourceCode || ''));
    const target = findRaw(String(input?.targetCode || ''));
    if (source.code === target.code) throw new DomainError('PORTAL_SAME_MAP', 'Portal phải nối hai bản đồ khác nhau', 400);
    const point = (x, y, document) => Number.isSafeInteger(x) && Number.isSafeInteger(y) && x >= 0 && y >= 0 && x < document.w && y < document.h;
    if (!point(input.sourceX, input.sourceY, source) || !point(input.targetX, input.targetY, target)) throw new DomainError('INVALID_PORTAL_POSITION', 'Tọa độ portal phải nằm trong bản đồ tương ứng');
    const id = String(input.id || `portal_${crypto.randomUUID()}`);
    const reverseId = input.twoWay ? `${id}_reverse` : null;
    const sourcePortal = { id, x: input.sourceX, y: input.sourceY, toMap: target.code, denMap: target.code, toX: input.targetX, toY: input.targetY, tenMapDen: target.tenMap || target.name, reversePortalId: reverseId };
    source.portals = [...(source.portals || []).filter((entry) => entry.id !== id), sourcePortal];
    const updates = [source];
    let reverse = null;
    if (input.twoWay) {
      reverse = { id: reverseId, x: input.targetX, y: input.targetY, toMap: source.code, denMap: source.code, toX: input.sourceX, toY: input.sourceY, tenMapDen: source.tenMap || source.name, reversePortalId: id };
      target.portals = [...(target.portals || []).filter((entry) => entry.id !== reverseId), reverse];
      updates.push(target);
    }
    for (const document of updates) {
      const validation = validateWorld(document, world.listAdminWorlds());
      if (!validation.valid) throw new DomainError('WORLD_INVALID', 'Portal làm bản đồ không hợp lệ', 409, validation);
    }
    const saved = await persist(actorId, updates, 'PORTAL_LINK', req);
    return { source: sourcePortal, reverse, sourceVersion: saved.find((entry) => entry.code === source.code)?.version, targetVersion: input.twoWay ? saved.find((entry) => entry.code === target.code)?.version : null };
  }

  async function deletePortal(code, portalId, actorId, req) {
    const source = findRaw(code);
    const portal = (source.portals || []).find((entry) => entry.id === portalId);
    if (!portal) throw new DomainError('PORTAL_NOT_FOUND', 'Portal không tồn tại', 404);
    source.portals = source.portals.filter((entry) => entry.id !== portalId);
    const updates = [source];
    let reverseRemoved = null;
    const targetCode = portal.toMap || portal.denMap;
    const target = world.listAdminWorlds().find((entry) => entry.code === targetCode);
    if (portal.reversePortalId && target) {
      target.portals = (target.portals || []).filter((entry) => entry.id !== portal.reversePortalId);
      updates.push(target);
      reverseRemoved = portal.reversePortalId;
    }
    await persist(actorId, updates, 'PORTAL_DELETE', req);
    return { removed: portalId, reverseRemoved };
  }

  return {
    list: () => world.listAdminSummaries().map((entry) => ({ ...entry, validation: validateWorld(findRaw(entry.code), world.listAdminWorlds()) })), get, create, update, validate, publish, remove, linkPortal, deletePortal,
  };
}

module.exports = { createAdminWorldService, validateWorld };
