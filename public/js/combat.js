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
  hasClearShot(player, target) {
    const dx = (target.px - CFG.TS / 2) / CFG.TS - player.x;
    const dy = (target.py - CFG.TS / 2) / CFG.TS - player.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.25));
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      if (isSolid(Math.floor(player.x + dx * ratio), Math.floor(player.y + dy * ratio))) return false;
    }
    return true;
  },

  canReachWithBasic(player, target, range = this.basicRange(player)) {
    if (dist(player.px, player.py, target.px, target.py) > range) return false;
    const style = player.equipment?.weapon?.basicAttack?.style;
    return !["staff", "spear", "bow", "crossbow"].includes(style) || this.hasClearShot(player, target);
  },

  basicRange(player = S.player) {
    const range = player?.equipment?.weapon?.basicAttack?.range;
    return Number.isFinite(range) && range > 0
      ? range
      : CFG.BASIC_ATTACK_RANGE * CFG.TS + (CFG.ATTACK_RANGE_PADDING || 0);
  },
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
    if (Number.isFinite(Number(S.player?.derivedStats?.pAtk))) {
      return Math.floor(Number(S.player.derivedStats.pAtk));
    }
    const s = S.player.stats;
    const role = Combat.getRole();
    let base = GAME_BALANCE.base.pAtk + (s?.str || 0) * 4 + (s?.agi || 0) * 0.5;

    // Bonus Chiến Binh
    if (role.id === "WARRIOR") base *= 1.0;
    return Math.floor(base + Combat.weaponAttack());
  },

  mAtk() {
    if (Number.isFinite(Number(S.player?.derivedStats?.mAtk))) {
      return Math.floor(Number(S.player.derivedStats.mAtk));
    }
    const s = S.player.stats;
    const role = Combat.getRole();
    let base = GAME_BALANCE.base.mAtk + (s?.ene || 0) * 4 + (s?.agi || 0) * 0.5;

    // Bonus Pháp Sư
    if (role.id === "MAGE") base *= 1.0;
    return Math.floor(base + Combat.weaponAttack());
  },

  pDef() {
    if (Number.isFinite(Number(S.player?.derivedStats?.pDef))) {
      return Math.floor(Number(S.player.derivedStats.pDef));
    }
    const s = S.player.stats;
    const role = Combat.getRole();
    let def = GAME_BALANCE.base.pDef + (Number(s?.vit) || 0) * 2 + (Number(s?.agi) || 0) * 0.25;

    // Bonus Đấu Sĩ
    if (role.id === "GLADIATOR") def *= 1.0;
    return Math.floor(def);
  },

  critChance(target = null) {
    const derivedCrit = Number(S.player?.derivedStats?.crit);
    let chance;
    if (Number.isFinite(derivedCrit)) {
      chance = derivedCrit;
    } else {
      const s = S.player.stats;
      const role = Combat.getRole();
      chance = 0.05 + (s?.agi || 0) * 0.003;
      // Bonus Sát Thủ
      if (role.id === "ASSASSIN") chance += 0.1;
      if (S.player.equipment?.weapon) {
        chance += Number(S.player.equipment.weapon.critChance || 0);
      }
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
    if (Number.isFinite(Number(S.player?.derivedStats?.evasion))) {
      return Number(S.player.derivedStats.evasion);
    }
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
    if (!socket?.connected || !Net._isOnline) return;
    if (!S.player || S.player.dead || S.atkCd > 0 || S.combatGcd > 0 || S.combatPending || m.dead) return;
    const inRange = this.canReachWithBasic(S.player, m);
    // Online: không dùng vị trí nội suy client để chặn request. Server kiểm tra
    // khoảng cách authoritative; nếu không hợp lệ sẽ trả action_error.
    if (!socket?.connected && !inRange) {
      UI.log("Mục tiêu ngoài tầm đánh thường.", "system");
      return;
    }
    if (S.player) {
      S.player.animStartedAt = Date.now();
      S.player.animState = "attack";
      S.player.animUntil = S.player.animStartedAt + 360;
      if (typeof Sound !== "undefined") Sound.play("attack");
    }
    if (socket?.connected) {
      S.combatPending = true;
      Net.command("combat.attack", { targetId: m.id, mapCode: S.mapCode });
      return;
    }
    const baseAtk = Combat.pAtk();
    const threat = monsterPressure(S.player, m);
    if (Math.random() < Math.min(0.32, Math.max(0, threat) * 0.16)) {
      if (typeof SkillVFX !== "undefined") SkillVFX.basicAttack(S.player, m, { miss: true });
      else Render.combatFx(m.px, m.py, "miss", "#a8ff8a", 0.7);
      Render.floatDmg(m.px, m.py, -26, "MISS", "#88ff88");
      if (typeof Sound !== "undefined") Sound.play("miss");
      S.atkCd = CFG.ATK_CD;
      return;
    }
    const armorDef = (Number(m.def) || 0) + (Number(m.vit) || 0) * 0.2 + Math.max(0, threat) * 40;
    const basicStat = Number(S.player.stats?.str || 0) * GAME_BALANCE.damage.basicStatScale;
    const attackBuff = S.player.buffs?.buff_atk || S.player.buffs?.atk;
    const attackBuffActive = attackBuff && (!attackBuff.expiresAt || attackBuff.expiresAt > Date.now()) ? Number(attackBuff.value || 0) : 0;
    const handMultiplier = 1 + Math.max(0, attackBuffActive) / 100;
    const pressureScale = Math.max(0.42, 1 - Math.max(0, threat) * 0.18);
    let dmg = Math.max(1, Math.floor((((baseAtk * GAME_BALANCE.damage.basicMultiplier + basicStat) * handMultiplier) * pressureScale) * 100 / (100 + Math.max(0, armorDef)) + randInt(0, 2)));
    const isCrit = Math.random() < Combat.critChance(m);
    if (isCrit) {
      const critAdd = Math.max(1, Math.round(baseAtk * (0.5 + Combat.critMultiplier())));
      dmg += critAdd;
    }
    m.hitUntil = Date.now() + 180;
    if (typeof Sound !== "undefined") Sound.play(isCrit ? "crit" : "hit", { isCrit });
    if (typeof SkillVFX !== "undefined") SkillVFX.basicAttack(S.player, m, { critical: isCrit });
    else Render.combatFx(m.px, m.py, isCrit ? "crit" : "hit", isCrit ? "#fff06a" : "#ff765c", isCrit ? 1.25 : 1);
    Render.floatDmg(m.px, m.py, -26, (isCrit ? "CRIT! " : "") + dmg, isCrit ? "#fff06a" : "#ff5555", isCrit);
    
    S.atkCd = CFG.ATK_CD;

    m.hp -= dmg;
    if (m.hp <= 0) {
      m.dead = true;
      m.respawnT = m.spawnCD || 10;
      Combat.dropLoot(m);
    }

  },

  attackTarget() {
    const target = S.target;
    if (!target || target.dead) return UI.log("Chưa chọn mục tiêu.", "system");
    const range = this.basicRange();
    if (dist(target.px, target.py, S.player.px, S.player.py) > range) {
      World.cancelPlayerMove(S.player);
      S.player.combatMove = false;
      S.player._spaceApproachTargetId = target.id;
      UI.log("Đang áp sát mục tiêu…", "system");
      return;
    }
    this.attack(target);
  },

  dropLoot(m) {
    if (API.REAL_BACKEND_ONLY) return;
    if ((!API.REAL_BACKEND_ONLY && typeof MockBackend !== "undefined" && MockBackend?.enabled)) {
      const tileX = Math.floor(Number(m.px) / CFG.TS);
      const tileY = Math.floor(Number(m.py) / CFG.TS);
      const drops = [];
      if (Math.random() < Number(m.moneyDropChance ?? 0.65)) {
        const from = Math.max(0, Math.floor(Number(m.moneyDropFrom ?? 2)));
        const to = Math.max(from, Math.floor(Number(m.moneyDropTo ?? 8)));
        const xu = randInt(from, to);
        if (xu > 0) drops.push({ id: `mock-xu-${m.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind: "xu", xu, x: tileX, y: tileY });
      }
      for (const entry of (Array.isArray(m.dropTable) ? m.dropTable : [])) {
        const chance = Math.max(0, Math.min(1, Number(entry.chance) || 0));
        if (!entry.item || Math.random() >= chance) continue;
        const min = Math.max(1, Math.floor(Number(entry.min) || 1));
        const max = Math.max(min, Math.floor(Number(entry.max) || min));
        const count = randInt(min, max);
        drops.push({
          id: `mock-item-${m.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          kind: "item", item: { ...entry.item }, count, x: tileX, y: tileY,
        });
      }
      S.groundItems.push(...drops);
      void MockBackend.recordQuestEvent("monster_kill", { monsterId: m.id });
      if (drops.length) UI.notify(`Quái vật rơi ${drops.length} vật phẩm.`, "success");
      return;
    }
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
