function updateMon(m, dt) {
  return;
  if (m.dead) {
    m.respawnT -= dt / 16;
    if (m.respawnT <= 0) {
      const T = CFG.MONSTERS[Math.min(4, ri(0, CFG.MONSTERS.length - 3))];
      const hp = T.hp + ri(0, Math.floor(T.hp * 0.2));
      Object.assign(m, {
        ti:
          CFG.MONSTERS.indexOf(T) >= 0
            ? CFG.MONSTERS.findIndex((tt) => tt === T)
            : m.ti,
        hp,
        maxHp: hp,
        atk: T.atk + ri(0, 3),
        def: T.def,
        dead: false,
        state: "idle",
        atkCd: 0,
        px: m.hx,
        py: m.hy,
        tpx: m.hx,
        tpy: m.hy,
        statusEffects: [],
      });
    }
    return;
  }
  //   StatusFX.tickMon(m, dt);
  if (m.statusEffects?.some((s) => s.id === "stun")) return; // stunned, skip move+attack

  const T = CFG.MONSTERS[m.ti];
  const spd = (T.spd || 1) * (dt / 16) * StatusFX.monSlowMult(m);
  const p = S.player;
  const dp = dist(m.px, m.py, p.px, p.py);
  const dh = dist(m.px, m.py, m.hx, m.hy);

  if (m.state === "idle" || m.state === "patrol") {
    if (dp < CFG.AGGRO) m.state = "chase";
    else {
      m.mvT -= dt / 16;
      if (m.mvT <= 0) {
        m.mvT = ri(80, 220);
        if (Math.random() < 0.4) {
          m.state = "patrol";
          const r = ri(2, 4) * CFG.TS,
            a = Math.random() * Math.PI * 2;
          m.tpx = Math.max(
            CFG.TS,
            Math.min((S.mapW - 2) * CFG.TS, m.hx + Math.cos(a) * r),
          );
          m.tpy = Math.max(
            CFG.TS,
            Math.min((S.mapH - 2) * CFG.TS, m.hy + Math.sin(a) * r),
          );
        } else m.state = "idle";
      }
    }
  }
  if (m.state === "chase") {
    if (dh > CFG.LEASH) {
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
    }
    if (dp < CFG.AGGRO * 0.6) m.state = "chase";
  }

  const tdx = m.tpx - m.px,
    tdy = m.tpy - m.py,
    td = Math.hypot(tdx, tdy);
  if (td > 3 && m.state !== "idle") {
    const vx = (tdx / td) * spd,
      vy = (tdy / td) * spd;
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

  if (dp < CFG.TS * 1.3 && m.state === "chase") {
    m.atkCd -= dt / 16;
    if (m.atkCd <= 0) {
      m.atkCd = T.boss ? 45 : 65;
      const dmg = Math.max(1, m.atk - CombatMod.pDef() + ri(0, 3));
      p.hp = Math.max(0, p.hp - dmg);
      Render.floatDmg(p.px, p.py, -36, "-" + dmg, "#ffaa44", "nm");
      // Monster applies status effect to player
      if (T.sfx?.length && Math.random() < 0.15)
        StatusFX.applyToPlayer(T.sfx[ri(0, T.sfx.length - 1)]);
      if (p.hp <= 0) {
        p.hp = Math.floor(p.maxHp * 0.25);
        S.combo = 0;
        G.log("⚠ Trọng thương! Combo reset.", "lcs");
      }
    }
  }
}
function makeMon(monster, tx, ty, elite) {
  const hp = Math.floor(
    (monster.hp + ri(0, Math.floor(monster.hp * 0.2))) *
      monster.level *
      (monster.isBoos > 0 ? 13 : 1),
  );
  return {
    monster,
    hp,
    maxHp: hp,
    atk: monster.atk + ri(0, 3),
    def: monster.def,
    px: tx * GameState.TS + GameState.TS / 2,
    py: ty * GameState.TS + GameState.TS / 2,
    hx: tx * GameState.TS + GameState.TS / 2,
    hy: ty * GameState.TS + GameState.TS / 2,
    state: "idle",
    tpx: tx * GameState.TS + GameState.TS / 2,
    tpy: ty * GameState.TS + GameState.TS / 2,
    mvT: ri(60, 180),
    atkCd: 0,
    dead: false,
    respawnT: 0,
    isElite: elite || false,
    statusEffects: [],
  };
}
