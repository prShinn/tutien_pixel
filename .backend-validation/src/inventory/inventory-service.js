const { DomainError } = require('../domain');
const { BALANCE } = require('../data/balance');

function validateRequestId(requestId) {
  if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) {
    throw new DomainError('INVALID_REQUEST_ID', 'requestId phải dài 8-80 ký tự');
  }
}

function createInventoryService({ store, catalog, players }) {
  function findItem(itemCode) {
    if (typeof itemCode !== 'string' || !itemCode.trim()) throw new DomainError('ITEM_NOT_FOUND', 'Vật phẩm không tồn tại', 404);
    const item = catalog.getItemByCode(itemCode.trim());
    if (!item) throw new DomainError('ITEM_NOT_FOUND', 'Vật phẩm không tồn tại', 404);
    return item;
  }

  function effectFor(item, mode) {
    const type = String(item.type || item.loai || '').toUpperCase();
    if (type === 'STONE' || type === 'ELEMSTONE') {
      const amount = Math.floor(Number(item.giaTriTuVi || 0));
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new DomainError('INVALID_ITEM_EFFECT', 'Giá trị vật phẩm tu vi không hợp lệ', 409);
      return { kind: 'cultivation', amount };
    }
    if (mode === 'ABSORB') throw new DomainError('ITEM_NOT_ABSORBABLE', 'Chỉ có thể hấp thụ vật phẩm tu vi', 400);
    if (type === 'BREAKTHROUGH_PILL') throw new DomainError('BREAKTHROUGH_PILL_RESERVED', 'Giữ đan trong túi; đan tự tiêu hao khi phá đại cảnh giới thành công', 409);
    if (type === 'LINDAN') {
      const amount = Math.floor(Number(item.tuViLinhCanVal || 0));
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new DomainError('INVALID_ITEM_EFFECT', 'Giá trị vật phẩm linh căn không hợp lệ', 409);
      return { kind: 'root_cultivation', amount, cap: BALANCE.progression.linhCan.itemCap };
    }
    if (type === 'POTION' || type === 'CONSUME') {
      const healHp = Math.floor(Number(item.healHp || 0));
      const healMp = Math.floor(Number(item.healMp || 0));
      const statBoost = Math.floor(Number(item.statBoost || 0));
      const statKey = String(item.statKey || 'str').toLowerCase();
      if (![healHp, healMp, statBoost].every(Number.isSafeInteger) || healHp < 0 || healMp < 0 || statBoost < 0
          || (statBoost > 0 && !['str', 'agi', 'vit', 'ene'].includes(statKey))) {
        throw new DomainError('INVALID_ITEM_EFFECT', 'Hiệu ứng vật phẩm không hợp lệ', 409);
      }
      if (healHp + healMp + statBoost === 0) throw new DomainError('ITEM_USE_NOT_SUPPORTED', 'Vật phẩm này chưa có hiệu ứng sử dụng', 409);
      return { kind: 'potion', healHp, healMp, statBoost, statKey };
    }
    throw new DomainError('ITEM_USE_NOT_SUPPORTED', 'Vật phẩm này chưa hỗ trợ sử dụng', 409);
  }

  async function mutate(userId, requestId, itemCode, operation, mode) {
    validateRequestId(requestId);
    const item = findItem(itemCode);
    const effect = effectFor(item, mode);
    const mutation = await store.useInventoryItem(userId, requestId, item.id, operation, effect);
    return { player: players.decorate(mutation.player), result: mutation.result };
  }

  function use(userId, requestId, itemCode) {
    return mutate(userId, requestId, itemCode, 'ITEM_USE', 'USE');
  }

  function absorb(userId, requestId, itemCode) {
    return mutate(userId, requestId, itemCode, 'CULTIVATION_ABSORB', 'ABSORB');
  }

  return { use, absorb };
}

module.exports = { createInventoryService, validateRequestId };
