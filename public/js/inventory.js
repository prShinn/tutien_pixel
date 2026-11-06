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
        return true;
      }
    }
    if (S.inventory.length < CFG.INV_MAX) {
      S.inventory.push({ ...item, count: 1 });
      UI.buildInv();
      UI.update();
      return true;
    }
    UI.log("Túi đồ đầy!", "system");
    return false;
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
    const entry = S.inventory[idx];
    const item = authToken ? GameData.itemWithCurrentDetails(entry) : entry;
    if (!item) return;
    if ((item.type || item.loai) === "BREAKTHROUGH_PILL") {
      return UI.notify("Giữ đan trong túi và bấm Đột phá khi đủ tu vi, OVR và tầng cuối. Máy chủ tự tiêu hao 1 viên khi phá đại cảnh giới.", "info");
    }
    if (authToken && (item.type || item.loai) === "EQUIPMENT") {
      const targetSlot = item.slot === "helmet" ? "hat" : (item.slot || "weapon");
      const result = await Net.mutate("POST", API.PATHS.player.equipItem, {
        itemId: item.id || item.itemCode,
        itemCode: item.itemCode || item.id,
        index: idx,
        slot: targetSlot,
      });
      if (!result?.player) return UI.log(result?.error || "KhÃ´ng thá»ƒ trang bá»‹ váº­t pháº©m.", "system");
      Net.applyPlayerSnapshot(result.player, { render: false });
      UI.log(`${item.icon || "âš”ï¸"} ÄÃ£ trang bá»‹ ${item.name}`, "loot");
      UI.renderEquipment(true);
      UI.buildInv();
      UI.update();
      if (typeof Sound !== "undefined") Sound.play("click");
      return;
    }
    if (authToken) {
      const result = await Net.mutate("POST", API.PATHS.player.useItem, {
        itemId: item.id || item.itemCode,
        itemCode: item.itemCode || item.id,
        index: idx,
      });
      if (!result?.player) return UI.log(result?.error || "Không thể sử dụng vật phẩm.", "system");
      Net.applyPlayerSnapshot(result.player, { render: false });
      UI.log(`${item.icon || "✦"} Đã sử dụng ${item.name}`, "system");
      if (typeof Sound !== "undefined") Sound.play("item");
      UI.renderEquipment(true);
      UI.buildInv();
      UI.update();
      if (typeof Sound !== "undefined") Sound.play("click");
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
    const result = await Net.mutate("POST", API.PATHS.player.unequipItem, { slot: slotMap[slotKey] || slotKey });
    if (!result?.player) return UI.log(result?.error || "Không thể tháo trang bị.", "system");
    Net.applyPlayerSnapshot(result.player, { render: false });
    UI.log(`Đã tháo ${item.name || "trang bị"} vào túi đồ.`, "loot");
    if (typeof Sound !== "undefined") Sound.play("click");
    UI.buildInv(); UI.renderEquipment(true); UI.update();
  },
};
