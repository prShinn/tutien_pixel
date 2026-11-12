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
  _currentNpc: null,
  _activeCategory: "ALL",

  normalizeCategory(rawCategory, npc = null) {
    const val = String(rawCategory || npc?.shopCategory || "").trim().toUpperCase();
    if (["EQUIPMENT", "ALCHEMY", "ALL"].includes(val)) return val;
    const role = String(npc?.role || "").trim().toLowerCase();
    if (role === "blacksmith") return "EQUIPMENT";
    if (role === "alchemist") return "ALCHEMY";
    return "ALL";
  },

  matchesCategory(item, category = this._activeCategory) {
    if (!item || !category || category === "ALL") return true;
    const explicit = String(item.shopCategory || "").trim().toUpperCase();
    if (explicit) return explicit === category || explicit === "ALL";
    const type = String(item.type || item.loai || "").toUpperCase();
    if (category === "EQUIPMENT") return type === "EQUIPMENT";
    if (category === "ALCHEMY") {
      return ["POTION", "CONSUME", "MATERIAL", "MAT", "STONE", "ELEMSTONE", "LINDAN", "BREAKTHROUGH_PILL"].includes(type);
    }
    return true;
  },

  setCategory(category) {
    this._activeCategory = this.normalizeCategory(category, this._currentNpc);
    this.render();
  },

  open(npc) {
    this._currentNpc = npc || null;
    this._activeCategory = this.normalizeCategory(npc?.shopCategory, npc);
    const titleEl = document.getElementById("shop-title");
    if (titleEl) titleEl.textContent = `Cửa hàng · ${npc?.name || "Thương Nhân"}`;
    const greetEl = document.getElementById("shop-greeting");
    if (greetEl) {
      greetEl.textContent = npc?.dialog || "";
      greetEl.hidden = !npc?.dialog;
    }
    this.render();
    document.getElementById("shop-modal")?.classList.add("open");
  },

  close() {
    document.getElementById("shop-modal")?.classList.remove("open");
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
    const xuEl = document.getElementById("shop-xu");
    if (xuEl) xuEl.textContent = Math.floor(Number(S.player?.xu || 0)).toLocaleString("vi-VN");

    const modal = document.getElementById("shop-modal");
    modal?.querySelectorAll("[data-shop-cat]").forEach((btn) => {
      const active = btn.dataset.shopCat === this._activeCategory;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
    const furnaceBtn = document.getElementById("shop-alchemy-shortcut");
    if (furnaceBtn) {
      furnaceBtn.hidden = this._activeCategory === "EQUIPMENT" && this._currentNpc?.role === "blacksmith";
    }

    // ── Cột MUA ──
    const buy = document.getElementById("shop-buy-list");
    if (!buy) return;
    buy.innerHTML = '<div class="shop-col-head">MUA VẬT PHẨM</div>';
    let buyCount = 0;
    for (const id of CFG.SHOP_SELL || []) {
      const item = CFG.ITEMS[id];
      if (!item || !item.giaMua || item.currency === "LINH_THACH") continue;
      if (!this.matchesCategory(item, this._activeCategory)) continue;
      buyCount += 1;
      const div = document.createElement("div");
      div.className = "shop-item";
      const icon = UI.createPixelIcon(item, "", "si-emoji");
      if (typeof ItemFX !== "undefined") ItemFX.decorateSlotElement(icon, item);
      const info = document.createElement("div");
      info.className = "si-info";
      const name = document.createElement("div");
      name.className = "si-name";
      const rarityMeta = typeof ItemFX !== "undefined" ? ItemFX.RARITY_META[item.rarity] : null;
      if (rarityMeta && item.rarity && item.rarity !== "NORMAL") name.style.color = rarityMeta.color;
      name.textContent = item.qualityLabel ? `${item.name || id} (${item.qualityLabel})` : (item.name || id);
      const desc = document.createElement("div");
      desc.className = "si-desc";
      desc.textContent = item.desc || "";
      info.append(name, desc);
      const effects = document.createElement("div");
      effects.className = "si-effects";
      effects.textContent = UI.itemEffectSummary(item);
      if (effects.textContent) info.appendChild(effects);
      div.onmouseenter = (event) => UI.showTip(item, event);
      div.onmousemove = (event) => UI.moveTip(event);
      div.onmouseleave = () => UI.hideTip();
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
    if (!buyCount) {
      const emptyBuy = document.createElement("div");
      emptyBuy.className = "shop-empty";
      emptyBuy.textContent = "Chưa có vật phẩm thuộc danh mục này.";
      buy.appendChild(emptyBuy);
    }

    // ── Cột BÁN ──
    const sell = document.getElementById("shop-sell-list");
    if (!sell) return;
    sell.innerHTML = '<div class="shop-col-head">BÁN VẬT PHẨM</div>';
    if (!S.inventory.length) {
      const empty = document.createElement("div");
      empty.className = "shop-empty";
      empty.textContent = "Túi đồ trống";
      sell.appendChild(empty);
    }
    let sellableCount = 0;
    S.inventory.forEach((entry, idx) => {
      const item = GameData.itemWithCurrentDetails(entry);
      if (!item || item.currency === "LINH_THACH" || !(Number(item.giaBan) > 0)) return;
      sellableCount += 1;
      const div = document.createElement("div");
      div.className = "shop-item";
      const icon = UI.createPixelIcon(item, "", "si-emoji");
      if (typeof ItemFX !== "undefined") ItemFX.decorateSlotElement(icon, item);
      const info = document.createElement("div");
      info.className = "si-info";
      const name = document.createElement("div");
      name.className = "si-name";
      const rarityMeta = typeof ItemFX !== "undefined" ? ItemFX.RARITY_META[item.rarity] : null;
      if (rarityMeta && item.rarity && item.rarity !== "NORMAL") name.style.color = rarityMeta.color;
      const enhTag = Number(item.enhanceLevel || 0) > 0 ? ` +${Number(item.enhanceLevel)}` : "";
      name.textContent = `${item.name || item.id}${enhTag} x${item.count || 1}`;
      info.appendChild(name);
      const effects = document.createElement("div");
      effects.className = "si-effects";
      effects.textContent = UI.itemEffectSummary(item);
      if (effects.textContent) info.appendChild(effects);
      div.onmouseenter = (event) => UI.showTip(item, event);
      div.onmousemove = (event) => UI.moveTip(event);
      div.onmouseleave = () => UI.hideTip();
      const price = document.createElement("span");
      price.className = "si-sell";
      const isEqSell = String(item.type || item.loai || "").toUpperCase() === "EQUIPMENT";
      const unitSellPrice = isEqSell && typeof GAME_BALANCE?.calcEquipmentSellPrice === "function"
        ? GAME_BALANCE.calcEquipmentSellPrice(item.giaBan || 0, item.enhanceLevel || 0, item.rarity || "NORMAL")
        : (Number(item.giaBan) || 0);
      price.textContent = `${unitSellPrice} xu/cái`;
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
    if (S.inventory.length && !sellableCount) {
      const empty = document.createElement("div");
      empty.className = "shop-empty";
      empty.textContent = "Không có vật phẩm nào có thể bán lại.";
      sell.appendChild(empty);
    }
  },

  async buy(id, quantity = 1) {
    if (!authToken) return UI.notify("Hãy đăng nhập BE.", "warning");
    const item = CFG.ITEMS[id];
    if (!item) return;
    const amount = Number(quantity);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 99) return UI.notify("Số lượng mua phải từ 1 đến 99.", "warning");
    if (authToken) {
      try {
        const result = await Net.mutate("POST", API.PATHS.player.buy, { itemCode: id, quantity: amount });
        if (!result?.player) return UI.notify(result?.error || result?.message || "Không thể mua vật phẩm.", "error");
        Net.applyPlayerSnapshot(result.player, { render: false });
        UI.log(`Mua: ${item.icon || "📦"} ${item.name} x${amount} (-${result.result?.price ?? item.giaMua * amount} xu)`, "loot");
        UI.notify(`Đã mua ${item.name} x${amount}.`, "success");
        UI.buildInv(); UI.update(); this.render();
      } catch (error) {
        UI.notify(error.message || "Không thể mua vật phẩm.", "error");
      }
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
    const invBase = CFG.INV_BASE || 40;
    const invMax = CFG.INV_MAX || 80;
    const maxSlots = Math.min(invMax, Math.max(invBase, Number(S.player?.inventoryCapacity || invBase)));
    if (!stack && S.inventory.length >= maxSlots) return UI.log("Túi đồ đầy!", "system");
    S.player.xu -= totalPrice;
    if (stack) stack.count = Number(stack.count || 1) + amount;
    else S.inventory.push({ ...item, count: amount });
    UI.log(`Mua: ${item.icon} ${item.name} x${amount} (-${totalPrice} xu)`, "loot");
    UI.buildInv(); UI.update();
    this.render();
  },

  async sell(idx, quantity = 1) {
    if (!authToken) return UI.notify("Hãy đăng nhập BE.", "warning");
    const item = S.inventory[idx];
    if (!item) return;
    const amount = Number(quantity);
    const available = Math.max(1, Number(item.count || 1));
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > available) return UI.notify(`Số lượng bán phải từ 1 đến ${available}.`, "warning");
    if (authToken) {
      try {
        const result = await Net.mutate("POST", API.PATHS.player.sell, {
          itemCode: item.itemCode || item.id,
          ...(item.isInstance && item.instanceId ? { instanceId: item.instanceId } : {}),
          quantity: amount,
        });
        if (!result?.player) return UI.notify(result?.error || result?.message || "Không thể bán vật phẩm.", "error");
        Net.applyPlayerSnapshot(result.player, { render: false });
        UI.log(`Bán: ${item.name} x${amount} (+${result.result?.price || 0} xu)`, "loot");
        UI.notify(`Đã bán ${item.name} x${amount} (+${result.result?.price || 0} xu).`, "success");
        UI.buildInv(); UI.update(); this.render();
      } catch (error) {
        UI.notify(error.message || "Không thể bán vật phẩm.", "error");
      }
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
    document.getElementById("dialog-npc-n").textContent = String(npc?.name || "");
    document.getElementById("dialog-text").textContent = String(npc?.dialog || "");
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
