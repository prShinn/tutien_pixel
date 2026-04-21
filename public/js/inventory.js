"use strict";
// ════════════════════════════════════════════════════════════
// inventory.js — §10 Inventory Module
// ════════════════════════════════════════════════════════════

const Inventory = {
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

  use(idx) {
    const item = S.inventory[idx];
    if (!item) return;
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
};
