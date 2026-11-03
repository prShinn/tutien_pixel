"use strict";

const fs = require("node:fs");
const { isKnownSkillCode, normalizeSkillVfxProfile } = require("./skill-vfx-profile");

class SkillVfxProfileStore {
  constructor(filename) {
    this.filename = filename;
    this.profiles = this.load();
    this.mutationQueue = Promise.resolve();
  }

  load() {
    if (!fs.existsSync(this.filename)) return {};
    try {
      const saved = JSON.parse(fs.readFileSync(this.filename, "utf8"));
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
      return Object.fromEntries(Object.entries(saved).flatMap(([code, input]) => {
        const result = normalizeSkillVfxProfile(code, input);
        return result.ok ? [[code, result.profile]] : [];
      }));
    } catch (error) {
      console.error("Cannot load skill VFX profiles:", error.message);
      return {};
    }
  }

  list() {
    return JSON.parse(JSON.stringify(this.profiles));
  }

  create(input = {}) {
    const validation = normalizeSkillVfxProfile(input.skillCode, input);
    if (!validation.ok) return Promise.resolve(this.validationError(validation));
    return this.mutate((profiles) => {
      const { skillCode } = validation.profile;
      if (profiles[skillCode]) return { ok: false, status: 409, code: "PROFILE_EXISTS", message: "Skill đã có cấu hình tùy chỉnh" };
      profiles[skillCode] = validation.profile;
      return { ok: true, profile: validation.profile };
    });
  }

  update(skillCode, input = {}) {
    const validation = normalizeSkillVfxProfile(skillCode, input);
    if (!validation.ok) return Promise.resolve(this.validationError(validation));
    return this.mutate((profiles) => {
      if (!profiles[validation.profile.skillCode]) return { ok: false, status: 404, code: "PROFILE_NOT_FOUND", message: "Chưa có cấu hình tùy chỉnh cho skill" };
      profiles[validation.profile.skillCode] = validation.profile;
      return { ok: true, profile: validation.profile };
    });
  }

  remove(skillCode) {
    const code = String(skillCode || "");
    if (!isKnownSkillCode(code)) return Promise.resolve(this.validationError({ code: "SKILL_NOT_FOUND", message: "Skill không tồn tại trong danh mục" }));
    return this.mutate((profiles) => {
      if (!profiles[code]) return { ok: false, status: 404, code: "PROFILE_NOT_FOUND", message: "Chưa có cấu hình tùy chỉnh cho skill" };
      delete profiles[code];
      return { ok: true, removed: code };
    });
  }

  validationError(validation) {
    return {
      ok: false,
      status: validation.code === "SKILL_NOT_FOUND" ? 404 : 400,
      code: validation.code,
      message: validation.message,
    };
  }

  mutate(mutateProfiles) {
    const operation = this.mutationQueue.then(async () => {
      const next = { ...this.profiles };
      const result = mutateProfiles(next);
      if (!result.ok) return result;
      const tempFile = `${this.filename}.tmp`;
      await fs.promises.writeFile(tempFile, JSON.stringify(next, null, 2), "utf8");
      try {
        await fs.promises.rename(tempFile, this.filename);
      } catch (error) {
        await fs.promises.rm(tempFile, { force: true }).catch(() => {});
        throw error;
      }
      this.profiles = next;
      return result;
    });
    this.mutationQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }
}

module.exports = SkillVfxProfileStore;
