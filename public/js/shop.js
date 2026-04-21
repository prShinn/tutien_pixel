"use strict";
// ════════════════════════════════════════════════════════════
// shop.js — §11 Shop, DialogUI, Chest
// ════════════════════════════════════════════════════════════

const Shop = {
  open(npc) {
    document.getElementById("shop-title").textContent = `🏪 ${npc.name}`;
    this.render();
    document.getElementById("shop-modal").classList.add("open");
  },

  close() {
    document.getElementById("shop-modal").classList.remove("open");
  },

  render() {
    document.getElementById("shop-xu").textContent =
      S.player.xu.toLocaleString();

    // ── Cột MUA ──
    const buy = document.getElementById("shop-buy-list");
    buy.innerHTML = '<div class="shop-col-head">MUA VẬT PHẨM</div>';
    for (const id of CFG.SHOP_SELL) {
      const item = CFG.ITEMS[id];
      if (!item || !item.giaMua) continue;
      const div = document.createElement("div");
      div.className = "shop-item";
      div.innerHTML = `<span class="si-emoji">${item.icon}</span><div class="si-info"><div class="si-name">${item.name}</div><div class="si-desc">${item.desc || ""}</div></div><span class="si-price">${item.giaMua}xu</span>`;
      const btn = document.createElement("button");
      btn.className = "sbtn";
      btn.textContent = "Mua";
      btn.onclick = () => Shop.buy(id);
      div.appendChild(btn);
      buy.appendChild(div);
    }

    // ── Cột BÁN ──
    const sell = document.getElementById("shop-sell-list");
    sell.innerHTML = '<div class="shop-col-head">BÁN VẬT PHẨM</div>';
    if (!S.inventory.length)
      sell.innerHTML +=
        '<div style="color:var(--text2);font-size:11px;padding:8px">Túi đồ trống</div>';
    S.inventory.forEach((item, idx) => {
      const div = document.createElement("div");
      div.className = "shop-item";
      div.innerHTML = `<span class="si-emoji">${item.icon}</span><div class="si-info"><div class="si-name">${item.name} x${item.count}</div></div><span class="si-sell">${item.giaBan || 0}xu/cái</span>`;
      const btn = document.createElement("button");
      btn.className = "sbtn ssell";
      btn.textContent = "Bán";
      btn.onclick = () => {
        Shop.sell(idx);
      };
      div.appendChild(btn);
      sell.appendChild(div);
    });
  },

  buy(id) {
    const item = CFG.ITEMS[id];
    if (!item) return;
    if (S.player.xu < item.giaMua) {
      UI.log("Không đủ xu!", "system");
      return;
    }
    S.player.xu -= item.giaMua;
    Inventory.add(item);
    UI.log(`Mua: ${item.icon} ${item.name} (-${item.giaMua}xu)`, "loot");
    this.render();
  },

  sell(idx) {
    const item = S.inventory[idx];
    if (!item) return;
    S.player.xu += item.giaBan || 0;
    UI.log(
      `Bán: ${item.name} (+${item.giaBan || 0}xu)`,
      "loot",
    );
    Inventory.remove(idx);
    this.render();
  },
};

const DialogUI = {
  open(npc) {
    document.getElementById("dialog-npc-n").textContent = npc.name;
    document.getElementById("dialog-text").innerHTML = (npc.dialog || "").replace(
      /\n/g,
      "<br>",
    );
    document.getElementById("dialog-modal").classList.add("open");
  },
  close() {
    document.getElementById("dialog-modal").classList.remove("open");
  },
};

const Chest = {
  open(npc) {
    if (npc.used) {
      UI.log("Rương đã trống.", "system");
      return;
    }
    npc.used = true;
    UI.log("🎁 Mở Rương Kho Báu!", "level");
    // Phần thưởng ngẫu nhiên từ CFG.ITEMS nếu có
    const _add = (id, count) => {
      const it = CFG.ITEMS[id];
      if (!it) return;
      for (let i = 0; i < count; i++) Inventory.add(it);
      UI.log(`  + ${it.icon} ${it.name} x${count}`, "loot");
    };
    // Thử dùng key chuẩn; nếu không tồn tại trong ITEMS thì skip
    _add("slo", randInt(2, 4));
    _add("smi", randInt(1, 2));
    _add("hpd", randInt(1, 3));
    _add("mpd", randInt(1, 2));
    const xu = randInt(50, 150);
    S.player.xu += xu;
    UI.log(`  + 💰 ${xu} Xu`, "loot");
  },
};
