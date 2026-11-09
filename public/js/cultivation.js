// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/cultivation.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Hệ thống tu luyện & cảnh giới (Cultivation & Progression): Quản lý tích lũy tu vi,
//      hấp thụ đá tu vi (Linh Thạch / Huyết Ngọc), tiến cấp tầng tu vi (1-9), đột phá đại cảnh giới
//      (Luyện Khí -> Trúc Cơ -> Kim Đan...), tăng điểm tiềm năng thuộc tính.
// 2. CẤU HÌNH LIÊN QUAN:
//    - CFG.REALMS, CANH_GIOI.
//    - Phụ thuộc: State (S), Net, UI, Render.
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Chuẩn hóa thuộc tính (str, agi, vit, ene), tính toán tỉ lệ đột phá thành công / thất bại,
//      đồng bộ trạng thái thăng cấp với REST API /api/cultivation/absorb và breakthrough.
// ════════════════════════════════════════════════════════════════════════════════════════

const Cultivation = {
  _pendingStatAllocations: new Set(),

  async allocateStat(stat) {
    if (!authToken) return UI.notify("Hãy đăng nhập BE.", "warning");
    const player = S.player;
    const statKey = String(stat || "").toLowerCase();
    if (!player || !["str", "agi", "vit", "ene"].includes(statKey)) return;
    if (player.dead) return UI.notify("Không thể phân bổ thuộc tính khi đang trọng thương.", "warning");
    if (Number(player.unspentStatPoints || 0) < 1) return UI.notify("Bạn không còn điểm tiềm năng.", "warning");
    if (this._pendingStatAllocations.size) return;

    this._pendingStatAllocations.add(statKey);
    UI.update();
    try {
      if (authToken) {
        const response = await Net.mutate("POST", API.PATHS.player.allocateStats, { stat: statKey, amount: 1 });
        if (!response?.player) throw new Error(response?.error || "Máy chủ không trả về nhân vật mới.");
        Net.applyPlayerSnapshot(response.player, { render: false });
      } else {
        this.normalizePlayerStats(player);
        player.stats[statKey] += 1;
        player.unspentStatPoints = Math.max(0, Number(player.unspentStatPoints || 0) - 1);
        player.maxHp = GAME_BALANCE.base.hp + player.stats.vit * GAME_BALANCE.stats.vit.maxHp;
        player.maxMp = GAME_BALANCE.base.mp + player.stats.ene * GAME_BALANCE.stats.ene.maxMp;
        player.hp = Math.min(Number(player.hp || 0), player.maxHp);
        player.mp = Math.min(Number(player.mp || 0), player.maxMp);
      }
      UI.update();
      UI.notify(`Đã cộng 1 điểm ${statKey.toUpperCase()}.`, "success");
    } catch (error) {
      UI.notify(error.message || "Không thể phân bổ điểm thuộc tính.", "error");
    } finally {
      this._pendingStatAllocations.delete(statKey);
      UI.update();
    }
  },

  showBreakthroughEffect(major) {
    const player = S.player;
    if (!player) return;
    const realm = player.tenCanhGioi || player.canhGioi?.tenCanhGioi || "Cảnh Giới Mới";
    const label = major ? `THĂNG CẢNH GIỚI · ${realm}` : `ĐỘT PHÁ TẦNG ${player.tangTuVi}`;
    Render.breakthroughEffect?.(player.px, player.py, label);
    S.cameraShake = { until: Date.now() + 200, power: 3 };
  },

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
    const realm = Math.max(1, Number(canhGioi?.stt) || 1);
    const stage = Math.max(1, Math.min(Number(canhGioi?.soTang || 9), Number(tangTuVi) || 1));
    return Math.floor(1000 * Math.pow(1.24, (realm - 1) * 10 + stage - 1));
  },

  calcBreakthroughThreshold(canhGioi, tangTuVi) {
    const normal = this.calcTuNeeded(canhGioi, tangTuVi);
    return Math.floor(normal * (Number(tangTuVi) >= Number(canhGioi?.soTang || 9) ? 1.5 : 1));
  },

  calcBreakthroughStatGain(canhGioi, tangTuVi, isMajor = false) {
    const tier = canhGioi?.stt || 0;
    const stage = tangTuVi;
    const budget = (isMajor ? 10 : 4) + Math.floor(tier * 0.75) + Math.floor(stage * 0.25);
    const base = Math.floor(budget / 4);
    const remainder = budget % 4;
    return { str: base + (remainder > 0 ? 1 : 0), agi: base + (remainder > 1 ? 1 : 0), vit: base + (remainder > 2 ? 1 : 0), ene: base };
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
    player.maxHp = GAME_BALANCE.base.hp + player.stats.vit * GAME_BALANCE.stats.vit.maxHp;
    player.maxMp = GAME_BALANCE.base.mp + player.stats.ene * GAME_BALANCE.stats.ene.maxMp;
    player.hp = Math.min(player.hp + gain.vit * GAME_BALANCE.stats.vit.maxHp, player.maxHp);
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
      p.maxHp = GAME_BALANCE.base.hp + p.stats.vit * GAME_BALANCE.stats.vit.maxHp;
      p.maxMp = GAME_BALANCE.base.mp + p.stats.ene * GAME_BALANCE.stats.ene.maxMp;
      UI.log(
        `${item.icon} Hấp Thu (khác hệ) → ${sk.toUpperCase()} +${sv}, Tu Vi Linh Căn +1`,
        "level",
      );
    }
    Inventory.remove(idx);
    UI.update();
  },

  async absorbStone() {
    if (!authToken) return UI.notify("Hãy đăng nhập BE.", "warning");
    const p = S.player;
    if (!p || this._absorbPending) return;
    const idx = S.inventory.findIndex(
      (i) => i.type === "STONE" || i.type === "ELEMSTONE",
    );
    if (idx < 0) {
      UI.notify("Không có linh thạch!", "warning");
      return;
    }
    const item = S.inventory[idx];
    if (authToken) {
      this._absorbPending = true;
      try {
        const result = await Net.mutate("POST", API.PATHS.player.absorb, { itemCode: item.itemCode || item.id });
        if (!result?.player) return UI.notify(result?.error || "Không thể hấp thụ tu vi.", "error");
        Net.applyPlayerSnapshot(result.player, { render: false });
        UI.notify(`Hấp thu ${item.name} → Tu vi +${result.result.amount}`, "success");
        UI.buildInv();
        UI.update();
        if (typeof Sound !== "undefined") Sound.play("item");
      } catch (error) {
        UI.notify(error.message || "Không kết nối được máy chủ để hấp thụ tu vi.", "error");
      } finally { this._absorbPending = false; }
      return;
    }
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
    p.maxHp = GAME_BALANCE.base.hp + p.stats.vit * GAME_BALANCE.stats.vit.maxHp;
    p.maxMp = GAME_BALANCE.base.mp + p.stats.ene * GAME_BALANCE.stats.ene.maxMp;
    Inventory.remove(idx);
    UI.update();
  },

  async tryBreakthrough() {
    if (!authToken) return UI.notify("Hãy đăng nhập BE.", "warning");
    const p = S.player;
    if (!p || this._breakthroughPending) return;
    if (p.dead) return UI.notify("Không thể đột phá khi đang trọng thương.", "warning");
    const stage = p.canhGioi?.tangTuVi?.find((entry) => Number(entry.stt) === Number(p.tangTuVi));
    if (stage?.toiCao) return UI.notify("Đã đạt cảnh giới tối cao hiện tại.", "info");
    if (p.tuViHienTai < p.tuViLenCap) {
      UI.notify(
        `Tu vi chưa đủ! Cần ${Math.floor(p.tuViLenCap)}, có ${Math.floor(p.tuViHienTai)}`,
        "warning",
      );
      return;
    }

    if (authToken) {
      const majorAttempt = Number(p.tangTuVi) >= Number(p.canhGioi?.soTang || 9);
      const pillCode = majorAttempt ? p.canhGioi?.danPhaCanh : null;
      if (pillCode && !(S.inventory || []).some((item) => (item.itemCode || item.id) === pillCode && Number(item.count ?? item.quantity ?? 0) > 0)) {
        const pillName = CFG.ITEMS?.[pillCode]?.name || pillCode;
        return UI.notify(`Cần 1 ${pillName} trong túi để phá đại cảnh giới. Đan được tự tiêu hao khi đột phá thành công.`, "warning");
      }
      this._breakthroughPending = true;
      try {
        const result = await Net.mutate("POST", API.PATHS.player.breakthrough, {});
        if (!result?.player) return UI.notify(result?.error || "Không thể đột phá.", "error");
        Net.applyPlayerSnapshot(result.player, { render: false });
        const major = Boolean(result.major ?? result.result?.major);
        UI.notify(major ? "Thăng cảnh giới thành công!" : `Đột phá tầng ${S.player.tangTuVi} thành công!`, "success");
        if (typeof Sound !== "undefined") Sound.play(major ? "breakthrough" : "levelUp");
        this.showBreakthroughEffect(major);
        UI.update();
      } catch (error) {
        UI.notify(error.message || "Không kết nối được máy chủ để đột phá.", "error");
      } finally { this._breakthroughPending = false; }
      return;
    }

    p.tuViHienTai -= p.tuViLenCap;
    let major = false;
    if (p.tangTuVi < 9) {
      p.tangTuVi++;
      this.applyBreakthroughStats(p, false);
      UI.log(`⚡ Đột Phá ${p.tenCanhGioi} Tầng ${p.tangTuVi}!`, "level");
    } else {
      major = true;
      const res = await Net.get(`${API.PATHS.data.realms}/stt/${p.canhGioi.stt + 1}`);
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
    this.showBreakthroughEffect(major);
    UI.update();
  },
};
