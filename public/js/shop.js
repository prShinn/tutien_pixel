// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/shop.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Quản lý cửa hàng NPC & hội thoại (Shop, Dialog & Chest UI): Hiển thị modal mua/bán
//      vật phẩm bằng Xu, hội thoại NPC hướng dẫn tân thủ, và mở rương kho báu trên bản đồ.
// 2. CẤU HÌNH LIÊN QUAN:
//    - CFG.SHOP_ITEMS, CFG.INV_MAX.
//    - Phụ thuộc: State (S), UI, Net, Inventory.
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Kiểm tra số lượng Xu và stack trước khi mua/bán; gọi mutation API có quantity
//      (/api/player/shop/buy, /api/player/shop/sell) hoặc xử lý local khi offline.
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

  quantityControl(max = 99) {
    const label = document.createElement("label");
    label.className = "shop-qty";
    label.append(document.createTextNode("SL"));
    const input = document.createElement("input");
    input.className = "shop-quantity";
    input.type = "number";
    input.min = "1";
    input.max = String(max);
    input.step = "1";
    input.value = "1";
    input.inputMode = "numeric";
    input.setAttribute("aria-label", `Số lượng, tối đa ${max}`);
    label.appendChild(input);
    return input;
  },

  readQuantity(input, max = 99) {
    const quantity = Number(input?.value);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > max) {
      UI.notify(`Số lượng phải từ 1 đến ${max}.`, "warning");
      input?.focus();
      return null;
    }
    return quantity;
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
      const quantity = this.quantityControl(99);
      div.appendChild(quantity.parentElement);
      const btn = document.createElement("button");
      btn.className = "sbtn";
      btn.textContent = "Mua";
      btn.onclick = async () => {
        const amount = Shop.readQuantity(quantity, 99);
        if (amount == null) return;
        btn.disabled = true;
        try { await Shop.buy(id, amount); } finally { btn.disabled = false; }
      };
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
      const quantity = this.quantityControl(Math.max(1, Number(item.count || 1)));
      div.appendChild(quantity.parentElement);
      const btn = document.createElement("button");
      btn.className = "sbtn ssell";
      btn.textContent = "Bán";
      btn.onclick = async () => {
        const amount = Shop.readQuantity(quantity, Math.max(1, Number(item.count || 1)));
        if (amount == null) return;
        btn.disabled = true;
        try { await Shop.sell(idx, amount); } finally { btn.disabled = false; }
      };
      div.appendChild(btn);
      sell.appendChild(div);
    });
  },

  async buy(id, quantity = 1) {
    const item = CFG.ITEMS[id];
    if (!item) return;
    const amount = Number(quantity);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 99) return UI.notify("Số lượng mua phải từ 1 đến 99.", "warning");
    if (authToken) {
      const result = await Net.mutate("POST", API.PATHS.player.buy, { itemCode: id, quantity: amount });
      if (!result?.player) return UI.log(result?.error || "Không thể mua vật phẩm.", "system");
      Net.applyPlayerSnapshot(result.player, { render: false });
      UI.log(`Mua: ${item.icon} ${item.name} x${amount} (-${result.result?.price ?? item.giaMua * amount} xu)`, "loot");
      UI.buildInv(); UI.update(); this.render();
      return;
    }
    const unitPrice = Math.max(0, Number(item.giaMua) || 0);
    const totalPrice = unitPrice * amount;
    if (S.player.xu < totalPrice) {
      UI.log("Không đủ xu!", "system");
      return;
    }
    const stack = S.inventory.find((entry) => String(entry.itemCode || entry.id) === String(item.id));
    if (stack && Number(stack.count || 1) + amount > 99) return UI.log("Số lượng vượt giới hạn một chồng đồ.", "system");
    if (!stack && S.inventory.length >= CFG.INV_MAX) return UI.log("Túi đồ đầy!", "system");
    S.player.xu -= totalPrice;
    if (stack) stack.count = Number(stack.count || 1) + amount;
    else S.inventory.push({ ...item, count: amount });
    UI.log(`Mua: ${item.icon} ${item.name} x${amount} (-${totalPrice} xu)`, "loot");
    UI.buildInv(); UI.update();
    this.render();
  },

  async sell(idx, quantity = 1) {
    const item = S.inventory[idx];
    if (!item) return;
    const amount = Number(quantity);
    const available = Math.max(1, Number(item.count || 1));
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > available) return UI.notify(`Số lượng bán phải từ 1 đến ${available}.`, "warning");
    if (authToken) {
      const result = await Net.mutate("POST", API.PATHS.player.sell, { itemCode: item.itemCode || item.id, quantity: amount });
      if (!result?.player) return UI.log(result?.error || "Không thể bán vật phẩm.", "system");
      Net.applyPlayerSnapshot(result.player, { render: false });
      UI.log(`Bán: ${item.name} x${amount} (+${result.result?.price || 0} xu)`, "loot");
      UI.buildInv(); UI.update(); this.render();
      return;
    }
    const unitPrice = Math.max(0, Number(item.giaBan) || 0);
    if (unitPrice <= 0) return UI.log("Vật phẩm này không thể bán.", "system");
    const totalPrice = unitPrice * amount;
    S.player.xu += totalPrice;
    item.count = available - amount;
    if (item.count <= 0) S.inventory.splice(idx, 1);
    UI.log(`Bán: ${item.name} x${amount} (+${totalPrice} xu)`, "loot");
    UI.buildInv(); UI.update();
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
