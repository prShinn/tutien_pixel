"use strict";

const $ = (id) => document.getElementById(id);
const state = { worlds: [], realms: [] };

function adminHeaders(json = false) { return json ? { "content-type": "application/json" } : {}; }

async function getJson(url, options = {}) {
  const response = AdminAuth.isAdminUrl(url)
    ? await AdminAuth.fetch(url, options)
    : await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

function renderStats() {
  const published = state.worlds.filter((world) => world.status === "PUBLISHED");
  $("published-count").textContent = published.length;
  $("draft-count").textContent = `${state.worlds.length - published.length} bản nháp`;
  $("portal-count").textContent = state.worlds.reduce((sum, world) => sum + Number(world.portalCount || 0), 0);
  $("pack-count").textContent = state.worlds.reduce((sum, world) => sum + Number(world.monsterPackCount || 0), 0);
  $("realm-count").textContent = state.realms.length || "—";
}

function renderWorlds() {
  const host = $("world-list");
  if (!state.worlds.length) { host.innerHTML = '<div class="empty">Chưa có map trong registry.</div>'; return; }
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  host.innerHTML = state.worlds.map((world) => {
    const status = world.status === "PUBLISHED" ? "Published" : "Draft";
    return `<a class="world-row" href="/admin/map-editor?map=${encodeURIComponent(world.code)}"><div><b>${escapeHtml(world.tenMap || world.code)}</b><small>${escapeHtml(world.code)} · ${world.w}×${world.h} · ${escapeHtml(world.regionId || "UNASSIGNED")}</small></div><small>${world.portalCount || 0} portal · ${world.monsterPackCount || 0} bãi</small><span class="badge ${world.status === "PUBLISHED" ? "" : "draft"}">${status}</span></a>`;
  }).join("");
}

const contentLabels = { quests: "Quest", npcs: "NPC", items: "Items & Loot", skills: "Skills", accounts: "Tài khoản" };
let activeCollection = null;
const contentManager = ContentAdmin.createController({ api: API, getJson, adminHeaders });
const contentState = { records: [], query: "", busy: false, editingId: null, loadVersion: 0, demo: false };
const vfxState = { skills: [], selectedCode: "", profiles: {}, loaded: false, authorized: false, saving: false, previewStarted: performance.now() };

function vfxCode(skill) { return String(skill?.code || skill?.maNangLuc || skill?.id || ""); }
function vfxName(skill) { return String(skill?.name || skill?.tenNangLuc || vfxCode(skill)); }
function vfxRoot(skill) { return String(skill?.linhCan || skill?.maLinhCan || "COMMON").toUpperCase(); }
function vfxEscape(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
function setVfxDisabled(disabled) {
  ["vfx-skill-select", "vfx-root", "vfx-label", "vfx-form", "vfx-duration", "vfx-color-main", "vfx-color-light", "vfx-color-dark", "vfx-color-accent", "vfx-create", "vfx-save", "vfx-delete", "vfx-reset", "vfx-replay"].forEach((id) => { $(id).disabled = disabled; });
}

function renderVfxList() {
  const query = $("vfx-search").value.trim().toLocaleLowerCase();
  const filtered = vfxState.skills.filter((skill) => `${vfxName(skill)} ${vfxCode(skill)} ${vfxRoot(skill)}`.toLocaleLowerCase().includes(query));
  $("vfx-count").textContent = `${vfxState.skills.length} skill`;
  $("vfx-skill-list").innerHTML = filtered.map((skill) => {
    const code = vfxCode(skill);
    const custom = Boolean(vfxState.profiles[code]);
    return `<button class="vfx-skill-row ${code === vfxState.selectedCode ? "selected" : ""}" type="button" data-vfx-code="${vfxEscape(code)}"><span class="vfx-skill-root">${vfxEscape(vfxRoot(skill).slice(0, 2))}</span><span class="vfx-skill-copy"><b>${vfxEscape(vfxName(skill))}</b><small>${vfxEscape(code)} · ${vfxEscape(vfxRoot(skill))}</small></span><i class="vfx-row-status ${custom ? "custom" : ""}">${custom ? "Đã sửa" : "Mặc định"}</i></button>`;
  }).join("") || '<div class="empty">Không tìm thấy skill phù hợp.</div>';
}

function setVfxForm(skill, useDefaults = false) {
  setVfxDisabled(false);
  const code = vfxCode(skill);
  const saved = vfxState.profiles[code];
  if (useDefaults && saved) {
    delete vfxState.profiles[code];
  }
  const profile = SkillVFX.profile(skill);
  if (useDefaults && saved) {
    vfxState.profiles[code] = saved;
    SkillVFX.customProfiles[code] = saved;
  }
  const root = useDefaults ? vfxRoot(skill) : profile.root;
  const palette = useDefaults ? (SkillVFX.palette[root] || SkillVFX.palette.COMMON) : profile.palette;
  $("vfx-skill-name").textContent = vfxName(skill);
  $("vfx-skill-select").value = code;
  $("vfx-root").value = root;
  $("vfx-label").value = useDefaults ? (SkillVFX.labels[SkillVFX.forms[code]] || vfxName(skill)) : profile.label;
  $("vfx-form").value = useDefaults ? (SkillVFX.forms[code] || SkillVFX.fallbackForm(skill)) : profile.form;
  $("vfx-duration").value = useDefaults ? (Number(skill.tier || skill.capDo || 1) >= 3 ? 760 : 580) : (profile.durationMs || (profile.tier >= 3 ? 760 : 580));
  $("vfx-color-main").value = palette.main;
  $("vfx-color-light").value = palette.light;
  $("vfx-color-dark").value = palette.dark;
  $("vfx-color-accent").value = palette.accent;
  const hasProfile = Boolean(vfxState.profiles[code]);
  $("vfx-profile-badge").textContent = hasProfile ? "Đã tùy chỉnh" : "Mặc định";
  $("vfx-profile-badge").classList.toggle("custom", hasProfile);
  $("vfx-create").disabled = vfxState.saving || hasProfile;
  $("vfx-save").disabled = vfxState.saving || !hasProfile;
  $("vfx-delete").disabled = vfxState.saving || !hasProfile;
  $("vfx-preview-label").textContent = `${vfxName(skill)} · ${vfxRoot(skill)}`;
  vfxState.previewStarted = performance.now();
  renderVfxList();
}

function currentVfxValues() {
  const skill = vfxState.skills.find((item) => vfxCode(item) === vfxState.selectedCode);
  if (!skill) return null;
  const durationMs = Math.max(300, Math.min(1200, Number($("vfx-duration").value) || 580));
  return {
    skillCode: vfxCode(skill),
    label: $("vfx-label").value.trim() || vfxName(skill),
    root: $("vfx-root").value,
    form: $("vfx-form").value,
    durationMs,
    colors: {
      main: $("vfx-color-main").value,
      light: $("vfx-color-light").value,
      dark: $("vfx-color-dark").value,
      accent: $("vfx-color-accent").value,
    },
  };
}

async function saveVfxProfile(createOnly = false) {
  if (!vfxState.authorized || !vfxState.loaded || vfxState.saving) return;
  const values = currentVfxValues();
  if (!values) return;
  if (createOnly && vfxState.profiles[values.skillCode]) return;
  if (!createOnly && !vfxState.profiles[values.skillCode]) return;
  const path = createOnly ? API.PATHS.admin.skillVfx : API.PATHS.admin.skillVfxItem(values.skillCode);
  vfxState.saving = true;
  $("vfx-create").disabled = true;
  $("vfx-save").disabled = true;
  $("vfx-delete").disabled = true;
  try {
    const result = await getJson(API.BASE + path, {
      method: createOnly ? "POST" : "PUT",
      headers: { ...adminHeaders(), "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    const profiles = { ...vfxState.profiles, [values.skillCode]: result.profile };
    vfxState.profiles = profiles;
    SkillVFX.customProfiles = profiles;
    const mirrored = SkillVFX.saveCustomProfiles(profiles);
    $("vfx-save-state").textContent = mirrored ? "Đã lưu trên máy chủ" : "Đã lưu server · tab hiện tại không ghi được bộ nhớ cục bộ";
    $("vfx-save-state").classList.toggle("saved", mirrored);
    if (vfxState.selectedCode === values.skillCode) setVfxForm(vfxState.skills.find((item) => vfxCode(item) === values.skillCode));
    else renderVfxList();
  } catch (error) {
    $("vfx-save-state").textContent = error.message || "Không lưu được cấu hình animation";
    $("vfx-save-state").classList.remove("saved");
  } finally {
    vfxState.saving = false;
    const hasProfile = Boolean(vfxState.profiles[vfxState.selectedCode]);
    $("vfx-create").disabled = hasProfile;
    $("vfx-save").disabled = !hasProfile;
    $("vfx-delete").disabled = !hasProfile;
  }
}

async function openSkillVfx() {
  if (!vfxState.loaded) {
    try {
      const [skills, adminCatalog, savedProfiles] = await Promise.all([
        getJson(API.BASE + API.PATHS.data.skills),
        getJson(API.BASE + API.PATHS.admin.content("skills"), { headers: adminHeaders() }),
        getJson(API.BASE + API.PATHS.admin.skillVfx, { headers: adminHeaders() }),
      ]);
      vfxState.authorized = true;
      vfxState.skills = (Array.isArray(skills) ? skills : []).filter((skill) => vfxCode(skill));
      if (Array.isArray(adminCatalog.data) && adminCatalog.data.length) vfxState.skills = adminCatalog.data.filter((skill) => vfxCode(skill));
      vfxState.skills.sort((a, b) => `${vfxRoot(a)} ${vfxName(a)}`.localeCompare(`${vfxRoot(b)} ${vfxName(b)}`, "vi"));
      vfxState.profiles = savedProfiles.profiles && typeof savedProfiles.profiles === "object" ? savedProfiles.profiles : {};
      SkillVFX.customProfiles = vfxState.profiles;
      SkillVFX.saveCustomProfiles(vfxState.profiles);
      $("vfx-skill-select").innerHTML = vfxState.skills.map((skill) => `<option value="${vfxEscape(vfxCode(skill))}">${vfxEscape(vfxName(skill))} · ${vfxEscape(vfxCode(skill))}</option>`).join("");
      $("vfx-root").innerHTML = Object.keys(SkillVFX.palette).map((root) => `<option value="${vfxEscape(root)}">${vfxEscape(root)}</option>`).join("");
      const forms = [...new Set(Object.values(SkillVFX.forms))].sort((a, b) => a.localeCompare(b));
      $("vfx-form").innerHTML = forms.map((form) => `<option value="${vfxEscape(form)}">${vfxEscape(SkillVFX.labels[form] || form)}</option>`).join("");
      if (!vfxState.skills.length) throw new Error("Danh mục skill chưa có dữ liệu.");
      vfxState.loaded = true;
      $("vfx-save-state").textContent = "Cấu hình được lưu trên máy chủ";
      $("vfx-save-state").classList.remove("saved");
    } catch (error) {
      vfxState.authorized = false;
      vfxState.loaded = false;
      vfxState.skills = [];
      vfxState.selectedCode = "";
      vfxState.profiles = {};
      setVfxDisabled(true);
      $("vfx-skill-list").innerHTML = `<div class="empty">${vfxEscape(error.message)}</div>`;
      $("vfx-save-state").textContent = error.message || "Không tải được danh sách skill";
      $("vfx-save-state").classList.remove("saved");
      return;
    }
  }
  if (!vfxState.selectedCode && vfxState.skills.length) vfxState.selectedCode = vfxCode(vfxState.skills[0]);
  renderVfxList();
  const selected = vfxState.skills.find((skill) => vfxCode(skill) === vfxState.selectedCode);
  if (selected) setVfxForm(selected);
}

function drawVfxPreview(now) {
  const canvas = $("vfx-preview");
  if (!canvas) return;
  if (!$("skill-vfx-view").classList.contains("active")) {
    window.requestAnimationFrame(drawVfxPreview);
    return;
  }
  const c = canvas.getContext("2d");
  window.ctx = c;
  c.imageSmoothingEnabled = false;
  c.fillStyle = "#101c19"; c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = "#14251f";
  for (let x = 8; x < canvas.width; x += 32) for (let y = 8; y < 144; y += 24) c.fillRect(x, y, 2, 2);
  c.fillStyle = "#263c2c"; c.fillRect(0, 154, canvas.width, 66);
  c.fillStyle = "#36543a"; c.fillRect(0, 154, canvas.width, 3);
  c.fillStyle = "#1c3025"; for (let x = 0; x < canvas.width; x += 28) c.fillRect(x + 4, 174 + (x % 3) * 5, 10, 2);
  const player = { x: 137, y: 150 }, target = { x: 322, y: 150 };
  const pixelActor = (x, y, robe, skin, hair) => {
    c.fillStyle = "#0a100f"; c.fillRect(x - 8, y - 3, 16, 4);
    c.fillStyle = hair; c.fillRect(x - 5, y - 25, 10, 8);
    c.fillStyle = skin; c.fillRect(x - 4, y - 20, 8, 7);
    c.fillStyle = robe; c.fillRect(x - 7, y - 12, 14, 12);
    c.fillStyle = "#dbd8bd"; c.fillRect(x - 8, y - 10, 3, 9); c.fillRect(x + 5, y - 10, 3, 9);
    c.fillStyle = "#29251e"; c.fillRect(x - 5, y, 4, 4); c.fillRect(x + 1, y, 4, 4);
  };
  pixelActor(player.x, player.y, "#557b68", "#e3b990", "#253e39");
  pixelActor(target.x, target.y, "#8a4b47", "#b7775c", "#452e2c");
  const skill = vfxState.skills.find((item) => vfxCode(item) === vfxState.selectedCode);
  if (skill && window.SkillVFX) {
    const values = currentVfxValues();
    const defaultProfile = SkillVFX.profile(skill);
    const root = values?.root || defaultProfile.root;
    const profile = { ...defaultProfile, root, form: values?.form || defaultProfile.form, label: values?.label || defaultProfile.label, durationMs: values?.durationMs || defaultProfile.durationMs };
    const base = SkillVFX.palette[root] || SkillVFX.palette.COMMON;
    const palette = { ...base, ...(values?.colors || {}) };
    const effectDuration = profile.durationMs || (profile.tier >= 3 ? 760 : 580);
    const chargeDuration = 230;
    const cycleDuration = chargeDuration + effectDuration + 260;
    const elapsed = (now - vfxState.previewStarted) % cycleDuration;
    c.save();
    const origin = { x: player.x, y: player.y - 6 }, point = { x: target.x, y: target.y - 6 };
    if (elapsed < chargeDuration) SkillVFX.drawCharge(origin, profile, palette, elapsed / chargeDuration);
    else if (elapsed < chargeDuration + effectDuration) {
      const phase = (elapsed - chargeDuration) / effectDuration;
      if (String(profile.category).toUpperCase() === "PASSIVE" || ["heal", "restore_mp", "cleanse", "shield", "buff_def", "buff_vitals", "speed"].includes(String(profile.effect).toLowerCase())) {
        SkillVFX.drawSupport(origin, profile, palette, phase);
      } else {
        SkillVFX.drawImpact(origin, point, profile, palette, phase, { miss: false, critical: phase > 0.84 }, true);
      }
    }
    c.restore();
    c.fillStyle = "#d4c9a0"; c.font = "12px monospace"; c.fillText(profile.label || vfxName(skill), 14, 24);
  } else {
    c.fillStyle = "#c1c0a0"; c.font = "12px monospace"; c.fillText("Chọn một skill để xem animation", 14, 24);
  }
  window.requestAnimationFrame(drawVfxPreview);
}

function setContentFeedback(message = "", kind = "success") {
  const feedback = $("content-feedback");
  feedback.textContent = message;
  feedback.classList.toggle("error", kind === "error");
  feedback.hidden = !message;
}

function renderContent(collection, payload) {
  activeCollection = collection;
  contentState.records = Array.isArray(payload.data) ? payload.data : [];
  contentState.demo = Boolean(payload.demo);
  $("content-title").textContent = contentLabels[collection] || collection;
  $("content-meta").textContent = payload.demo
    ? "Mock server · dữ liệu RAM · mất khi server khởi động lại"
    : "Dữ liệu máy chủ";
  const canEdit = ContentAdmin.EDITABLE_COLLECTIONS.has(collection);
  const newButton = $("new-record");
  newButton.hidden = !canEdit;
  newButton.disabled = contentState.busy;
  const visibleRecords = AdminContentUtils.filterRecords(contentState.records, contentState.query);
  if (!visibleRecords.length) {
    const emptyMessage = contentState.records.length ? "Không tìm thấy bản ghi phù hợp." : "Collection chưa có bản ghi.";
    $("content-table").innerHTML = `<div class="empty">${AdminContentUtils.escapeHtml(emptyMessage)}</div>`;
    return;
  }
  const rows = visibleRecords.map((record) => {
    const recordIndex = contentState.records.indexOf(record);
    const values = AdminContentUtils.summarizeRecord(record, 3).map(({ key, value }) =>
      `<span class="content-field"><small>${AdminContentUtils.escapeHtml(key)}</small><span title="${AdminContentUtils.escapeHtml(value)}">${AdminContentUtils.escapeHtml(value)}</span></span>`).join("");
    const id = AdminContentUtils.escapeHtml(record.id);
    const state = AdminContentUtils.escapeHtml(record.status || "Đang dùng");
    const actions = canEdit
      ? `<div class="content-record-actions"><button class="vfx-button subtle" type="button" data-content-action="edit" data-index="${recordIndex}" aria-label="Sửa ${id}">Sửa</button><button class="vfx-button danger" type="button" data-content-action="delete" data-index="${recordIndex}" aria-label="Xóa ${id}">Xóa</button></div>`
      : `<span class="content-readonly">Chỉ xem</span>`;
    return `<article class="content-record" role="listitem"><div class="content-record-id"><b>${id}</b><small>${values}</small></div><span class="table-status">${state}</span>${actions}</article>`;
  }).join("");
  const mockNote = payload.demo
    ? `<div class="mock-note">${collection === "quests" || collection === "npcs" ? "Quest và NPC trong mục này là catalog demo; chưa nối vào nội dung runtime." : "Đây là catalog demo trên server hiện tại; thay đổi chưa được lưu bền vững."}</div>`
    : "";
  $("content-table").innerHTML = `${mockNote}<div class="content-record-list" role="list">${rows}</div>`;
}

async function openContent(collection, { feedback = "" } = {}) {
  activeCollection = collection;
  const loadVersion = ++contentState.loadVersion;
  contentState.records = [];
  if (feedback) setContentFeedback(feedback);
  else setContentFeedback();
  $("content-table").innerHTML = '<div class="loading" role="status">Đang tải dữ liệu…</div>';
  try {
    const payload = await contentManager.list(collection);
    if (loadVersion !== contentState.loadVersion || collection !== activeCollection) return;
    renderContent(collection, payload);
    if (feedback) setContentFeedback(feedback);
  } catch (error) {
    if (loadVersion !== contentState.loadVersion || collection !== activeCollection) return;
    $("content-table").innerHTML = `<div class="empty"><span>${AdminContentUtils.escapeHtml(error.message || "Không tải được dữ liệu.")}</span><button class="vfx-button subtle" type="button" data-content-action="reload">Thử tải lại</button></div>`;
  }
}

function openContentEditor(record = null) {
  if (!activeCollection || !ContentAdmin.EDITABLE_COLLECTIONS.has(activeCollection) || contentState.busy) return;
  const editing = Boolean(record);
  const fields = editing ? { ...record } : AdminContentUtils.createBlankRecord(activeCollection, Date.now(), contentState.records);
  const recordId = String(fields.id ?? "");
  delete fields.id;
  delete fields.updatedAt;
  contentState.editingId = editing ? recordId : null;
  $("content-editor-title").textContent = editing ? `Sửa ${contentLabels[activeCollection]}` : `Thêm ${contentLabels[activeCollection]}`;
  $("content-editor-save").textContent = editing ? "Lưu thay đổi" : "Tạo bản ghi";
  $("content-record-id").value = recordId;
  $("content-record-id").readOnly = editing;
  $("content-record-json").value = JSON.stringify(fields, null, 2);
  $("content-editor-error").textContent = "";
  $("content-editor-error").hidden = true;
  $("content-editor-dialog").showModal();
  if (!editing) $("content-record-id").focus();
}

function setContentEditorError(message) {
  const error = $("content-editor-error");
  error.textContent = message;
  error.hidden = !message;
}

async function saveContent(event) {
  event.preventDefault();
  if (contentState.busy || !activeCollection) return;
  const wasEdit = contentState.editingId !== null;
  const editingId = contentState.editingId;
  contentState.busy = true;
  $("content-editor-save").disabled = true;
  $("content-editor-save").textContent = "Đang lưu…";
  setContentEditorError("");
  try {
    const id = $("content-record-id").value.trim();
    const result = await contentManager.save(activeCollection, {
      id,
      json: $("content-record-json").value,
      existingId: editingId,
    });
    $("content-editor-dialog").close();
    await openContent(activeCollection, { feedback: wasEdit ? "Đã lưu thay đổi." : "Đã tạo bản ghi." });
    if (result?.data?.id) setContentFeedback(`Đã lưu ${result.data.id}.`);
  } catch (error) {
    setContentEditorError(error.message || "Không lưu được bản ghi.");
  } finally {
    contentState.busy = false;
    $("content-editor-save").disabled = false;
    $("content-editor-save").textContent = contentState.editingId ? "Lưu thay đổi" : "Tạo bản ghi";
    $("new-record").disabled = false;
  }
}

async function handleContentAction(event) {
  const button = event.target.closest("[data-content-action]");
  if (!button) return;
  const action = button.dataset.contentAction;
  if (action === "reload") return openContent(activeCollection);
  const record = contentState.records[Number(button.dataset.index)];
  if (!record || contentState.busy) return;
  if (action === "edit") return openContentEditor(record);
  if (action !== "delete" || !window.confirm(`Xóa bản ghi “${record.name || record.title || record.id}”?`)) return;
  contentState.busy = true;
  button.disabled = true;
  try {
    await contentManager.remove(activeCollection, record.id);
    await openContent(activeCollection, { feedback: `Đã xóa ${record.id}.` });
  } catch (error) {
    setContentFeedback(error.message || "Không xóa được bản ghi.", "error");
  } finally {
    contentState.busy = false;
    $("new-record").disabled = false;
    renderContent(activeCollection, { data: contentState.records, demo: contentState.demo });
  }
}

async function loadOverview() {
  try {
    const [worlds, realms] = await Promise.all([
      getJson(API.BASE + API.PATHS.admin.worlds, { headers: adminHeaders() }),
      getJson(API.BASE + API.PATHS.data.realms),
    ]);
    state.worlds = worlds; state.realms = realms;
    renderStats(); renderWorlds();
  } catch (error) {
    $("world-list").innerHTML = `<div class="empty">${error.message} · cần tài khoản GM/ADMIN.</div>`;
  }
}

function reloadAdminViewAfterLogin() {
  void loadOverview();
  const active = document.querySelector('.nav-item.active[data-view]');
  if (active?.dataset.view === "content") void openContent(active.dataset.collection);
  if (active?.dataset.view === "skill-vfx") {
    vfxState.loaded = false;
    vfxState.authorized = false;
    setVfxDisabled(true);
    void openSkillVfx();
  }
}
window.addEventListener("admin:authenticated", reloadAdminViewAfterLogin);

document.querySelectorAll(".nav-item[data-view]").forEach((item) => item.addEventListener("click", (event) => {
  event.preventDefault();
  if (item.classList.contains("disabled")) return;
  document.querySelectorAll(".nav-item").forEach((node) => node.classList.remove("active"));
  item.classList.add("active");
  const isContent = item.dataset.view === "content";
  const isVfx = item.dataset.view === "skill-vfx";
  $("overview").classList.toggle("hidden", isContent || isVfx);
  $("content-view").classList.toggle("active", isContent);
  $("skill-vfx-view").classList.toggle("active", isVfx);
  $("placeholder").classList.remove("active");
  $("view-title").textContent = isVfx ? "Hoạt ảnh kỹ năng" : (isContent ? (contentLabels[item.dataset.collection] || "Content") : "Tổng quan thế giới");
  if (isContent) openContent(item.dataset.collection);
  if (isVfx) openSkillVfx();
}));

$("new-record").addEventListener("click", () => openContentEditor());
$("content-search").addEventListener("input", (event) => {
  contentState.query = event.target.value;
  if (activeCollection) renderContent(activeCollection, { data: contentState.records, demo: contentState.demo });
});
$("content-table").addEventListener("click", (event) => { void handleContentAction(event); });
$("content-editor-form").addEventListener("submit", (event) => { void saveContent(event); });
$("content-editor-close").addEventListener("click", () => $("content-editor-dialog").close());
$("content-editor-cancel").addEventListener("click", () => $("content-editor-dialog").close());
$("content-editor-dialog").addEventListener("close", () => {
  contentState.editingId = null;
  contentState.busy = false;
  $("content-editor-save").disabled = false;
  $("content-editor-save").textContent = "Lưu bản ghi";
});

$("vfx-search").addEventListener("input", renderVfxList);
$("vfx-skill-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-vfx-code]");
  if (!button) return;
  vfxState.selectedCode = button.dataset.vfxCode;
  const skill = vfxState.skills.find((item) => vfxCode(item) === vfxState.selectedCode);
  if (skill) setVfxForm(skill);
});
$("vfx-skill-select").addEventListener("change", (event) => {
  vfxState.selectedCode = event.target.value;
  const skill = vfxState.skills.find((item) => vfxCode(item) === vfxState.selectedCode);
  if (skill) setVfxForm(skill);
});
$("vfx-create").addEventListener("click", () => saveVfxProfile(true));
$("vfx-save").addEventListener("click", () => saveVfxProfile(false));
$("vfx-delete").addEventListener("click", async () => {
  if (!vfxState.authorized || !vfxState.loaded || vfxState.saving) return;
  const code = vfxState.selectedCode;
  if (!vfxState.profiles[code]) return;
  vfxState.saving = true;
  $("vfx-create").disabled = true;
  $("vfx-save").disabled = true;
  $("vfx-delete").disabled = true;
  try {
    await getJson(API.BASE + API.PATHS.admin.skillVfxItem(code), { method: "DELETE", headers: adminHeaders() });
    const profiles = { ...vfxState.profiles };
    delete profiles[code];
    vfxState.profiles = profiles;
    SkillVFX.customProfiles = profiles;
    SkillVFX.saveCustomProfiles(profiles);
    $("vfx-save-state").textContent = "Đã xóa cấu hình · đang dùng mặc định";
    $("vfx-save-state").classList.remove("saved");
  } catch (error) {
    $("vfx-save-state").textContent = error.message || "Không xóa được cấu hình animation";
    $("vfx-save-state").classList.remove("saved");
  } finally {
    vfxState.saving = false;
    const hasProfile = Boolean(vfxState.profiles[vfxState.selectedCode]);
    $("vfx-create").disabled = hasProfile;
    $("vfx-save").disabled = !hasProfile;
    $("vfx-delete").disabled = !hasProfile;
    if (vfxState.selectedCode === code) {
      const skill = vfxState.skills.find((item) => vfxCode(item) === code);
      if (skill) setVfxForm(skill);
    }
  }
});
$("vfx-reset").addEventListener("click", () => {
  const skill = vfxState.skills.find((item) => vfxCode(item) === vfxState.selectedCode);
  if (skill) setVfxForm(skill, true);
});
$("vfx-replay").addEventListener("click", () => { vfxState.previewStarted = performance.now(); });
$("vfx-label").addEventListener("input", () => {
  const skill = vfxState.skills.find((item) => vfxCode(item) === vfxState.selectedCode);
  if (skill) $("vfx-preview-label").textContent = `${$("vfx-label").value || vfxName(skill)} · ${$("vfx-root").value}`;
});
$("vfx-root").addEventListener("change", () => {
  const root = $("vfx-root").value;
  const palette = SkillVFX.palette[root] || SkillVFX.palette.COMMON;
  if (!vfxState.profiles[vfxState.selectedCode]) {
    $("vfx-color-main").value = palette.main;
    $("vfx-color-light").value = palette.light;
    $("vfx-color-dark").value = palette.dark;
    $("vfx-color-accent").value = palette.accent;
  }
});
window.addEventListener("storage", (event) => {
  if (event.key !== SkillVFX.storageKey && event.key !== null) return;
  if (!vfxState.loaded) return;
  void getJson(API.BASE + API.PATHS.admin.skillVfx, { headers: adminHeaders() }).then((result) => {
    vfxState.profiles = result.profiles && typeof result.profiles === "object" ? result.profiles : {};
    SkillVFX.customProfiles = vfxState.profiles;
    SkillVFX.saveCustomProfiles(vfxState.profiles);
    renderVfxList();
    const skill = vfxState.skills.find((item) => vfxCode(item) === vfxState.selectedCode);
    if (skill) setVfxForm(skill);
  }).catch((error) => {
    $("vfx-save-state").textContent = error.message || "Không đồng bộ được cấu hình animation";
    $("vfx-save-state").classList.remove("saved");
  });
});
window.requestAnimationFrame(drawVfxPreview);
setVfxDisabled(true);
void AdminAuth.ready.then((authenticated) => { if (authenticated) return loadOverview(); });
