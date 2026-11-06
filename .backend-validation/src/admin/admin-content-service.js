const { DomainError } = require('../domain');
const { QUEST_DEFINITIONS } = require('../quests/quest-catalog');
const { validateQuestDefinition } = require('../quests/quest-service');

const EDITABLE = new Set(['quests', 'items', 'skills', 'monsters']);
const seed = require('../data/mock-data');
const PAGED = { items: seed.items, monsters: seed.monsterDefs || [], skills: seed.skills };
const READ_ONLY = new Set(['accounts', 'npcs']);

function recordId(collection, record) {
  if (collection === 'skills') return String(record.code || record.id || '');
  return String(record.id || record.code || record.maDo || '');
}

function parseMonster(input, catalog) {
  const id = input.id;
  const code = input.code;
  const type = input.type;
  const linhCan = input.linhCan;
  const level = input.level;
  const hp = input.hp;
  const atk = input.atk;
  const def = input.def;
  const speed = input.speed;
  const respawnMs = input.respawnMs == null ? 10000 : input.respawnMs;
  const img = input.img;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const validInt = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  const root = catalog.getRootByCode(linhCan);
  if (typeof id !== 'string' || !/^[A-Z0-9_]{1,64}$/.test(id) || code !== id || !name || name.length > 80
      || !['NORMAL', 'ELITE', 'BOSS'].includes(type) || !root
      || !validInt(level, 1, 1000) || !validInt(hp, 1, 10000000) || !validInt(atk, 1, 100000)
      || !validInt(def, 0, 100000) || !Number.isFinite(speed) || speed < 0.1 || speed > 10
      || !validInt(respawnMs, 1000, 3600000)) {
    throw new DomainError('INVALID_MONSTER', 'Thông tin quái vật không hợp lệ');
  }
  const localAsset = typeof img === 'string' && /^(?:\.\/)?assets\/[A-Za-z0-9_/-]+\.png$/.test(img);
  const prefix = 'data:image/png;base64,';
  if (!localAsset && (typeof img !== 'string' || !img.startsWith(prefix) || img.length > 24000)) {
    throw new DomainError('INVALID_MONSTER_IMAGE', 'Sprite phải là PNG hợp lệ và không được vượt giới hạn dung lượng');
  }
  if (!localAsset) {
    const data = img.slice(prefix.length);
    const png = Buffer.from(data, 'base64');
    const size = png.length >= 33 ? png.readUInt32BE(16) : 0;
    if (png.toString('base64') !== data || ![32, 48, 64].includes(size)
        || png.subarray(0, 16).toString('hex') !== '89504e470d0a1a0a0000000d49484452'
        || png.readUInt32BE(20) !== size) {
      throw new DomainError('INVALID_MONSTER_IMAGE', 'Sprite phải là PNG vuông 32, 48 hoặc 64 px');
    }
  }
  const color = /^#[0-9a-f]{6}$/i.test(input.color || '') ? input.color : root.color;
  return { ...input, id, code, name, img, type, linhCan, nguHanh: Array.isArray(input.nguHanh) ? input.nguHanh : [linhCan], color,
    level, hp, maxHp: validInt(input.maxHp, 1, 10000000) ? input.maxHp : hp, atk, def, speed, respawnMs };
}
function createAdminContentService({ store, catalog, world, quests, onCatalogChange = () => {} }) {
  const writes = new Map();
  const isPaged = (collection) => Object.hasOwn(PAGED, collection);

  function serialize(operation) {
    return (collection, ...args) => {
      const pending = (writes.get(collection) || Promise.resolve()).then(() => operation(collection, ...args));
      const settled = pending.catch(() => {});
      writes.set(collection, settled);
      void settled.then(() => { if (writes.get(collection) === settled) writes.delete(collection); });
      return pending;
    };
  }

  async function findRecord(collection, id) {
    if (!isPaged(collection)) {
      const data = (await list(collection)).data.find((entry) => recordId(collection, entry) === id);
      return data ? { data } : null;
    }
    const stored = await store.getAdminContentRecord(collection, id);
    if (stored) return stored.deleted ? null : stored;
    const data = PAGED[collection].find((entry) => recordId(collection, entry) === id);
    return data ? { data, version: 0 } : null;
  }

  async function publishChange(collection, id, saved) {
    if (collection !== 'items' && collection !== 'monsters') return refreshCatalog(collection);
    if (!catalog.applyAdminRecord(collection, id, saved)) return;
    try { onCatalogChange(collection, id, saved); }
    catch { process.stderr.write('{"level":"error","event":"catalog_notification_failed"}\n'); }
  }
  function baseRecords(collection) {
    if (collection === 'items' || collection === 'skills') return catalog.getAdminCollection(collection);
    if (collection === 'monsters') return catalog.listMonsters();
    if (collection === 'quests') return QUEST_DEFINITIONS.map((entry) => ({ ...entry }));
    if (collection === 'npcs') return world.listAdminWorlds().flatMap((entry) => entry.npcs || []);
    return [];
  }

  async function list(collection, query = {}) {
    if (!EDITABLE.has(collection) && !READ_ONLY.has(collection)) throw new DomainError('INVALID_CONTENT_COLLECTION', 'Nhóm nội dung không hợp lệ', 404);
    if (collection === 'accounts') return { collection, demo: false, persisted: true, data: await store.listAdminAccounts() };
    if (isPaged(collection) && ["page", "limit", "q", "ids"].some((key) => query[key] !== undefined)) {
      const page = Number(query.page ?? 1);
      const limit = Number(query.limit ?? 24);
      const q = query.q ?? "";
      const ids = typeof query.ids === "string" ? query.ids.split(",") : [];
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100
          || typeof q !== "string" || q.length > 100 || (query.ids !== undefined && typeof query.ids !== "string")
          || ids.length > 50 || ids.some((id) => !/^[A-Za-z0-9_-]{1,80}$/.test(id))) {
        throw new DomainError("INVALID_CATALOG_PAGE", "Bộ lọc hoặc thông số phân trang không hợp lệ", 400);
      }
      const seeds = new Map(PAGED[collection].map((entry) => [recordId(collection, entry), entry]));
      const searchRows = [...seeds].map(([id, entry]) => ({ id, name: entry.tenDo || entry.name || "", code: entry.maDo || entry.code || "" }));
      const { total, rows } = await store.pageAdminCatalog(collection, searchRows, { q: q.trim(), ids, limit, offset: (page - 1) * limit });
      return { collection, demo: false, persisted: true, data: rows.map((row) => row.data ?? seeds.get(row.id)), pagination: { page, limit, total } };
    }
    const records = baseRecords(collection);
    const merged = new Map(records.map((entry) => [recordId(collection, entry), entry]));
    for (const override of await store.listAdminContentRecords(collection)) {
      if (override.deleted) merged.delete(override.id);
      else merged.set(override.id, override.data);
    }
    return { collection, demo: false, persisted: true, data: [...merged.values()] };
  }

  async function create(collection, input, actorId, requestId) {
    if (!EDITABLE.has(collection) && collection !== 'monsters') throw new DomainError('CONTENT_READ_ONLY', 'Nhóm nội dung này chỉ được xem', 403);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DomainError('INVALID_PAYLOAD', 'Nội dung không hợp lệ');
    if (collection === 'monsters') input = parseMonster(input, catalog);
    if (collection === 'quests') input = validateQuestDefinition(input, catalog.listItems());
    const id = recordId(collection, input);
    if (!id) throw new DomainError('CONTENT_ID_REQUIRED', 'Bản ghi cần có id hoặc code');
    if (await findRecord(collection, id)) throw new DomainError('CONTENT_EXISTS', 'Bản ghi đã tồn tại', 409);
    const document = { ...input, id: input.id || id };
    const saved = await store.mutateAdminContent(actorId, collection, id, document, false, requestId, true);
    await publishChange(collection, id, saved);
    return { demo: false, persisted: true, data: saved.data };
  }

  async function update(collection, id, input, actorId, requestId) {
    if (!EDITABLE.has(collection)) throw new DomainError('CONTENT_READ_ONLY', 'Nhóm nội dung này chỉ được xem', 403);
    const found = await findRecord(collection, id);
    if (!found) throw new DomainError('CONTENT_NOT_FOUND', 'Bản ghi nội dung không tồn tại', 404);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DomainError('INVALID_PAYLOAD', 'Nội dung không hợp lệ');
    if (input.id != null && recordId(collection, input) !== id) throw new DomainError('CONTENT_ID_MISMATCH', 'id trong body không khớp đường dẫn', 400);
    const previous = found.data;
    if (collection === 'monsters') input = parseMonster({ ...previous, ...input, id, code: previous.code || id }, catalog);
    if (collection === 'quests') input = validateQuestDefinition({ ...previous, ...input, id }, catalog.listItems());
    const document = { ...previous, ...input, id: previous.id || id };
    const saved = await store.mutateAdminContent(actorId, collection, id, document, false, requestId, false, found.version);
    await publishChange(collection, id, saved);
    return { demo: false, persisted: true, data: saved.data };
  }

  async function remove(collection, id, actorId, requestId) {
    if (!EDITABLE.has(collection) || collection === 'quests' || collection === 'monsters') throw new DomainError('CONTENT_READ_ONLY', 'Quest và quái được giữ để bảo vệ tiến độ và cấu hình map', 403);
    const found = await findRecord(collection, id);
    if (!found) throw new DomainError('CONTENT_NOT_FOUND', 'Bản ghi nội dung không tồn tại', 404);
    const saved = await store.mutateAdminContent(actorId, collection, id, null, true, requestId, false, found.version);
    await publishChange(collection, id, saved);
    return { demo: false, persisted: true, removed: id };
  }

  async function refreshCatalog(collection) {
    if (collection === 'quests') {
      quests.applyOverrides(await store.listAdminContentRecords('quests'));
      return;
    }
    if (!['items', 'skills', 'monsters'].includes(collection)) return;
    const current = await list(collection);
    catalog.applyAdminCollection(collection, current.data);
  }

  return { list, create: serialize(create), update: serialize(update), remove: serialize(remove) };
}

module.exports = { createAdminContentService };
