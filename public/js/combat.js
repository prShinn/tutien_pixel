"use strict";
// ════════════════════════════════════════════════════════════
// combat.js — §8 Combat Module
// ════════════════════════════════════════════════════════════

const Combat = {
  pAtk() {
    const s = S.player.stats;
    const base =
      10 + Math.floor(s?.str || 0) * 1.5 + Math.floor(s?.agi || 0) * 0.8;
    return Math.floor(base + Combat.weaponAttack());
  },

  mAtk() {
    const s = S.player.stats;
    const base =
      10 + Math.floor(s?.ene || 0) * 1.5 + Math.floor(s?.agi || 0) * 0.8;
    const raw = Math.floor(base + Combat.weaponAttack());
    return Math.floor(raw * 1.05);
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

  critChance() {
    let chance = 0.05;
    if (S.player.equipment?.weapon) {
      chance += Number(S.player.equipment.weapon.critChance || 0);
    }
    if (S.player.stats.critChance) {
      chance += Number(S.player.stats.critChance || 0);
    }
    return Math.min(0.5, chance);
  },

  critMultiplier() {
    let extra = 0.1;
    if (S.player.equipment?.weapon) {
      extra += Number(S.player.equipment.weapon.critMultiplier || 0);
    }
    if (S.player.stats.critMultiplier) {
      extra += Number(S.player.stats.critMultiplier || 0);
    }
    return extra;
  },

  pDef() {
    const s = S.player.stats;
    return Math.floor(2 + (s?.vit || 0) * 0.3 + (s?.agi || 0) * 0.7);
  },

  evasion() {
    const s = S.player.stats;
    const agi = Math.max(0, Math.floor(s?.agi || 0));
    const bonus =
      Number(S.player.stats?.eva || 0) +
      Number(S.player.equipment?.eva || 0);
    const rate = 0.1 + agi * 0.02 + bonus;
    return Math.min(0.35, Math.max(0.001, rate));
  },

  attack(m) {
    if (S.atkCd > 0 || m.dead) return;
    const baseAtk = Combat.pAtk();
    const armorDef = (m.def || 0) + (m.vit || 0) * 0.2;
    let dmg = Math.max(1, Math.floor(baseAtk - armorDef + randInt(0, 6)));
    const isCrit = Math.random() < Combat.critChance();
    if (isCrit) {
      const critAdd = Math.max(1, Math.round(baseAtk * Combat.critMultiplier()));
      dmg += critAdd;
    }
    m.hp -= dmg;
    S.atkCd = CFG.ATK_CD;
    S.atkFx.push({ px: m.px, py: m.py, r: 14, life: 14 });
    Render.floatDmg(m.px, m.py, -26, "-" + dmg, "#ff6666");
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
      let index = Math.floor(Math.random() * m.dropItems.length - 1 + 1);
      if (m.dropItems.length > 0) Inventory.add(m.dropItems[index]);
    }
  },
};
