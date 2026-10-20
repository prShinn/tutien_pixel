const BASE = process.env.DEMO_URL || "http://localhost:3000";
const KEY = process.env.ADMIN_MAP_KEY || "demo-admin";

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, { ...options, headers: { "x-admin-key": KEY, "content-type": "application/json", ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${data.error || path}`);
  return data;
}

async function main() {
  const collections = ["quests", "npcs", "items", "skills", "accounts"];
  const listed = {};
  for (const collection of collections) listed[collection] = await request(`/api/admin/content/${collection}`);
  const created = await request("/api/admin/content/quests", { method: "POST", body: JSON.stringify({ id: `smoke_quest_${Date.now()}`, name: "Smoke quest", status: "DRAFT" }) });
  const updated = await request(`/api/admin/content/quests/${created.data.id}`, { method: "PUT", body: JSON.stringify({ status: "ACTIVE" }) });
  const removed = await request(`/api/admin/content/quests/${created.data.id}`, { method: "DELETE" });
  const valid = collections.every((collection) => listed[collection].demo && Array.isArray(listed[collection].data))
    && created.data.status === "DRAFT" && updated.data.status === "ACTIVE" && removed.removed === created.data.id;
  console.log(JSON.stringify({ collections, questCrud: valid, persisted: listed.quests.persisted, valid }));
  if (!valid) process.exitCode = 1;
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
