const { DomainError } = require('../domain');

function createSkillVfxService({ store, catalog }) {
  async function list() {
    return { profiles: await store.listAdminSkillVfx() };
  }

  function normalize(input, fallbackCode) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DomainError('INVALID_PAYLOAD', 'Cấu hình VFX không hợp lệ');
    const profile = {
      skillCode: String(input.skillCode || fallbackCode || '').trim(),
      root: String(input.root || '').trim(),
      form: String(input.form || '').trim(),
      label: String(input.label || '').trim(),
      durationMs: Number(input.durationMs),
      colors: input.colors,
    };
    if (!profile.skillCode || !profile.root || !profile.form || !profile.label
        || !Number.isSafeInteger(profile.durationMs) || profile.durationMs < 50 || profile.durationMs > 30000
        || !profile.colors || !['main', 'light', 'dark', 'accent'].every((key) => typeof profile.colors[key] === 'string' && /^#[0-9a-f]{6}$/i.test(profile.colors[key]))) {
      throw new DomainError('INVALID_VFX_PROFILE', 'Profile cần skillCode, root, form, label, durationMs và đủ bốn màu hex');
    }
    return profile;
  }

  async function save(input, actorId, requestId, expectedCode) {
    const profile = normalize(input, expectedCode);
    if (expectedCode && profile.skillCode !== expectedCode) throw new DomainError('SKILL_CODE_MISMATCH', 'skillCode không khớp đường dẫn', 400);
    if (!catalog.listSkills().some((skill) => skill.code === profile.skillCode)) throw new DomainError('SKILL_NOT_FOUND', 'Kỹ năng không tồn tại trong catalog', 404);
    const saved = await store.mutateSkillVfx(actorId, profile.skillCode, profile, false, requestId);
    catalog.setSkillVfxProfile(profile.skillCode, saved);
    return { ok: true, profile: saved };
  }

  async function remove(skillCode, actorId, requestId) {
    const profiles = await store.listAdminSkillVfx();
    if (!profiles[skillCode]) throw new DomainError('SKILL_VFX_NOT_FOUND', 'Cấu hình VFX không tồn tại', 404);
    await store.mutateSkillVfx(actorId, skillCode, null, true, requestId);
    catalog.removeSkillVfxProfile(skillCode);
    return { ok: true, removed: skillCode };
  }

  return { list, create: (input, actorId, requestId) => save(input, actorId, requestId), update: (code, input, actorId, requestId) => save(input, actorId, requestId, code), remove };
}

module.exports = { createSkillVfxService };
