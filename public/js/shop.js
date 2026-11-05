// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/shop.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Quản lý cửa hàng NPC & hội thoại (Shop, Dialog & Chest UI): Hiển thị modal mua/bán
//      vật phẩm bằng Xu, hội thoại NPC hướng dẫn tân thủ, và mở rương kho báu trên bản đồ.
// 2. CẤU HÌNH LIÊN QUAN:
//    - CFG.SHOP_ITEMS, CFG.INV_MAX.
//    - Phụ thuộc: State (S), UI, Net, Inventory.
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Kiểm tra số lượng Xu trước khi mua đồ, trừ Xu và tự động thêm vật phẩm vào túi đồ
//      (gọi API /api/shop/buy khi online hoặc xử lý local khi offline).
// ════════════════════════════════════════════════════════════════════════════════════════

const Shop = {
  open(npc) {
    document.getElementById("shop-title").textContent = `Cửa hàng · ${npc.name}`;
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
      const icon = UI.createPixelIcon(item, "", "si-emoji");
      const info = document.createElement("div");
      info.className = "si-info";
      const name = document.createElement("div");
      name.className = "si-name";
      name.textContent = item.name || id;
      const desc = document.createElement("div");
      desc.className = "si-desc";
      desc.textContent = item.desc || "";
      info.append(name, desc);
      const price = document.createElement("span");
      price.className = "si-price";
      price.textContent = `${item.giaMua} xu`;
      div.append(icon, info, price);
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
    if (!S.inventory.length) {
      const empty = document.createElement("div");
      empty.className = "shop-empty";
      empty.textContent = "Túi đồ trống";
      sell.appendChild(empty);
    }
    S.inventory.forEach((item, idx) => {
      const div = document.createElement("div");
      div.className = "shop-item";
      const icon = UI.createPixelIcon(item, "", "si-emoji");
      const info = document.createElement("div");
      info.className = "si-info";
      const name = document.createElement("div");
      name.className = "si-name";
      name.textContent = `${item.name || item.id} x${item.count || 1}`;
      info.appendChild(name);
      const price = document.createElement("span");
      price.className = "si-sell";
      price.textContent = `${item.giaBan || 0} xu/cái`;
      div.append(icon, info, price);
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

  async buy(id) {
    const item = CFG.ITEMS[id];
    if (!item) return;
    if (authToken) {
      const result = await Net.mutate("POST", API.PATHS.player.buy, { itemCode: id, quantity: 1 });
      if (!result?.player) return UI.log(result?.error || "Không thể mua vật phẩm.", "system");
      Net.applyPlayerSnapshot(result.player, { render: false });
      UI.log(`Mua: ${item.icon} ${item.name} (-${result.result?.price ?? item.giaMua}xu)`, "loot");
      UI.buildInv(); UI.update(); this.render();
      return;
    }
    if (S.player.xu < item.giaMua) {
      UI.log("Không đủ xu!", "system");
      return;
    }
    S.player.xu -= item.giaMua;
    Inventory.add(item);
    UI.log(`Mua: ${item.icon} ${item.name} (-${item.giaMua}xu)`, "loot");
    this.render();
  },

  async sell(idx) {
    const item = S.inventory[idx];
    if (!item) return;
    if (authToken) {
      const result = await Net.mutate("POST", API.PATHS.player.sell, { itemCode: item.itemCode || item.id, quantity: 1 });
      if (!result?.player) return UI.log(result?.error || "Không thể bán vật phẩm.", "system");
      Net.applyPlayerSnapshot(result.player, { render: false });
      UI.log(`Bán: ${item.name} (+${result.result?.price || 0}xu)`, "loot");
      UI.buildInv(); UI.update(); this.render();
      return;
    }
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
