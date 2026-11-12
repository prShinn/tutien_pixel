(function exposeAdminEditors(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AdminEditors = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createAdminEditors() {
  "use strict";

  function createDynamicRow(fieldsHtml, onRemove) {
    const row = document.createElement("div");
    row.className = "dynamic-row";
    row.innerHTML = `${fieldsHtml}<button class="vfx-button danger dynamic-row-remove" type="button" aria-label="Xóa dòng">×</button>`;
    row.querySelector(".dynamic-row-remove").addEventListener("click", () => {
      row.remove();
      onRemove?.();
    });
    return row;
  }

  function mount({ api, getJson, adminHeaders, contentManager, escapeHtml }) {
    const esc = escapeHtml || ((value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch])));

    let itemDatalistLoaded = false;
    async function ensureItemDatalist() {
      if (itemDatalistLoaded) return;
      const listEl = document.getElementById("admin-item-code-list");
      if (!listEl) return;
      try {
        const items = await getJson(api.BASE + api.PATHS.data.items);
        if (Array.isArray(items)) {
          listEl.innerHTML = items.map((item) => {
            const code = esc(item.id || item.maDo || "");
            const label = esc(item.tenDo || item.name || code);
            return `<option value="${code}">${label} (${code})</option>`;
          }).join("");
          itemDatalistLoaded = true;
        }
      } catch {
        // Bỏ qua nếu chưa tải được datalist gợi ý
      }
    }

    // --- 1. Alchemy Recipes Editor ---
    const alchemyState = { recipes: [], editingCode: null, busy: false };
    const alchemyForm = document.getElementById("alchemy-form");
    const alchemyList = document.getElementById("alchemy-list");
    const alchemyIngBox = document.getElementById("alchemy-ingredients");
    const alchemyStatus = document.getElementById("alchemy-status");
    const alchemyDeleteBtn = document.getElementById("alchemy-delete-btn");

    function addIngredientRow(itemCode = "", quantity = 1) {
      if (!alchemyIngBox || alchemyIngBox.children.length >= 10) return;
      const row = createDynamicRow(
        `<input name="ingCode" required maxlength="64" list="admin-item-code-list" placeholder="Mã nguyên liệu" value="${esc(itemCode)}" />`
        + `<input name="ingQty" type="number" min="1" max="999" value="${Number(quantity) || 1}" required />`,
      );
      alchemyIngBox.appendChild(row);
    }

    function resetAlchemyForm(recipe = null) {
      if (!alchemyForm) return;
      alchemyState.editingCode = recipe ? String(recipe.code || recipe.id || "") : null;
      alchemyForm.reset();
      alchemyIngBox.replaceChildren();
      document.getElementById("alchemy-form-title").textContent = alchemyState.editingCode
        ? `Sửa công thức: ${alchemyState.editingCode}`
        : "Tạo công thức mới";
      alchemyDeleteBtn.hidden = !alchemyState.editingCode;
      const fields = alchemyForm.elements;
      fields.code.readOnly = Boolean(alchemyState.editingCode);
      if (recipe) {
        fields.code.value = recipe.code || recipe.id || "";
        fields.name.value = recipe.name || "";
        fields.category.value = recipe.category || "BREAKTHROUGH";
        fields.quality.value = recipe.quality || "HA_PHAM";
        fields.outputItemCode.value = recipe.outputItemCode || "";
        fields.upgradedItemCode.value = recipe.upgradedItemCode || "";
        fields.outputQuantity.value = recipe.outputQuantity ?? 1;
        fields.craftSuccessRate.value = recipe.craftSuccessRate ?? 0.65;
        fields.mutationChance.value = recipe.mutationChance ?? 0.05;
        fields.requiredRealmStt.value = recipe.requiredRealmStt ?? 1;
        fields.costXu.value = recipe.costXu ?? 0;
        fields.costLinhThach.value = recipe.costLinhThach ?? 0;
        const ings = Array.isArray(recipe.ingredients) && recipe.ingredients.length
          ? recipe.ingredients
          : [{ itemCode: "", quantity: 1 }];
        ings.forEach((ing) => addIngredientRow(ing.itemCode, ing.quantity));
      } else {
        fields.category.value = "BREAKTHROUGH";
        fields.quality.value = "HA_PHAM";
        addIngredientRow("MAT_THAO_DUOC", 4);
        addIngredientRow("STONE_LINH_NHO", 3);
      }
      alchemyStatus.textContent = alchemyState.editingCode ? "Đang chỉnh sửa" : "Tạo mới";
      renderAlchemyList();
    }

    function renderAlchemyList() {
      if (!alchemyList) return;
      const query = (document.getElementById("alchemy-search")?.value || "").trim().toLocaleLowerCase();
      const rows = alchemyState.recipes.filter((r) => `${r.code} ${r.name} ${r.category} ${r.outputItemCode}`.toLocaleLowerCase().includes(query));
      alchemyList.innerHTML = rows.map((r) => {
        const code = String(r.code || r.id || "");
        const selected = code === alchemyState.editingCode ? "selected" : "";
        return `<button class="editor-list-row ${selected}" type="button" data-alchemy-code="${esc(code)}">`
          + `<b>${esc(r.name || code)}</b>`
          + `<small>${esc(code)} · ${esc(r.category || "BASIC")} · ${(Number(r.craftSuccessRate || 0) * 100).toFixed(0)}%</small>`
          + `</button>`;
      }).join("") || '<div class="empty">Không có công thức phù hợp.</div>';
    }

    async function openAlchemy() {
      if (!alchemyList) return;
      alchemyList.innerHTML = '<div class="loading">Đang tải công thức…</div>';
      void ensureItemDatalist();
      try {
        const res = await contentManager.list("alchemyRecipes");
        alchemyState.recipes = Array.isArray(res?.data) ? res.data : [];
        if (alchemyState.recipes.length && !alchemyState.editingCode) {
          resetAlchemyForm(alchemyState.recipes[0]);
        } else {
          renderAlchemyList();
        }
      } catch (error) {
        alchemyList.innerHTML = `<div class="empty">${esc(error.message || "Không tải được công thức.")}</div>`;
      }
    }

    document.getElementById("alchemy-search")?.addEventListener("input", renderAlchemyList);
    document.getElementById("alchemy-new-btn")?.addEventListener("click", () => resetAlchemyForm(null));
    document.getElementById("alchemy-add-ingredient")?.addEventListener("click", () => addIngredientRow("", 1));
    alchemyList?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-alchemy-code]");
      if (!btn) return;
      const found = alchemyState.recipes.find((r) => String(r.code || r.id) === btn.dataset.alchemyCode);
      if (found) resetAlchemyForm(found);
    });
    alchemyForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (alchemyState.busy) return;
      const fields = alchemyForm.elements;
      const code = (alchemyState.editingCode || fields.code.value).trim();
      const ingredients = [...alchemyIngBox.querySelectorAll(".dynamic-row")].map((row) => ({
        itemCode: row.querySelector('[name="ingCode"]').value.trim(),
        quantity: Number(row.querySelector('[name="ingQty"]').value || 1),
      })).filter((entry) => entry.itemCode);
      const record = {
        id: code,
        code,
        name: fields.name.value.trim(),
        category: fields.category.value,
        quality: fields.quality.value,
        outputItemCode: fields.outputItemCode.value.trim(),
        ...(fields.upgradedItemCode.value.trim() ? { upgradedItemCode: fields.upgradedItemCode.value.trim() } : {}),
        outputQuantity: Number(fields.outputQuantity.value || 1),
        craftSuccessRate: Number(fields.craftSuccessRate.value),
        mutationChance: fields.mutationChance.value === "" ? 0.05 : Number(fields.mutationChance.value),
        requiredRealmStt: fields.requiredRealmStt.value === "" ? 1 : Number(fields.requiredRealmStt.value),
        costXu: fields.costXu.value === "" ? 0 : Number(fields.costXu.value),
        costLinhThach: fields.costLinhThach.value === "" ? 0 : Number(fields.costLinhThach.value),
        ingredients,
      };
      alchemyState.busy = true;
      alchemyStatus.textContent = "Đang lưu…";
      try {
        await contentManager.save("alchemyRecipes", {
          id: code,
          existingId: alchemyState.editingCode,
          json: JSON.stringify(record),
        });
        alchemyState.editingCode = code;
        await openAlchemy();
        alchemyStatus.textContent = `Đã lưu ${code} vào MySQL`;
      } catch (error) {
        alchemyStatus.textContent = error.message || "Lỗi khi lưu công thức";
      } finally {
        alchemyState.busy = false;
      }
    });
    alchemyDeleteBtn?.addEventListener("click", async () => {
      if (alchemyState.busy || !alchemyState.editingCode) return;
      if (!window.confirm(`Xóa công thức “${alchemyState.editingCode}”?`)) return;
      alchemyState.busy = true;
      try {
        await contentManager.remove("alchemyRecipes", alchemyState.editingCode);
        alchemyState.editingCode = null;
        await openAlchemy();
        if (!alchemyState.recipes.length) resetAlchemyForm(null);
        alchemyStatus.textContent = "Đã xóa công thức.";
      } catch (error) {
        alchemyStatus.textContent = error.message || "Không xóa được công thức";
      } finally {
        alchemyState.busy = false;
      }
    });

    // --- 2. Loot Tables Editor ---
    const lootState = { tables: [], editingId: null, busy: false };
    const lootForm = document.getElementById("loot-form");
    const lootList = document.getElementById("loot-list");
    const lootEntriesBox = document.getElementById("loot-entries");
    const lootStatus = document.getElementById("loot-status");
    const lootDeleteBtn = document.getElementById("loot-delete-btn");

    function addLootEntryRow(itemId = "", chance = 0.25, min = 1, max = 1) {
      if (!lootEntriesBox || lootEntriesBox.children.length >= 50) return;
      const row = createDynamicRow(
        `<input name="lootItemId" required maxlength="64" list="admin-item-code-list" placeholder="Mã vật phẩm" value="${esc(itemId)}" />`
        + `<input name="lootChance" type="number" min="0.001" max="1" step="0.005" value="${Number(chance) || 0.1}" title="Xác suất (0..1)" required />`
        + `<input name="lootMin" type="number" min="1" max="99" value="${Number(min) || 1}" title="Min" required />`
        + `<input name="lootMax" type="number" min="1" max="99" value="${Number(max) || 1}" title="Max" required />`,
      );
      lootEntriesBox.appendChild(row);
    }

    function resetLootForm(table = null) {
      if (!lootForm) return;
      lootState.editingId = table ? String(table.id) : null;
      lootForm.reset();
      lootEntriesBox.replaceChildren();
      document.getElementById("loot-form-title").textContent = lootState.editingId
        ? `Bảng rớt: ${lootState.editingId}`
        : "Tạo bảng rớt mới";
      lootDeleteBtn.hidden = !lootState.editingId;
      lootForm.elements.id.readOnly = Boolean(lootState.editingId);
      if (table) {
        lootForm.elements.id.value = table.id || "";
        (table.entries || []).forEach((e) => addLootEntryRow(e.itemId, e.chance, e.min, e.max));
      } else {
        addLootEntryRow("STONE_LINH_NHO", 0.4, 1, 1);
      }
      lootStatus.textContent = lootState.editingId ? "Đang chỉnh sửa" : "Tạo mới";
      renderLootList();
    }

    function renderLootList() {
      if (!lootList) return;
      const query = (document.getElementById("loot-search")?.value || "").trim().toLocaleLowerCase();
      const rows = lootState.tables.filter((t) => String(t.id || "").toLocaleLowerCase().includes(query));
      lootList.innerHTML = rows.map((t) => {
        const selected = t.id === lootState.editingId ? "selected" : "";
        return `<button class="editor-list-row ${selected}" type="button" data-loot-id="${esc(t.id)}">`
          + `<b>${esc(t.id)}</b>`
          + `<small>${(t.entries || []).length} vật phẩm rớt</small>`
          + `</button>`;
      }).join("") || '<div class="empty">Không có bảng rớt phù hợp.</div>';
    }

    async function openLootTables() {
      if (!lootList) return;
      lootList.innerHTML = '<div class="loading">Đang tải bảng rớt…</div>';
      void ensureItemDatalist();
      try {
        const res = await contentManager.list("lootTables");
        lootState.tables = Array.isArray(res?.data) ? res.data : [];
        if (lootState.tables.length && !lootState.editingId) {
          resetLootForm(lootState.tables[0]);
        } else {
          renderLootList();
        }
      } catch (error) {
        lootList.innerHTML = `<div class="empty">${esc(error.message || "Không tải được bảng rớt.")}</div>`;
      }
    }

    document.getElementById("loot-search")?.addEventListener("input", renderLootList);
    document.getElementById("loot-new-btn")?.addEventListener("click", () => resetLootForm(null));
    document.getElementById("loot-add-entry")?.addEventListener("click", () => addLootEntryRow("", 0.2, 1, 1));
    lootList?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-loot-id]");
      if (!btn) return;
      const found = lootState.tables.find((t) => String(t.id) === btn.dataset.lootId);
      if (found) resetLootForm(found);
    });
    lootForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (lootState.busy) return;
      const id = (lootState.editingId || lootForm.elements.id.value).trim();
      const entries = [...lootEntriesBox.querySelectorAll(".dynamic-row")].map((row) => ({
        itemId: row.querySelector('[name="lootItemId"]').value.trim(),
        chance: Number(row.querySelector('[name="lootChance"]').value),
        min: Number(row.querySelector('[name="lootMin"]').value || 1),
        max: Number(row.querySelector('[name="lootMax"]').value || 1),
      })).filter((entry) => entry.itemId);
      lootState.busy = true;
      lootStatus.textContent = "Đang lưu…";
      try {
        await contentManager.save("lootTables", {
          id,
          existingId: lootState.editingId,
          json: JSON.stringify({ id, entries }),
        });
        lootState.editingId = id;
        await openLootTables();
        lootStatus.textContent = `Đã lưu ${id} vào MySQL`;
      } catch (error) {
        lootStatus.textContent = error.message || "Lỗi khi lưu bảng rớt";
      } finally {
        lootState.busy = false;
      }
    });
    lootDeleteBtn?.addEventListener("click", async () => {
      if (lootState.busy || !lootState.editingId) return;
      if (!window.confirm(`Xóa bảng rớt “${lootState.editingId}”?`)) return;
      lootState.busy = true;
      try {
        await contentManager.remove("lootTables", lootState.editingId);
        lootState.editingId = null;
        await openLootTables();
        if (!lootState.tables.length) resetLootForm(null);
        lootStatus.textContent = "Đã xóa bảng rớt.";
      } catch (error) {
        lootStatus.textContent = error.message || "Không xóa được bảng rớt";
      } finally {
        lootState.busy = false;
      }
    });

    // --- 3. GM Mail Sender ---
    const mailForm = document.getElementById("admin-mail-form");
    const mailItemsBox = document.getElementById("mail-items-list");
    const mailStatus = document.getElementById("mail-send-status");
    let mailBusy = false;

    function addMailItemRow(itemCode = "", quantity = 1) {
      if (!mailItemsBox || mailItemsBox.children.length >= 5) return;
      const row = createDynamicRow(
        `<input name="mailItemCode" required maxlength="64" list="admin-item-code-list" placeholder="Mã vật phẩm" value="${esc(itemCode)}" />`
        + `<input name="mailItemQty" type="number" min="1" max="99" value="${Number(quantity) || 1}" required />`,
      );
      mailItemsBox.appendChild(row);
    }

    function openMailSender() {
      void ensureItemDatalist();
    }

    function prefillMail(playerId) {
      if (mailForm?.elements?.playerId && playerId) {
        mailForm.elements.playerId.value = String(playerId);
      }
      if (mailStatus) mailStatus.textContent = `Đã chọn nhân vật ID #${playerId}`;
      openMailSender();
    }

    document.getElementById("mail-add-item")?.addEventListener("click", () => addMailItemRow("", 1));
    mailForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (mailBusy) return;
      const fields = mailForm.elements;
      const items = [...mailItemsBox.querySelectorAll(".dynamic-row")].map((row) => ({
        itemCode: row.querySelector('[name="mailItemCode"]').value.trim(),
        quantity: Number(row.querySelector('[name="mailItemQty"]').value || 1),
      })).filter((entry) => entry.itemCode);
      const payload = {
        requestId: `gm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        playerId: fields.playerId.value.trim(),
        sourceType: fields.sourceType.value || "ADMIN",
        title: fields.title.value.trim(),
        body: fields.body.value.trim(),
        expiresInHours: Number(fields.expiresInHours.value || 168),
        attachments: {
          xu: Number(fields.xu.value || 0),
          linhThach: Number(fields.linhThach.value || 0),
          tuVi: Number(fields.tuVi.value || 0),
          items,
        },
      };
      mailBusy = true;
      mailStatus.textContent = "Đang gửi thư…";
      try {
        const res = await getJson(api.BASE + api.PATHS.admin.mail, {
          method: "POST",
          headers: { ...adminHeaders(), "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        mailStatus.textContent = `Đã gửi thành công tới nhân vật #${payload.playerId} (Mail ID: ${res.mail?.id ?? "OK"})`;
      } catch (error) {
        mailStatus.textContent = error.message || "Gửi thư thất bại";
      } finally {
        mailBusy = false;
      }
    });

    // --- 4. Balance & Config Reference Viewer ---
    async function openBalanceSettings() {
      const grid = document.getElementById("balance-settings-grid");
      if (!grid) return;
      grid.innerHTML = '<div class="loading">Đang đọc /api/balance…</div>';
      try {
        const bal = await getJson(api.BASE + api.PATHS.data.balance);
        const tiers = Array.isArray(bal?.enhance?.tiers) ? bal.enhance.tiers : [];
        const enhanceRows = tiers.map((cfg) => {
          const gems = (cfg.gems || []).map((g) => `${esc(g.itemCode)} ×${Number(g.quantity || 1)}`).join(", ");
          const lt = Number(cfg.linhThach || 0) > 0 ? ` + ${cfg.linhThach} Linh Thạch` : "";
          return `<tr><td>+${esc(cfg.targetLevel)}</td><td>${Math.round(Number(cfg.rate || 0) * 100)}%</td><td>${gems || "—"}</td><td>${Number(cfg.xu || 0).toLocaleString("vi-VN")} Xu${esc(lt)}</td><td>${esc(cfg.failOutcome || "FAIL_DOWN")}</td></tr>`;
        }).join("");
        const qualityRows = Object.entries(bal?.breakthrough?.qualities || {}).map(([, q]) =>
          `<tr><td>${esc(q.label)} (${esc(q.key)})</td><td>${Math.round(Number(q.breakthroughRate || 0) * 100)}%</td><td>Tầng bậc ${esc(q.tier ?? "—")}</td></tr>`,
        ).join("");
        grid.innerHTML = `
          <section class="panel">
            <div class="panel-head"><div><span class="eyebrow">CƯỜNG HÓA TRANG BỊ</span><h3>Bảng tỷ lệ +1 đến +15</h3></div></div>
            <table class="balance-table"><thead><tr><th>Cấp</th><th>Tỷ lệ</th><th>Ngọc yêu cầu</th><th>Chi phí</th><th>Khi thất bại</th></tr></thead><tbody>${enhanceRows || '<tr><td colspan="5">Không có dữ liệu</td></tr>'}</tbody></table>
          </section>
          <section class="panel">
            <div class="panel-head"><div><span class="eyebrow">LUYỆN ĐAN &amp; ĐỘT PHÁ</span><h3>Giới hạn &amp; Phẩm chất đan</h3></div></div>
            <p class="balance-note">Trần tỷ lệ luyện đan: <b>${Math.round(Number(bal?.alchemy?.maxCraftSuccessRate || 0.7) * 100)}%</b> · Đột biến mặc định: <b>${Math.round(Number(bal?.alchemy?.mutationChance || 0.05) * 100)}%</b></p>
            <table class="balance-table"><thead><tr><th>Phẩm chất</th><th>Tỷ lệ phá cảnh</th><th>Cấp phẩm chất</th></tr></thead><tbody>${qualityRows || '<tr><td colspan="3">Không có dữ liệu</td></tr>'}</tbody></table>
          </section>`;
      } catch (error) {
        grid.innerHTML = `<div class="empty">${esc(error.message || "Không tải được cấu hình cân bằng.")}</div>`;
      }
    }

    return {
      openAlchemy,
      openLootTables,
      openMailSender,
      prefillMail,
      openBalanceSettings,
      ensureItemDatalist,
    };
  }

  return { mount };
});
