const SkillMod = {
  init() {
    const root = S.player.root.name;
    S.skills = CFG.SKILLS[root] || CFG.SKILLS.Kim;
    S.skillCds = S.skills.map(() => 0);
    if (!S.skillLvs || S.skillLvs.length !== 4) S.skillLvs = [0, 0, 0, 0];
    S.skillBufs = [];
    this.renderBar();
    this.renderLvlList();
  },

  scaled(sk, idx) {
    const lv = S.skillLvs[idx] || 0;
    return {
      ...sk,
      dmg: (sk.dmg || 0) * (1 + lv * 0.1),
      mp: Math.floor((sk.mp || 0) * (1 - lv * 0.05)),
      cd: Math.floor((sk.cd || 1) * (1 - lv * 0.08)),
      hp: sk.hp ? sk.hp * (1 + lv * 0.08) : undefined,
    };
  },

  use(idx) {
    const raw = S.skills[idx];
    if (!raw) return;
    if (StatusFX.isStunned()) {
      G.log("Đang bị Choáng!", "lcs");
      return;
    }
    const sk = this.scaled(raw, idx);
    if (S.skillCds[idx] > 0) {
      G.log(
        `${raw.n || raw.id} còn ${(S.skillCds[idx] / 60).toFixed(1)}s`,
        "lcs",
      );
      return;
    }
    const p = S.player;
    if (p.mp < sk.mp) {
      G.log(`Không đủ MP (cần ${sk.mp})`, "lcs");
      return;
    }
    p.mp -= sk.mp;
    S.skillCds[idx] = sk.cd;

    const eq = EqMod.calcStats();
    const sb = SectMod.getBuffs();
    const pb = PetMod.getBuffs();
    const pAtk2 = Math.floor(
      (10 + p.stats.str * 2 + eq.patk) *
        (1 + (sb.atkPct || 0)) *
        (1 + (pb.atkPct || 0)),
    );
    const mAtk2 = Math.floor(
      (5 + p.stats.int * 3 + eq.matk) * (1 + (sb.matkPct || 0)),
    );

    if (sk.tp === "heal") {
      const amt = Math.floor(p.maxHp * sk.hp);
      p.hp = Math.min(p.maxHp, p.hp + amt);
      Render.floatDmg(p.px, p.py, -40, "+" + amt, "#44ee44", "hl");
      G.log(`${raw.e || ""} ${raw.n || raw.id} — Hồi ${amt} HP`, "lck");
    } else if (sk.tp === "buff") {
      S.skillBufs.push({
        def: sk.bdef || 0,
        hp: sk.bhp || 0,
        dur: sk.bdur || 1,
        el: 0,
        n: raw.n || raw.id,
      });
      if (sk.bhp) p.hp = Math.min(p.maxHp, p.hp + sk.bhp);
      G.log(`${raw.e || ""} ${raw.n || raw.id} kích hoạt!`, "lck");
    } else {
      const atk = sk.tp === "magic" ? mAtk2 : pAtk2;
      let targets = [];
      if (sk.aoe > 0) {
        targets = monGrid.query(p.px, p.py, sk.aoe).filter((m) => !m.dead);
      } else {
        let best = null,
          bd = 6 * CFG.TS;
        const near = monGrid.query(p.px, p.py, 6 * CFG.TS);
        for (const m of near)
          if (!m.dead) {
            const d = dist(m.px, m.py, p.px, p.py);
            if (d < bd) {
              bd = d;
              best = m;
            }
          }
        if (best) targets = [best];
      }
      if (!targets.length) {
        G.log(`${raw.n || raw.id}: Không có mục tiêu!`, "lcs");
        return;
      }
      Render.castFx(p.px, p.py, p.root.c, sk.aoe || 50);
      let kills = 0;
      for (const m of targets) {
        const isCrit =
          Math.random() < CFG.CRIT_BASE + eq.crit / 100 + (sb.critFlat || 0);
        const comboMult = 1 + (S.combo >= 10 ? 0.15 : S.combo >= 5 ? 0.08 : 0);
        let dmg = Math.max(
          1,
          Math.floor(atk * sk.dmg * comboMult * (isCrit ? CFG.CRIT_MULT : 1)) -
            m.def,
        );
        m.hp -= dmg;
        S.atkFx.push({
          px: m.px,
          py: m.py,
          r: sk.aoe > 0 ? sk.aoe / 2 : 18,
          life: 16,
          c: p.root.c,
        });
        Render.floatDmg(
          m.px,
          m.py,
          -26,
          (isCrit ? "💥" : "") + dmg,
          isCrit ? "#ffdd44" : "#cc88ff",
          isCrit ? "cr" : "sk",
        );
        // Status effect from skill
        if (raw.sfx && Math.random() < 0.6) StatusFX.applyToMon(m, raw.sfx);
        // Lifesteal
        if (sk.lifesteal) {
          const ls = Math.floor(dmg * sk.lifesteal);
          p.hp = Math.min(p.maxHp, p.hp + ls);
          Render.floatDmg(p.px, p.py, -44, "+" + ls, "#44ee44", "hl");
        }
        if (m.hp <= 0) {
          m.dead = true;
          m.respawnT = CFG.RESPAWN;
          CombatMod.drop(m);
          kills++;
        }
      }
      CombatMod.addCombo(targets.length);
      G.log(
        `${raw.e || ""} ${raw.n || raw.id} — ${targets.length} mục tiêu`,
        "lck",
      );
      if (kills) G.log(`Tiêu diệt ${kills} kẻ thù!`, "lco");
    }
    S.atkCd = Math.floor(CFG.ATK_CD * 0.5);
    document.getElementById(`sk_${idx}`)?.classList.add("aon");
    setTimeout(
      () => document.getElementById(`sk_${idx}`)?.classList.remove("aon"),
      300,
    );
    S._uiDirty = true;
  },

  tick(dt) {
    const fps = dt / 16;
    for (let i = 0; i < S.skillCds.length; i++) {
      if (S.skillCds[i] > 0) {
        S.skillCds[i] = Math.max(0, S.skillCds[i] - fps);
        const sl = document.getElementById(`sk_${i}`);
        const cd = document.getElementById(`sk_cd_${i}`);
        const bar = document.getElementById(`sk_bar_${i}`);
        if (!sl) continue;
        const pct = 1 - S.skillCds[i] / S.skills[i].cd;
        if (S.skillCds[i] > 0) {
          sl.classList.add("ocd");
          if (cd) cd.textContent = (S.skillCds[i] / 60).toFixed(1) + "s";
          if (bar) bar.style.width = pct * 100 + "%";
        } else {
          sl.classList.remove("ocd");
          sl.classList.add("rdy");
          if (bar) bar.style.width = "100%";
          setTimeout(() => sl?.classList.remove("rdy"), 300);
        }
      }
    }
    for (let i = S.skillBufs.length - 1; i >= 0; i--) {
      S.skillBufs[i].el += fps;
      if (S.skillBufs[i].el >= S.skillBufs[i].dur) S.skillBufs.splice(i, 1);
    }
  },

  activeDef() {
    return S.skillBufs.reduce((a, b) => a + (b.def || 0), 0);
  },

  levelUp(idx) {
    const lv = S.skillLvs[idx] || 0;
    if (lv >= CFG.SKILL_MAX) {
      G.log("MAX!", "lcs");
      return;
    }
    const cost = CFG.SKILL_COST_BASE * (lv + 1) * (idx + 1);
    if (S.player.xu < cost) {
      G.log(`Cần ${cost} xu`, "lcs");
      return;
    }
    S.player.xu -= cost;
    S.skillLvs[idx]++;
    G.log(
      `✦ ${S.skills[idx].n || S.skills[idx].id} → Lv${S.skillLvs[idx] + 1}!`,
      "lcl",
    );
    this.renderBar();
    this.renderLvlList();
    S._uiDirty = true;
  },

  renderBar() {
    const el = document.getElementById("sk-slots");
    if (!el) return;
    el.innerHTML = "";
    S.skills.forEach((sk, i) => {
      const lv = S.skillLvs[i] || 0;
      const d = document.createElement("div");
      d.className = "sks";
      d.id = `sk_${i}`;
      d.innerHTML = `<span class="ske">${i + 1}</span><span class="sem">${sk.e || "✦"}</span><span class="skn">${sk.n || sk.id}</span>${lv > 0 ? `<span class="slv">L${lv + 1}</span>` : ""}
        <div class="scd" id="sk_cd_${i}"></div><div class="skb" id="sk_bar_${i}" style="width:0%"></div>`;
      d.onclick = () => SkillMod.use(i);
      d.title = `${sk.n || sk.id} [Lv${lv + 1}]\n${sk.dc || ""}\nMP:${Math.floor(sk.mp * (1 - lv * 0.05))} CD:${((sk.cd * (1 - lv * 0.08)) / 60).toFixed(1)}s`;
      el.appendChild(d);
    });
  },

  renderLvlList() {
    const el = document.getElementById("sk-lvl-list");
    if (!el || !S.skills) return;
    el.innerHTML = S.skills
      .map((sk, i) => {
        const lv = S.skillLvs[i] || 0;
        const maxed = lv >= CFG.SKILL_MAX;
        const cost = CFG.SKILL_COST_BASE * (lv + 1) * (i + 1);
        let pips = "";
        for (let p = 0; p < CFG.SKILL_MAX; p++)
          pips += `<div style="display:inline-block;width:12px;height:5px;background:${p < lv ? "var(--gold)" : "#111"};border:1px solid var(--bd);margin-right:1px"></div>`;
        return `<div style="background:#050510;border:1px solid var(--bd);padding:5px 6px;margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px">
          <span style="font-size:13px">${sk.e || "✦"}</span><span style="font-size:10px;color:var(--gold)">${sk.n || sk.id}</span>
          <span style="font-size:9px;color:${maxed ? "#ff8800" : "var(--txt2)"};margin-left:auto">L${lv + 1}${maxed ? " MAX" : ""}</span>
        </div>
        <div style="margin-bottom:3px">${pips}</div>
        ${!maxed ? `<div style="font-size:9px;color:var(--txt2)">${cost} xu → DMG+10%,CD-8%</div><button class="mb2" style="margin-top:3px;font-size:9px;padding:2px 7px" onclick="SkillMod.levelUp(${i})">⬆ Nâng Cấp</button>` : ""}
      </div>`;
      })
      .join("");
  },
};
