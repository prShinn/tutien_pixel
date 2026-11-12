"use strict";

const ItemStudio = (() => {
  function removeBackground(pixels, width, height) {
    // A transparent PNG already carries its own silhouette.
    const corners = [0, width - 1, width * (height - 1), width * height - 1];
    if (corners.some((index) => pixels[index * 4 + 3] < 128)) return;
    const colors = corners.map((index) => pixels.slice(index * 4, index * 4 + 3));
    const visited = new Uint8Array(width * height);
    const queue = [];
    function visit(index) {
      if (visited[index]) return;
      visited[index] = 1;
      const offset = index * 4;
      if (!colors.some((color) => color.every((channel, i) => Math.abs(channel - pixels[offset + i]) <= 34))) return;
      pixels[offset + 3] = 0;
      queue.push(index);
    }
    for (let x = 0; x < width; x++) {
      visit(x);
      visit((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
      visit(y * width);
      visit(y * width + width - 1);
    }
    for (let i = 0; i < queue.length; i++) {
      const index = queue[i];
      const x = index % width;
      if (x > 0) visit(index - 1);
      if (x < width - 1) visit(index + 1);
      if (index >= width) visit(index - width);
      if (index < (height - 1) * width) visit(index + width);
    }
  }

  function drawIcon(bitmap, preview, { size, colors, removeBg, outline }) {
    const work = document.createElement("canvas");
    const ratio = Math.min(1, 192 / Math.max(bitmap.width, bitmap.height));
    work.width = Math.max(1, Math.round(bitmap.width * ratio));
    work.height = Math.max(1, Math.round(bitmap.height * ratio));
    const source = work.getContext("2d", { willReadFrequently: true });
    const { width, height } = work;
    source.drawImage(bitmap, 0, 0, width, height);
    const image = source.getImageData(0, 0, width, height);
    if (removeBg) removeBackground(image.data, width, height);
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (image.data[(y * width + x) * 4 + 3] < 128) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    if (right < left) throw new Error("Ảnh kết quả đang trống. Hãy bỏ tách nền hoặc chọn ảnh khác.");
    source.putImageData(image, 0, 0);
    const cropW = right - left + 1;
    const cropH = bottom - top + 1;
    const scale = (size - 4) / Math.max(cropW, cropH);
    const w = Math.max(1, Math.round(cropW * scale));
    const h = Math.max(1, Math.round(cropH * scale));
    preview.width = preview.height = size;
    const ctx = preview.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(work, left, top, cropW, cropH, Math.floor((size - w) / 2), Math.floor((size - h) / 2), w, h);
    const icon = ctx.getImageData(0, 0, size, size);
    const pixels = icon.data;
    const solid = new Uint8Array(size * size);
    for (let i = 0; i < solid.length; i++) solid[i] = pixels[i * 4 + 3] >= 128;
    if (!solid.includes(1)) throw new Error("Chi tiết quá nhỏ. Hãy thử kích thước lớn hơn hoặc ảnh khác.");
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = y * size + x;
        const offset = index * 4;
        if (solid[index]) {
          for (let c = 0; c < 3; c++) pixels[offset + c] = Math.round(pixels[offset + c] / colors) * colors;
          pixels[offset + 3] = 255;
        } else if (outline && ((x > 0 && solid[index - 1]) || (x < size - 1 && solid[index + 1])
          || (y > 0 && solid[index - size]) || (y < size - 1 && solid[index + size]))) {
          pixels.set([27, 22, 32, 255], offset);
        } else {
          pixels[offset + 3] = 0;
        }
      }
    }
    ctx.putImageData(icon, 0, 0);
    return preview.toDataURL("image/png");
  }

  function validatePngPayloadSize(dataUrl, size) {
    if (!dataUrl) return dataUrl;
    if (dataUrl.length > 24000) {
      throw new Error(`Ảnh ${size}×${size} (${dataUrl.length} ký tự) vượt giới hạn 24.000 ký tự. Hãy chọn kích thước 32×32 hoặc ít màu hơn.`);
    }
    return dataUrl;
  }

  function sparkleFromForm(fields) {
    const preset = String(fields?.sparklePreset?.value || "NONE").toUpperCase();
    const color = fields?.sparkleColor?.value || "#ffd966";
    const intensity = Math.max(1, Math.min(3, Math.floor(Number(fields?.sparkleIntensity?.value || 2))));
    return { enabled: preset !== "NONE", preset, color, intensity };
  }

  async function loadBitmap(file, pngOnly) {
    if (file.size > 8 * 1024 * 1024) throw new Error("Ảnh vượt quá 8 MB.");
    const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte);
    const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
    if (!png && (pngOnly || !jpeg)) throw new Error(pngOnly ? "Tệp phải là ảnh PNG." : "Tệp phải là ảnh PNG hoặc JPG.");
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error("Không đọc được ảnh. Hãy chọn một tệp PNG hoặc JPG khác.");
    }
    if (bitmap.width * bitmap.height > 24_000_000) {
      bitmap.close();
      throw new Error("Ảnh vượt quá 24 megapixel.");
    }
    return bitmap;
  }

  function mountImage(form, { onChange, pngOnly = false, enableSparklePreview = false }) {
    const fields = form.elements;
    const preview = form.querySelector("canvas");
    const artStatus = form.querySelector("[data-art-status]");
    const bakeCanvas = document.createElement("canvas");
    let bitmap = null;
    let bakedImg = "";
    let version = 0;
    let rafId = 0;

    function stopAnim() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }

    function paintPreviewFrame(nowMs = performance.now()) {
      const ctx = preview.getContext("2d");
      ctx.clearRect(0, 0, preview.width, preview.height);
      if (!bakedImg || !bakeCanvas.width) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bakeCanvas, 0, 0, preview.width, preview.height);
      if (enableSparklePreview && typeof ItemFX !== "undefined" && fields?.sparklePreset) {
        const sparkle = sparkleFromForm(fields);
        const rarity = fields?.rarity?.value || "NORMAL";
        const linhCan = fields?.linhCan?.value || "COMMON";
        ItemFX.drawSparkleOverlayCanvas(
          ctx,
          0,
          0,
          preview.width,
          { rarity, linhCan, sparkle, hasLuck: Boolean(fields?.hasLuck?.checked) },
          nowMs,
          { forceAnimate: true },
        );
      }
    }

    let hiddenObserver = null;
    function watchVisibility() {
      if (hiddenObserver || typeof MutationObserver === "undefined") return;
      const hiddenHost = form.closest("[hidden]")?.parentElement || form.parentElement;
      if (!hiddenHost) return;
      hiddenObserver = new MutationObserver(() => {
        if (!form.isConnected) {
          hiddenObserver.disconnect();
          hiddenObserver = null;
          return;
        }
        if (form.closest("[hidden]")) {
          stopAnim();
        } else {
          syncAnimLoop();
        }
      });
      hiddenObserver.observe(hiddenHost, { attributes: true, subtree: true, attributeFilter: ["hidden", "class", "style"] });
    }

    function syncAnimLoop() {
      stopAnim();
      if (!enableSparklePreview || !bakedImg || typeof ItemFX === "undefined" || !fields?.sparklePreset) return;
      const sparkle = sparkleFromForm(fields);
      if (!sparkle.enabled) return;
      watchVisibility();
      if (!form.isConnected || form.closest("[hidden]")) return;
      const tick = (nowMs) => {
        if (!form.isConnected || form.closest("[hidden]")) {
          rafId = 0;
          return;
        }
        paintPreviewFrame(nowMs);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }

    function refreshPreview() {
      stopAnim();
      bakedImg = "";
      preview.getContext("2d").clearRect(0, 0, preview.width, preview.height);
      if (bitmap) {
        try {
          const size = Number(fields.size.value);
          const rawUrl = drawIcon(bitmap, bakeCanvas, {
            size, colors: Number(fields.colors.value), removeBg: fields.removeBg.checked, outline: fields.outline.checked,
          });
          bakedImg = validatePngPayloadSize(rawUrl, size);
          preview.width = preview.height = enableSparklePreview ? Math.max(96, size * 2) : size;
          paintPreviewFrame(performance.now());
          const sparkleLabel = enableSparklePreview && fields?.sparklePreset?.value !== "NONE"
            ? ` · lấp lánh 2D (${fields.sparklePreset.value})`
            : "";
          artStatus.textContent = `${pngOnly ? "Sprite" : "Icon"} PNG · ${size} × ${size} px (${Math.round(bakedImg.length / 1024)} KB)${sparkleLabel}`;
          syncAnimLoop();
        } catch (error) {
          bakedImg = "";
          preview.getContext("2d").clearRect(0, 0, preview.width, preview.height);
          artStatus.textContent = error.message;
        }
      }
      onChange(bakedImg);
    }

    fields.source.addEventListener("change", async () => {
      const request = ++version;
      bitmap?.close();
      bitmap = null;
      refreshPreview();
      const file = fields.source.files[0];
      artStatus.textContent = file ? "Đang đọc ảnh…" : "Chọn ảnh để xem trước icon.";
      if (!file) return;
      try {
        const decoded = await loadBitmap(file, pngOnly);
        if (request !== version) return decoded.close();
        bitmap = decoded;
        refreshPreview();
      } catch (error) {
        if (request === version) artStatus.textContent = error.message;
      }
    });
    for (const key of ["size", "colors", "removeBg", "outline"]) fields.namedItem(key).addEventListener("change", refreshPreview);
    if (enableSparklePreview) {
      for (const key of ["sparklePreset", "sparkleColor", "sparkleIntensity", "rarity", "linhCan", "hasLuck"]) {
        fields.namedItem(key)?.addEventListener("change", () => {
          paintPreviewFrame(performance.now());
          syncAnimLoop();
        });
      }
    }
    function resetImage() {
      version += 1;
      stopAnim();
      bitmap?.close();
      bitmap = null;
      fields.source.value = "";
      artStatus.textContent = "Chọn ảnh để xem trước icon.";
      refreshPreview();
    }
    resetImage.setExisting = function setExistingImage(url) {
      const request = ++version;
      stopAnim();
      bitmap?.close();
      bitmap = null;
      fields.source.value = "";
      bakedImg = url || "";
      if (!bakedImg) {
        bakeCanvas.width = 0;
        bakeCanvas.height = 0;
        preview.getContext("2d").clearRect(0, 0, preview.width, preview.height);
        artStatus.textContent = "Chưa có ảnh PNG (đang dùng icon chữ). Chọn ảnh mới nếu muốn thay.";
        onChange("");
        return;
      }
      artStatus.textContent = "Đang dùng ảnh hiện tại. Chọn ảnh nguồn mới nếu muốn thay.";
      onChange(bakedImg);
      const previewSrc = /^(?:\.\/|\/)?assets\//i.test(bakedImg)
        ? "/" + bakedImg.replace(/^(?:\.\/|\/)/, "")
        : bakedImg;
      if (typeof Image === "function") {
        const existing = new Image();
        existing.onload = () => {
          if (request !== version) return;
          const size = existing.width || 48;
          bakeCanvas.width = size;
          bakeCanvas.height = existing.height || size;
          bakeCanvas.getContext("2d").drawImage(existing, 0, 0);
          preview.width = preview.height = enableSparklePreview ? Math.max(96, size * 2) : size;
          paintPreviewFrame(performance.now());
          syncAnimLoop();
        };
        existing.src = previewSrc;
      }
    };
    return resetImage;
  }

  function mount({ form, saveItem, openItems }) {
    const fields = form.elements;
    const saveStatus = form.querySelector("#item-save-status");
    const save = form.querySelector("[type=submit]");
    const list = form.querySelector("#item-studio-list");
    const modeBanner = form.querySelector("#item-studio-mode-banner");
    const modeLabel = form.querySelector("#item-studio-mode-label");
    const resetModeBtn = form.querySelector("#item-studio-new-mode");
    const typeGroups = form.querySelectorAll("[data-item-type]");
    let img = "";
    let saving = false;
    let saved = false;
    let customCode = false;
    let editingId = null;
    let editingRecord = null;
    const value = (key) => fields.namedItem(key)?.value ?? "";
    const number = (key) => Number(value(key) || 0);
    const updateButton = () => {
      save.disabled = saving || saved || (!img && !editingId);
      save.textContent = editingId ? "Lưu thay đổi vật phẩm" : "Lưu vào kho vật phẩm";
      if (modeBanner) modeBanner.hidden = !editingId;
      if (modeLabel && editingId) modeLabel.textContent = `Đang chỉnh sửa: ${editingRecord?.tenDo || editingRecord?.name || editingId} (${editingId})`;
    };
    const imageControl = mountImage(form, { onChange: (url) => { img = url; updateButton(); }, enableSparklePreview: true });

    function syncTypeGroups() {
      const currentType = value("type");
      for (const group of typeGroups) {
        group.hidden = group.disabled = group.dataset.itemType !== currentType;
      }
      if (fields.weaponKind) {
        const isWeapon = currentType === "EQUIPMENT" && value("slot") === "weapon";
        fields.weaponKind.disabled = !isWeapon;
      }
    }
    syncTypeGroups();

    function setField(key, val) {
      const el = fields.namedItem(key);
      if (!el) return;
      if (el.type === "checkbox") el.checked = Boolean(val);
      else el.value = val ?? "";
    }

    function loadRecord(record) {
      if (!record || typeof record !== "object") return;
      const id = String(record.id || record.maDo || "").trim();
      if (!id) return;
      editingId = id;
      editingRecord = { ...record };
      saved = false;
      customCode = true;
      if (fields.source) fields.source.required = false;
      setField("itemName", record.tenDo || record.name || "");
      setField("code", id);
      if (fields.code) fields.code.readOnly = true;
      setField("type", String(record.type || record.loai || "MATERIAL").toUpperCase());
      setField("rarity", String(record.rarity || "NORMAL").toUpperCase());
      setField("requiredRealmStt", record.requiredRealmStt ?? 1);
      setField("itemLevel", record.itemLevel ?? 10);
      setField("linhCan", record.linhCan || "");
      setField("currency", String(record.currency || "XU").toUpperCase());
      setField("giaMua", record.giaMua ?? 0);
      setField("giaBan", record.giaBan ?? 0);
      setField("hasLuck", Boolean(record.hasLuck));
      setField("moTa", record.moTa || "");
      const sparkle = record.sparkle || {};
      setField("sparklePreset", record.sparkle
        ? (sparkle.preset || (sparkle.enabled === false ? "NONE" : "SHIMMER"))
        : "NONE");
      setField("sparkleColor", /^#[0-9a-f]{6}$/i.test(sparkle.color || "") ? sparkle.color : "#ffd966");
      setField("sparkleIntensity", String(sparkle.intensity || 2));
      const stats = record.stats || {};
      setField("slot", record.slot || "weapon");
      setField("weaponKind", String(record.weaponKind || "sword").toLowerCase());
      for (const statKey of ["pAtk", "mAtk", "pDef", "mDef", "maxHp", "maxMp", "spd", "crit", "str", "agi", "vit", "ene"]) {
        setField(statKey, stats[statKey] ?? (statKey === "maxHp" ? stats.maxHP ?? 0 : statKey === "maxMp" ? stats.maxMP ?? 0 : 0));
      }
      setField("gemTier", record.gemTier || "BLESS");
      setField("healHp", record.healHp ?? 0);
      setField("healMp", record.healMp ?? 0);
      setField("giaTriTuVi", record.giaTriTuVi ?? 120);
      setField("elemTuVi", record.giaTriTuVi ?? 80);
      setField("tuViLinhCanVal", record.tuViLinhCanVal ?? 120);
      setField("bagSlots", record.bagSlots ?? 6);
      setField("xuAmount", record.xuAmount ?? 1000);
      setField("realmCode", record.realmCode || "TRUC_CO");
      setField("quality", record.quality || "HA_PHAM");
      setField("qualityLabel", record.qualityLabel || "Hạ phẩm");
      setField("breakthroughRate", record.breakthroughRate ?? 0.7);
      syncTypeGroups();
      imageControl.setExisting(record.img || "");
      saveStatus.textContent = "";
      list.hidden = true;
      updateButton();
    }

    function resetToCreate() {
      editingId = null;
      editingRecord = null;
      saved = false;
      customCode = false;
      form.reset();
      if (fields.code) fields.code.readOnly = false;
      if (fields.source) fields.source.required = true;
      syncTypeGroups();
      imageControl();
      saveStatus.textContent = "";
      list.hidden = true;
      updateButton();
    }

    resetModeBtn?.addEventListener("click", resetToCreate);
    fields.type.addEventListener("change", syncTypeGroups);
    fields.slot?.addEventListener("change", syncTypeGroups);
    fields.code.addEventListener("input", () => { customCode = Boolean(value("code")); });
    fields.itemName.addEventListener("input", () => {
      if (customCode || editingId) return;
      fields.code.value = value("itemName").toUpperCase().replace(/Đ/g, "D")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
    });
    function markEdited() {
      if (saving) return;
      saved = false;
      list.hidden = true;
      saveStatus.textContent = "";
      updateButton();
    }
    form.addEventListener("input", markEdited);
    form.addEventListener("change", markEdited);
    list.addEventListener("click", openItems);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (saving || saved || (!img && !editingId) || !form.reportValidity()) return;
      const id = editingId || value("code").trim();
      const name = value("itemName").trim();
      const type = value("type");
      if (!name) {
        saveStatus.textContent = "Hãy nhập tên vật phẩm.";
        fields.itemName.focus();
        return;
      }
      const sparkle = sparkleFromForm(fields);
      const record = {
        id,
        maDo: id,
        name,
        tenDo: name,
        loai: type,
        type,
        icon: editingRecord?.icon || "◇",
        rarity: value("rarity") || "NORMAL",
        requiredRealmStt: Math.max(1, number("requiredRealmStt") || 1),
        itemLevel: Math.max(1, number("itemLevel") || 10),
        currency: value("currency") || "XU",
        hasLuck: Boolean(fields.hasLuck?.checked),
        sparkle,
        moTa: value("moTa").trim(),
        giaMua: number("giaMua"),
        giaBan: number("giaBan"),
      };
      if (img) record.img = img;
      const linhCan = value("linhCan").trim();
      if (linhCan) record.linhCan = linhCan;
      if (record.giaMua > 0 && record.giaBan > record.giaMua) {
        saveStatus.textContent = "Giá bán lại phải nhỏ hơn hoặc bằng giá mua.";
        fields.giaBan.focus();
        return;
      }
      if (type === "EQUIPMENT") {
        record.slot = value("slot") || "weapon";
        if (record.slot === "weapon" && value("weaponKind")) {
          record.weaponKind = value("weaponKind");
        }
        record.stats = {
          pAtk: number("pAtk"),
          mAtk: number("mAtk"),
          pDef: number("pDef"),
          mDef: number("mDef"),
          maxHp: number("maxHp"),
          maxMp: number("maxMp"),
          spd: number("spd"),
          crit: Math.round(number("crit") * 10000) / 10000,
          str: number("str"),
          agi: number("agi"),
          vit: number("vit"),
          ene: number("ene"),
        };
      } else if (type === "ENHANCE_GEM") {
        record.gemTier = value("gemTier") || "BLESS";
      } else if (type === "PROTECT_CHARM") {
        record.gemTier = "PROTECT";
      } else if (type === "POTION") {
        record.healHp = number("healHp");
        record.healMp = number("healMp");
        if (!record.healHp && !record.healMp) {
          saveStatus.textContent = "Thuốc cần hồi ít nhất 1 HP hoặc 1 MP.";
          fields.healHp.focus();
          return;
        }
      } else if (type === "STONE") {
        record.giaTriTuVi = number("giaTriTuVi");
      } else if (type === "ELEMSTONE") {
        record.giaTriTuVi = number("elemTuVi");
      } else if (type === "LINDAN") {
        record.tuViLinhCanVal = number("tuViLinhCanVal");
      } else if (type === "BAG_EXPAND") {
        record.bagSlots = Math.max(1, number("bagSlots") || 6);
      } else if (type === "EXCHANGE_XU") {
        record.xuAmount = Math.max(1, number("xuAmount") || 1000);
      } else if (type === "BREAKTHROUGH_PILL") {
        record.realmCode = value("realmCode").trim() || "TRUC_CO";
        record.quality = value("quality") || "HA";
        if (value("qualityLabel").trim()) record.qualityLabel = value("qualityLabel").trim();
        record.breakthroughRate = Math.max(0.01, Math.min(1, number("breakthroughRate") || 0.55));
      }
      saving = true;
      const controls = [...form.querySelectorAll("input, select, textarea")].filter((control) => !control.disabled);
      controls.forEach((control) => { control.disabled = true; });
      updateButton();
      saveStatus.textContent = editingId ? "Đang cập nhật vật phẩm…" : "Đang lưu vật phẩm…";
      try {
        await saveItem(record, editingId);
        saved = true;
        saveStatus.textContent = editingId
          ? `Đã cập nhật ${name} (${id}) vào kho vật phẩm MySQL.`
          : `Đã lưu ${name} (${id}) vào kho vật phẩm MySQL.`;
        list.hidden = false;
      } catch (error) {
        saveStatus.textContent = error.message || "Không lưu được vật phẩm.";
      } finally {
        controls.forEach((control) => { control.disabled = false; });
        if (fields.code) fields.code.readOnly = Boolean(editingId);
        syncTypeGroups();
        saving = false;
        updateButton();
      }
    });

    return { loadRecord, resetToCreate };
  }

  return { mount, mountImage, sparkleFromForm, validatePngPayloadSize };
})();
