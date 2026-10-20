// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/combat.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Hệ thống chiến đấu cơ bản (Combat Core): Xác định vai trò (Role: Chiến Binh, Thích Khách,
//      Pháp Sư, Hộ Vệ), tính toán công/thủ vật lý & phép, tỉ lệ né đòn, bạo kích (Crit),
//      xử lý đòn đánh thường (Basic Attack), tạo hiệu ứng trúng đòn và gửi lệnh đánh lên server.
// 2. CẤU HÌNH LIÊN QUAN:
//    - CFG.BASIC_ATTACK_RANGE, CFG.BASE_ATK_CD, CFG.COMBAT_GCD.
//    - Phụ thuộc: State (S), Net, Render, UI.
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Tích hợp kiểm tra cự ly đánh, âm thanh/hình ảnh chém kiếm, số nhảy sát thương,
//      đảm bảo đồng bộ kết quả chiến đấu với server-authoritative khi online.
// ════════════════════════════════════════════════════════════════════════════════════════

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
    let base = GAME_BALANCE.base.pAtk + (s?.str || 0) * 4 + (s?.agi || 0) * 0.5;

    // Bonus Chiến Binh
    if (role.id === "WARRIOR") base *= 1.0;
    return Math.floor(base + Combat.weaponAttack());
  },

  mAtk() {
    const s = S.player.stats;
    const role = Combat.getRole();
    let base = GAME_BALANCE.base.mAtk + (s?.ene || 0) * 4 + (s?.agi || 0) * 0.5;

    // Bonus Pháp Sư
    if (role.id === "MAGE") base *= 1.0;
    return Math.floor(base + Combat.weaponAttack());
  },

  pDef() {
    const s = S.player.stats;
    const role = Combat.getRole();
    let def = GAME_BALANCE.base.pDef + (Number(s?.vit) || 0) * 2 + (Number(s?.agi) || 0) * 0.25;

    // Bonus Đấu Sĩ
    if (role.id === "GLADIATOR") def *= 1.0;
    return Math.floor(def);
  },

  critChance(target = null) {
    const s = S.player.stats;
    const role = Combat.getRole();
    let chance = 0.05 + (s?.agi || 0) * 0.003;

    // Bonus Sát Thủ
    if (role.id === "ASSASSIN") chance += 0.1;

    if (S.player.equipment?.weapon) {
      chance += Number(S.player.equipment.weapon.critChance || 0);
    }
    const critBuff = S.player.buffs?.buff_crit || S.player.buffs?.crit;
    if (critBuff && (!critBuff.expiresAt || critBuff.expiresAt > Date.now())) chance += Number(critBuff.value || 0) / 100;
    if (target) {
      const targetElement = target.linhCan || target.element || target.nguHanh?.[0];
      chance += affinityCritBonus(affinityProfile(S.player.linhCan, targetElement, elementalStrength(S.player), elementalStrength(target)));
    }
    return Math.min(0.75, chance);
  },

  evasion() {
    const s = S.player.stats;
    const role = Combat.getRole();
    let rate = 0.03 + (s?.agi || 0) * 0.004;

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
    if (S.atkCd > 0 || S.combatGcd > 0 || S.combatPending || m.dead) return;
    const inRange = dist(m.px, m.py, S.player.px, S.player.py) <= CFG.BASIC_ATTACK_RANGE * CFG.TS + (CFG.ATTACK_RANGE_PADDING || 0);
    // Online: không dùng vị trí nội suy client để chặn request. Server kiểm tra
    // khoảng cách authoritative; nếu không hợp lệ sẽ trả action_error.
    if (!socket?.connected && !inRange) {
      UI.log("Mục tiêu ngoài tầm đánh thường.", "system");
      return;
    }
    if (S.player) { S.player.animState = "attack"; S.player.animUntil = Date.now() + 360; }
    if (socket?.connected) {
      S.combatPending = true;
      Net.command("combat.attack", { targetId: m.id, mapId: S.mapCode });
      return;
    }
    const baseAtk = Combat.pAtk();
    const armorDef = (Number(m.def) || 0) + (Number(m.vit) || 0) * 0.2;
    const basicStat = Number(S.player.stats?.str || 0) * GAME_BALANCE.damage.basicStatScale;
    const attackBuff = S.player.buffs?.buff_atk || S.player.buffs?.atk;
    const attackBuffActive = attackBuff && (!attackBuff.expiresAt || attackBuff.expiresAt > Date.now()) ? Number(attackBuff.value || 0) : 0;
    const handMultiplier = 1 + Math.max(0, attackBuffActive) / 100;
    let dmg = Math.max(1, Math.floor(((baseAtk * GAME_BALANCE.damage.basicMultiplier + basicStat) * handMultiplier) * 100 / (100 + Math.max(0, armorDef)) + randInt(0, 2)));
    const isCrit = Math.random() < Combat.critChance(m);
    if (isCrit) {
      const critAdd = Math.max(1, Math.round(baseAtk * (0.5 + Combat.critMultiplier())));
      dmg += critAdd;
    }
    m.hitUntil = Date.now() + 180;
    Render.floatDmg(m.px, m.py, -26, (isCrit ? "CRIT! " : "") + dmg, isCrit ? "#fff06a" : "#ff5555", isCrit);
    
    S.atkCd = CFG.ATK_CD;

    m.hp -= dmg;
    if (m.hp <= 0) {
      m.dead = true;
      m.respawnT = m.spawnCD || 10;
      Combat.dropLoot(m);
    }

    if (socket?.connected)
      socket.emit("attack_effect", {
        targetId: m.id,
        damage: dmg,
        isMonster: true,
        mapCode: S.mapCode,
      });
  },

  attackTarget() {
    const target = S.target;
    if (!target || target.dead) return UI.log("Chưa chọn mục tiêu.", "system");
    const range = CFG.BASIC_ATTACK_RANGE * CFG.TS + (CFG.ATTACK_RANGE_PADDING || 0);
    if (dist(target.px, target.py, S.player.px, S.player.py) > range) {
      S.player.targetMovePos = null;
      S.player.combatMove = true;
      UI.log("Đang áp sát mục tiêu…", "system");
      return;
    }
    this.attack(target);
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
