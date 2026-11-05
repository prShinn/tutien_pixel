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
  const itemId = `SMOKE_ITEM_${Date.now()}`;
  const item = await request("/api/admin/content/items", { method: "POST", body: JSON.stringify({ id: itemId, maDo: itemId, name: "Smoke item", type: "MATERIAL" }) });
  const updatedItem = await request(`/api/admin/content/items/${itemId}`, { method: "PUT", body: JSON.stringify({ name: "Updated smoke item" }) });
  const removedItem = await request(`/api/admin/content/items/${itemId}`, { method: "DELETE" });
  const numericSkill = listed.skills.data.find((skill) => Number.isSafeInteger(Number(skill.id)));
  const originalSkillDescription = numericSkill?.moTa || "";
  const updatedSkill = numericSkill
    ? await request(`/api/admin/content/skills/${numericSkill.id}`, { method: "PUT", body: JSON.stringify({ moTa: `${originalSkillDescription} ` }) })
    : null;
  const restoredSkill = numericSkill
    ? await request(`/api/admin/content/skills/${numericSkill.id}`, { method: "PUT", body: JSON.stringify({ moTa: originalSkillDescription }) })
    : null;
  const questCrud = created.data.status === "DRAFT" && updated.data.status === "ACTIVE" && removed.removed === created.data.id;
  const itemCrud = item.data.id === itemId && updatedItem.data.id === itemId && updatedItem.data.name === "Updated smoke item" && removedItem.removed === itemId;
  const numericSkillCrud = Boolean(numericSkill && updatedSkill.data.id === numericSkill.id && restoredSkill.data.moTa === originalSkillDescription);
  const valid = collections.every((collection) => (listed[collection].demo || listed[collection].persisted) && Array.isArray(listed[collection].data)) && questCrud && itemCrud && numericSkillCrud;
  console.log(JSON.stringify({ collections, questCrud, itemCrud, numericSkillCrud, casePreservedItemId: item.data.id === itemId, persisted: listed.quests.persisted, valid }));
  if (!valid) process.exitCode = 1;
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
