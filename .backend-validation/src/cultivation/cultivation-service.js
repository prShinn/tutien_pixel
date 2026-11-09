const { DomainError } = require('../domain');
const { combatPower, breakthroughThreshold, minimumBreakthroughOvr, breakthroughGain } = require('../data/balance');
const { validateRequestId } = require('../inventory/inventory-service');

function createCultivationService({ store, catalog, players, inventory }) {
  async function absorb(userId, requestId, itemCode) {
    return inventory.absorb(userId, requestId, itemCode);
  }

  async function breakthrough(userId, requestId) {
    validateRequestId(requestId);
    const player = await players.snapshot(userId);
    const replay = await store.replayBreakthrough(userId, requestId);
    if (replay) return { player: await players.snapshot(userId), result: replay.result };
    const realm = catalog.getRealmByCode(player.realmCode);
    if (!realm) throw new DomainError('PLAYER_CONTENT_STALE', 'Cảnh giới nhân vật không còn trong catalog', 409);
    const stage = Number(player.realmStage);
    const major = stage >= Number(realm.soTang || 9);
    const nextRealm = major ? catalog.getRealmByStt(Number(realm.stt) + 1) : null;
    if (major && !nextRealm) throw new DomainError('MAX_REALM_REACHED', 'Đã đạt cảnh giới tối cao', 409);
    const threshold = breakthroughThreshold(realm, stage);
    const requiredOvr = minimumBreakthroughOvr(realm, stage, major);
    const power = combatPower({
      ...player,
      realm: realm.stt,
      canhGioi: realm,
      tangTuVi: stage,
      tuViLenCap: threshold,
    });
    if (Number(player.tuVi || 0) < threshold) throw new DomainError('INSUFFICIENT_TUVI', 'Tu vi chưa đủ điều kiện đột phá', 409);
    if (power < requiredOvr) throw new DomainError('INSUFFICIENT_COMBAT_POWER', 'OVR chưa đủ điều kiện đột phá', 409);

    const mutation = await store.breakthrough(userId, requestId, {
      realm,
      nextRealm,
      stage,
      major,
      threshold,
      requiredOvr,
      itemCatalog: catalog.listItems(),
      gain: breakthroughGain(realm, stage, major),
    });
    const updatedPlayer = mutation.replayed ? await players.snapshot(userId) : players.decorate(mutation.player);
    return { player: updatedPlayer, result: mutation.result };
  }

  return { absorb, breakthrough };
}

module.exports = { createCultivationService };
