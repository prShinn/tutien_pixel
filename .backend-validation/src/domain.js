class DomainError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}

function publicUser(user) {
  return { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt };
}

function publicPlayer(player, wallet, inventory, equipment = {}, learnedSkills = [], equippedSkills = []) {
  const safeInventory = inventory.map(({ id, itemCode, quantity, slot }) => ({
    id: itemCode,
    itemCode,
    count: quantity,
    quantity,
    slot,
    instanceId: id,
  }));
  return {
    id: player.id, userId: player.userId, name: player.name, gender: player.gender, linhCan: player.linhCan,
    realmCode: player.realmCode,
    realmStage: player.realmStage, tuVi: player.tuVi, tuViLinhCan: player.tuViLinhCan || 0,
    hp: player.hp, maxHp: player.maxHp, mp: player.mp, maxMp: player.maxMp, mapCode: player.mapCode,
    mapId: player.mapCode, maCanhGioi: player.realmCode, tangTuVi: player.realmStage,
    tuViHienTai: player.tuVi,
    x: player.x, y: player.y, positionVersion: player.positionVersion, version: player.version, stats: player.stats,
    unspentStatPoints: player.unspentPoints || 0,
    derivedStats: player.derivedStats,
    wallet: { xu: wallet?.xu || 0, linhThach: wallet?.linhThach || 0 },
    xu: wallet?.xu || 0,
    linhThach: wallet?.linhThach || 0,
    inventory: safeInventory,
    jsonIventory: JSON.stringify(safeInventory),
    equipment,
    trangBi: equipment,
    equip_slot: equipment,
    learnedSkills,
    equippedSkills,
    skills: player.skills || [],
    combatPower: player.combatPower,
  };
}

module.exports = { DomainError, publicUser, publicPlayer };
