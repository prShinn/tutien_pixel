const BASE = process.env.DEMO_URL || "http://localhost:3000";
const ADMIN_KEY = process.env.ADMIN_MAP_KEY || "demo-admin";

function grid(width, height, value) {
  return Array.from({ length: height }, () => Array(width).fill(value));
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "x-admin-key": ADMIN_KEY, "content-type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${data.error || path}`);
  return data;
}

async function publicRequest(path, expectedStatus = 200) {
  const response = await fetch(`${BASE}${path}`);
  const data = await response.json();
  if (response.status !== expectedStatus) throw new Error(`${response.status}: expected ${expectedStatus} for ${path}`);
  return data;
}

async function main() {
  const code = `smoke_map_${Date.now()}`;
  const width = 320, height = 240;
  const ground = grid(width, height, 0);
  const objects = grid(width, height, -1);
  const elevation = grid(width, height, 0);
  for (let y = 0; y < height; y += 1) ground[y][Math.floor(width / 2)] = 2;
  const created = await request("/api/admin/worlds", {
    method: "POST",
    body: JSON.stringify({
      code, tenMap: "Smoke Sơn Thủy", status: "DRAFT", regionId: "SMOKE_REGION", tier: 1,
      type: "PLAIN", biome: "RIVER_VALLEY", w: width, h: height, spawnX: 8, spawnY: 24,
      layers: { ground, objects, elevation },
      monsterSpawns: [{ packId: "PACK_SMOKE", templateId: "MOC_NHAN", centerX: 50, centerY: 50, count: 3, radius: 12 }],
    }),
  });
  await publicRequest(`/api/worlds/by-code?code=${code}`, 404);
  const draft = await request(`/api/admin/worlds/${code}`);
  const validation = await request(`/api/admin/worlds/${code}/validate`);
  const published = await request(`/api/admin/worlds/${code}/publish`, { method: "POST" });
  const loaded = await publicRequest(`/api/worlds/by-code?code=${code}`);
  const updated = await request(`/api/admin/worlds/${code}`, { method: "PUT", body: JSON.stringify({ ...published.world, tenMap: "Smoke Sơn Thủy v2" }) });
  const removed = await request(`/api/admin/worlds/${code}`, { method: "DELETE" });
  const valid = created.status === "DRAFT" && draft.monsterSpawns.length === 1 && validation.valid
    && published.world.status === "PUBLISHED" && loaded.layers.ground.length === height
    && updated.version > published.world.version && removed.removed === code;
  console.log(JSON.stringify({ created: created.code, draftHidden: true, published: published.world.status, size: `${loaded.w}x${loaded.h}`, version: updated.version, removed: removed.removed, valid }));
  if (!valid) process.exitCode = 1;
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
