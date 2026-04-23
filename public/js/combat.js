"use strict";
// ════════════════════════════════════════════════════════════
// combat.js — §8 Combat Module
// ════════════════════════════════════════════════════════════

const Combat = {
  // ── Hệ thống Vai Trò (Role) dựa trên thuộc tính ──
  getRole() {
    const s = S.player?.stats || { str: 5, agi: 5, vit: 5, ene: 5 };
    const { str, agi, vit, ene } = s;

    // Ưu tiên theo chỉ số cao nhất
    const max = Math.max(str, agi, vit, ene);

    if (str === max) return { id: "WARRIOR", name: "Chiến Binh", color: "#ff4444" };
    if (vit === max) return { id: "GLADIATOR", name: "Đấu Sĩ", color: "#ffaa44" };
    if (ene === max) return { id: "MAGE", name: "Pháp Sư", color: "#4488ff" };
    if (agi === max) return { id: "ASSASSIN", name: "Sát Thủ", color: "#44ffaa" };

    return { id: "NONE", name: "Tu Sĩ", color: "#ffffff" };
  },

  pAtk() {
    const s = S.player.stats;
    const role = Combat.getRole();
    let base = 10 + (s?.str || 0) * 1.8 + (s?.agi || 0) * 0.5;

    // Bonus Chiến Binh
    if (role.id === "WARRIOR") base *= 1.15;
    return Math.floor(base + Combat.weaponAttack());
  },

  mAtk() {
    const s = S.player.stats;
    const role = Combat.getRole();
    let base = 10 + (s?.ene || 0) * 1.8 + (s?.agi || 0) * 0.5;

    // Bonus Pháp Sư
    if (role.id === "MAGE") base *= 1.15;
    return Math.floor(base + Combat.weaponAttack());
  },

  pDef() {
    const s = S.player.stats;
    const role = Combat.getRole();
    let def = 2 + (s?.vit || 0) * 0.8 + (s?.agi || 0) * 0.4;

    // Bonus Đấu Sĩ
    if (role.id === "GLADIATOR") def *= 1.2;
    return Math.floor(def);
  },

  critChance() {
    const s = S.player.stats;
    const role = Combat.getRole();
    let chance = 0.05 + (s?.agi || 0) * 0.005;

    // Bonus Sát Thủ
    if (role.id === "ASSASSIN") chance += 0.1;

    if (S.player.equipment?.weapon) {
      chance += Number(S.player.equipment.weapon.critChance || 0);
    }
    return Math.min(0.5, chance);
  },

  evasion() {
    const s = S.player.stats;
    const role = Combat.getRole();
    let rate = 0.05 + (s?.agi || 0) * 0.01;

    // Bonus Sát Thủ & Pháp Sư (pháp sư bay nhảy)
    if (role.id === "ASSASSIN") rate += 0.1;
    if (role.id === "MAGE") rate += 0.05;

    const bonus = Number(S.player.equipment?.eva || 0);
    return Math.min(0.4, rate + bonus);
  },

  weaponAttack() {
    let bonus = 0;
    if (S.player.equipment?.weapon) {
      bonus += Number(S.player.equipment.weapon.atk || 0);
    }
    if (Array.isArray(S.player.inventory)) {
      for (const item of S.player.inventory) {
        if (item?.equipped && item.atk) bonus += Number(item.atk || 0);
      }
    }
    return bonus;
  },

  critMultiplier() {
    let extra = 0.1;
    if (S.player.equipment?.weapon) {
      extra += Number(S.player.equipment.weapon.critMultiplier || 0);
    }
    return extra;
  },

  attack(m) {
    if (S.atkCd > 0 || m.dead) return;
    const baseAtk = Combat.pAtk();
    const armorDef = (m.def || 0) + (m.vit || 0) * 0.2;
    let dmg = Math.max(1, Math.floor(baseAtk - armorDef + randInt(0, 6)));
    const isCrit = Math.random() < Combat.critChance();
    if (isCrit) {
      const critAdd = Math.max(1, Math.round(baseAtk * (0.5 + Combat.critMultiplier())));
      dmg += critAdd;
    }
    m.hp -= dmg;
    S.atkCd = CFG.ATK_CD;
    S.atkFx.push({ px: m.px, py: m.py, r: 14, life: 14 });
    Render.floatDmg(m.px, m.py, -26, (isCrit ? "CRIT! " : "") + dmg, isCrit ? "#ffff00" : "#ff6666");
    if (socket?.connected)
      socket.emit("attack_effect", {
        targetId: null,
        damage: dmg,
        mapCode: S.mapCode,
      });
    if (m.hp <= 0) {
      m.dead = true;
      m.respawnT = m.spawnCD;
      Combat.dropLoot(m);
    }
  },

  dropLoot(m) {
    if (Math.random() * 100 < m.tyLeRoiTien) {
      const xu = randInt(m.moneyDropFrom, m.moneyDropTo);
      S.player.xu += xu;
      UI.log(`Nhặt được ${xu} xu`, "loot");
    }
    if (Math.random() * 100 < m.tyLeRoiDo) {
      let index = Math.floor(Math.random() * m.dropItems.length);
      if (m.dropItems.length > 0) Inventory.add(m.dropItems[index]);
    }
  },
};

