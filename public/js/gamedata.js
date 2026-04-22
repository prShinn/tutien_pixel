"use strict";
// ════════════════════════════════════════════════════════════
// gamedata.js — Fetch ITEMS, SKILLS, ROOTS, REALMS từ Backend API
// Gọi GameData.load() trước khi khởi động game.
// ════════════════════════════════════════════════════════════

const GameData = {
  // ── Fetch helper (không cần auth token) ──
  async _get(path) {
    try {
      const res = await fetch(API.BASE + path, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  // ════ REALMS ════
  // GET /api/canh-gioi → [{ stt, code, tenCanhGioi, tuViTienCap, ... }]
  async loadRealms() {
    const data = await this._get("/api/canh-gioi");
    if (!Array.isArray(data) || data.length === 0) {
      console.warn("[GameData] Không load được REALMS từ API.");
      return;
    }
    // Sắp xếp theo stt
    data.sort((a, b) => (a.stt ?? 0) - (b.stt ?? 0));
    CFG.REALMS = data;
    console.info(`[GameData] REALMS: ${data.length} cảnh giới đã tải.`);
  },

  // ════ ROOTS (Linh Căn) ════
  // GET /api/linh-can → [{ maLinhCan, tenLinhCan, emoji, mauSac, background }]
  async loadRoots() {
    const data = await this._get("/api/linh-can");
    if (!Array.isArray(data) || data.length === 0) {
      console.warn("[GameData] Không load được ROOTS từ API.");
      return;
    }
    CFG.ROOTS = data.map((r) => ({
      id: r.maLinhCan || r.id,
      name: r.tenLinhCan || r.name,
      emoji: r.emoji,
      color: r.mauSac || r.color,
      bg: r.background || r.bg,
    }));
    // Build Linh_CAN lookup map
    Linh_CAN = {};
    for (const r of CFG.ROOTS) {
      Linh_CAN[r.id] = { emoji: r.emoji, color: r.color, bg: r.bg };
    }
    console.info(`[GameData] ROOTS: ${CFG.ROOTS.length} linh căn đã tải.`);
  },

  // ════ ITEMS ════
  // GET /api/items → [{ maDo/id, tenDo/name, icon, loai/type, ... }]
  async loadItems() {
    const data = await this._get("/api/items");
    if (!Array.isArray(data) || data.length === 0) {
      console.warn("[GameData] Không load được ITEMS từ API.");
      return;
    }
    CFG.ITEMS = {};
    const shopSell = [];
    for (const item of data) {
      const id = item.maDo || item.id;
      const normalized = {
        id,
        name: item.tenDo || item.name,
        icon: item.icon || item.emoji || "📦",
        type: item.loai || item.type,
        // Tu vi stones
        giaTriTuVi: item.giaTriTuVi || item.tuVal || 0,
        // Elem stones
        giaTriTang: item.giaTriTang || item.statVal || 0,
        statKey: item.statKey || null,
        str: item.str || false,
        agi: item.agi || false,
        vit: item.vit || false,
        ene: item.ene || false,
        // Linh Đan
        linhCan: item.linhCan || null,
        tuViLinhCanVal: item.tuViLinhCanVal || 0,
        // Consumable
        healHp: item.healHp || item.hpHoi || 0,
        healMp: item.healMp || item.mpHoi || 0,
        statBoost: item.statBoost || 0,
        // Economy
        giaMua: item.giaMua || item.buyPrice || 0,
        giaBan: item.giaBan || item.sell || 0,
        buyPrice: item.giaMua || item.buyPrice || 0,
        sell: item.giaBan || item.sell || 0,
        // Desc
        desc: item.moTa || item.desc || item.description || "",
        description: item.moTa || item.desc || item.description || "",
      };
      CFG.ITEMS[id] = normalized;
      // Tự động thêm vào SHOP_SELL nếu có giaMua
      if (normalized.giaMua > 0) shopSell.push(id);
    }
    if (shopSell.length) CFG.SHOP_SELL = shopSell;
    console.info(`[GameData] ITEMS: ${Object.keys(CFG.ITEMS).length} vật phẩm đã tải.`);
  },

  // ════ SKILLS ════
  // GET /api/skills → [{id, code, name, icon, tier, linhCan, range, aoe, aoeR,
  //                    mpTieuHao, hoiChieu, satThuong, dienRong, thoiGianBuff,
  //                    type (PHYS|MAGIC), sfx_code, description}]
  //
  // Quy ước FE:
  //   damageType : "PHYS" | "MAGIC"  — loại sát thương (từ sk.type)
  //   satThuong  : number            — hệ số nhân (1.5 = 150% pAtk/mAtk)
  //   effect     : string | null     — debuff/buff code (burn, slow, root...)
  //   effectDur  : number            — ticks (frames) hiệu ứng tồn tại
  //   effectVal  : number            — giá trị hiệu ứng (DoT, slow%...)
  async loadSkills() {
    const data = await this._get("/api/skills");
    if (!Array.isArray(data) || data.length === 0) {
      console.warn("[GameData] Không load được SKILLS từ API.");
      return;
    }
    // Build nested: CFG.SKILLS[linhCan][tierIndex] = [skill, ...]
    const grouped = {};
    for (const sk of data) {
      const lc = sk.linhCan || sk.maLinhCan;
      const tier = sk.tier || sk.capDo || 1;
      if (!lc) continue;
      if (!grouped[lc]) grouped[lc] = {};
      if (!grouped[lc][tier]) grouped[lc][tier] = [];

      // sk.type từ BE là "PHYS" hoặc "MAGIC" — đây là damageType
      // sk.sfx_code (nếu có) hoặc sk.effect là debuff/buff effect
      const damageType = (sk.type === "PHYS" || sk.type === "MAGIC")
        ? sk.type
        : "PHYS"; // default
      // effect riêng: lấy sk.sfx_code hoặc sk.effect (nếu không phải PHYS/MAGIC)
      const effectCode = sk.sfx_code && sk.sfx_code !== "string"
        ? sk.sfx_code
        : (sk.effect && sk.effect !== "PHYS" && sk.effect !== "MAGIC" ? sk.effect : null);

      grouped[lc][tier].push({
        id: sk.code || sk.maNangLuc || String(sk.id),
        name: sk.name || sk.tenNangLuc,
        icon: sk.icon || (damageType === "MAGIC" ? "✨" : "⚔️"),
        linhCan: lc,
        tier,
        damageType,                          // "PHYS" | "MAGIC"
        satThuong: sk.satThuong ?? 1,        // hệ số nhân sát thương
        mpCost: sk.mpTieuHao ?? sk.mpCost ?? 0,
        cd: (sk.hoiChieu ?? sk.cd ?? 60) * 60, // BE gửi giây → đổi sang ticks (60fps)
        range: sk.range ?? sk.tamDanh ?? 5,
        aoe: (sk.dienRong ?? sk.aoeR ?? 0) > 0 || sk.aoe || false,
        aoeR: sk.dienRong ?? sk.aoeR ?? 0,
        effect: effectCode,                  // debuff/buff code
        effectDur: (sk.thoiGianBuff ?? sk.effectDur ?? 0) * 60, // giây → ticks
        effectVal: sk.effectVal ?? 0,        // giá trị effect (không phải satThuong)
        desc: sk.description ?? sk.moTa ?? sk.desc ?? "",
        _beId: sk.id || null,
      });
    }
    // Convert grouped object to sorted tier arrays
    CFG.SKILLS = {};
    for (const lc of Object.keys(grouped)) {
      const tierMap = grouped[lc];
      const maxTier = Math.max(...Object.keys(tierMap).map(Number));
      CFG.SKILLS[lc] = [];
      for (let t = 1; t <= maxTier; t++) {
        CFG.SKILLS[lc].push(tierMap[t] || []);
      }
    }
    const total = data.length;
    const lcs = Object.keys(CFG.SKILLS).length;
    console.info(`[GameData] SKILLS: ${total} kỹ năng cho ${lcs} linh căn đã tải.`);
  },

  // ════ Load tất cả song song ════
  async load() {
    console.info("[GameData] Đang tải dữ liệu game từ server...");
    await Promise.allSettled([
      this.loadRealms(),
      this.loadRoots(),
      this.loadItems(),
      this.loadSkills(),
    ]);
    console.info("[GameData] Hoàn tất tải dữ liệu.");
  },
};
