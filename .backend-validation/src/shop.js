const { DomainError } = require('./domain');

function validateRequest(requestId, itemCode, quantity, catalog, operation) {
  if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) {
    throw new DomainError('INVALID_REQUEST_ID', 'requestId phải dài 8-80 ký tự');
  }
  if (typeof itemCode !== 'string') throw new DomainError('ITEM_NOT_FOUND', 'Vật phẩm không tồn tại', 404);
  const definition = catalog.getItemByCode(itemCode);
  if (!definition) throw new DomainError('ITEM_NOT_FOUND', 'Vật phẩm không tồn tại', 404);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new DomainError('INVALID_QUANTITY', 'Số lượng phải là số nguyên từ 1 đến 99');
  }

  const price = operation === 'BUY_ITEM' ? Number(definition.giaMua) : Number(definition.giaBan);
  if (!Number.isSafeInteger(price) || price < 0 || (operation === 'BUY_ITEM' && price === 0)) {
    const code = operation === 'BUY_ITEM' ? 'ITEM_NOT_BUYABLE' : 'ITEM_NOT_SELLABLE';
    throw new DomainError(code, operation === 'BUY_ITEM' ? 'Vật phẩm này không thể mua' : 'Vật phẩm này không thể bán', 400);
  }
  return { definition, item: { price, sellPrice: price } };
}

function createShopService({ store, catalog, players }) {
  function listCatalog() { return catalog.listItems(); }

  async function buy(userId, requestId, itemCode, quantity) {
    const { definition, item } = validateRequest(requestId, itemCode, quantity, catalog, 'BUY_ITEM');
    const player = await store.buyItem(userId, requestId, definition.id, quantity, item);
    return { player: players.decorate(player), result: { type: 'bought', itemId: definition.id, itemCode: definition.id, quantity, price: item.price * quantity } };
  }

  async function sell(userId, requestId, itemCode, quantity) {
    const { definition, item } = validateRequest(requestId, itemCode, quantity, catalog, 'SELL_ITEM');
    if (item.sellPrice <= 0) throw new DomainError('ITEM_NOT_SELLABLE', 'Vật phẩm này không thể bán', 400);
    const player = await store.sellItem(userId, requestId, definition.id, quantity, item);
    return { player: players.decorate(player), result: { type: 'sold', itemId: definition.id, itemCode: definition.id, quantity, price: item.sellPrice * quantity } };
  }

  return { listCatalog, buy, sell };
}

module.exports = { createShopService };
