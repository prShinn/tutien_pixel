"use strict";

function mountMonsterStudio(options, maybeSaveMonster) {
  const form = options?.form || options;
  const saveMonster = typeof options?.saveMonster === "function" ? options.saveMonster : maybeSaveMonster;
  const openMonsters = typeof options?.openMonsters === "function" ? options.openMonsters : null;

  const fields = form.elements;
  const status = form.querySelector("[data-monster-status]");
  const download = form.querySelector("[data-monster-download]");
  const mapLink = form.querySelector("[data-monster-map]");
  const save = form.querySelector("[type=submit]");
  const modeBanner = form.querySelector("#monster-studio-mode-banner");
  const modeLabel = form.querySelector("#monster-studio-mode-label");
  const resetModeBtn = form.querySelector("#monster-studio-new-mode");
  const listBtn = form.querySelector("#monster-studio-list");

  let img = "";
  let saving = false;
  let savedCode = "";
  let editingId = null;
  let editingRecord = null;

  const value = (key) => fields.namedItem(key)?.value ?? "";
  const number = (key) => Number(value(key) || 0);

  const updateButton = () => {
    const code = value("code").trim();
    save.disabled = saving || (!img && !editingId) || !code || (savedCode === code && !editingId);
    save.textContent = editingId ? "Lưu thay đổi quái vật" : "Lưu vào ngân hàng quái";
    if (modeBanner) modeBanner.hidden = !editingId;
    if (modeLabel && editingId) {
      modeLabel.textContent = `Đang chỉnh sửa: ${editingRecord?.name || editingId} (${editingId})`;
    }
  };

  const imageControl = ItemStudio.mountImage(form, {
    pngOnly: true,
    onChange(url) {
      img = url;
      if (download) {
        download.hidden = !img;
        if (img) download.href = img;
        else download.removeAttribute("href");
      }
      updateButton();
    },
  });

  const lootSelect = fields.namedItem("lootTableId");
  async function loadLootTables() {
    if (!lootSelect || lootSelect.dataset.loaded) return;
    try {
      const response = await AdminAuth.fetch(API.BASE + API.PATHS.admin.content("lootTables"));
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.data)) return;
      const chosen = lootSelect.value;
      lootSelect.replaceChildren(new Option("Không rớt đồ", ""), ...data.data.map(
        (table) => {
          const entryNames = (table.entries || []).map((e) => e.itemId);
          const preview = entryNames.slice(0, 3).join(", ") + (entryNames.length > 3 ? "…" : "");
          return new Option(`${table.id} (${(table.entries || []).length} món${preview ? `: ${preview}` : ""})`, table.id);
        },
      ));
      lootSelect.value = chosen;
      lootSelect.dataset.loaded = "1";
    } catch { /* chưa đăng nhập hoặc BE tạm lỗi */ }
  }
  void loadLootTables();
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("admin:authenticated", () => { void loadLootTables(); });
  }
  lootSelect?.addEventListener("focus", () => { void loadLootTables(); });

  function setField(key, val) {
    const el = fields.namedItem(key) || form.querySelector(`[name="${key}"]`) || form.elements?.[key];
    if (!el) return;
    if (el.type === "checkbox") el.checked = Boolean(val);
    else el.value = val ?? "";
  }

  function applyRecordFields(record) {
    if (!record || typeof record !== "object") return;
    const id = String(record.code || record.id || "").trim();
    if (!id) return;
    const nameVal = record.name || record.tenQuai || record.title || "";
    setField("monsterName", nameVal);
    setField("code", id);
    const codeEl = fields.namedItem("code") || form.querySelector('[name="code"]');
    if (codeEl) {
      codeEl.value = id;
      codeEl.readOnly = true;
    }
    const nameEl = fields.namedItem("monsterName") || form.querySelector('[name="monsterName"]');
    if (nameEl) {
      nameEl.value = nameVal;
    }
    setField("type", String(record.type || "NORMAL").toUpperCase());
    setField("linhCan", String(record.linhCan || "KIM").toUpperCase());
    setField("level", record.level ?? 1);
    setField("hp", record.hp ?? record.maxHp ?? 90);
    setField("atk", record.atk ?? 9);
    setField("def", record.def ?? 2);
    setField("speed", record.speed ?? 1.25);
    setField("respawn", Math.max(1, Math.round(Number(record.respawnMs ?? 15000) / 1000)));
    if (lootSelect) {
      void loadLootTables().then(() => {
        if (lootSelect) lootSelect.value = record.lootTableId || "";
      });
    }
    imageControl.setExisting(record.img || "");
    img = record.img || "";
    if (status) status.textContent = "";
    if (listBtn) listBtn.hidden = false;
    updateButton();
  }

  function loadRecord(record) {
    if (!record || typeof record !== "object") return;
    const id = String(record.code || record.id || "").trim();
    if (!id) return;
    editingId = id;
    editingRecord = { ...record };
    savedCode = "";
    if (fields.source) fields.source.required = false;
    applyRecordFields(record);
    if (typeof setTimeout === "function") setTimeout(() => applyRecordFields(record), 50);
  }

  function resetToCreate() {
    editingId = null;
    editingRecord = null;
    savedCode = "";
    form.reset();
    const codeEl = fields.namedItem("code") || form.querySelector('[name="code"]');
    if (codeEl) {
      codeEl.value = "";
      codeEl.readOnly = false;
    }
    const nameEl = fields.namedItem("monsterName") || form.querySelector('[name="monsterName"]');
    if (nameEl) nameEl.value = "";
    if (fields.source) fields.source.required = true;
    imageControl();
    img = "";
    if (status) status.textContent = "";
    if (listBtn) listBtn.hidden = false;
    if (modeBanner) modeBanner.hidden = true;
    updateButton();
  }

  resetModeBtn?.addEventListener("click", resetToCreate);
  listBtn?.addEventListener("click", () => openMonsters?.());
  if (typeof document !== "undefined" && typeof document.getElementById === "function") {
    document.getElementById("monster-studio-back-top")?.addEventListener("click", () => openMonsters?.());
    document.getElementById("monster-studio-back-banner")?.addEventListener("click", () => openMonsters?.());
  }

  const codeInput = fields.namedItem("code") || form.querySelector('[name="code"]');
  codeInput?.addEventListener("input", () => {
    if (download && codeInput.value) download.download = `${codeInput.value.replace(/[^A-Z0-9_]/g, "") || "monster"}.png`;
    updateButton();
  });
  const nameInput = fields.namedItem("monsterName") || form.querySelector('[name="monsterName"]');
  nameInput?.addEventListener("input", () => {
    if (!editingId && (!codeInput || !codeInput.value)) {
      if (codeInput) {
        codeInput.value = value("monsterName").toUpperCase().replace(/Đ/g, "D")
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
      }
      updateButton();
    }
  });

  function markEdited() {
    if (saving) return;
    if (status) status.textContent = "";
    updateButton();
  }
  form.addEventListener("input", markEdited);
  form.addEventListener("change", markEdited);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (save.disabled || !form.reportValidity()) return;
    const code = editingId || (fields.namedItem("code") || form.querySelector('[name="code"]'))?.value?.trim() || "";
    const nameInputEl = fields.namedItem("monsterName") || form.querySelector('[name="monsterName"]');
    const name = nameInputEl?.value?.trim() || "";
    if (!name) {
      if (status) status.textContent = "Hãy nhập tên quái.";
      nameInputEl?.focus?.();
      return;
    }
    const linhCan = (fields.namedItem("linhCan") || form.querySelector('[name="linhCan"]'))?.value || "KIM";
    const typeVal = (fields.namedItem("type") || form.querySelector('[name="type"]'))?.value || "NORMAL";
    const hp = number("hp");
    const monsterImage = img || editingRecord?.img || "";
    if (!monsterImage) {
      if (status) status.textContent = "Hãy chọn ảnh PNG cho quái vật.";
      const sourceInput = fields.namedItem("source") || form.querySelector('[name="source"]');
      sourceInput?.focus?.();
      return;
    }
    const record = {
      id: code,
      code,
      name,
      img: monsterImage,
      type: typeVal,
      linhCan,
      nguHanh: [linhCan],
      level: number("level"),
      hp,
      maxHp: hp,
      atk: number("atk"),
      def: number("def"),
      speed: number("speed"),
      respawnMs: number("respawn") * 1000,
      ...(lootSelect?.value ? { lootTableId: lootSelect.value } : {}),
    };
    saving = true;
    updateButton();
    const controls = [...form.querySelectorAll("input, select")];
    controls.forEach((control) => { control.disabled = true; });
    if (status) status.textContent = editingId ? "Đang cập nhật quái vật…" : "Đang lưu quái vật…";
    try {
      await saveMonster(record, editingId);
      savedCode = code;
      if (mapLink) {
        const query = typeof URLSearchParams !== "undefined" ? new URLSearchParams({ monster: code }) : null;
        const apiBase = typeof window !== "undefined" && window.location?.search && typeof URLSearchParams !== "undefined"
          ? new URLSearchParams(window.location.search).get("apiBase")
          : null;
        if (query && apiBase) query.set("apiBase", apiBase);
        mapLink.href = `/admin/map-editor?${query ? query.toString() : `monster=${encodeURIComponent(code)}`}`;
        mapLink.hidden = false;
      }
      if (listBtn) listBtn.hidden = false;
      if (status) {
        status.textContent = editingId
          ? `Đã cập nhật ${name} (${code}) vào MySQL.`
          : `Đã lưu ${name} (${code}) vào MySQL. Có thể chọn quái này trong Map Editor.`;
      }
      if (typeof window !== "undefined" && typeof window.showToast === "function") {
        window.showToast(editingId ? `Đã cập nhật quái vật ${name} (${code}) vào MySQL!` : `Đã lưu quái vật mới ${name} (${code}) vào MySQL!`, "success");
      }
    } catch (error) {
      if (status) status.textContent = error.message || "Không lưu được quái vật.";
      if (typeof window !== "undefined" && typeof window.showToast === "function") {
        window.showToast(error.message || "Không lưu được quái vật.", "error");
      }
    } finally {
      controls.forEach((control) => { control.disabled = false; });
      if (fields.code) fields.code.readOnly = Boolean(editingId);
      saving = false;
      updateButton();
    }
  });

  return { loadRecord, resetToCreate, isEditing: () => Boolean(editingId) };
}

if (typeof module === "object" && module.exports) {
  module.exports = { mountMonsterStudio };
}
