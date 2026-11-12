// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/balance.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Cân bằng chiến đấu phía Client (Client Combat Formulas): Bản sao đồng bộ của src/data/balance.js bên BE (tutien_pixel_be)
//      phục vụ tính toán sát thương tức thời trên màn hình (Client Prediction), tính toán OVR lực chiến,
//      vòng tròn Tương Sinh (Kim -> Thủy -> Mộc -> Hỏa -> Thổ) và Tương Khắc (Kim -> Mộc -> Thổ -> Thủy -> Hỏa).
// 2. CẤU HÌNH LIÊN QUAN:
//    - GAME_BALANCE (stats, damage, affinity, polarity, special, progression).
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Đảm bảo hiển thị đúng số liệu sát thương dự tính và OVR lực chiến trên HUD người chơi
//      mà không cần liên tục gửi request hỏi server.
// ════════════════════════════════════════════════════════════════════════════════════════

"use strict";
const GAME_BALANCE = {
  stats: { str: { pAtk: 4 }, agi: { pAtk: 0.5, crit: 0.003, evasion: 0.004, speed: 0.25 }, vit: { pDef: 2, maxHp: 12 }, ene: { mAtk: 4, mDef: 1.5, maxMp: 8 } },
  base: { pAtk: 8, mAtk: 8, pDef: 3, mDef: 3, hp: 100, mp: 50 },
  death: { xuPerRealmStt: 20, maxXuLoss: 500 },
  damage: {
    defenseBase: 100,
    critMultiplier: 1.5,
    variance: 0.08,
    basicMultiplier: 0.5,
    basicStatScale: 0.5,
    skillMultiplier: 1.25,
    skillStatScale: 1.5,
    areaSecondaryMultiplier: 0.72,
  },
  affinity: { neutral: 1, advantage: 1.12, disadvantage: 0.94, generation: 0.98, generatedBy: 1.02, same: 0.92, strengthImpact: 0.08, min: 0.82, max: 1.18, critBonusWhenCounter: 0.02, critBonusStrengthImpact: 0.02, critBonusMax: 0.04 },
  generationCycle: ["KIM", "THUY", "MOC", "HOA", "THO"],
  controlCycle: ["KIM", "MOC", "THO", "THUY", "HOA"],
  polarity: { KIM: "YANG", MOC: "YIN", THUY: "YIN", HOA: "YANG", THO: "BALANCED", QUANG: "YANG", AM: "YIN", PHONG: "YANG", LOI: "YANG" },
  special: { QUANG: { AM: 1.1 }, AM: { QUANG: 0.9 }, LOI: { PHONG: 1.08 }, PHONG: { LOI: 0.92 } },
  progression: { realmWeight: 1000, stageWeight: 90, masteryWeight: 70, skillWeight: 18, linhCan: { itemCap: 1000, itemScale: 0.00008, maxItemBonus: 0.08, realmBonus: 0.012, stageBonus: 0.002, ovrItemWeight: 0.04 }, cultivation: { overcapOvrWeight: 180, maxOvercapOvr: 360, elementalPerCap: 0.04, maxElementalBonus: 0.08 } },
  itemTaxonomy: {
    rarities: {
      NORMAL: { key: "NORMAL", tier: 1, label: "Thường", color: "#e6edf3", glow: "NONE", maxExl: 0, sellMult: 1 },
      MAGIC: { key: "MAGIC", tier: 2, label: "Tinh Luyện", color: "#69b8ff", glow: "DEWDROP", maxExl: 1, sellMult: 1.35 },
      EXL: { key: "EXL", tier: 3, label: "Hoàn Hảo", color: "#5ef2a8", glow: "SHIMMER", maxExl: 3, sellMult: 2.0 },
      ANCIENT: { key: "ANCIENT", tier: 4, label: "Thần Khí", color: "#ffd369", glow: "MYTHIC_PRISM", maxExl: 4, sellMult: 3.0 },
    },
  },
  exlOptions: {
    DMG_PCT: { code: "DMG_PCT", group: "OFFENSE", label: "Sát thương +{val}%", val: 3 },
    EXL_CRIT_DMG: { code: "EXL_CRIT_DMG", group: "OFFENSE", label: "Đòn Hoàn Hảo +{val}%", val: 5 },
    HP_ON_KILL_PCT: { code: "HP_ON_KILL_PCT", group: "OFFENSE", label: "Hồi {val}% HP khi hạ quái", val: 3 },
    MP_ON_KILL_PCT: { code: "MP_ON_KILL_PCT", group: "OFFENSE", label: "Hồi {val}% MP khi hạ quái", val: 3 },
    ARMOR_PIERCE_PCT: { code: "ARMOR_PIERCE_PCT", group: "OFFENSE", label: "Xuyên giáp +{val}%", val: 5 },
    DMG_REDUCE_PCT: { code: "DMG_REDUCE_PCT", group: "DEFENSE", label: "Giảm sát thương -{val}%", val: 4 },
    REFLECT_PCT: { code: "REFLECT_PCT", group: "DEFENSE", label: "Phản sát thương {val}%", val: 4 },
    MAX_HP_PCT: { code: "MAX_HP_PCT", group: "DEFENSE", label: "Sinh lực tối đa +{val}%", val: 5 },
    EVASION_PCT: { code: "EVASION_PCT", group: "DEFENSE", label: "Né tránh +{val}%", val: 3 },
  },
  enhance: {
    maxLevel: 15,
    luckRateBonus: 0.15,
    luckSuccessBonus: 0.15,
    luckCombatCritBonus: 0.05,
    protectionItemCode: "CHARM_BAO_VE",
    broadcastMinLevel: 11,
  },
};

function enhanceStatMultiplier(level = 0) {
  const safe = Math.max(0, Math.min(15, Math.floor(Number(level) || 0)));
  if (safe <= 0) return 1;
  return 1 + safe * 0.08 + (safe >= 10 ? (safe - 9) * 0.04 : 0);
}

function readEquipmentStat(item, ...keys) {
  for (const key of keys) {
    const direct = Number(item?.[key]);
    if (Number.isFinite(direct) && direct !== 0) return direct;
    const nested = Number(item?.stats?.[key]);
    if (Number.isFinite(nested) && nested !== 0) return nested;
  }
  return 0;
}

function scaledEquipmentStats(item = {}) {
  const mult = enhanceStatMultiplier(item?.enhanceLevel || 0);
  const scaleInt = (value) => (value ? Math.round(value * mult) : 0);
  return {
    pAtk: scaleInt(readEquipmentStat(item, "pAtk")),
    mAtk: scaleInt(readEquipmentStat(item, "mAtk")),
    pDef: scaleInt(readEquipmentStat(item, "pDef")),
    mDef: scaleInt(readEquipmentStat(item, "mDef")),
    maxHp: scaleInt(readEquipmentStat(item, "maxHp", "maxHP")),
    maxMp: scaleInt(readEquipmentStat(item, "maxMp", "maxMP")),
    spd: scaleInt(readEquipmentStat(item, "spd")),
    str: scaleInt(readEquipmentStat(item, "str")),
    agi: scaleInt(readEquipmentStat(item, "agi")),
    vit: scaleInt(readEquipmentStat(item, "vit")),
    ene: scaleInt(readEquipmentStat(item, "ene")),
    crit: Number(readEquipmentStat(item, "crit")) || 0,
  };
}

function calcEquipmentSellPrice(baseSellPrice = 0, enhanceLevel = 0, rarity = "NORMAL") {
  const safeBase = Math.max(0, Math.floor(Number(baseSellPrice) || 0));
  if (safeBase <= 0) return 0;
  const lvl = Math.max(0, Math.min(15, Math.floor(Number(enhanceLevel) || 0)));
  const rarities = GAME_BALANCE.itemTaxonomy?.rarities || {};
  const rarityInfo = rarities[String(rarity || "NORMAL").toUpperCase()] || rarities.NORMAL || { sellMult: 1 };
  return Math.floor(safeBase * Number(rarityInfo.sellMult || 1) * (1 + lvl * 0.15));
}

function affinityMultiplier(attacker, defender, attackerStrength = 1, defenderStrength = 1) {
  return affinityProfile(attacker, defender, attackerStrength, defenderStrength).multiplier;
}

function affinityCritBonus(profile = {}) {
  if (profile.relation !== "khac") return 0;
  return Math.max(0, Math.min(GAME_BALANCE.affinity.critBonusMax, GAME_BALANCE.affinity.critBonusWhenCounter + Number(profile.strengthGap || 0) * GAME_BALANCE.affinity.critBonusStrengthImpact));
}

function elementalStrength(entity = {}) {
  const linhCan = GAME_BALANCE.progression.linhCan;
  const cultivation = Math.min(linhCan.maxItemBonus, Math.min(linhCan.itemCap, Math.max(0, Number(entity.tuViLinhCan || 0))) * linhCan.itemScale);
  const cap = Math.max(1, Number(entity.tuViLenCap || 1));
  const bodyLinhLuc = Math.min(GAME_BALANCE.progression.cultivation.maxElementalBonus, Math.max(0, Number(entity.tuViHienTai || 0)) / cap * GAME_BALANCE.progression.cultivation.elementalPerCap);
  const realm = Math.max(0, Number(entity.canhGioi?.stt || entity.realm || 1) - 1) * linhCan.realmBonus;
  const stage = Math.max(0, Number(entity.tangTuVi || entity.stage || 1) - 1) * linhCan.stageBonus;
  const level = Math.max(0, Number(entity.level || 1) - 1) * 0.06;
  return Math.max(1, 1 + cultivation + bodyLinhLuc + realm + stage + level);
}

function affinityProfile(attacker, defender, attackerStrength = 1, defenderStrength = 1) {
  const base = { attacker, defender, attackerPolarity: GAME_BALANCE.polarity[attacker] || "BALANCED", defenderPolarity: GAME_BALANCE.polarity[defender] || "BALANCED", relation: "neutral", pressure: null, multiplier: GAME_BALANCE.affinity.neutral, strengthGap: 0 };
  if (!attacker || !defender) return base;
  if (attacker === defender) return { ...base, relation: "dong_hanh", multiplier: GAME_BALANCE.affinity.same };
  const strengthGap = Math.max(-1, Math.min(1, (Number(attackerStrength || 1) - Number(defenderStrength || 1)) / Math.max(Number(attackerStrength || 1), Number(defenderStrength || 1), 1)));
  const adjust = (value) => Math.max(GAME_BALANCE.affinity.min, Math.min(GAME_BALANCE.affinity.max, value + strengthGap * GAME_BALANCE.affinity.strengthImpact));
  if (GAME_BALANCE.special[attacker]?.[defender]) return { ...base, relation: "dac_biet", multiplier: adjust(GAME_BALANCE.special[attacker][defender]), strengthGap };
  const generation = GAME_BALANCE.generationCycle;
  const control = GAME_BALANCE.controlCycle;
  const gi = generation.indexOf(attacker), gd = generation.indexOf(defender);
  const ci = control.indexOf(attacker), cd = control.indexOf(defender);
  if (ci >= 0 && cd >= 0) {
    if ((ci + 1) % control.length === cd) return { ...base, relation: "khac", multiplier: adjust(GAME_BALANCE.affinity.advantage), strengthGap };
    if ((ci + control.length - 1) % control.length === cd) return { ...base, relation: "bi_khac", multiplier: adjust(GAME_BALANCE.affinity.disadvantage), strengthGap };
  }
  if (gi >= 0 && gd >= 0) {
    if ((gi + 1) % generation.length === gd) return { ...base, relation: "sinh", multiplier: adjust(GAME_BALANCE.affinity.generation), strengthGap };
    if ((gi + generation.length - 1) % generation.length === gd) return { ...base, relation: "duoc_sinh", multiplier: adjust(GAME_BALANCE.affinity.generatedBy), strengthGap };
  }
  return base;
}

function deriveCombatStats(stats = {}, equipment = {}) {
  let maxHpPct = 0;
  let evasionPct = 0;
  const e = Object.values(equipment || {}).reduce((out, item) => {
    if (!item) return out;
    const scaled = scaledEquipmentStats(item);
    out.pAtk += scaled.pAtk;
    out.mAtk += scaled.mAtk;
    out.pDef += scaled.pDef;
    out.mDef += scaled.mDef;
    out.maxHP += scaled.maxHp;
    out.maxMP += scaled.maxMp;
    out.spd += scaled.spd;
    out.str += scaled.str;
    out.agi += scaled.agi;
    out.vit += scaled.vit;
    out.ene += scaled.ene;
    out.crit += scaled.crit + (item.hasLuck ? GAME_BALANCE.enhance.luckCombatCritBonus : 0);
    for (const opt of Array.isArray(item.exlOptions) ? item.exlOptions : []) {
      const code = String(opt?.code || "").toUpperCase();
      if (code === "MAX_HP_PCT") {
        maxHpPct += Math.max(0, Number(opt?.val || 5)) / 100;
      } else if (code === "EVASION_PCT") {
        evasionPct += Math.max(0, Number(opt?.val || 3)) / 100;
      }
    }
    return out;
  }, { pAtk: 0, mAtk: 0, pDef: 0, mDef: 0, maxHP: 0, maxMP: 0, spd: 0, str: 0, agi: 0, vit: 0, ene: 0, crit: 0 });
  const s = {
    str: (Number(stats.str) || 0) + e.str,
    agi: (Number(stats.agi) || 0) + e.agi,
    vit: (Number(stats.vit) || 0) + e.vit,
    ene: (Number(stats.ene) || 0) + e.ene,
  };
  const maxHp = Math.round((100 + s.vit * 12 + e.maxHP) * (1 + Math.min(0.6, maxHpPct)));
  return {
    pAtk: 8 + s.str * 4 + s.agi * 0.5 + e.pAtk,
    mAtk: 8 + s.ene * 4 + s.agi * 0.5 + e.mAtk,
    pDef: 3 + s.vit * 2 + s.agi * 0.25 + e.pDef,
    mDef: 3 + s.ene * 1.5 + s.vit * 0.25 + e.mDef,
    maxHp,
    maxMp: 50 + s.ene * 8 + e.maxMP,
    spd: e.spd,
    crit: Math.min(0.6, 0.05 + s.agi * 0.003 + e.crit),
    evasion: Math.min(0.45, 0.03 + s.agi * 0.004 + Math.min(0.25, evasionPct)),
  };
}

function combatStatPower(derived) {
  return derived.pAtk + derived.mAtk + (derived.pDef + derived.mDef) * 1.5 + derived.maxHp * 0.1 + derived.maxMp * 0.1;
}

function equipmentStatPower(equipment = {}) {
  return Object.values(equipment || {}).reduce((sum, item) => {
    if (!item) return sum;
    const baseStats = Object.values(item.stats || {}).reduce((n, value) => n + Number(value || 0), 0);
    const enhanceLevel = Math.max(0, Math.floor(Number(item.enhanceLevel || 0)));
    const exlBonus = (Array.isArray(item.exlOptions) ? item.exlOptions.length : 0) * 18;
    const luckBonus = item.hasLuck ? 12 : 0;
    return sum + Math.round(baseStats * enhanceStatMultiplier(enhanceLevel)) + enhanceLevel * 8 + exlBonus + luckBonus;
  }, 0);
}

function describeEquipment(item = {}) {
  const base = deriveCombatStats();
  const equipped = deriveCombatStats({}, { preview: item });
  const bonuses = {};
  for (const key of ["pAtk", "mAtk", "pDef", "mDef", "maxHp", "maxMp", "spd"]) {
    const delta = equipped[key] - base[key];
    if (delta !== 0) bonuses[key] = delta;
  }
  const appliedKeys = new Set(["pAtk", "mAtk", "pDef", "mDef", "maxHp", "maxHP", "maxMp", "maxMP", "spd"]);
  const mult = enhanceStatMultiplier(item?.enhanceLevel || 0);
  const ratingOnly = Object.fromEntries(
    Object.entries(item.stats || {})
      .filter(([key, value]) => !appliedKeys.has(key) && Number(value) !== 0)
      .map(([key, value]) => [key, key === "crit" ? Number(value) : Math.round(Number(value) * mult)]),
  );
  const combatOvr = combatStatPower(equipped) - combatStatPower(base);
  const itemOvr = equipmentStatPower({ preview: item });
  return {
    bonuses,
    ratingOnly,
    combatOvr,
    itemOvr,
    ovr: combatOvr + itemOvr,
    enhanceLevel: Math.max(0, Math.floor(Number(item?.enhanceLevel || 0))),
    rarity: String(item?.rarity || "NORMAL").toUpperCase(),
    hasLuck: Boolean(item?.hasLuck),
    exlOptions: Array.isArray(item?.exlOptions) ? item.exlOptions : [],
  };
}

function combatTier(entity = {}) {
  const realm = Math.max(1, Number(entity.canhGioi?.stt || entity.realm || 1));
  const stage = Math.max(1, Number(entity.tangTuVi || entity.stage || 1));
  return (realm - 1) * 9 + stage;
}

function monsterPressure(player = {}, monster = {}, derived = deriveCombatStats(player.stats, player.equipment)) {
  const levelGap = Math.max(-8, Math.min(12, Number(monster.level || 1) - combatTier(player)));
  const monsterThreat = Number(monster.atk || 0) * 1.8 + Number(monster.def || 0) * 1.2 + Number(monster.maxHp || monster.hp || 0) * 0.04;
  const playerThreat = Number(derived.pAtk || 0) * 0.9 + Number(derived.pDef || 0) * 0.8 + Number(derived.maxHp || 100) * 0.03;
  return Math.max(-0.35, Math.min(1.5, levelGap * 0.12 + (monsterThreat / Math.max(1, playerThreat) - 1) * 0.35));
}

function calcCombatPower(player = {}) {
  const d = deriveCombatStats(player.stats, player.equipment);
  const realm = Number(player.canhGioi?.stt || player.realm || 1), stage = Number(player.tangTuVi || player.stage || 1);
  const progression = GAME_BALANCE.progression;
  const mastery = Math.max(0, Math.min(1, Number(player.tuViHienTai || 0) / Math.max(1, Number(player.tuViLenCap || 1))));
  const cap = Math.max(1, Number(player.tuViLenCap || 1));
  const overflowRatio = Math.max(0, Number(player.tuViHienTai || 0) / cap - 1);
  const overflowPower = Math.min(GAME_BALANCE.progression.cultivation.maxOvercapOvr, overflowRatio * GAME_BALANCE.progression.cultivation.overcapOvrWeight);
  const statPower = d.pAtk + d.mAtk + (d.pDef + d.mDef) * 1.5 + d.maxHp * 0.1 + d.maxMp * 0.1;
  const equipmentPower = Object.values(player.equipment || {}).reduce((sum, item) => {
    if (!item) return sum;
    const baseStats = Object.values(item.stats || {}).reduce((n, value) => n + Number(value || 0), 0);
    const enhanceLevel = Math.max(0, Math.floor(Number(item.enhanceLevel || 0)));
    const exlBonus = (Array.isArray(item.exlOptions) ? item.exlOptions.length : 0) * 18;
    const luckBonus = item.hasLuck ? 12 : 0;
    return sum + Math.round(baseStats * enhanceStatMultiplier(enhanceLevel)) + enhanceLevel * 8 + exlBonus + luckBonus;
  }, 0);
  const skillPower = (player.learnedSkills || player.skills || []).length * GAME_BALANCE.progression.skillWeight;
  const linhCanPower = Math.min(GAME_BALANCE.progression.linhCan.itemCap * GAME_BALANCE.progression.linhCan.ovrItemWeight, Math.max(0, Number(player.tuViLinhCan || 0)) * GAME_BALANCE.progression.linhCan.ovrItemWeight);
  return Math.floor(realm * progression.realmWeight + stage * progression.stageWeight + mastery * progression.masteryWeight + overflowPower + statPower + equipmentPower + skillPower + linhCanPower);
}

function calcDeathXuPenalty(currentXu = 0, realmStt = 1) {
  const safeXu = Math.max(0, Math.floor(Number(currentXu) || 0));
  const safeRealmStt = Math.max(1, Math.floor(Number(realmStt) || 1));
  const rawFee = Math.min(GAME_BALANCE.death.maxXuLoss, GAME_BALANCE.death.xuPerRealmStt * safeRealmStt);
  return Math.min(safeXu, rawFee);
}

Object.assign(GAME_BALANCE, {
  enhanceStatMultiplier,
  scaledEquipmentStats,
  calcEquipmentSellPrice,
  deriveCombatStats,
  describeEquipment,
});
