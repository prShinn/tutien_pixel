const BASE = process.env.DEMO_URL || "http://localhost:3000";

async function call(path, token, method = "GET", body) {
  const response = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${data.error || "failed"}`);
  return data;
}

async function main() {
  const auth = await call("/api/auth/demo", undefined, "POST");
  const player = await call("/api/player", auth.token, "POST", {
    userId: auth.user.id, name: "Smoke Tu Si", linhCan: "KIM", stats: { str: 8, agi: 7, vit: 7, ene: 8 },
    tangTuVi: 1, realm: 1, tuViHienTai: 0, tuViLenCap: 1, hp: 100, maxHp: 220, mp: 50, maxMp: 130, xu: 50, jsonIventory: "[]", skills: [],
  });
  const absorbed = await call("/api/player/cultivation/absorb", auth.token, "POST", { amount: 10 });
  const breakthrough = await call("/api/player/cultivation/breakthrough", auth.token, "POST");
  const bought = await call("/api/player/shop/buy", auth.token, "POST", { itemId: "HUYET_NGOC_NHO" });
  const used = await call("/api/player/inventory/use", auth.token, "POST", { index: 0 });
  if (absorbed.player.tuViHienTai !== 10 || breakthrough.result.type !== "stage_breakthrough" || breakthrough.player.tangTuVi !== 2 || bought.result.type !== "bought" || used.result.type !== "item_used") throw new Error("server state transition mismatch");
  console.log(JSON.stringify({ created: Boolean(player.id), absorbed: absorbed.result.amount, stage: breakthrough.player.tangTuVi, itemUsed: used.result.itemId, power: breakthrough.player.combatPower }));
}

main().catch((error) => { console.error(error.message); process.exit(1); });
