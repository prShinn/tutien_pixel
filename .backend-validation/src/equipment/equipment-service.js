const { DomainError } = require('../domain');
const { validateRequestId } = require('../inventory/inventory-service');

const EQUIPMENT_SLOTS = new Set(['weapon', 'armor', 'pants', 'boots', 'hat', 'gloves', 'ring', 'amulet', 'belt', 'gem']);

function createEquipmentService({ store, catalog, players }) {
  async function equip(userId, input) {
    validateRequestId(input?.requestId);
    const itemCode = String(input?.itemCode || input?.itemId || '').trim();
    const item = catalog.getItemByCode(itemCode);
    if (!item || String(item.type || item.loai || '').toUpperCase() !== 'EQUIPMENT') throw new DomainError('ITEM_NOT_EQUIPMENT', 'Không tìm thấy trang bị hợp lệ', 404);
    const slot = String(input?.slot || item.slot || 'weapon').toLowerCase();
    if (!EQUIPMENT_SLOTS.has(slot)) throw new DomainError('INVALID_EQUIPMENT_SLOT', 'Vị trí trang bị không hợp lệ');
    const player = await players.snapshot(userId);
    const playerRealmStt = Number(player.canhGioi?.stt || 1);
    const requiredRealmStt = Math.max(1, Number(item.requiredRealmStt || 1));
    if (playerRealmStt < requiredRealmStt) throw new DomainError('REALM_TOO_LOW', 'Cảnh giới chưa đủ để trang bị', 409);
    const mutation = await store.equipItem(userId, input.requestId, item.id, slot, player.realmCode, playerRealmStt, requiredRealmStt);
    return { player: players.decorate(mutation.player), result: mutation.result };
  }

  async function unequip(userId, input) {
    validateRequestId(input?.requestId);
    const slot = String(input?.slot || '').toLowerCase();
    if (!EQUIPMENT_SLOTS.has(slot)) throw new DomainError('INVALID_EQUIPMENT_SLOT', 'Vị trí trang bị không hợp lệ');
    const mutation = await store.unequipItem(userId, input.requestId, slot);
    return { player: players.decorate(mutation.player), result: mutation.result };
  }

  return { equip, unequip };
}

module.exports = { createEquipmentService, EQUIPMENT_SLOTS };
