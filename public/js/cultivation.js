"use strict";
// ════════════════════════════════════════════════════════════
// cultivation.js — §9 Cultivation Module
// ════════════════════════════════════════════════════════════

const Cultivation = {
  normalizePlayerStats(player) {
    if (!player.stats) player.stats = { str: 0, agi: 0, vit: 0, ene: 0 };
    if (player.stats.int != null && player.stats.ene == null) {
      player.stats.ene = player.stats.int;
      delete player.stats.int;
    }
    player.stats.str = player.stats.str || 0;
    player.stats.agi = player.stats.agi || 0;
    player.stats.vit = player.stats.vit || 0;
    player.stats.ene = player.stats.ene || 0;
  },

  calcTuNeeded(canhGioi, tangTuVi) {
    const realm = Math.max(0, Number(canhGioi?.stt) || 0);
    const stage = Math.max(1, Math.min(9, Number(tangTuVi) || 1));
    const base = 10;
    const stageGrowth = Math.pow(1.1, stage - 1);
    const realmMultiplier = 1 + realm * 0.1 * stage;
    const extra = Number(canhGioi?.tuViTienCap || 1);
    return Math.floor(base * stage * stageGrowth * realmMultiplier + extra);
  },

  calcBreakthroughStatGain(canhGioi, tangTuVi, isMajor = false) {
    const tier = canhGioi?.stt || 0;
    const stage = tangTuVi;
    if (!isMajor) {
      return {
        str: Math.max(1, Math.round(2 + tier * 0.6 + stage * 0.35)),
        agi: Math.max(1, Math.round(2 + tier * 0.5 + stage * 0.3)),
        vit: Math.max(1, Math.round(2 + tier * 0.7 + stage * 0.4)),
        ene: Math.max(1, Math.round(1 + tier * 0.55 + stage * 0.25)),
      };
    }
    return {
      str: Math.max(3, Math.round(6 + tier * 1.4 + stage * 0.9)),
      agi: Math.max(3, Math.round(6 + tier * 1.2 + stage * 0.8)),
      vit: Math.max(3, Math.round(6 + tier * 1.6 + stage * 1.0)),
      ene: Math.max(3, Math.round(4 + tier * 1.3 + stage * 0.7)),
    };
  },

  applyBreakthroughStats(player, dotPhaDaiCanhGioi = false) {
    this.normalizePlayerStats(player);
    const gain = this.calcBreakthroughStatGain(
      player.canhGioi,
      player.tangTuVi,
      dotPhaDaiCanhGioi,
    );
    player.stats.str += gain.str;
    player.stats.agi += gain.agi;
    player.stats.vit += gain.vit;
    player.stats.ene += gain.ene;
    player.maxHp = 100 + player.stats.vit * 10;
    player.maxMp = 50 + player.stats.ene * 8;
    player.hp = Math.min(player.hp + gain.vit * 10, player.maxHp);
    player.mp = Math.min(player.mp + gain.ene * 8, player.maxMp);
    UI.log(
      `+${gain.str} STR +${gain.agi} AGI +${gain.vit} VIT +${gain.ene} ENE`,
      "level",
    );
  },

  absorbLinDan(idx) {
    const p = S.player;
    const item = S.inventory[idx];
    if (!item || item.type !== "LINDAN") return;
    this.normalizePlayerStats(p);
    if (item.linhCan === p.linhCan) {
      p.tuViLinhCan = (p.tuViLinhCan || 0) + item.tuViLinhCanVal;
      UI.log(
        `${item.icon} Hấp Thu ${item.name} → Tu Vi Linh Căn +${item.tuViLinhCanVal}`,
        "level",
      );
    } else {
      p.tuViLinhCan = (p.tuViLinhCan || 0) + 1;
      const statKeys = ["str", "agi", "vit", "ene"];
      const sk = statKeys[randInt(0, 3)];
      const sv = Math.max(1, Math.floor(item.tuViLinhCanVal * 0.3));
      p.stats[sk] = (p.stats[sk] || 0) + sv;
      p.maxHp = 100 + p.stats.vit * 10;
      p.maxMp = 50 + p.stats.ene * 8;
      UI.log(
        `${item.icon} Hấp Thu (khác hệ) → ${sk.toUpperCase()} +${sv}, Tu Vi Linh Căn +1`,
        "level",
      );
    }
    Inventory.remove(idx);
    UI.update();
  },

  absorbStone() {
    const p = S.player;
    const idx = S.inventory.findIndex(
      (i) => i.type === "STONE" || i.type === "ELEMSTONE",
    );
    if (idx < 0) {
      UI.log("Không có linh thạch!", "system");
      return;
    }
    const item = S.inventory[idx];
    this.normalizePlayerStats(p);
    p.tuViHienTai += item.giaTriTuVi;
    if (item.str) {
      p.stats.str += item.giaTriTang;
      UI.log(`${item.icon} Hấp thu → str +${item.giaTriTang}`, "level");
    }
    if (item.agi) {
      p.stats.agi += item.giaTriTang;
      UI.log(`${item.icon} Hấp thu → agi +${item.giaTriTang}`, "level");
    }
    if (item.vit) {
      p.stats.vit += item.giaTriTang;
      UI.log(`${item.icon} Hấp thu → vit +${item.giaTriTang}`, "level");
    }
    if (item.ene) {
      p.stats.ene += item.giaTriTang;
      UI.log(`${item.icon} Hấp thu → ene +${item.giaTriTang}`, "level");
    }
    if (!item.str && !item.agi && !item.vit && !item.ene) {
      UI.log(
        `${item.icon} Hấp thu ${item.name} → Tu Vi +${item.giaTriTuVi}`,
        "level",
      );
    }
    p.maxHp = 100 + p.stats.vit * 10;
    p.maxMp = 50 + p.stats.ene * 8;
    Inventory.remove(idx);
    UI.update();
  },

  async tryBreakthrough() {
    const p = S.player;
    if (p.tuViHienTai < p.tuViLenCap) {
      UI.log(
        `Tu vi chưa đủ! Cần ${Math.floor(p.tuViLenCap)}, có ${Math.floor(p.tuViHienTai)}`,
        "system",
      );
      return;
    }

    p.tuViHienTai -= p.tuViLenCap;
    if (p.tangTuVi < 9) {
      p.tangTuVi++;
      this.applyBreakthroughStats(p, false);
      UI.log(`⚡ Đột Phá ${p.tenCanhGioi} Tầng ${p.tangTuVi}!`, "level");
    } else {
      const res = await Net.get("/api/canh-gioi/" + (p.canhGioi.stt + 1));
      p.canhGioi = res;
      p.realm = res.stt || p.realm + 1;
      p.tangTuVi = 1;
      this.applyBreakthroughStats(p, true);
      UI.log(`🌟 THĂNG CẢNH GIỚI → ${res.tenCanhGioi} Tầng 1!`, "level");
      p.maCanhGioi = res.code;
    }
    p.tuViLenCap = Cultivation.calcTuNeeded(p.canhGioi, p.tangTuVi);
    S.player = { ...p };
    Net.saveNow({
      type: "breakthrough",
      data: { realm: p.realm, tangTuVi: p.tangTuVi },
    });
    UI.update();
  },
};
