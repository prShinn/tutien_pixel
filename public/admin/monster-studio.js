"use strict";

function mountMonsterStudio(form, saveMonster) {
  const fields = form.elements;
  const status = form.querySelector("[data-monster-status]");
  const download = form.querySelector("[data-monster-download]");
  const mapLink = form.querySelector("[data-monster-map]");
  const save = form.querySelector("[type=submit]");
  let img = "";
  let saving = false;
  let savedCode = "";
  const number = (key) => Number(fields.namedItem(key).value);
  const updateButton = () => { save.disabled = saving || !img || !fields.code.value || savedCode === fields.code.value; };

  ItemStudio.mountImage(form, {
    pngOnly: true,
    onChange(url) {
      img = url;
      download.hidden = !img;
      if (img) download.href = img;
      else download.removeAttribute("href");
      updateButton();
    },
  });
  fields.code.addEventListener("input", () => {
    download.download = `${fields.code.value.replace(/[^A-Z0-9_]/g, "") || "monster"}.png`;
    updateButton();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (save.disabled || !form.reportValidity()) return;
    const code = fields.code.value;
    const name = fields.monsterName.value.trim();
    if (!name) {
      status.textContent = "Hãy nhập tên quái.";
      fields.monsterName.focus();
      return;
    }
    const linhCan = fields.linhCan.value;
    const hp = number("hp");
    const record = {
      id: code, code, name, img, type: fields.type.value, linhCan, nguHanh: [linhCan],
      level: number("level"), hp, maxHp: hp, atk: number("atk"), def: number("def"),
      speed: number("speed"), respawnMs: number("respawn") * 1000,
    };
    saving = true;
    updateButton();
    const controls = [...form.querySelectorAll("input, select")];
    controls.forEach((control) => { control.disabled = true; });
    status.textContent = "Đang lưu quái vật…";
    try {
      await saveMonster(record);
      savedCode = code;
      const query = new URLSearchParams({ monster: code });
      const apiBase = new URLSearchParams(window.location.search).get("apiBase");
      if (apiBase) query.set("apiBase", apiBase);
      mapLink.href = `/admin/map-editor?${query}`;
      mapLink.hidden = false;
      status.textContent = `Đã lưu ${name} (${code}) vào MySQL. Có thể chọn quái này trong Map Editor.`;
    } catch (error) {
      status.textContent = error.message || "Không lưu được quái vật.";
    } finally {
      controls.forEach((control) => { control.disabled = false; });
      saving = false;
      updateButton();
    }
  });
}
