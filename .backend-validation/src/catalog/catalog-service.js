const seed = require('../data/mock-data');
const { BALANCE, deriveStats, combatPower } = require('../data/balance');

const clone = (value) => structuredClone(value);

function createCatalogService() {
  let items = clone(seed.items);
  let skills = clone(seed.skills);
  let monsters = clone(seed.monsterDefs || []);
  let monsterRevision = 0;
  const recordVersions = new Map();
  let skillVfxProfiles = {};
  return {
    listRealms: () => clone(seed.realms),
    getRealmByStt: (stt) => clone(seed.realms.find((realm) => realm.stt === Number(stt)) || null),
    getRealmById: (id) => clone(seed.realms.find((realm) => realm.id === Number(id)) || null),
    getRealmByCode: (code) => clone(seed.realms.find((realm) => realm.code === code) || null),
    listRoots: () => clone(seed.roots),
    getRootByCode: (code) => clone(seed.roots.find((root) => root.id === code || root.maLinhCan === code) || null),
    listItems: () => clone(items),
    getItemByCode: (code) => clone(items.find((item) => item.id === code || item.maDo === code) || null),
    listSkills: () => clone(skills),
    listMonsters: () => clone(monsters),
    getMonsterRevision: () => monsterRevision,
    getLootTableById: (id) => clone(seed.lootTables[id] || []),
    getBalance: () => clone(BALANCE),
    getSkillsForPlayer: async (playerService, userId) => {
      const player = await playerService.snapshot(userId);
      return { skills: clone(skills), learnedSkills: player.learnedSkills || [], equippedSkills: player.equippedSkills || [], playerVersion: player.version };
    },
    listSkillVfxProfiles: () => clone(skillVfxProfiles),
    setSkillVfxProfile: (skillCode, profile) => { skillVfxProfiles[skillCode] = clone(profile); },
    removeSkillVfxProfile: (skillCode) => { delete skillVfxProfiles[skillCode]; },
    replaceItems: (nextItems) => { items = clone(nextItems); },
    replaceSkills: (nextSkills) => { skills = clone(nextSkills); },
    getAdminCollection: (collection) => collection === 'items' ? clone(items) : collection === 'skills' ? clone(skills) : collection === 'monsters' ? clone(monsters) : [],
    applyAdminRecord(collection, id, { data, deleted, version }) {
      const key = collection + ":" + id;
      if (Number(version) <= (recordVersions.get(key) || 0)) return false;
      const records = collection === "items" ? items : monsters;
      const index = records.findIndex((record) => String(record.id || record.code || record.maDo) === id);
      if (deleted) {
        if (index !== -1) records.splice(index, 1);
      } else if (index === -1) records.push(clone(data));
      else records[index] = clone(data);
      recordVersions.set(key, Number(version));
      if (collection === "monsters") monsterRevision += 1;
      return true;
    },
    applyAdminCollection(collection, records) {
      if (collection === 'items') items = clone(records);
      if (collection === 'skills') skills = clone(records);
      if (collection === 'monsters') { monsters = clone(records); monsterRevision += 1; }
    },
    decoratePlayer(player) {
      const inventory = (player.inventory || []).map((entry) => ({
        ...(items.find((item) => item.id === entry.itemCode) || {}),
        ...entry,
        id: entry.itemCode || entry.id,
      }));
      const slots = ['weapon', 'armor', 'pants', 'boots', 'hat', 'gloves', 'ring', 'amulet', 'belt', 'gem'];
      const equipment = Object.fromEntries(slots.map((slot) => {
        const stored = player.equipment?.[slot];
        const code = typeof stored === 'string' ? stored : stored?.itemCode || stored?.id;
        return [slot, code ? { ...(items.find((item) => item.id === code) || {}), id: code, itemCode: code } : null];
      }));
      const learnedSkills = player.learnedSkills || [];
      const equippedSkills = player.equippedSkills || [];
      const equippedSkillDefinitions = equippedSkills.map((code) => skills.find((skill) => skill.code === code)).filter(Boolean);
      const derivedStats = deriveStats(player.stats || {}, equipment);
      const combat = combatPower({
        ...player,
        realm: player.canhGioi?.stt || 1,
        canhGioi: player.canhGioi,
        tangTuVi: player.realmStage || player.tangTuVi || 1,
        tuViHienTai: player.tuVi ?? player.tuViHienTai,
        tuViLenCap: player.tuViLenCap || player.canhGioi?.tuViTienCap || 1,
        stats: player.stats || {},
        equipment,
        learnedSkills,
      });
      const legacyEquipment = {
        vuKhi: equipment.weapon,
        ao: equipment.armor,
        quan: equipment.pants,
        giay: equipment.boots,
        mu: equipment.hat,
        tay: equipment.gloves,
        nhan: equipment.ring,
        vong: equipment.amulet,
      };
      return {
        ...player,
        inventory,
        jsonIventory: JSON.stringify(inventory),
        equipment,
        trangBi: legacyEquipment,
        equip_slot: legacyEquipment,
        learnedSkills,
        equippedSkills,
        skills: equippedSkillDefinitions,
        derivedStats,
        combatPower: combat,
        tuViLinhCan: Number(player.tuViLinhCan || 0),
        unspentStatPoints: Number(player.unspentStatPoints ?? player.stats?.unspentPoints ?? 0),
      };
    },
  };
}

module.exports = { createCatalogService };
