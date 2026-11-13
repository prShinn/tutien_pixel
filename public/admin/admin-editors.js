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
    row.querySelector(".dynamic-row-remove")?.addEventListener("click", () => {
      row.remove?.();
      onRemove?.();
    });
    return row;
  }

  function mount({ api, getJson, adminHeaders, contentManager, escapeHtml }) {
    const esc = escapeHtml || ((value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch])));

    let itemsCatalog = [];
    let itemDatalistLoaded = false;
    async function ensureItemCatalog() {
      if (itemDatalistLoaded && itemsCatalog.length) return itemsCatalog;
      try {
        const items = await getJson(api.BASE + api.PATHS.data.items);
        if (Array.isArray(items)) {
          itemsCatalog = items;
          itemDatalistLoaded = true;
          const listEl = document.getElementById("admin-item-code-list");
          if (listEl) {
            listEl.innerHTML = items.map((item) => {
              const code = esc(item.id || item.maDo || "");
              const label = esc(item.tenDo || item.name || code);
              return `<option value="${code}">${label} (${code})</option>`;
            }).join("");
          }
        }
      } catch {
        // Bỏ qua nếu chưa tải được
      }
      return itemsCatalog;
    }

    async function ensureItemDatalist() {
      return ensureItemCatalog();
    }

    let monstersCatalog = [];
    let monsterDatalistLoaded = false;
    async function ensureMonsterCatalog() {
      if (monsterDatalistLoaded && monstersCatalog.length) return monstersCatalog;
      try {
        const monsters = await getJson(api.BASE + api.PATHS.data.monsters);
        if (Array.isArray(monsters)) {
          monstersCatalog = monsters;
          monsterDatalistLoaded = true;
          const listEl = document.getElementById("admin-monster-code-list");
          if (listEl) {
            listEl.innerHTML = monsters.map((m) => {
              const code = esc(m.code || m.id || "");
              const label = esc(m.name || code);
              return `<option value="${code}">${label} (${code})</option>`;
            }).join("");
          }
        }
      } catch {
        // Bỏ qua nếu chưa tải được
      }
      return monstersCatalog;
    }

    async function ensureMonsterDatalist() {
      return ensureMonsterCatalog();
    }

    function buildItemOptions(selectedCode = "") {
      const selected = String(selectedCode || "").trim();
      let hasSelected = false;
      const opts = itemsCatalog.map((item) => {
        const code = String(item.id || item.maDo || "");
        const name = item.tenDo || item.name || code;
        const type = item.loai || item.type || "Vật phẩm";
        const isSel = code === selected;
        if (isSel) hasSelected = true;
        return `<option value="${esc(code)}"${isSel ? " selected" : ""}>${esc(name)} · [${esc(type)}]</option>`;
      });
      if (selected && !hasSelected) {
        opts.unshift(`<option value="${esc(selected)}" selected>${esc(selected)} (Hiện tại)</option>`);
      } else if (!selected) {
        opts.unshift('<option value="" selected>-- Chọn vật phẩm --</option>');
      }
      return opts.join("");
    }

    function getItemName(code) {
      if (!code) return "—";
      const found = itemsCatalog.find((i) => (i.id || i.maDo) === code);
      return found ? (found.tenDo || found.name || code) : code;
    }

    function buildMonsterOptions(selectedCode = "") {
      const selected = String(selectedCode || "").trim();
      let hasSelected = false;
      const opts = monstersCatalog.map((m) => {
        const code = String(m.code || m.id || "");
        const name = m.name || code;
        const lv = m.level ? `Lv.${m.level}` : "";
        const isSel = code === selected;
        if (isSel) hasSelected = true;
        return `<option value="${esc(code)}"${isSel ? " selected" : ""}>${esc(name)}${lv ? ` · ${esc(lv)}` : ""} [${esc(code)}]</option>`;
      });
      if (selected && !hasSelected) {
        opts.unshift(`<option value="${esc(selected)}" selected>${esc(selected)} (Hiện tại)</option>`);
      } else if (!selected) {
        opts.unshift('<option value="" selected>-- Chọn quái vật --</option>');
      }
      return opts.join("");
    }

    function slugify(text, uppercase = false) {
      const s = String(text || "")
        .replace(/Đ/g, "D").replace(/đ/g, "d")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      return uppercase ? s.toUpperCase() : s.toLowerCase();
    }

    function updateQuestDatalist(quests) {
      const listEl = document.getElementById("admin-quest-id-list");
      if (!listEl || !Array.isArray(quests)) return;
      listEl.innerHTML = quests.map((q) => {
        const id = esc(q.id || "");
        const label = esc(q.title || id);
        return `<option value="${id}">${label} (${id})</option>`;
      }).join("");
    }

    // --- 1. Alchemy Recipes Editor ---
    const alchemyState = {
      recipes: [],
      editingCode: null,
      busy: false,
      page: 1,
      limit: 20,
      total: 0,
      hasMore: true,
      loadingMore: false,
    };
    const alchemyForm = document.getElementById("alchemy-form");
    const alchemyList = document.getElementById("alchemy-list");
    const alchemyIngBox = document.getElementById("alchemy-ingredients");
    const alchemyStatus = document.getElementById("alchemy-status");
    const alchemyDeleteBtn = document.getElementById("alchemy-delete-btn");

    function addIngredientRow(itemCode = "", quantity = 1) {
      if (!alchemyIngBox || alchemyIngBox.children.length >= 10) return;
      const row = createDynamicRow(
        `<select name="ingCode" class="alchemy-item-select" required>${buildItemOptions(itemCode)}</select>`
        + `<input name="ingQty" type="number" min="1" max="999" value="${Number(quantity) || 1}" title="Số lượng" required />`,
      );
      alchemyIngBox.appendChild(row);
    }

    function resetAlchemyForm(recipe = null) {
      if (!alchemyForm) return;
      alchemyState.editingCode = recipe ? String(recipe.code || recipe.id || "") : null;
      alchemyForm.reset();
      alchemyIngBox.replaceChildren();
      document.getElementById("alchemy-form-title").textContent = alchemyState.editingCode
        ? `Sửa công thức: ${recipe?.name || alchemyState.editingCode}`
        : "Tạo công thức mới";
      alchemyDeleteBtn.hidden = !alchemyState.editingCode;
      const fields = alchemyForm.elements;
      fields.code.readOnly = Boolean(alchemyState.editingCode);
      if (fields.outputItemCode?.tagName === "SELECT") {
        fields.outputItemCode.innerHTML = buildItemOptions(recipe?.outputItemCode || "DAN_PHI_THANG");
      }
      if (fields.upgradedItemCode?.tagName === "SELECT") {
        fields.upgradedItemCode.innerHTML = '<option value="">-- Không có đan đột biến --</option>' + buildItemOptions(recipe?.upgradedItemCode || "");
      }
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
      let rowsHtml = rows.map((r) => {
        const code = String(r.code || r.id || "");
        const selected = code === alchemyState.editingCode ? "selected" : "";
        const outName = getItemName(r.outputItemCode);
        return `<button class="editor-list-row ${selected}" type="button" data-alchemy-code="${esc(code)}">`
          + `<b>${esc(r.name || code)}</b>`
          + `<small>Tạo ra: ${esc(outName)} · [${esc(r.category || "BASIC")}] · ${(Number(r.craftSuccessRate || 0) * 100).toFixed(0)}%</small>`
          + `</button>`;
      }).join("");
      if (!rowsHtml) {
        rowsHtml = '<div class="empty">Không có công thức phù hợp.</div>';
      }
      let footerHtml = "";
      if (alchemyState.loadingMore) {
        footerHtml = '<div class="editor-list-footer loading">Đang nạp thêm công thức…</div>';
      } else if (alchemyState.hasMore) {
        footerHtml = `<button class="editor-list-load-btn" type="button" data-load-more="alchemy">▼ Tải thêm công thức (Trang ${alchemyState.page + 1})</button>`;
      } else if (alchemyState.recipes.length > alchemyState.limit) {
        footerHtml = `<div class="editor-list-footer end">Đã tải hết (${alchemyState.recipes.length}/${alchemyState.total || alchemyState.recipes.length} công thức)</div>`;
      }
      alchemyList.innerHTML = rowsHtml + footerHtml;
    }

    async function loadMoreAlchemy() {
      if (alchemyState.loadingMore || !alchemyState.hasMore) return;
      alchemyState.loadingMore = true;
      alchemyState.page += 1;
      renderAlchemyList();
      await openAlchemy(false);
      alchemyState.loadingMore = false;
      renderAlchemyList();
    }

    async function openAlchemy(reset = true) {
      if (!alchemyList) return;
      if (reset) {
        alchemyState.page = 1;
        alchemyState.recipes = [];
        alchemyState.hasMore = true;
        alchemyState.loadingMore = false;
        alchemyList.innerHTML = '<div class="loading">Đang tải công thức…</div>';
      }
      await ensureItemCatalog();
      const search = (document.getElementById("alchemy-search")?.value || "").trim();
      try {
        const res = await contentManager.list("alchemyRecipes", {
          page: alchemyState.page,
          limit: alchemyState.limit,
          q: search,
        });
        const rows = Array.isArray(res?.data) ? res.data : [];
        if (reset) {
          alchemyState.recipes = rows;
        } else {
          const existingCodes = new Set(alchemyState.recipes.map((r) => String(r.code || r.id)));
          rows.forEach((r) => {
            const k = String(r.code || r.id);
            if (!existingCodes.has(k)) {
              existingCodes.add(k);
              alchemyState.recipes.push(r);
            }
          });
        }
        alchemyState.total = res.pagination?.total ?? alchemyState.recipes.length;
        alchemyState.hasMore = alchemyState.recipes.length < alchemyState.total;
        if (alchemyState.recipes.length && !alchemyState.editingCode && reset) {
          resetAlchemyForm(alchemyState.recipes[0]);
        } else {
          renderAlchemyList();
        }
      } catch (error) {
        if (reset) {
          alchemyList.innerHTML = `<div class="empty">${esc(error.message || "Không tải được công thức.")}</div>`;
        }
      }
    }

    let alchemySearchTimer;
    document.getElementById("alchemy-search")?.addEventListener("input", () => {
      clearTimeout(alchemySearchTimer);
      alchemySearchTimer = setTimeout(() => {
        void openAlchemy(true);
      }, 250);
    });
    document.getElementById("alchemy-new-btn")?.addEventListener("click", () => resetAlchemyForm(null));
    document.getElementById("alchemy-add-ingredient")?.addEventListener("click", () => addIngredientRow("", 1));
    alchemyForm?.elements?.name?.addEventListener("input", () => {
      const fields = alchemyForm.elements;
      if (!alchemyState.editingCode && fields.code && !fields.code.readOnly) {
        fields.code.value = ("RECIPE_" + slugify(fields.name.value, true)).slice(0, 64);
      }
    });
    alchemyList?.addEventListener("scroll", () => {
      if (alchemyState.loadingMore || !alchemyState.hasMore) return;
      if (alchemyList.scrollTop + alchemyList.clientHeight >= alchemyList.scrollHeight - 30) {
        void loadMoreAlchemy();
      }
    });
    alchemyList?.addEventListener("click", (event) => {
      if (event.target.closest('[data-load-more="alchemy"]')) {
        void loadMoreAlchemy();
        return;
      }
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
        if (typeof window !== "undefined" && typeof window.showToast === "function") {
          window.showToast(`Đã lưu công thức luyện đan ${code} vào MySQL!`, "success");
        }
      } catch (error) {
        alchemyStatus.textContent = error.message || "Lỗi khi lưu công thức";
        if (typeof window !== "undefined" && typeof window.showToast === "function") {
          window.showToast(error.message || "Lỗi khi lưu công thức", "error");
        }
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
        if (typeof window !== "undefined" && typeof window.showToast === "function") {
          window.showToast("Đã xóa công thức luyện đan thành công!", "success");
        }
      } catch (error) {
        alchemyStatus.textContent = error.message || "Không xóa được công thức";
        if (typeof window !== "undefined" && typeof window.showToast === "function") {
          window.showToast(error.message || "Không xóa được công thức", "error");
        }
      } finally {
        alchemyState.busy = false;
      }
    });

    // --- 2. Loot Tables Editor ---
    const lootState = {
      tables: [],
      editingId: null,
      busy: false,
      page: 1,
      limit: 20,
      total: 0,
      hasMore: true,
      loadingMore: false,
    };
    const lootForm = document.getElementById("loot-form");
    const lootList = document.getElementById("loot-list");
    const lootEntriesBox = document.getElementById("loot-entries");
    const lootStatus = document.getElementById("loot-status");
    const lootDeleteBtn = document.getElementById("loot-delete-btn");

    function addLootEntryRow(itemId = "", chance = 0.25, min = 1, max = 1) {
      if (!lootEntriesBox || lootEntriesBox.children.length >= 50) return;
      const row = createDynamicRow(
        `<select name="lootItemId" class="loot-item-select" required>${buildItemOptions(itemId)}</select>`
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
      let rowsHtml = rows.map((t) => {
        const selected = t.id === lootState.editingId ? "selected" : "";
        const entryNames = (t.entries || []).map((e) => getItemName(e.itemId));
        const previewText = entryNames.slice(0, 3).join(", ") + (entryNames.length > 3 ? "…" : "");
        return `<button class="editor-list-row ${selected}" type="button" data-loot-id="${esc(t.id)}">`
          + `<b>${esc(t.id)}</b>`
          + `<small>${esc(previewText || "Chưa có vật phẩm")} (${(t.entries || []).length} món)</small>`
          + `</button>`;
      }).join("");
      if (!rowsHtml) {
        rowsHtml = '<div class="empty">Không có bảng rớt phù hợp.</div>';
      }
      let footerHtml = "";
      if (lootState.loadingMore) {
        footerHtml = '<div class="editor-list-footer loading">Đang nạp thêm bảng rớt…</div>';
      } else if (lootState.hasMore) {
        footerHtml = `<button class="editor-list-load-btn" type="button" data-load-more="loot">▼ Tải thêm bảng rớt (Trang ${lootState.page + 1})</button>`;
      } else if (lootState.tables.length > lootState.limit) {
        footerHtml = `<div class="editor-list-footer end">Đã tải hết (${lootState.tables.length}/${lootState.total || lootState.tables.length} bảng rớt)</div>`;
      }
      lootList.innerHTML = rowsHtml + footerHtml;
    }

    async function loadMoreLoot() {
      if (lootState.loadingMore || !lootState.hasMore) return;
      lootState.loadingMore = true;
      lootState.page += 1;
      renderLootList();
      await openLootTables(false);
      lootState.loadingMore = false;
      renderLootList();
    }

    async function openLootTables(reset = true) {
      if (!lootList) return;
      if (reset) {
        lootState.page = 1;
        lootState.tables = [];
        lootState.hasMore = true;
        lootState.loadingMore = false;
        lootList.innerHTML = '<div class="loading">Đang tải bảng rớt…</div>';
      }
      await ensureItemCatalog();
      const search = (document.getElementById("loot-search")?.value || "").trim();
      try {
        const res = await contentManager.list("lootTables", {
          page: lootState.page,
          limit: lootState.limit,
          q: search,
        });
        const rows = Array.isArray(res?.data) ? res.data : [];
        if (reset) {
          lootState.tables = rows;
        } else {
          const existingIds = new Set(lootState.tables.map((t) => String(t.id)));
          rows.forEach((t) => {
            const k = String(t.id);
            if (!existingIds.has(k)) {
              existingIds.add(k);
              lootState.tables.push(t);
            }
          });
        }
        lootState.total = res.pagination?.total ?? lootState.tables.length;
        lootState.hasMore = lootState.tables.length < lootState.total;
        if (lootState.tables.length && !lootState.editingId && reset) {
          resetLootForm(lootState.tables[0]);
        } else {
          renderLootList();
        }
      } catch (error) {
        if (reset) {
          lootList.innerHTML = `<div class="empty">${esc(error.message || "Không tải được bảng rớt.")}</div>`;
        }
      }
    }

    let lootSearchTimer;
    document.getElementById("loot-search")?.addEventListener("input", () => {
      clearTimeout(lootSearchTimer);
      lootSearchTimer = setTimeout(() => {
        void openLootTables(true);
      }, 250);
    });
    document.getElementById("loot-new-btn")?.addEventListener("click", () => resetLootForm(null));
    document.getElementById("loot-add-entry")?.addEventListener("click", () => addLootEntryRow("", 0.25, 1, 1));
    lootList?.addEventListener("scroll", () => {
      if (lootState.loadingMore || !lootState.hasMore) return;
      if (lootList.scrollTop + lootList.clientHeight >= lootList.scrollHeight - 30) {
        void loadMoreLoot();
      }
    });
    lootList?.addEventListener("click", (event) => {
      if (event.target.closest('[data-load-more="loot"]')) {
        void loadMoreLoot();
        return;
      }
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
        if (typeof window !== "undefined" && typeof window.showToast === "function") {
          window.showToast(`Đã lưu bảng rớt đồ ${id} vào MySQL!`, "success");
        }
      } catch (error) {
        lootStatus.textContent = error.message || "Lỗi khi lưu bảng rớt";
        if (typeof window !== "undefined" && typeof window.showToast === "function") {
          window.showToast(error.message || "Lỗi khi lưu bảng rớt", "error");
        }
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
        if (typeof window !== "undefined" && typeof window.showToast === "function") {
          window.showToast("Đã xóa bảng rớt đồ thành công!", "success");
        }
      } catch (error) {
        lootStatus.textContent = error.message || "Không xóa được bảng rớt";
        if (typeof window !== "undefined" && typeof window.showToast === "function") {
          window.showToast(error.message || "Không xóa được bảng rớt", "error");
        }
      } finally {
        lootState.busy = false;
      }
    });

    // --- 3. GM Mail Sender ---
    const mailForm = document.getElementById("admin-mail-form");
    const mailItemsBox = document.getElementById("mail-items-list");
    const mailStatus = document.getElementById("mail-send-status");
    const mailPlayerSelect = document.getElementById("mail-player-select");
    const mailPlayerIdInput = document.getElementById("mail-player-id-input") || mailForm?.elements?.playerId;
    const mailRecipientCard = document.getElementById("mail-recipient-card");
    const mailRecipientName = document.getElementById("mail-recipient-name");
    const mailRecipientMeta = document.getElementById("mail-recipient-meta");
    let mailBusy = false;
    let cachedAccounts = [];
    const mailPlayerPaging = {
      page: 1,
      limit: 20,
      total: 0,
      hasMore: true,
      loading: false,
    };

    function addMailItemRow(itemCode = "", quantity = 1) {
      if (!mailItemsBox || mailItemsBox.children.length >= 5) return;
      const row = createDynamicRow(
        `<select name="mailItemCode" class="mail-item-select" required>${buildItemOptions(itemCode)}</select>`
        + `<input name="mailItemQty" type="number" min="1" max="99" value="${Number(quantity) || 1}" title="Số lượng" required />`,
      );
      mailItemsBox.appendChild(row);
    }

    async function loadMoreMailPlayers() {
      if (mailPlayerPaging.loading || !mailPlayerPaging.hasMore) return;
      mailPlayerPaging.loading = true;
      mailPlayerPaging.page += 1;
      const loadMoreBtn = document.getElementById("mail-player-load-more-btn");
      if (loadMoreBtn) loadMoreBtn.textContent = "Đang tải thêm nhân vật…";
      await loadMailPlayers(false);
      mailPlayerPaging.loading = false;
    }

    async function loadMailPlayers(reset = true) {
      if (!mailPlayerSelect) return;
      if (reset) {
        mailPlayerPaging.page = 1;
        mailPlayerPaging.hasMore = true;
        mailPlayerPaging.loading = false;
        cachedAccounts = [];
        mailPlayerSelect.innerHTML = '<option value="">-- Đang nạp danh sách nhân vật… --</option>';
      }
      try {
        const res = await contentManager.list("accounts", {
          page: mailPlayerPaging.page,
          limit: mailPlayerPaging.limit,
        });
        const list = Array.isArray(res?.data) ? res.data : [];
        const existingPlayerIds = new Set(cachedAccounts.map((a) => a.playerId));
        list.forEach((acc) => {
          if (acc && acc.playerId && !existingPlayerIds.has(acc.playerId)) {
            existingPlayerIds.add(acc.playerId);
            cachedAccounts.push(acc);
          }
        });
        mailPlayerPaging.total = res.pagination?.total ?? cachedAccounts.length;
        mailPlayerPaging.hasMore = cachedAccounts.length < mailPlayerPaging.total;

        const curVal = mailPlayerIdInput?.value || mailPlayerSelect.value || "";
        let optsHtml = '<option value="">-- Chọn nhân vật nhận quà --</option>'
          + cachedAccounts.map((acc) => {
            const pid = esc(acc.playerId);
            const pName = esc(acc.playerName || "Tu Sĩ");
            const realm = esc(acc.realmCode || "Luyện Thể");
            const stage = acc.realmStage ? ` ${acc.realmStage}` : "";
            const uName = esc(acc.username || "Chưa rõ");
            const isSel = pid === curVal ? " selected" : "";
            return `<option value="${pid}"${isSel}>${pName} · [${realm}${stage}] (Tài khoản: ${uName})</option>`;
          }).join("");

        if (mailPlayerPaging.hasMore) {
          optsHtml += `<option value="__LOAD_MORE__">▼ Đang hiện ${cachedAccounts.length}/${mailPlayerPaging.total} nhân vật · Cuộn / Bấm để tải thêm…</option>`;
        }
        mailPlayerSelect.innerHTML = optsHtml;

        const loadMoreBtn = document.getElementById("mail-player-load-more-btn");
        if (loadMoreBtn) {
          loadMoreBtn.hidden = !mailPlayerPaging.hasMore;
          loadMoreBtn.textContent = `▼ Tải thêm nhân vật (Đang hiện ${cachedAccounts.length}/${mailPlayerPaging.total})`;
        }

        if (curVal && curVal !== "__LOAD_MORE__") {
          mailPlayerSelect.value = curVal;
          syncRecipientCard(curVal);
        }
      } catch {
        if (reset) {
          mailPlayerSelect.innerHTML = '<option value="">-- Lỗi tải danh sách nhân vật --</option>';
        }
      }
    }

    mailPlayerSelect?.addEventListener("scroll", () => {
      if (mailPlayerPaging.loading || !mailPlayerPaging.hasMore) return;
      if (mailPlayerSelect.scrollTop + mailPlayerSelect.clientHeight >= mailPlayerSelect.scrollHeight - 20) {
        void loadMoreMailPlayers();
      }
    });
    document.getElementById("mail-player-load-more-btn")?.addEventListener("click", () => {
      void loadMoreMailPlayers();
    });

    function syncRecipientCard(playerId) {
      if (!playerId) {
        if (mailPlayerIdInput) mailPlayerIdInput.value = "";
        if (mailRecipientCard) mailRecipientCard.hidden = true;
        if (mailStatus) mailStatus.textContent = "";
        return;
      }
      const pIdStr = String(playerId);
      if (mailPlayerIdInput) mailPlayerIdInput.value = pIdStr;
      if (mailPlayerSelect && mailPlayerSelect.value !== pIdStr) {
        mailPlayerSelect.value = pIdStr;
      }
      const acc = cachedAccounts.find((a) => String(a.playerId) === pIdStr);
      if (acc) {
        if (mailRecipientCard) mailRecipientCard.hidden = false;
        if (mailRecipientName) mailRecipientName.textContent = `Tu Sĩ: ${acc.playerName || "Chưa đặt tên"}`;
        if (mailRecipientMeta) {
          const realm = acc.realmCode || "Luyện Thể";
          const stage = acc.realmStage ? ` ${acc.realmStage}` : "";
          mailRecipientMeta.textContent = `Tài khoản: ${acc.username} · Cảnh giới: ${realm}${stage}`;
        }
        if (mailStatus) mailStatus.textContent = `Người nhận: ${acc.playerName || acc.username}`;
      } else {
        if (mailRecipientCard) mailRecipientCard.hidden = false;
        if (mailRecipientName) mailRecipientName.textContent = `Nhân vật đã chọn`;
        if (mailRecipientMeta) mailRecipientMeta.textContent = `Đang đồng bộ dữ liệu nhân vật…`;
        if (mailStatus) mailStatus.textContent = `Người nhận: ${pIdStr}`;
      }
    }

    mailPlayerSelect?.addEventListener("change", (e) => {
      if (e.target.value === "__LOAD_MORE__") {
        void loadMoreMailPlayers();
        return;
      }
      syncRecipientCard(e.target.value);
    });

    async function openMailSender() {
      await Promise.all([ensureItemCatalog(), loadMailPlayers()]);
    }

    function prefillMail(target, name, user, realm) {
      let playerId = "";
      let playerName = "";
      let username = "";
      let realmCode = "";
      if (target && typeof target === "object") {
        playerId = target.playerId || "";
        playerName = target.playerName || "";
        username = target.username || "";
        realmCode = target.realmCode || "";
      } else {
        playerId = String(target || "");
        playerName = name || "";
        username = user || "";
        realmCode = realm || "";
      }
      if (mailPlayerIdInput && playerId) {
        mailPlayerIdInput.value = String(playerId);
      }
      if (mailRecipientCard && playerId) {
        mailRecipientCard.hidden = false;
        if (mailRecipientName) mailRecipientName.textContent = `Tu Sĩ: ${playerName || "Nhân vật đã chọn"}`;
        if (mailRecipientMeta) mailRecipientMeta.textContent = `Tài khoản: ${username || "Hệ thống"} · Cảnh giới: ${realmCode || "Luyện Thể"}`;
      }
      if (mailStatus) {
        mailStatus.textContent = playerName ? `Người nhận: ${playerName}` : `Người nhận: ${playerId}`;
      }
      if (playerId && !cachedAccounts.some((a) => a.playerId === playerId)) {
        cachedAccounts.push({
          playerId,
          playerName: playerName || "Tu Sĩ",
          username: username || "Hệ thống",
          realmCode: realmCode || "LUYEN_THE",
        });
      }
      if (mailPlayerSelect && playerId) {
        let opt = mailPlayerSelect.querySelector(`option[value="${esc(playerId)}"]`);
        if (!opt) {
          opt = document.createElement("option");
          opt.value = playerId;
          opt.textContent = `${playerName || "Tu Sĩ"} · [${realmCode || "Luyện Thể"}] (Tài khoản: ${username || "Hệ thống"})`;
          mailPlayerSelect.appendChild(opt);
        }
        mailPlayerSelect.value = playerId;
      }
      void openMailSender();
    }

    document.getElementById("mail-add-item")?.addEventListener("click", () => addMailItemRow("", 1));
    mailForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (mailBusy) return;
      const fields = mailForm.elements;
      const playerId = (mailPlayerIdInput?.value || fields.playerId?.value || mailPlayerSelect?.value || "").trim();
      if (!playerId) {
        if (mailStatus) mailStatus.textContent = "Vui lòng chọn nhân vật nhận quà!";
        return;
      }
      const items = [...mailItemsBox.querySelectorAll(".dynamic-row")].map((row) => ({
        itemCode: row.querySelector('[name="mailItemCode"]').value.trim(),
        quantity: Number(row.querySelector('[name="mailItemQty"]').value || 1),
      })).filter((entry) => entry.itemCode);
      const payload = {
        requestId: `gm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        playerId,
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
        const targetAcc = cachedAccounts.find((a) => a.playerId === payload.playerId);
        const recipientDisplay = targetAcc?.playerName || payload.playerId;
        mailStatus.textContent = `Đã gửi thành công tới Tu Sĩ “${recipientDisplay}” (Thư ID: ${res.mail?.id ?? "OK"})`;
        if (typeof window !== "undefined" && typeof window.showToast === "function") {
          window.showToast(`Đã phát thư & quà thành công tới Tu Sĩ “${recipientDisplay}”!`, "success");
        }
      } catch (error) {
        mailStatus.textContent = error.message || "Gửi thư thất bại";
        if (typeof window !== "undefined" && typeof window.showToast === "function") {
          window.showToast(error.message || "Gửi thư thất bại", "error");
        }
      } finally {
        mailBusy = false;
      }
    });

    // --- 4. Balance & Config Reference Viewer ---
    async function openBalanceSettings() {
      const grid = document.getElementById("balance-settings-grid");
      if (!grid) return;
      grid.innerHTML = '<div class="loading">Đang tải cấu hình máy chủ và cân bằng hệ thống…</div>';
      await ensureItemCatalog();
      try {
        const [bal, srv] = await Promise.all([
          getJson(api.BASE + api.PATHS.data.balance),
          getJson(api.BASE + "/api/admin/server-config", { headers: adminHeaders() }).catch(() => null),
        ]);
        const tiers = Array.isArray(bal?.enhance?.tiers) ? bal.enhance.tiers : [];
        const enhanceRows = tiers.map((cfg) => {
          const gems = (cfg.gems || []).map((g) => `${esc(getItemName(g.itemCode))} ×${Number(g.quantity || 1)}`).join(", ");
          const lt = Number(cfg.linhThach || 0) > 0 ? ` + ${cfg.linhThach} Linh Thạch` : "";
          return `<tr><td>+${esc(cfg.targetLevel)}</td><td>${Math.round(Number(cfg.rate || 0) * 100)}%</td><td>${gems || "—"}</td><td>${Number(cfg.xu || 0).toLocaleString("vi-VN")} Xu${esc(lt)}</td><td>${esc(cfg.failOutcome || "FAIL_DOWN")}</td></tr>`;
        }).join("");
        const qualityRows = Object.entries(bal?.breakthrough?.qualities || {}).map(([, q]) =>
          `<tr><td>${esc(q.label)} (${esc(q.key)})</td><td>${Math.round(Number(q.breakthroughRate || 0) * 100)}%</td><td>Tầng bậc ${esc(q.tier ?? "—")}</td></tr>`,
        ).join("");

        const srvData = srv?.data || {};
        grid.innerHTML = `
          <section class="panel" style="grid-column: 1 / -1;">
            <div class="panel-head">
              <div>
                <span class="eyebrow">SERVER OPERATIONS</span>
                <h3>Cấu hình Vận hành &amp; Sự kiện Máy chủ</h3>
                <p style="margin:4px 0 0;color:var(--muted,#8ca090);font-size:12px;">Cấu hình áp dụng cho toàn máy chủ, lưu bền vững MySQL.</p>
              </div>
              <button id="save-server-config-btn" class="hero-action" type="button">💾 Lưu cấu hình máy chủ</button>
            </div>
            <form id="server-config-form" class="editor-form-panel" style="padding:0;background:transparent;border:none;">
              <div class="form-grid-3">
                <label>
                  Chế độ bảo trì máy chủ
                  <select id="server-maintenance-mode" style="background:#16241f;border:1px solid #2e4438;color:#fff;padding:8px;border-radius:4px;">
                    <option value="false"${!srvData.maintenanceMode ? " selected" : ""}>Hoạt động bình thường (ONLINE)</option>
                    <option value="true"${srvData.maintenanceMode ? " selected" : ""}>Bật bảo trì (MAINTENANCE)</option>
                  </select>
                </label>
                <label>
                  Hệ số Rơi Đồ (Drop Multiplier)
                  <input id="server-drop-rate" type="number" step="0.1" min="0.1" max="10" value="${esc(srvData.dropRateMultiplier ?? 1.0)}" />
                </label>
                <label>
                  Hệ số Tu Vi / EXP (EXP Multiplier)
                  <input id="server-exp-rate" type="number" step="0.1" min="0.1" max="10" value="${esc(srvData.expMultiplier ?? 1.0)}" />
                </label>
              </div>
              <div class="form-grid-3" style="margin-top:12px;">
                <label>
                  Hệ số Tiền / Xu (Gold Multiplier)
                  <input id="server-gold-rate" type="number" step="0.1" min="0.1" max="10" value="${esc(srvData.goldMultiplier ?? 1.0)}" />
                </label>
                <label style="grid-column: span 2;">
                  Thông báo toàn server (MOTD Banner)
                  <input id="server-announcement" maxlength="255" value="${esc(srvData.announcement || "")}" placeholder="Thông điệp hiển thị trên đầu game..." />
                </label>
              </div>
              <div class="form-full-label" style="margin-top:12px;">
                <label>
                  Thông điệp bảo trì (hiển thị khi bật bảo trì)
                  <textarea id="server-maintenance-msg" rows="2" placeholder="Lý do &amp; thời gian bảo trì dự kiến...">${esc(srvData.maintenanceMessage || "")}</textarea>
                </label>
              </div>
            </form>
          </section>
          <section class="panel">
            <div class="panel-head"><div><span class="eyebrow">CƯỜNG HÓA TRANG BỊ</span><h3>Bảng tỷ lệ +1 đến +15</h3></div></div>
            <table class="balance-table"><thead><tr><th>Cấp</th><th>Tỷ lệ</th><th>Ngọc yêu cầu</th><th>Chi phí</th><th>Khi thất bại</th></tr></thead><tbody>${enhanceRows || '<tr><td colspan="5">Không có dữ liệu</td></tr>'}</tbody></table>
          </section>
          <section class="panel">
            <div class="panel-head"><div><span class="eyebrow">LUYỆN ĐAN &amp; ĐỘT PHÁ</span><h3>Giới hạn &amp; Phẩm chất đan</h3></div></div>
            <p class="balance-note">Trần tỷ lệ luyện đan: <b>${Math.round(Number(bal?.alchemy?.maxCraftSuccessRate || 0.7) * 100)}%</b> · Đột biến mặc định: <b>${Math.round(Number(bal?.alchemy?.mutationChance || 0.05) * 100)}%</b></p>
            <table class="balance-table"><thead><tr><th>Phẩm chất</th><th>Tỷ lệ phá cảnh</th><th>Cấp phẩm chất</th></tr></thead><tbody>${qualityRows || '<tr><td colspan="3">Không có dữ liệu</td></tr>'}</tbody></table>
          </section>`;

        const saveBtn = document.getElementById("save-server-config-btn");
        saveBtn?.addEventListener("click", async () => {
          saveBtn.disabled = true;
          saveBtn.textContent = "Đang lưu…";
          try {
            const payload = {
              maintenanceMode: document.getElementById("server-maintenance-mode")?.value === "true",
              dropRateMultiplier: Number(document.getElementById("server-drop-rate")?.value) || 1.0,
              expMultiplier: Number(document.getElementById("server-exp-rate")?.value) || 1.0,
              goldMultiplier: Number(document.getElementById("server-gold-rate")?.value) || 1.0,
              announcement: document.getElementById("server-announcement")?.value.trim() || "",
              maintenanceMessage: document.getElementById("server-maintenance-msg")?.value.trim() || "",
            };
            const res = await fetch(api.BASE + "/api/admin/server-config", {
              method: "PUT",
              headers: { ...adminHeaders(), "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const result = await res.json();
            if (!res.ok || !result.ok) throw new Error(result.error || result.message || "Lỗi khi lưu cấu hình máy chủ");
            window.showToast?.("Đã lưu cấu hình máy chủ thành công!", "success");
          } catch (err) {
            window.showToast?.(err.message || "Không lưu được cấu hình", "error");
          } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = "💾 Lưu cấu hình máy chủ";
          }
        });
      } catch (error) {
        grid.innerHTML = `<div class="empty">${esc(error.message || "Không tải được cấu hình cân bằng.")}</div>`;
      }
    }

    // --- 5. Quest Studio ---
    const questState = {
      quests: [],
      editingId: null,
      busy: false,
      page: 1,
      limit: 20,
      total: 0,
      hasMore: true,
      loadingMore: false,
    };
    const questForm = document.getElementById("quest-form");
    const questList = document.getElementById("quest-list");
    const questRewardsBox = document.getElementById("quest-rewards-list");
    const questStatus = document.getElementById("quest-status");
    const questDeleteBtn = document.getElementById("quest-delete-btn");
    const questEventTypeSelect = questForm?.elements?.eventType;
    const questTargetCodeInput = questForm?.elements?.targetCode;
    const questTargetIdLabel = document.getElementById("quest-target-id-label");
    const questTargetMonsterSelect = document.getElementById("quest-target-monster-select");
    const questTargetItemSelect = document.getElementById("quest-target-item-select");
    const questRequiresSelect = document.getElementById("quest-requires-select");
    const questRequiresInput = document.getElementById("quest-requires-input") || questForm?.elements?.requiresQuestId;

    function refreshQuestRequiresOptions(selectedId = "") {
      if (!questRequiresSelect) return;
      const opts = ['<option value="">-- Không yêu cầu nhiệm vụ tiên quyết --</option>'];
      questState.quests.forEach((q) => {
        if (q.id === questState.editingId) return;
        const cat = q.category === "main" ? "Chính Tuyến" : q.category === "daily" ? "Hàng Ngày" : "Phụ Tuyến";
        const isSel = q.id === selectedId;
        opts.push(`<option value="${esc(q.id)}"${isSel ? " selected" : ""}>${esc(q.title || q.id)} · [${cat}]</option>`);
      });
      questRequiresSelect.innerHTML = opts.join("");
      if (selectedId) questRequiresSelect.value = selectedId;
    }

    function updateQuestTargetUi() {
      if (!questEventTypeSelect || !questTargetCodeInput) return;
      const type = questEventTypeSelect.value;
      const curCode = questTargetCodeInput.value || "";
      if (type === "monster_kill") {
        if (questTargetIdLabel?.firstChild) questTargetIdLabel.firstChild.textContent = "Quái vật mục tiêu ";
        if (questTargetMonsterSelect) {
          questTargetMonsterSelect.style.display = "";
          questTargetMonsterSelect.innerHTML = buildMonsterOptions(curCode);
          if (curCode) questTargetMonsterSelect.value = curCode;
        }
        if (questTargetItemSelect) questTargetItemSelect.style.display = "none";
        questTargetCodeInput.style.display = "none";
        questTargetCodeInput.required = false;
      } else if (type === "collect_item") {
        if (questTargetIdLabel?.firstChild) questTargetIdLabel.firstChild.textContent = "Vật phẩm mục tiêu ";
        if (questTargetItemSelect) {
          questTargetItemSelect.style.display = "";
          questTargetItemSelect.innerHTML = buildItemOptions(curCode);
          if (curCode) questTargetItemSelect.value = curCode;
        }
        if (questTargetMonsterSelect) questTargetMonsterSelect.style.display = "none";
        questTargetCodeInput.style.display = "none";
        questTargetCodeInput.required = true;
      } else if (type === "map_enter") {
        if (questTargetIdLabel?.firstChild) questTargetIdLabel.firstChild.textContent = "Bản đồ mục tiêu ";
        if (questTargetMonsterSelect) questTargetMonsterSelect.style.display = "none";
        if (questTargetItemSelect) questTargetItemSelect.style.display = "none";
        questTargetCodeInput.style.display = "";
        questTargetCodeInput.placeholder = "Tên hoặc mã bản đồ (VD: thung_lung_hoang_so)";
        questTargetCodeInput.required = true;
      } else {
        if (questTargetIdLabel?.firstChild) questTargetIdLabel.firstChild.textContent = "Đối tượng mục tiêu ";
        if (questTargetMonsterSelect) questTargetMonsterSelect.style.display = "none";
        if (questTargetItemSelect) questTargetItemSelect.style.display = "none";
        questTargetCodeInput.style.display = "";
        questTargetCodeInput.placeholder = "Mã mục tiêu";
        questTargetCodeInput.required = false;
      }
    }

    function addQuestRewardRow(type = "xu", amount = 100, itemId = "", label = "") {
      if (!questRewardsBox || questRewardsBox.children.length >= 8) return;
      const isItem = type === "item";
      const initialItemDisplay = isItem ? "" : "style=\"display:none;\"";
      const initialAmountMax = isItem ? 99 : 1000000000;
      const row = createDynamicRow(
        `<select name="rewardType">`
        + `<option value="xu"${type === "xu" ? " selected" : ""}>Xu</option>`
        + `<option value="tuVi"${type === "tuVi" ? " selected" : ""}>Tu Vi</option>`
        + `<option value="item"${isItem ? " selected" : ""}>Vật phẩm (item)</option>`
        + `</select>`
        + `<input name="rewardAmount" type="number" min="1" max="${initialAmountMax}" value="${Number(amount) || 1}" placeholder="Số lượng" required />`
        + `<select name="rewardItemId" class="quest-reward-item-select" ${initialItemDisplay}>${buildItemOptions(itemId)}</select>`
        + `<input name="rewardLabel" maxlength="80" placeholder="Nhãn phần thưởng" value="${esc(label)}" required />`,
      );
      const sel = row.querySelector('[name="rewardType"]');
      const amtInput = row.querySelector('[name="rewardAmount"]');
      const itemInput = row.querySelector('[name="rewardItemId"]');
      const lblInput = row.querySelector('[name="rewardLabel"]');

      function syncRewardRow() {
        const curType = sel.value;
        if (curType === "item") {
          itemInput.style.display = "";
          itemInput.required = true;
          amtInput.max = 99;
          if (Number(amtInput.value) > 99) amtInput.value = 1;
          const itemName = getItemName(itemInput.value);
          if (!lblInput.value || lblInput.dataset.auto) {
            lblInput.value = `${itemName} ×${amtInput.value}`;
            lblInput.dataset.auto = "1";
          }
        } else {
          itemInput.style.display = "none";
          itemInput.required = false;
          amtInput.max = 1000000000;
          if (!lblInput.value || lblInput.dataset.auto) {
            lblInput.value = curType === "xu" ? `${Number(amtInput.value).toLocaleString("vi-VN")} Xu` : `${Number(amtInput.value).toLocaleString("vi-VN")} Tu Vi`;
            lblInput.dataset.auto = "1";
          }
        }
      }

      sel.addEventListener("change", syncRewardRow);
      amtInput.addEventListener("input", () => {
        if (lblInput.dataset.auto) syncRewardRow();
      });
      itemInput.addEventListener("input", () => {
        if (lblInput.dataset.auto) syncRewardRow();
      });
      itemInput.addEventListener("change", () => {
        lblInput.dataset.auto = "1";
        syncRewardRow();
      });
      lblInput.addEventListener("input", () => {
        delete lblInput.dataset.auto;
      });

      questRewardsBox.appendChild(row);
    }

    function resetQuestForm(quest = null) {
      if (!questForm) return;
      questState.editingId = quest ? String(quest.id) : null;
      questForm.reset();
      questRewardsBox.replaceChildren();
      document.getElementById("quest-form-title").textContent = questState.editingId
        ? `Sửa nhiệm vụ: ${quest?.title || questState.editingId}`
        : "Tạo nhiệm vụ mới";
      questDeleteBtn.hidden = true;
      const fields = questForm.elements;
      fields.id.readOnly = Boolean(questState.editingId);
      if (quest) {
        fields.id.value = quest.id || "";
        fields.title.value = quest.title || "";
        fields.category.value = quest.category || "main";
        fields.giver.value = quest.giver || "";
        fields.location.value = quest.location || "";
        fields.objective.value = quest.objective || "";
        fields.eventType.value = quest.eventType || "monster_kill";
        fields.target.value = quest.target ?? 1;
        fields.targetCode.value = quest.targetMonsterId || quest.targetItemId || quest.targetMapCode || quest.targetCode || "";
        fields.requiresQuestId.value = quest.requiresQuestId || "";
        fields.initialStatus.value = quest.initialStatus || "available";
        fields.summary.value = quest.summary || "";
        const rewards = Array.isArray(quest.rewards) && quest.rewards.length ? quest.rewards : [{ type: "xu", amount: 100, label: "100 Xu" }];
        rewards.forEach((r) => addQuestRewardRow(r.type, r.amount, r.itemId || "", r.label || ""));
        refreshQuestRequiresOptions(fields.requiresQuestId.value);
      } else {
        fields.category.value = "main";
        fields.giver.value = "Lão Tu Sĩ";
        fields.location.value = "Thanh Vân Trấn";
        fields.eventType.value = "monster_kill";
        fields.target.value = 5;
        fields.initialStatus.value = "available";
        fields.summary.value = "Tu hành gian nan, bước đầu tiên cần rèn luyện thể phách vững vàng.";
        addQuestRewardRow("xu", 500, "", "500 Xu");
        addQuestRewardRow("tuVi", 200, "", "200 Tu Vi");
        refreshQuestRequiresOptions("");
      }
      updateQuestTargetUi();
      questStatus.textContent = questState.editingId ? "Đang chỉnh sửa" : "Tạo mới";
      renderQuestList();
    }

    function renderQuestList() {
      if (!questList) return;
      const query = (document.getElementById("quest-search")?.value || "").trim().toLocaleLowerCase();
      const catFilter = document.getElementById("quest-category-filter")?.value || "";
      const rows = questState.quests.filter((q) => {
        if (catFilter && q.category !== catFilter) return false;
        return `${q.id} ${q.title} ${q.giver} ${q.location} ${q.eventType}`.toLocaleLowerCase().includes(query);
      });
      let rowsHtml = rows.map((q) => {
        const id = String(q.id);
        const selected = id === questState.editingId ? "selected" : "";
        const catBadge = q.category === "main" ? "Chính Tuyến" : q.category === "daily" ? "Hàng Ngày" : "Phụ Tuyến";
        return `<button class="editor-list-row ${selected}" type="button" data-quest-id="${esc(id)}">`
          + `<b>${esc(q.title || id)}</b>`
          + `<small>[${catBadge}] · Người giao: ${esc(q.giver || "—")} · Khu vực: ${esc(q.location || "—")}</small>`
          + `</button>`;
      }).join("");
      if (!rowsHtml) {
        rowsHtml = '<div class="empty">Không có nhiệm vụ phù hợp.</div>';
      }
      let footerHtml = "";
      if (questState.loadingMore) {
        footerHtml = '<div class="editor-list-footer loading">Đang nạp thêm nhiệm vụ…</div>';
      } else if (questState.hasMore) {
        footerHtml = `<button class="editor-list-load-btn" type="button" data-load-more="quest">▼ Tải thêm nhiệm vụ (Trang ${questState.page + 1})</button>`;
      } else if (questState.quests.length > questState.limit) {
        footerHtml = `<div class="editor-list-footer end">Đã tải hết (${questState.quests.length}/${questState.total || questState.quests.length} nhiệm vụ)</div>`;
      }
      questList.innerHTML = rowsHtml + footerHtml;
    }

    async function loadMoreQuests() {
      if (questState.loadingMore || !questState.hasMore) return;
      questState.loadingMore = true;
      questState.page += 1;
      renderQuestList();
      await openQuests(false);
      questState.loadingMore = false;
      renderQuestList();
    }

    async function openQuests(reset = true) {
      if (!questList) return;
      if (reset) {
        questState.page = 1;
        questState.quests = [];
        questState.hasMore = true;
        questState.loadingMore = false;
        questList.innerHTML = '<div class="loading">Đang tải nhiệm vụ…</div>';
      }
      await Promise.all([ensureItemCatalog(), ensureMonsterCatalog()]);
      const search = (document.getElementById("quest-search")?.value || "").trim();
      try {
        const res = await contentManager.list("quests", {
          page: questState.page,
          limit: questState.limit,
          q: search,
        });
        const rows = Array.isArray(res?.data) ? res.data : [];
        if (reset) {
          questState.quests = rows;
        } else {
          const existingIds = new Set(questState.quests.map((q) => String(q.id)));
          rows.forEach((q) => {
            const k = String(q.id);
            if (!existingIds.has(k)) {
              existingIds.add(k);
              questState.quests.push(q);
            }
          });
        }
        questState.total = res.pagination?.total ?? questState.quests.length;
        questState.hasMore = questState.quests.length < questState.total;
        updateQuestDatalist(questState.quests);
        refreshQuestRequiresOptions(questForm?.elements?.requiresQuestId?.value || "");
        if (questState.quests.length && !questState.editingId && reset) {
          resetQuestForm(questState.quests[0]);
        } else {
          renderQuestList();
        }
      } catch (error) {
        if (reset) {
          questList.innerHTML = `<div class="empty">${esc(error.message || "Không tải được nhiệm vụ.")}</div>`;
        }
      }
    }

    questEventTypeSelect?.addEventListener("change", updateQuestTargetUi);
    questTargetMonsterSelect?.addEventListener("change", () => {
      if (questTargetCodeInput) questTargetCodeInput.value = questTargetMonsterSelect.value;
    });
    questTargetItemSelect?.addEventListener("change", () => {
      if (questTargetCodeInput) questTargetCodeInput.value = questTargetItemSelect.value;
    });
    questRequiresSelect?.addEventListener("change", () => {
      if (questRequiresInput) questRequiresInput.value = questRequiresSelect.value;
    });
    questForm?.elements?.title?.addEventListener("input", () => {
      const fields = questForm.elements;
      if (!questState.editingId && fields.id && !fields.id.readOnly) {
        fields.id.value = slugify(fields.title.value).replace(/_/g, "-").slice(0, 64);
      }
    });
    let questSearchTimer;
    document.getElementById("quest-search")?.addEventListener("input", () => {
      clearTimeout(questSearchTimer);
      questSearchTimer = setTimeout(() => {
        void openQuests(true);
      }, 250);
    });
    document.getElementById("quest-category-filter")?.addEventListener("change", renderQuestList);
    document.getElementById("quest-new-btn")?.addEventListener("click", () => resetQuestForm(null));
    document.getElementById("quest-add-reward")?.addEventListener("click", () => addQuestRewardRow("xu", 100, "", "100 Xu"));
    questList?.addEventListener("scroll", () => {
      if (questState.loadingMore || !questState.hasMore) return;
      if (questList.scrollTop + questList.clientHeight >= questList.scrollHeight - 30) {
        void loadMoreQuests();
      }
    });
    questList?.addEventListener("click", (event) => {
      if (event.target.closest('[data-load-more="quest"]')) {
        void loadMoreQuests();
        return;
      }
      const btn = event.target.closest("[data-quest-id]");
      if (!btn) return;
      const found = questState.quests.find((q) => String(q.id) === btn.dataset.questId);
      if (found) resetQuestForm(found);
    });

    questForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (questState.busy) return;
      const fields = questForm.elements;
      const id = (questState.editingId || fields.id.value).trim();
      const eventType = fields.eventType.value;
      const targetCode = fields.targetCode.value.trim();
      const rewards = [...questRewardsBox.querySelectorAll(".dynamic-row")].map((row) => {
        const type = row.querySelector('[name="rewardType"]').value;
        const amount = Number(row.querySelector('[name="rewardAmount"]').value || 1);
        const label = row.querySelector('[name="rewardLabel"]').value.trim() || `${amount} ${type}`;
        const item = { type, amount, label };
        if (type === "item") {
          item.itemId = row.querySelector('[name="rewardItemId"]').value.trim();
        }
        return item;
      }).filter((r) => r.type !== "item" || r.itemId);

      const record = {
        id,
        title: fields.title.value.trim(),
        category: fields.category.value,
        giver: fields.giver.value.trim(),
        location: fields.location.value.trim(),
        objective: fields.objective.value.trim(),
        eventType,
        target: Number(fields.target.value || 1),
        initialProgress: 0,
        initialStatus: fields.initialStatus.value,
        summary: fields.summary.value.trim(),
        ...(fields.requiresQuestId.value.trim() ? { requiresQuestId: fields.requiresQuestId.value.trim() } : {}),
        rewards,
      };
      if (eventType === "monster_kill" && targetCode) {
        record.targetMonsterId = targetCode;
      } else if (eventType === "collect_item" && targetCode) {
        record.targetItemId = targetCode;
      } else if (eventType === "map_enter" && targetCode) {
        record.targetMapCode = targetCode;
      }

      questState.busy = true;
      questStatus.textContent = "Đang lưu…";
      try {
        await contentManager.save("quests", {
          id,
          existingId: questState.editingId,
          json: JSON.stringify(record),
        });
        questState.editingId = id;
        await openQuests();
        questStatus.textContent = `Đã lưu ${id} vào MySQL`;
        if (typeof window !== "undefined" && typeof window.showToast === "function") {
          window.showToast(`Đã lưu nhiệm vụ “${record.title || id}” vào MySQL!`, "success");
        }
      } catch (error) {
        questStatus.textContent = error.message || "Lỗi khi lưu nhiệm vụ";
        if (typeof window !== "undefined" && typeof window.showToast === "function") {
          window.showToast(error.message || "Lỗi khi lưu nhiệm vụ", "error");
        }
      } finally {
        questState.busy = false;
      }
    });

    questDeleteBtn?.addEventListener("click", async () => {
      if (questState.busy || !questState.editingId) return;
      if (!window.confirm(`Xóa nhiệm vụ “${questState.editingId}”?`)) return;
      questState.busy = true;
      try {
        await contentManager.remove("quests", questState.editingId);
        const deletedId = questState.editingId;
        questState.editingId = null;
        await openQuests();
        if (!questState.quests.length) resetQuestForm(null);
        questStatus.textContent = `Đã xóa nhiệm vụ ${deletedId}.`;
        if (typeof window !== "undefined" && typeof window.showToast === "function") {
          window.showToast(`Đã xóa nhiệm vụ ${deletedId} thành công!`, "success");
        }
      } catch (error) {
        questStatus.textContent = error.message || "Không xóa được nhiệm vụ";
        if (typeof window !== "undefined" && typeof window.showToast === "function") {
          window.showToast(error.message || "Không xóa được nhiệm vụ", "error");
        }
      } finally {
        questState.busy = false;
      }
    });

    // --- 6. Skill Studio ---
    const skillState = {
      skills: [],
      editingCode: null,
      busy: false,
      page: 1,
      limit: 20,
      total: 0,
      hasMore: true,
      loadingMore: false,
    };
    const skillForm = document.getElementById("skill-form");
    const skillList = document.getElementById("skill-list");
    const skillStatus = document.getElementById("skill-status");
    const skillDeleteBtn = document.getElementById("skill-delete-btn");
    const skillPassivesBox = document.getElementById("skill-passives-box");
    const skillCategorySelect = skillForm?.elements?.category;

    const PASSIVE_MOD_KEYS = [
      "maxHpPct", "maxMpPct", "skillDamagePct", "pDefPenPct",
      "defensePct", "speedPct", "critPct", "shieldPct",
      "hpRegenPct", "resistPct", "cooldownPct", "statusEffectPct",
    ];

    function updateSkillCategoryUi() {
      if (!skillPassivesBox || !skillCategorySelect) return;
      const isPassive = skillCategorySelect.value === "PASSIVE";
      skillPassivesBox.hidden = !isPassive;
      if (isPassive && skillForm?.elements?.effect && !skillForm.elements.effect.value) {
        skillForm.elements.effect.value = "passive";
      }
    }

    function resetSkillForm(skill = null) {
      if (!skillForm) return;
      skillState.editingCode = skill ? String(skill.code || skill.id || "") : null;
      skillForm.reset();
      document.getElementById("skill-form-title").textContent = skillState.editingCode
        ? `Sửa kỹ năng: ${skill?.name || skillState.editingCode}`
        : "Tạo kỹ năng mới";
      skillDeleteBtn.hidden = !skillState.editingCode;
      const fields = skillForm.elements;
      fields.code.readOnly = Boolean(skillState.editingCode);

      if (skill) {
        fields.code.value = skill.code || skill.id || "";
        fields.name.value = skill.name || "";
        fields.linhCan.value = skill.linhCan || "COMMON";
        fields.tier.value = skill.tier ?? 1;
        fields.type.value = skill.type || "COMMON";
        fields.category.value = skill.category || "ACTIVE";
        fields.mpTieuHao.value = skill.mpTieuHao ?? 10;
        fields.hoiChieu.value = skill.hoiChieu ?? 1.5;
        fields.range.value = skill.range ?? 3.5;
        fields.satThuong.value = skill.satThuong ?? 1;
        fields.dienRong.value = skill.dienRong ?? 0;
        fields.scalingStat.value = skill.scalingStat || "ene";
        fields.effect.value = skill.effect || "";
        fields.effectVal.value = skill.effectVal ?? 0;
        fields.thoiGianBuff.value = skill.thoiGianBuff ?? 0;
        fields.moTa.value = skill.moTa || "";

        const mods = skill.passiveModifiers || {};
        PASSIVE_MOD_KEYS.forEach((k) => {
          const input = fields[`pass_${k}`];
          if (input) {
            input.value = mods[k] != null ? Math.round(Number(mods[k]) * 100 * 10) / 10 : 0;
          }
        });
      } else {
        fields.linhCan.value = "COMMON";
        fields.tier.value = 1;
        fields.type.value = "COMMON";
        fields.category.value = "ACTIVE";
        fields.mpTieuHao.value = 10;
        fields.hoiChieu.value = 1.5;
        fields.range.value = 3.5;
        fields.satThuong.value = 1.2;
        fields.dienRong.value = 0;
        fields.scalingStat.value = "ene";
        fields.effect.value = "";
        fields.effectVal.value = 0;
        fields.thoiGianBuff.value = 0;
        fields.moTa.value = "";
        PASSIVE_MOD_KEYS.forEach((k) => {
          const input = fields[`pass_${k}`];
          if (input) input.value = 0;
        });
      }
      updateSkillCategoryUi();
      skillStatus.textContent = skillState.editingCode ? "Đang chỉnh sửa" : "Tạo mới";
      renderSkillList();
    }

    function renderSkillList() {
      if (!skillList) return;
      const query = (document.getElementById("skill-search")?.value || "").trim().toLocaleLowerCase();
      const rootFilter = document.getElementById("skill-root-filter")?.value || "";
      const rows = skillState.skills.filter((s) => {
        if (rootFilter && (s.linhCan || "COMMON") !== rootFilter) return false;
        return `${s.code} ${s.name} ${s.linhCan} ${s.type} ${s.category}`.toLocaleLowerCase().includes(query);
      });
      let rowsHtml = rows.map((s) => {
        const code = String(s.code || s.id || "");
        const selected = code === skillState.editingCode ? "selected" : "";
        const cat = s.category === "PASSIVE" ? "Nội tại" : "Chủ động";
        return `<button class="editor-list-row ${selected}" type="button" data-skill-code="${esc(code)}">`
          + `<b>${esc(s.name || code)}</b>`
          + `<small>[Hệ ${esc(s.linhCan || "COMMON")}] · ${cat} · Tầng ${s.tier || 1}</small>`
          + `</button>`;
      }).join("");
      if (!rowsHtml) {
        rowsHtml = '<div class="empty">Không có kỹ năng phù hợp.</div>';
      }
      let footerHtml = "";
      if (skillState.loadingMore) {
        footerHtml = '<div class="editor-list-footer loading">Đang nạp thêm kỹ năng…</div>';
      } else if (skillState.hasMore) {
        footerHtml = `<button class="editor-list-load-btn" type="button" data-load-more="skill">▼ Tải thêm kỹ năng (Trang ${skillState.page + 1})</button>`;
      } else if (skillState.skills.length > skillState.limit) {
        footerHtml = `<div class="editor-list-footer end">Đã tải hết (${skillState.skills.length}/${skillState.total || skillState.skills.length} kỹ năng)</div>`;
      }
      skillList.innerHTML = rowsHtml + footerHtml;
    }

    async function loadMoreSkills() {
      if (skillState.loadingMore || !skillState.hasMore) return;
      skillState.loadingMore = true;
      skillState.page += 1;
      renderSkillList();
      await openSkills(false);
      skillState.loadingMore = false;
      renderSkillList();
    }

    async function openSkills(reset = true) {
      if (!skillList) return;
      if (reset) {
        skillState.page = 1;
        skillState.skills = [];
        skillState.hasMore = true;
        skillState.loadingMore = false;
        skillList.innerHTML = '<div class="loading">Đang tải kỹ năng…</div>';
      }
      const search = (document.getElementById("skill-search")?.value || "").trim();
      try {
        const res = await contentManager.list("skills", {
          page: skillState.page,
          limit: skillState.limit,
          q: search,
        });
        const rows = Array.isArray(res?.data) ? res.data : [];
        if (reset) {
          skillState.skills = rows;
        } else {
          const existingCodes = new Set(skillState.skills.map((s) => String(s.code || s.id)));
          rows.forEach((s) => {
            const k = String(s.code || s.id);
            if (!existingCodes.has(k)) {
              existingCodes.add(k);
              skillState.skills.push(s);
            }
          });
        }
        skillState.total = res.pagination?.total ?? skillState.skills.length;
        skillState.hasMore = skillState.skills.length < skillState.total;
        if (skillState.skills.length && !skillState.editingCode && reset) {
          resetSkillForm(skillState.skills[0]);
        } else {
          renderSkillList();
        }
      } catch (error) {
        if (reset) {
          skillList.innerHTML = `<div class="empty">${esc(error.message || "Không tải được kỹ năng.")}</div>`;
        }
      }
    }

    skillCategorySelect?.addEventListener("change", updateSkillCategoryUi);
    skillForm?.elements?.name?.addEventListener("input", () => {
      const fields = skillForm.elements;
      if (!skillState.editingCode && fields.code && !fields.code.readOnly) {
        const root = (fields.linhCan?.value || "COMMON").toUpperCase();
        fields.code.value = (root + "_" + slugify(fields.name.value, true)).slice(0, 64);
      }
    });
    let skillSearchTimer;
    document.getElementById("skill-search")?.addEventListener("input", () => {
      clearTimeout(skillSearchTimer);
      skillSearchTimer = setTimeout(() => {
        void openSkills(true);
      }, 250);
    });
    document.getElementById("skill-root-filter")?.addEventListener("change", renderSkillList);
    document.getElementById("skill-new-btn")?.addEventListener("click", () => resetSkillForm(null));
    skillList?.addEventListener("scroll", () => {
      if (skillState.loadingMore || !skillState.hasMore) return;
      if (skillList.scrollTop + skillList.clientHeight >= skillList.scrollHeight - 30) {
        void loadMoreSkills();
      }
    });
    skillList?.addEventListener("click", (event) => {
      if (event.target.closest('[data-load-more="skill"]')) {
        void loadMoreSkills();
        return;
      }
      const btn = event.target.closest("[data-skill-code]");
      if (!btn) return;
      const found = skillState.skills.find((s) => String(s.code || s.id) === btn.dataset.skillCode);
      if (found) resetSkillForm(found);
    });
    document.getElementById("skill-open-vfx-btn")?.addEventListener("click", () => {
      const code = skillState.editingCode || skillForm?.elements?.code?.value?.trim();
      const vfxTab = document.querySelector('.nav-item[data-view="skill-vfx"]');
      if (vfxTab) {
        vfxTab.click();
        if (code && typeof window.setVfxSkillCode === "function") {
          window.setVfxSkillCode(code);
        }
      }
    });
    skillList?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-skill-code]");
      if (!btn) return;
      const found = skillState.skills.find((s) => String(s.code || s.id) === btn.dataset.skillCode);
      if (found) resetSkillForm(found);
    });

    skillForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (skillState.busy) return;
      const fields = skillForm.elements;
      const code = (skillState.editingCode || fields.code.value).trim();
      const category = fields.category.value;
      const isPassive = category === "PASSIVE";

      let passiveModifiers;
      if (isPassive) {
        passiveModifiers = {};
        PASSIVE_MOD_KEYS.forEach((k) => {
          const val = Number(fields[`pass_${k}`]?.value || 0);
          if (val > 0) {
            passiveModifiers[k] = Math.round((val / 100) * 1000) / 1000;
          }
        });
      }

      const record = {
        code,
        id: code,
        name: fields.name.value.trim(),
        linhCan: fields.linhCan.value,
        tier: Number(fields.tier.value || 1),
        type: fields.type.value,
        category,
        mpTieuHao: Number(fields.mpTieuHao.value || 0),
        hoiChieu: Number(fields.hoiChieu.value || 0),
        range: Number(fields.range.value || 0),
        satThuong: Number(fields.satThuong.value || 0),
        dienRong: Number(fields.dienRong.value || 0),
        scalingStat: fields.scalingStat.value,
        effect: fields.effect.value || (isPassive ? "passive" : ""),
        effectVal: Number(fields.effectVal.value || 0),
        thoiGianBuff: Number(fields.thoiGianBuff.value || 0),
        moTa: fields.moTa.value.trim(),
        ...(passiveModifiers ? { passiveModifiers } : {}),
      };

      skillState.busy = true;
      skillStatus.textContent = "Đang lưu…";
      try {
        await contentManager.save("skills", {
          id: code,
          existingId: skillState.editingCode,
          json: JSON.stringify(record),
        });
        skillState.editingCode = code;
        await openSkills();
        skillStatus.textContent = `Đã lưu ${code} vào MySQL`;
        if (typeof window !== "undefined" && typeof window.showToast === "function") {
          window.showToast(`Đã lưu kỹ năng “${record.name || code}” vào MySQL!`, "success");
        }
      } catch (error) {
        skillStatus.textContent = error.message || "Lỗi khi lưu kỹ năng";
        if (typeof window !== "undefined" && typeof window.showToast === "function") {
          window.showToast(error.message || "Lỗi khi lưu kỹ năng", "error");
        }
      } finally {
        skillState.busy = false;
      }
    });

    skillDeleteBtn?.addEventListener("click", async () => {
      if (skillState.busy || !skillState.editingCode) return;
      if (!window.confirm(`Xóa kỹ năng “${skillState.editingCode}”?`)) return;
      skillState.busy = true;
      try {
        await contentManager.remove("skills", skillState.editingCode);
        const deletedCode = skillState.editingCode;
        skillState.editingCode = null;
        await openSkills();
        if (!skillState.skills.length) resetSkillForm(null);
        skillStatus.textContent = "Đã xóa kỹ năng.";
        if (typeof window !== "undefined" && typeof window.showToast === "function") {
          window.showToast(`Đã xóa kỹ năng ${deletedCode} thành công!`, "success");
        }
      } catch (error) {
        skillStatus.textContent = error.message || "Không xóa được kỹ năng";
        if (typeof window !== "undefined" && typeof window.showToast === "function") {
          window.showToast(error.message || "Không xóa được kỹ năng", "error");
        }
      } finally {
        skillState.busy = false;
      }
    });

    return {
      openAlchemy,
      openLootTables,
      openMailSender,
      prefillMail,
      openBalanceSettings,
      openQuests,
      openSkills,
      loadQuest(record) {
        resetQuestForm(record);
      },
      loadSkill(record) {
        resetSkillForm(record);
      },
      ensureItemDatalist,
      ensureMonsterDatalist,
    };
  }

  return { mount };
});
