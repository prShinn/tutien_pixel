"use strict";

const $ = (id) => document.getElementById(id);
const state = { worlds: [], realms: [] };

function adminHeaders() { return { "x-admin-key": $("admin-key").value }; }

async function getJson(url, options = {}) {
  const response = await fetch(url, options);
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

function renderContent(collection, payload) {
  activeCollection = collection;
  const records = payload.data || [];
  $("content-title").textContent = contentLabels[collection] || collection;
  $("content-meta").textContent = payload.demo ? "Mock API · dữ liệu in-memory · chưa lưu database" : "Server data";
  const escape = (value) => String(value ?? "").replace(/[<>]/g, "");
  const rows = records.map((record) => {
    const values = Object.entries(record).filter(([key]) => !["id", "updatedAt", "img", "animation"].includes(key)).slice(0, 3);
    return `<div class="table-row"><b>${escape(record.id)}</b>${values.map(([, value]) => `<small>${escape(Array.isArray(value) ? value.join(", ") : value).slice(0, 100)}</small>`).join("")}<span class="table-status">${escape(record.status || "ACTIVE")}</span></div>`;
  });
  $("content-table").innerHTML = `<div class="mock-note">API demo đang hoạt động. CRUD đầy đủ sẽ được mở rộng theo schema từng module.</div><div class="table-row"><span>ID</span><span>Thông tin</span><span>Trạng thái</span><span>—</span></div>${rows.join("") || '<div class="empty">Collection chưa có bản ghi.</div>'}`;
}

async function openContent(collection) {
  try {
    const payload = await getJson(`/api/admin/content/${encodeURIComponent(collection)}`, { headers: adminHeaders() });
    renderContent(collection, payload);
  } catch (error) { $("content-table").innerHTML = `<div class="empty">${error.message}</div>`; }
}

async function loadOverview() {
  try {
    const [worlds, realms] = await Promise.all([
      getJson("/api/admin/worlds", { headers: adminHeaders() }),
      getJson("/api/canh-gioi"),
    ]);
    state.worlds = worlds; state.realms = realms;
    renderStats(); renderWorlds();
  } catch (error) {
    $("world-list").innerHTML = `<div class="empty">${error.message} · kiểm tra Admin key.</div>`;
  }
}

document.querySelectorAll(".nav-item[data-view]").forEach((item) => item.addEventListener("click", (event) => {
  event.preventDefault();
  if (item.classList.contains("disabled")) return;
  document.querySelectorAll(".nav-item").forEach((node) => node.classList.remove("active"));
  item.classList.add("active");
  const isContent = item.dataset.view === "content";
  $("overview").classList.toggle("hidden", isContent);
  $("content-view").classList.toggle("active", isContent);
  $("placeholder").classList.remove("active");
  $("view-title").textContent = isContent ? (contentLabels[item.dataset.collection] || "Content") : "Tổng quan thế giới";
  if (isContent) openContent(item.dataset.collection);
}));

$("admin-key").addEventListener("change", loadOverview);
$("new-record").addEventListener("click", async () => {
  if (!activeCollection || ["items", "skills", "accounts"].includes(activeCollection)) return;
  const name = window.prompt(`Tên ${contentLabels[activeCollection] || activeCollection} demo`, "Nội dung mới");
  if (!name) return;
  try {
    await getJson(`/api/admin/content/${activeCollection}`, { method: "POST", headers: { ...adminHeaders(), "content-type": "application/json" }, body: JSON.stringify({ id: `${activeCollection}_demo_${Date.now()}`, name, status: "DRAFT" }) });
    openContent(activeCollection);
  } catch (error) { window.alert(error.message); }
});
loadOverview();
