// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/inventory.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Quản lý túi đồ & trang bị (Inventory & Equipment): Thêm vật phẩm vào túi (stack tối đa 99),
//      sử dụng vật phẩm (đan dược hồi phục, đá tu vi), trang bị vũ khí/giáp/pháp bảo vào ô trang bị,
//      tháo trang bị, và đồng bộ với REST API /api/player/inventory.
// 2. CẤU HÌNH LIÊN QUAN:
//    - CFG.INV_MAX, CFG.SLOTS (weapon, hat, armor, pants, boots, ring, amulet, belt, gem).
//    - Phụ thuộc: State (S), UI, Net.
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Tự động cộng dồn (stackable) vật phẩm trùng ID, tính toán lại thuộc tính nhân vật khi mặc/tháo đồ,
//      hỗ trợ cả cập nhật local và gọi server API.
// ════════════════════════════════════════════════════════════════════════════════════════

const Inventory = {
  selectedIndex: -1,
  add(item) {
    if (!S.inventory) S.inventory = [];
    for (const iv of S.inventory) {
      if (iv && iv.id === item.id && iv.count < 99) {
        iv.count++;
        UI.buildInv();
        UI.update();
        return;
      }
    }
    if (S.inventory.length < CFG.INV_MAX) {
      S.inventory.push({ ...item, count: 1 });
      UI.buildInv();
      UI.update();
    } else UI.log("Túi đồ đầy!", "system");
  },

  remove(idx) {
    const iv = S.inventory[idx];
    if (!iv) return;
    iv.count--;
    if (iv.count <= 0) S.inventory.splice(idx, 1);
    UI.buildInv();
    UI.update();
  },

  async use(idx) {
    const item = S.inventory[idx];
    if (!item) return;
    if (authToken && (item.type || item.loai) === "EQUIPMENT") {
      const result = await Net.post(API.PATHS.player.equipItem, { index: idx, itemId: item.id, slot: item.slot || "weapon" });
      if (!result?.player) return UI.log(result?.error || "KhÃ´ng thá»ƒ trang bá»‹ váº­t pháº©m.", "system");
      Object.assign(S.player, result.player);
      try { S.inventory = typeof result.player.jsonIventory === "string" ? JSON.parse(result.player.jsonIventory || "[]") : (result.player.inventory || []); } catch { S.inventory = []; }
      UI.log(`${item.icon || "âš”ï¸"} ÄÃ£ trang bá»‹ ${item.name}`, "loot");
      UI.buildInv();
      UI.update();
      return;
    }
    if (authToken) {
      const result = await Net.post(API.PATHS.player.useItem, { index: idx, itemId: item.id });
      if (!result?.player) return UI.log(result?.error || "Không thể sử dụng vật phẩm.", "system");
      Object.assign(S.player, result.player);
      try { S.inventory = typeof result.player.jsonIventory === "string" ? JSON.parse(result.player.jsonIventory || "[]") : (result.player.inventory || []); } catch { S.inventory = []; }
      UI.log(`${item.icon || "✦"} Đã sử dụng ${item.name}`, "system");
      UI.buildInv();
      UI.update();
      return;
    }
    if (item.type === "LINDAN") {
      Cultivation.absorbLinDan(idx);
      return;
    }
    if (item.type === "STONE" || item.type === "ELEMSTONE") {
      Cultivation.absorbStone();
      return;
    }
    if (item.type === "CONSUME") {
      const p = S.player;
      if (item.healHp) {
        p.hp = Math.min(p.maxHp, p.hp + item.healHp);
        UI.log(`Dùng ${item.icon} → Hồi ${item.healHp} HP`, "system");
      }
      if (item.healMp) {
        p.mp = Math.min(p.maxMp, p.mp + item.healMp);
        UI.log(`Dùng ${item.icon} → Hồi ${item.healMp} MP`, "system");
      }
      if (item.statBoost) {
        const ss = ["str", "agi", "vit", "ene"];
        const s = ss[randInt(0, 3)];
        S.player.stats[s] += item.statBoost;
        UI.log(`Dùng ${item.icon} → +${item.statBoost} ${s.toUpperCase()}`, "level");
      }
      Inventory.remove(idx);
      UI.update();
    } else
      UI.log(`${item.icon} ${item.name}: ${item.desc || ""}`, "system");
  },

  async unequip(item, slotKey) {
    if (!item || !authToken) return UI.log("Chưa kết nối máy chủ.", "system");
    const slotMap = { weapon: "weapon", helmet: "hat", armor: "armor", pants: "pants", boots: "boots", ring: "ring", amulet: "amulet", belt: "belt", gem: "gem" };
    const result = await Net.post(API.PATHS.player.unequipItem, { slot: slotMap[slotKey] || slotKey });
    if (!result?.player) return UI.log(result?.error || "Không thể tháo trang bị.", "system");
    Object.assign(S.player, result.player);
    try { S.inventory = typeof result.player.jsonIventory === "string" ? JSON.parse(result.player.jsonIventory || "[]") : (result.player.inventory || []); } catch { S.inventory = []; }
    UI.log(`Đã tháo ${item.name || "trang bị"} vào túi đồ.`, "loot");
    UI.buildInv(); UI.renderEquipment(true); UI.update();
  },
};
