"use strict";
// ════════════════════════════════════════════════════════════
// monster.js — §7 Monster AI
// ════════════════════════════════════════════════════════════

const Monster = {
  // Tạo quái vật từ template hoặc data server
  make(data, tx, ty, id = null) {
    const tmpl = data;
    const hp = data.hp || (tmpl.hp + randInt(0, Math.floor(tmpl.hp * 0.2)));
    return {
      ...tmpl,
      id: id || `mon_${Math.random().toString(36).substr(2, 9)}`, // ID duy nhất
      hp,
      maxHp: data.maxHp || hp,
      atk: tmpl.atk + randInt(0, 3),
      def: tmpl.def,
      px: tx * CFG.TS + CFG.TS / 2,
      py: ty * CFG.TS + CFG.TS / 2,
      hx: tx * CFG.TS + CFG.TS / 2,
      hy: ty * CFG.TS + CFG.TS / 2,
      state: data.state || "idle",
      tpx: tx * CFG.TS + CFG.TS / 2,
      tpy: ty * CFG.TS + CFG.TS / 2,
      moveTimer: randInt(60, 180),
      atkCd: 0,
      dead: data.dead || false,
      respawnT: data.spawnCD || 10,
      targetId: data.targetId || null,
    };
  },

  update(m, dt) {
    if (m.dead) {
      m.respawnT -= dt / 16;
      if (m.respawnT <= 0) Monster.respawn(m);
      return;
    }

    SkillSystem.updateMonsterStatus(m, dt);
    if (m.dead) return;

    const p = S.player;
    if (!p) return;

    // ── LOCAL AI (Luôn chạy để tránh đơ quái) ──
    const speedMult = SkillSystem.getSpeedMult(m);
    const tmpl = m;
    const speed = (tmpl.speed || 1) * (dt / 16) * speedMult;
    const dp = dist(m.px, m.py, p.px, p.py);
    const dh = dist(m.px, m.py, m.hx, m.hy);

    if (m.state === "idle" || m.state === "patrol") {
      if (dp < CFG.MON_AGGRO * CFG.TS) m.state = "chase";
      else {
        m.moveTimer -= dt / 16;
        if (m.moveTimer <= 0) {
          m.moveTimer = randInt(80, 220);
          if (m.state === "idle" && Math.random() < 0.45) {
            m.state = "patrol";
            Monster._patrol(m);
          } else m.state = "idle";
        }
      }
    }

    if (m.state === "chase") {
      if (dh > CFG.MON_LEASH * CFG.TS) {
        m.state = "return";
        m.tpx = m.hx;
        m.tpy = m.hy;
      } else {
        m.tpx = p.px;
        m.tpy = p.py;
      }
    }

    if (m.state === "return") {
      if (dh < CFG.TS) {
        m.state = "idle";
        m.tpx = m.hx;
        m.tpy = m.hy;
      }
      if (dp < CFG.MON_AGGRO * CFG.TS * 0.6) m.state = "chase";
    }

    Monster._moveTowardsTarget(m, speed);

    // Monster Attack Player
    if (dp < CFG.TS * 1.3 && m.state === "chase" && !SkillSystem.isFrozenOrStunned(m)) {
      m.atkCd -= dt / 16;
      if (m.atkCd <= 0) {
        m.atkCd = 65;
        Monster._performAttack(m, p);
      }
    }
  },

  _networkUpdate(m, dt) {
    if (m.tpx === undefined || isNaN(m.tpx)) return;
    const dx = m.tpx - m.px;
    const dy = m.tpy - m.py;
    const d = Math.hypot(dx, dy);
    if (d > 2) {
      const step = (m.speed || 1) * (dt / 16) * 1.5;
      m.px += (dx / d) * Math.min(d, step);
      m.py += (dy / d) * Math.min(d, step);
    }
  },

  _moveTowardsTarget(m, speed) {
    const tdx = m.tpx - m.px,
      tdy = m.tpy - m.py,
      td = Math.hypot(tdx, tdy);
    if (td > 3 && m.state !== "idle") {
      const vx = (tdx / td) * speed,
        vy = (tdy / td) * speed;
      const nx = m.px + vx,
        ny = m.py + vy;
      const ntx = Math.floor(nx / CFG.TS),
        nty = Math.floor(ny / CFG.TS),
        ctx2 = Math.floor(m.px / CFG.TS),
        cty2 = Math.floor(m.py / CFG.TS);

      if (!isSolid(ntx, nty)) {
        m.px = nx;
        m.py = ny;
      } else if (!isSolid(ntx, cty2)) {
        m.px = nx;
      } else if (!isSolid(ctx2, nty)) {
        m.py = ny;
      }
    }
  },

  _performAttack(m, p) {
    const weakenEff = m.statusEffects?.find((e) => e.type === "weaken");
    const weakenMult = weakenEff ? weakenEff.value : 1;
    if (Math.random() < Combat.evasion()) {
      Render.floatDmg(p.px, p.py, -36, "MISS", "#88ff88");
    } else {
      const dmg = Math.max(
        1,
        Math.floor((m.atk - Combat.pDef() + randInt(0, 3)) * weakenMult),
      );
      p.hp = Math.max(0, p.hp - dmg);
      Render.floatDmg(p.px, p.py, -36, "-" + dmg, "#ffaa44");
      if (p.hp <= 0) {
        p.hp = Math.floor(p.maxHp * 0.25);
        UI.log("⚠ Trọng thương! Hồi phục khẩn cấp...", "system");
      }
    }
  },

  respawn(m) {
    const tmpl = m;
    const hp = tmpl.hp + randInt(0, Math.floor(tmpl.hp * 0.2));
    m.hp = hp;
    m.maxHp = hp;
    m.atk = tmpl.atk + randInt(0, 3);
    m.def = tmpl.def;
    m.dead = false;
    m.state = "idle";
    m.atkCd = 0;
    m.px = m.hx;
    m.py = m.hy;
    m.tpx = m.hx;
    m.tpy = m.hy;
  },

  _patrol(m) {
    const r = randInt(2, 4) * CFG.TS,
      ang = Math.random() * Math.PI * 2;
    m.tpx = Math.max(
      CFG.TS,
      Math.min((S.mapW - 2) * CFG.TS, m.hx + Math.cos(ang) * r),
    );
    m.tpy = Math.max(
      CFG.TS,
      Math.min((S.mapH - 2) * CFG.TS, m.hy + Math.sin(ang) * r),
    );
  },
};
