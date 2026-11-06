const { DomainError } = require('../domain');
const { validateRequestId } = require('../inventory/inventory-service');

function createSkillService({ store, catalog, players }) {
  async function learn(userId, input) {
    validateRequestId(input?.requestId);
    const skillCode = String(input?.skillCode || '').trim();
    const skill = catalog.listSkills().find((entry) => entry.code === skillCode);
    if (!skill) throw new DomainError('SKILL_NOT_FOUND', 'Kỹ năng không tồn tại', 404);
    const player = await players.snapshot(userId);
    if (skill.linhCan !== 'COMMON' && skill.linhCan !== player.linhCan) throw new DomainError('SKILL_ROOT_MISMATCH', 'Kỹ năng không thuộc linh căn nhân vật', 403);
    const requiredRealmStt = Math.max(1, Number(skill.tier || 1));
    const playerRealmStt = Number(player.canhGioi?.stt || 1);
    if (playerRealmStt < requiredRealmStt) throw new DomainError('REALM_TOO_LOW', 'Cảnh giới chưa đủ để lĩnh hội kỹ năng', 409);
    const mutation = await store.learnSkill(userId, input.requestId, skillCode, player.realmCode, player.linhCan, playerRealmStt, requiredRealmStt);
    const updatedPlayer = players.decorate(mutation.player);
    return { learnedSkills: mutation.result.learnedSkills, skill, combatPower: updatedPlayer.combatPower };
  }

  async function equip(userId, input) {
    validateRequestId(input?.requestId);
    if (!Array.isArray(input?.skillCodes) || input.skillCodes.length > 4
        || input.skillCodes.some((code) => typeof code !== 'string' || !code.trim())) {
      throw new DomainError('INVALID_SKILL_LOADOUT', 'Loadout chỉ nhận tối đa 4 mã kỹ năng hợp lệ');
    }
    const skillCodes = [...new Set(input.skillCodes.map((code) => code.trim()))];
    const skills = catalog.listSkills();
    const selected = skillCodes.map((code) => skills.find((skill) => skill.code === code));
    if (selected.some((skill) => !skill)) throw new DomainError('SKILL_NOT_FOUND', 'Kỹ năng không tồn tại', 404);
    if (selected.some((skill) => String(skill.category || 'ACTIVE').toUpperCase() === 'PASSIVE')) {
      throw new DomainError('PASSIVE_SKILL_NOT_EQUIPPABLE', 'Kỹ năng nội tại không nằm trong loadout chủ động', 409);
    }
    const mutation = await store.equipSkills(userId, input.requestId, skillCodes);
    return {
      equippedSkills: mutation.result.equippedSkills,
      skills: mutation.result.equippedSkills.map((code) => skills.find((skill) => skill.code === code)).filter(Boolean),
    };
  }

  return { learn, equip };
}

module.exports = { createSkillService };
