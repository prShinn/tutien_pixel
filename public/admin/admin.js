"use strict";

const $ = (id) => document.getElementById(id);
function adminImage(source) {
  if (typeof source !== "string") return "";
  if (/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(source) && source.length <= 24000) return source;
  if (/^(?:\.\/|\/)?assets\/[A-Za-z0-9_/-]+\.(?:png|svg|webp)$/i.test(source)) return "/" + source.replace(/^(?:\.\/|\/)/, "");
  return "";
}
const state = { worlds: [], realms: [] };

function adminHeaders(json = false) { return json ? { "content-type": "application/json" } : {}; }

async function getJson(url, options = {}) {
  const response = AdminAuth.isAdminUrl(url)
    ? await AdminAuth.fetch(url, options)
    : await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || `Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
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

const contentLabels = { quests: "Quest", npcs: "NPC theo map", items: "Kho vật phẩm", skills: "Skills", monsters: "Ngân hàng quái", alchemyRecipes: "Công thức Luyện Đan", lootTables: "Bảng rớt đồ", accounts: "Tài khoản & Nhân vật" };
let activeCollection = null;
const contentManager = ContentAdmin.createController({ api: API, getJson, adminHeaders });
const pagedCollections = new Set(["items", "monsters", "skills"]);
const pixelArtCollections = new Set(["items", "skills", "monsters"]);
const catalogPageSize = 24;
let contentSearchTimer;
const contentState = { page: 1, records: [], query: "", itemType: "", rarity: "", busy: false, editingId: null, loadVersion: 0, demo: false, persisted: false, sampleItems: null };
const vfxState = { skills: [], selectedCode: "", profiles: {}, loaded: false, authorized: false, saving: false, previewStarted: performance.now(), previewActive: false };

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
  const profile = SkillVFX.profile(skill, { useDefaults });
  const { root, palette } = profile;
  $("vfx-skill-name").textContent = vfxName(skill);
  $("vfx-skill-select").value = code;
  $("vfx-root").value = root;
  $("vfx-label").value = profile.label;
  $("vfx-form").value = profile.form;
  $("vfx-duration").value = SkillVFX.castTiming(profile).effect;
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
  if (!canvas) { vfxState.previewActive = false; return; }
  if (!$("skill-vfx-view").classList.contains("active")) {
    vfxState.previewActive = false;
    return;
  }
  vfxState.previewActive = true;
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
  let drawEffect = () => {};
  let label = "Chọn một skill để xem animation";
  const skill = vfxState.skills.find((item) => vfxCode(item) === vfxState.selectedCode);
  if (skill && window.SkillVFX) {
    const values = currentVfxValues();
    const defaultProfile = SkillVFX.profile(skill);
    const root = values?.root || defaultProfile.root;
    const profile = { ...defaultProfile, root, form: values?.form || defaultProfile.form, label: values?.label || defaultProfile.label, durationMs: values?.durationMs || defaultProfile.durationMs };
    const base = SkillVFX.palette[root] || SkillVFX.palette.COMMON;
    const palette = { ...base, ...(values?.colors || {}) };
    profile.palette = palette;
    const timing = SkillVFX.castTiming(profile);
    const castMode = SkillVFX.castMode(skill);
    const cycleDuration = timing.charge + timing.effect + (castMode === "passive" ? SkillVFX.auraPauseMs : 260);
    const elapsed = (now - vfxState.previewStarted) % cycleDuration;
    const mode = elapsed < timing.charge ? "charge" : castMode;
    const phase = mode === "charge"
      ? SkillVFX.phaseProgress(elapsed, timing.charge)
      : SkillVFX.phaseProgress(elapsed - timing.charge, timing.effect);
    label = profile.label || vfxName(skill);
    drawEffect = (layer) => {
      if (phase === null) return;
      c.save();
      SkillVFX.drawCastPhase(mode, player, [target], profile, phase, layer);
      c.restore();
    };
  }
  drawEffect("behind");
  pixelActor(player.x, player.y, "#557b68", "#e3b990", "#253e39");
  pixelActor(target.x, target.y, "#8a4b47", "#b7775c", "#452e2c");
  drawEffect("front");
  c.fillStyle = "#d4c9a0";
  c.font = "12px monospace";
  c.fillText(label, 14, 24);
  if ($("skill-vfx-view").classList.contains("active")) {
    window.requestAnimationFrame(drawVfxPreview);
  } else {
    vfxState.previewActive = false;
  }
}

function startVfxPreview() {
  if (!vfxState.previewActive) {
    vfxState.previewActive = true;
    window.requestAnimationFrame(drawVfxPreview);
  }
}

function setContentFeedback(message = "", kind = "success") {
  const feedback = $("content-feedback");
  feedback.textContent = message;
  feedback.classList.toggle("error", kind === "error");
  feedback.hidden = !message;
}

async function loadSampleItemsPreview() {
  const items = AdminContentUtils.createSampleInventory();
  contentState.sampleItems = null;
  $("apply-sample-items").disabled = true;
  $("sample-items-preview").replaceChildren();
  $("sample-items-status").textContent = "Đang đối chiếu danh mục…";
  const loadVersion = contentState.loadVersion;
  const isCurrent = () => !$("sample-items-tool").hidden && activeCollection === "items" && loadVersion === contentState.loadVersion;
  try {
    const result = await fetchCatalog("items", { ids: items.map((item) => item.id).join(","), limit: 100 });
    if (!isCurrent()) return;
    if (result.persisted !== true || result.demo === true) throw new Error("API Admin chưa xác nhận danh mục MySQL.");
    if (result.pagination && result.pagination.total > result.data.length) {
      throw new Error("Chưa đối chiếu đủ vật phẩm mẫu. Hãy tải lại danh mục rồi thử lại.");
    }
    const existing = new Set(result.data.flatMap((record) => [String(record.id), String(record.maDo || "")]));
    contentState.sampleItems = { all: items, existing };
    renderSampleItemsPreview();
  } catch (error) {
    if (isCurrent()) $("sample-items-status").textContent = error.message;
  }
}

async function fetchCatalog(collection, params) {
  const payload = await contentManager.list(collection, params);
  if (!Array.isArray(payload?.data)) throw new Error("API Admin trả danh sách không hợp lệ.");
  return pagedCollections.has(collection)
    ? AdminContentUtils.validatePagedResult(payload, { page: params?.page ?? 1, limit: params?.limit ?? catalogPageSize })
    : payload;
}

function renderSampleItemsPreview() {
  if (!contentState.sampleItems) return;
  const { all: items, existing } = contentState.sampleItems;
  const pending = items.filter((item) => !existing.has(item.id));
  const duplicates = items.length - pending.length;
  contentState.sampleItems = { all: items, existing, pending };
  const categories = [
    ["Nón", items.filter((item) => item.slot === "hat").length],
    ["Giáp", items.filter((item) => item.slot === "armor").length],
    ["Quần", items.filter((item) => item.slot === "pants").length],
    ["Giày", items.filter((item) => item.slot === "boots").length],
    ["Vật phẩm khác", items.filter((item) => !item.slot).length],
  ];
  $("sample-items-preview").innerHTML = items.map((item) => {
    const category = item.slot ? categories.find(([name]) => ({ Nón: "hat", Giáp: "armor", Quần: "pants", Giày: "boots" }[name]) === item.slot)?.[0] : item.type;
    const state = existing.has(item.id) ? "Đã có" : "Sẽ thêm";
    return `<div class="sample-item-row" role="listitem"><span><b>${AdminContentUtils.escapeHtml(item.name)}</b><small>${AdminContentUtils.escapeHtml(category)} · ${AdminContentUtils.escapeHtml(item.id)}</small></span><i class="${existing.has(item.id) ? "exists" : "new"}">${state}</i></div>`;
  }).join("");
  const storageState = contentState.persisted ? "MySQL sẵn sàng" : "Ghi MySQL đang khóa";
  $("sample-items-status").textContent = `${items.length} món · ${categories.map(([name, count]) => `${name} ${count}`).join(" · ")} · ${pending.length} món mới, ${duplicates} món đã có · ${storageState}.`;
  $("apply-sample-items").disabled = contentState.busy || !contentState.persisted || !pending.length;
  $("apply-sample-items").textContent = pending.length ? `Thêm ${pending.length} món chưa có` : "Danh mục mẫu đã đủ";
}

function setSampleItemsBusy(busy) {
  $("sample-items-tool").setAttribute("aria-busy", String(busy));
  $("open-sample-items").disabled = busy;
  $("new-record").disabled = busy;
  $("apply-sample-items").disabled = busy || !contentState.persisted || !contentState.sampleItems?.pending.length;
}

async function applySampleItems() {
  if (contentState.busy || activeCollection !== "items" || !contentState.persisted) return;
  renderSampleItemsPreview();
  const pending = contentState.sampleItems?.pending || [];
  if (!pending.length) return;
  contentState.busy = true;
  setSampleItemsBusy(true);
  let created = 0;
  let skipped = 0;
  const failures = [];
  for (let index = 0; index < pending.length; index += 1) {
    const item = pending[index];
    $("sample-items-status").textContent = `Đang thêm ${index + 1}/${pending.length}: ${item.name}…`;
    try {
      await contentManager.save("items", { id: item.id, json: JSON.stringify(item) });
      created += 1;
    } catch (error) {
      if (/đã tồn tại/i.test(error.message || "")) skipped += 1;
      else {
        failures.push(`${item.id}: ${error.message || "không lưu được"}`);
        if (/mysql|backend|không kết nối/i.test(error.message || "")) break;
      }
    }
  }
  if (activeCollection === "items") {
    await openContent("items");
  }
  contentState.busy = false;
  setSampleItemsBusy(false);
  if (activeCollection === "items") renderContent("items", { data: contentState.records, demo: contentState.demo, pagination: contentState.pagination });
  if (activeCollection === "items" && !$("sample-items-tool").hidden) renderSampleItemsPreview();
  const message = `Đã thêm ${created} món${skipped ? ` · bỏ qua ${skipped} món trùng` : ""}${failures.length ? ` · ${failures.length} lỗi` : ""}.`;
  setContentFeedback(failures.length ? `${message} ${failures.slice(0, 2).join("; ")}` : message, failures.length ? "error" : "success");
}

function renderContentPager() {
  const pagination = contentState.pagination;
  $("content-pagination").hidden = !pagination;
  if (!pagination) return;
  const pages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  $("content-page-summary").textContent = "Trang " + pagination.page + "/" + pages + " · " + pagination.total + " bản ghi";
  $("content-prev").disabled = pagination.page <= 1 || contentState.busy;
  $("content-next").disabled = pagination.page >= pages || contentState.busy;
}

function renderContent(collection, payload) {
  activeCollection = collection;
  contentState.records = Array.isArray(payload.data) ? payload.data : [];
  contentState.demo = Boolean(payload.demo);
  contentState.persisted = (payload.persisted === undefined ? contentState.persisted : payload.persisted === true) && !contentState.demo;
  $("content-title").textContent = contentLabels[collection] || collection;
  $("content-meta").textContent = contentState.persisted
    ? (pagedCollections.has(collection) ? "Backend · MySQL · phân trang máy chủ" : "Backend · MySQL · lưu bền vững")
    : "Chỉ xem · Backend chưa xác nhận lưu MySQL";
  const canEdit = ContentAdmin.EDITABLE_COLLECTIONS.has(collection) && contentState.persisted;
  const newButton = $("new-record");
  newButton.hidden = !canEdit || collection === "monsters";
  newButton.disabled = contentState.busy;
  const sampleButton = $("open-sample-items");
  sampleButton.hidden = collection !== "items" || !ContentAdmin.EDITABLE_COLLECTIONS.has(collection);
  sampleButton.disabled = contentState.busy || !contentState.persisted;
  $("open-item-studio").hidden = collection !== "items";
  $("open-item-studio").disabled = contentState.busy || !contentState.persisted;
  $("item-type-filter").hidden = collection !== "items";
  $("item-rarity-filter").hidden = collection !== "items";
  $("open-monster-studio").hidden = collection !== "monsters";
  $("open-monster-studio").disabled = contentState.busy || !contentState.persisted;
  if (collection !== "items") {
    $("sample-items-tool").hidden = true;
    sampleButton.setAttribute("aria-expanded", "false");
  }
  const storageNote = !contentState.persisted
    ? '<div class="mock-note">Backend chưa xác nhận MySQL đang lưu dữ liệu. Các thao tác thêm, sửa, xóa đã khóa để tránh ghi vào RAM.</div>'
    : "";
  const pagination = contentState.pagination = payload.pagination ?? null;
  renderContentPager();
  const visibleRecords = pagination ? contentState.records : AdminContentUtils.filterRecords(contentState.records, contentState.query);
  if (!visibleRecords.length) {
    const emptyMessage = (contentState.query.trim() || contentState.itemType || contentState.rarity || contentState.records.length)
      ? "Không tìm thấy bản ghi phù hợp."
      : "Collection chưa có bản ghi.";
    $("content-table").innerHTML = `${storageNote}<div class="empty">${AdminContentUtils.escapeHtml(emptyMessage)}</div>`;
    if (!$("sample-items-tool").hidden) renderSampleItemsPreview();
    return;
  }
  const rows = visibleRecords.map((record) => {
    const recordIndex = contentState.records.indexOf(record);
    const values = AdminContentUtils.summarizeRecord(record, 4).map(({ key, value }) =>
      `<span class="content-field"><small>${AdminContentUtils.escapeHtml(key)}</small><span title="${AdminContentUtils.escapeHtml(value)}">${AdminContentUtils.escapeHtml(value)}</span></span>`).join("");
    const id = AdminContentUtils.escapeHtml(collection === "skills" ? record.code || record.id : (record.id ?? record.playerId ?? ""));
    const rarityCode = String(record.rarity || "").toUpperCase();
    const state = collection === "items" && rarityCode
      ? AdminContentUtils.escapeHtml(`${rarityCode} · iLv.${record.itemLevel ?? (Number(record.requiredRealmStt || 1) * 10)}`)
      : collection === "accounts"
        ? AdminContentUtils.escapeHtml(`${record.role || "PLAYER"}${record.playerName ? ` · ${record.playerName}` : ""}`)
        : AdminContentUtils.escapeHtml(record.status || "Đang dùng");
    const canEditRecord = canEdit;
    const asset = pagedCollections.has(collection) ? adminImage(record.img) || adminImage(record.icon) : "";
    const preview = asset ? `<img class="content-record-preview" src="${asset}" alt="" loading="lazy" />` : "";
    let actions = `<span class="content-readonly">Chỉ xem</span>`;
    if (canEditRecord) {
      actions = `<div class="content-record-actions">`
        + (collection === "items" ? `<button class="vfx-button primary" type="button" data-content-action="edit-studio" data-index="${recordIndex}">Sửa Studio</button>` : "")
        + `<button class="vfx-button subtle" type="button" data-content-action="edit" data-index="${recordIndex}" aria-label="Sửa ${id}">${collection === "items" ? "Sửa JSON" : "Sửa"}</button>`
        + (collection === "items" || collection === "skills" ? `<button class="vfx-button danger" type="button" data-content-action="delete" data-index="${recordIndex}" aria-label="Xóa ${id}">Xóa</button>` : "")
        + `</div>`;
    } else if (collection === "accounts" && record.playerId) {
      actions = `<div class="content-record-actions"><button class="vfx-button primary" type="button" data-content-action="mail" data-index="${recordIndex}">Gửi thư quà</button></div>`;
    }
    const displayName = collection === "accounts"
      ? `${record.username || id}${record.playerName ? ` (${record.playerName})` : " (Chưa tạo nhân vật)"}`
      : (record.tenDo || record.name || record.title || record.id);
    return `<article class="content-record${pagedCollections.has(collection) ? " with-preview" : ""}" role="listitem">${preview || (pagedCollections.has(collection) ? '<span class="content-record-preview preview-placeholder" aria-hidden="true">—</span>' : "")}<div class="content-record-id"><b>${AdminContentUtils.escapeHtml(displayName)}</b><small class="content-record-code">${id}</small><div class="content-record-fields">${values}</div></div><span class="table-status">${state}</span>${actions}</article>`;
  }).join("");
  $("content-table").innerHTML = `${storageNote}<div class="content-record-list" role="list">${rows}</div>`;
  if (!$("sample-items-tool").hidden) renderSampleItemsPreview();
}

async function openContent(collection, { feedback = "" } = {}) {
  clearTimeout(contentSearchTimer);
  if (activeCollection !== collection) {
    contentState.page = 1;
    contentState.query = "";
    contentState.itemType = "";
    contentState.rarity = "";
    $("content-search").value = "";
    $("item-type-filter").value = "";
    $("item-rarity-filter").value = "";
  }
  activeCollection = collection;
  const loadVersion = ++contentState.loadVersion;
  $("content-pagination").hidden = true;
  $("open-item-studio").hidden = true;
  $("item-type-filter").hidden = true;
  $("item-rarity-filter").hidden = true;
  $("open-monster-studio").hidden = true;
  contentState.records = [];
  contentState.pagination = null;
  contentState.persisted = false;
  $("content-title").textContent = contentLabels[collection] || collection;
  $("content-meta").textContent = "Đang xác minh MySQL…";
  $("new-record").hidden = true;
  $("open-sample-items").hidden = true;
  $("open-sample-items").disabled = true;
  $("sample-items-tool").hidden = true;
  $("open-sample-items").setAttribute("aria-expanded", "false");
  if (feedback) setContentFeedback(feedback);
  else setContentFeedback();
  $("content-table").innerHTML = '<div class="loading" role="status">Đang tải dữ liệu…</div>';
  try {
    let params = null;
    if (pagedCollections.has(collection)) {
      params = { page: contentState.page, limit: catalogPageSize, q: contentState.query.trim() };
      if (collection === "items") {
        if (contentState.itemType) params.itemType = contentState.itemType;
        if (contentState.rarity) params.rarity = contentState.rarity;
      }
    }
    const payload = params
      ? await fetchCatalog(collection, params)
      : await contentManager.list(collection);
    if (loadVersion !== contentState.loadVersion || collection !== activeCollection) return;
    const lastPage = payload.pagination ? Math.max(1, Math.ceil(payload.pagination.total / payload.pagination.limit)) : 1;
    if (params && contentState.page > lastPage) {
      contentState.page = lastPage;
      return openContent(collection, { feedback });
    }
    renderContent(collection, payload);
    if (feedback) setContentFeedback(feedback);
  } catch (error) {
    if (loadVersion !== contentState.loadVersion || collection !== activeCollection) return;
    $("content-meta").textContent = "Không tải được danh mục";
    $("content-table").innerHTML = `<div class="empty"><span>${AdminContentUtils.escapeHtml(error.message || "Không tải được dữ liệu.")}</span><button class="vfx-button subtle" type="button" data-content-action="reload">Thử tải lại</button></div>`;
  }
}

let resetEditorImage;
let generatedEditorImage = "";

function showEditorImage(record, enabled) {
  const panel = $("content-pixel-art");
  panel.hidden = panel.disabled = !enabled;
  if (!enabled) return;
  $("content-pixel-help").textContent = activeCollection === "monsters"
    ? "Tạo sprite quái từ PNG hoặc JPG. Ảnh mới dùng một khung với chuyển động do game tạo. Để trống ảnh nguồn để giữ sprite hiện tại."
    : "Chọn PNG hoặc JPG để tạo icon. Khi sửa bản ghi, để trống ảnh nguồn nếu muốn giữ ảnh hiện tại.";
  const previous = panel.querySelector("img");
  const preview = panel.querySelector("canvas");
  const source = adminImage(record?.img);
  if (source) previous.src = source;
  else previous.removeAttribute("src");
  resetEditorImage ??= ItemStudio.mountImage(panel, { onChange(img) {
    generatedEditorImage = img;
    preview.hidden = !img;
    previous.hidden = Boolean(img) || !previous.hasAttribute("src");
  } });
  resetEditorImage();
}

async function openContentEditor(record = null) {
  if (!activeCollection || !ContentAdmin.EDITABLE_COLLECTIONS.has(activeCollection) || contentState.busy || !contentState.persisted) return;
  const collection = activeCollection;
  const editing = Boolean(record);
  let records = contentState.records;
  if (!editing && collection === "skills") records = [];
  const fields = editing ? { ...record } : AdminContentUtils.createBlankRecord(collection, Date.now(), records);
  const recordId = String((collection === "skills" ? fields.code || fields.id : fields.id) ?? "");
  delete fields.id;
  delete fields.updatedAt;
  const usePixelEditor = pixelArtCollections.has(collection);
  if (usePixelEditor) delete fields.img;
  showEditorImage(record, usePixelEditor);
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
  if (contentState.busy || !activeCollection || !contentState.persisted) return;
  const wasEdit = contentState.editingId !== null;
  const editingId = contentState.editingId;
  const collection = activeCollection;
  contentState.busy = true;
  $("content-editor-save").disabled = true;
  $("content-editor-close").disabled = true;
  $("content-editor-cancel").disabled = true;
  $("content-editor-save").textContent = "Đang lưu…";
  setContentEditorError("");
  try {
    const id = $("content-record-id").value.trim();
    const json = $("content-record-json").value;
    const pixelArt = $("content-pixel-art");
    const hasPickedFile = Boolean(pixelArt.elements?.namedItem?.("source")?.files?.length);
    let pixelImage;
    if (pixelArtCollections.has(collection)) {
      if (generatedEditorImage) pixelImage = generatedEditorImage;
      else if (hasPickedFile) throw new Error("Hãy chọn ảnh nguồn và đợi ảnh pixel hiển thị trước khi lưu.");
      else if (collection === "monsters" && !wasEdit) {
        throw new Error("Quái vật mới cần chọn ảnh PNG hoặc tạo từ Monster Studio.");
      }
    }
    pixelArt.disabled = true;
    const result = await contentManager.save(collection, {
      id,
      json,
      existingId: editingId,
      pixelImage,
    });
    $("content-editor-dialog").close();
    if (activeCollection === collection) {
      const feedback = result?.data?.id ? `Đã lưu ${result.data.id}.` : wasEdit ? "Đã lưu thay đổi." : "Đã tạo bản ghi.";
      await openContent(collection, { feedback });
    }
  } catch (error) {
    setContentEditorError(error.message || "Không lưu được bản ghi.");
  } finally {
    contentState.busy = false;
    $("content-editor-save").disabled = false;
    $("content-editor-close").disabled = false;
    $("content-editor-cancel").disabled = false;
    $("content-pixel-art").disabled = $("content-pixel-art").hidden;
    $("content-editor-save").textContent = contentState.editingId ? "Lưu thay đổi" : "Tạo bản ghi";
    $("new-record").disabled = false;
    renderContentPager();
  }
}

async function handleContentAction(event) {
  const button = event.target.closest("[data-content-action]");
  if (!button) return;
  const action = button.dataset.contentAction;
  if (action === "reload") return openContent(activeCollection);
  const record = contentState.records[Number(button.dataset.index)];
  if (!record || contentState.busy) return;
  if (action === "mail") {
    document.querySelector?.('.nav-item[data-view="mail-sender"]')?.click();
    editorsHandle?.prefillMail?.(record.playerId);
    return;
  }
  if (!contentState.persisted) return;
  if (action === "edit-studio") {
    itemStudioHandle?.loadRecord?.(record);
    document.querySelector?.('.nav-item[data-view="item-studio"]')?.click();
    return;
  }
  if (action === "edit") return openContentEditor(record);
  if (action === "preview") return;
  if (action !== "delete" || ["quests", "monsters"].includes(activeCollection) || !window.confirm(`Xóa bản ghi “${record.name || record.title || record.id}”?`)) return;
  contentState.busy = true;
  button.disabled = true;
  const collection = activeCollection;
  const id = collection === "skills" ? record.code || record.id : record.id;
  try {
    await contentManager.remove(collection, id);
    if (activeCollection === collection) await openContent(collection, { feedback: `Đã xóa ${id}.` });
  } catch (error) {
    setContentFeedback(error.message || "Không xóa được bản ghi.", "error");
  } finally {
    contentState.busy = false;
    $("new-record").disabled = false;
    if (contentState.persisted) renderContent(activeCollection, { data: contentState.records, demo: contentState.demo, pagination: contentState.pagination });
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
    $("world-list").innerHTML = `<div class="empty">${AdminContentUtils.escapeHtml(error.message)} · cần tài khoản GM/ADMIN.</div>`;
  }
}

function reloadAdminViewAfterLogin() {
  void loadOverview();
  const active = document.querySelector('.nav-item.active[data-view]');
  const view = active?.dataset.view;
  if (view === "content") void openContent(active.dataset.collection);
  if (view === "skill-vfx") {
    vfxState.loaded = false;
    vfxState.authorized = false;
    setVfxDisabled(true);
    void openSkillVfx();
  }
  if (view === "alchemy-recipes") editorsHandle?.openAlchemy?.();
  if (view === "loot-tables") editorsHandle?.openLootTables?.();
  if (view === "mail-sender") editorsHandle?.openMailSender?.();
  if (view === "balance-settings") editorsHandle?.openBalanceSettings?.();
}
window.addEventListener("admin:authenticated", reloadAdminViewAfterLogin);
window.addEventListener("admin:unauthenticated", () => {
  clearTimeout(contentSearchTimer);
  contentState.loadVersion += 1;
  contentState.sampleItems = null;
  contentState.records = [];
  contentState.pagination = null;
  contentState.persisted = false;
  $("content-pagination").hidden = true;
  $("sample-items-tool").hidden = true;
  $("content-table").replaceChildren();
});

document.querySelectorAll(".nav-item[data-view]").forEach((item) => item.addEventListener("click", (event) => {
  event.preventDefault();
  if (item.classList.contains("disabled")) return;
  document.querySelectorAll(".nav-item").forEach((node) => node.classList.remove("active"));
  item.classList.add("active");
  const view = item.dataset.view;
  const isContent = view === "content";
  const isVfx = view === "skill-vfx";
  const isItemStudio = view === "item-studio";
  const isMonsterStudio = view === "monster-studio";
  const isAlchemy = view === "alchemy-recipes";
  const isLoot = view === "loot-tables";
  const isMail = view === "mail-sender";
  const isBalance = view === "balance-settings";
  $("overview").classList.toggle("hidden", isContent || isVfx || isItemStudio || isMonsterStudio || isAlchemy || isLoot || isMail || isBalance);
  $("content-view").classList.toggle("active", isContent);
  $("skill-vfx-view").classList.toggle("active", isVfx);
  $("item-studio-view").hidden = !isItemStudio;
  $("monster-studio-view").hidden = !isMonsterStudio;
  $("alchemy-recipes-view").hidden = !isAlchemy;
  $("loot-tables-view").hidden = !isLoot;
  $("mail-sender-view").hidden = !isMail;
  $("balance-settings-view").hidden = !isBalance;
  $("placeholder").classList.remove("active");
  const viewTitles = {
    "skill-vfx": "Hoạt ảnh kỹ năng",
    "item-studio": "Item Studio · Tạo & Sửa vật phẩm",
    "monster-studio": "Tạo quái vật từ ảnh",
    "alchemy-recipes": "Công thức Luyện Đan",
    "loot-tables": "Bảng rớt đồ (Loot Tables)",
    "mail-sender": "Gửi thư & Quà GM",
    "balance-settings": "Cấu hình & Cân bằng Hệ thống",
  };
  $("view-title").textContent = isContent ? (contentLabels[item.dataset.collection] || "Content") : (viewTitles[view] || "Tổng quan thế giới");
  if (isContent) openContent(item.dataset.collection);
  if (isVfx) {
    startVfxPreview();
    openSkillVfx();
  }
  if (isAlchemy) editorsHandle?.openAlchemy?.();
  if (isLoot) editorsHandle?.openLootTables?.();
  if (isMail) editorsHandle?.openMailSender?.();
  if (isBalance) editorsHandle?.openBalanceSettings?.();
}));

const editorsHandle = typeof AdminEditors !== "undefined"
  ? AdminEditors.mount({
    api: API,
    getJson,
    adminHeaders,
    contentManager,
    escapeHtml: AdminContentUtils.escapeHtml,
  })
  : null;

const itemStudioHandle = ItemStudio.mount({
  form: $("item-studio-form"),
  async saveItem(record, existingId = null) {
    await API.assertPersistentStorage();
    return contentManager.save("items", {
      id: existingId || record.id,
      existingId,
      json: JSON.stringify(record),
    });
  },
  openItems: () => document.querySelector?.('.nav-item[data-collection="items"]')?.click(),
});

$("open-item-studio").addEventListener("click", () => {
  itemStudioHandle?.resetToCreate?.();
  document.querySelector?.('.nav-item[data-view="item-studio"]')?.click();
});

for (const [filterId, stateKey] of [["item-type-filter", "itemType"], ["item-rarity-filter", "rarity"]]) {
  $(filterId).addEventListener("change", (event) => {
    contentState[stateKey] = event.target.value;
    contentState.page = 1;
    if (activeCollection === "items") void openContent("items");
  });
}

$("open-monster-studio").addEventListener("click", () => {
  document.querySelector('.nav-item[data-view="monster-studio"]').click();
});

mountMonsterStudio($("monster-studio-form"), async (record) => {
  await API.assertPersistentStorage();
  const result = await getJson(API.BASE + API.PATHS.admin.content("monsters"), {
    method: "POST", headers: adminHeaders(true), body: JSON.stringify(record),
  });
  if (result.persisted !== true || result.demo === true) throw new Error("Backend chưa xác nhận lưu quái vào MySQL.");
});

$("new-record").addEventListener("click", () => openContentEditor());
$("open-sample-items").addEventListener("click", () => {
  const panel = $("sample-items-tool");
  const open = panel.hidden;
  panel.hidden = !open;
  $("open-sample-items").setAttribute("aria-expanded", String(open));
  if (open) void loadSampleItemsPreview();
});
$("close-sample-items").addEventListener("click", () => {
  $("sample-items-tool").hidden = true;
  $("open-sample-items").setAttribute("aria-expanded", "false");
  $("open-sample-items").focus();
});
$("apply-sample-items").addEventListener("click", () => { void applySampleItems(); });
$("content-search").addEventListener("input", (event) => {
  contentState.query = event.target.value;
  if (pagedCollections.has(activeCollection)) {
    clearTimeout(contentSearchTimer);
    contentState.page = 1;
    contentState.loadVersion += 1;
    $("content-pagination").hidden = true;
    $("content-table").innerHTML = '<div class="loading" role="status">Đang tìm dữ liệu…</div>';
    const collection = activeCollection;
    contentSearchTimer = setTimeout(() => { if (activeCollection === collection) void openContent(collection); }, 250);
  } else if (activeCollection) renderContent(activeCollection, { data: contentState.records, demo: contentState.demo, pagination: contentState.pagination });
});
for (const [id, step] of [["content-prev", -1], ["content-next", 1]]) {
  $(id).addEventListener("click", async () => {
    if (!pagedCollections.has(activeCollection) || !contentState.pagination || contentState.busy) return;
    contentState.page += step;
    await openContent(activeCollection);
    if (!$("content-pagination").hidden) $("content-page-summary").focus();
  });
}
$("content-table").addEventListener("click", (event) => { void handleContentAction(event); });
$("content-editor-form").addEventListener("submit", (event) => { void saveContent(event); });
$("content-pixel-reset").addEventListener("click", () => resetEditorImage?.());
$("content-editor-close").addEventListener("click", () => $("content-editor-dialog").close());
$("content-editor-cancel").addEventListener("click", () => $("content-editor-dialog").close());
$("content-editor-dialog").addEventListener("cancel", (event) => {
  if (contentState.busy) event.preventDefault();
});
$("content-editor-dialog").addEventListener("close", () => {
  resetEditorImage?.();
  contentState.editingId = null;
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
