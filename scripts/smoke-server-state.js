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
    tangTuVi: 1, realm: 1, tuViHienTai: 0, tuViLenCap: 1, hp: 100, maxHp: 220, mp: 50, maxMp: 130, xu: 50, jsonIventory: JSON.stringify([{ id: "STONE_LINH_NHO", count: 1, giaTriTuVi: 1000 }]), skills: [],
  });
  const boughtStone = await call("/api/player/shop/buy", auth.token, "POST", { itemId: "STONE_LINH_NHO" });
  const absorbed = await call("/api/player/cultivation/absorb", auth.token, "POST", { itemId: "STONE_LINH_NHO" });
  const breakthroughResponse = await fetch(`${BASE}/api/player/cultivation/breakthrough`, {
    method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${auth.token}` }, body: "{}",
  });
  const breakthrough = await breakthroughResponse.json();
  const breakthroughBlocked = breakthroughResponse.status === 400 && breakthrough.error === "Tu vi chưa đủ";
  const bought = await call("/api/player/shop/buy", auth.token, "POST", { itemId: "HUYET_NGOC_NHO" });
  const used = await call("/api/player/inventory/use", auth.token, "POST", { index: 0 });
  const clientInventoryIgnored = Array.isArray(player.inventory) && player.inventory.length === 0;
  const checks = {
    clientInventoryIgnored,
    stoneBought: boughtStone.result?.type === "bought",
    absorbedAmount: absorbed.result?.amount,
    cultivationAfterAbsorb: absorbed.player?.tuViHienTai,
    breakthroughBlocked,
    breakthroughError: breakthrough.error,
    potionBought: bought.result?.type === "bought",
    itemUsed: used.result?.type === "item_used",
  };
  if (!clientInventoryIgnored || !checks.stoneBought || absorbed.result.amount !== 120 || absorbed.player.tuViHienTai !== 120 || !breakthroughBlocked || !checks.potionBought || !checks.itemUsed) throw new Error(`server state transition mismatch: ${JSON.stringify(checks)}`);
  console.log(JSON.stringify({ created: Boolean(player.id), clientInventoryIgnored, absorbed: absorbed.result.amount, breakthroughBlocked, itemUsed: used.result.itemId, power: absorbed.player.combatPower }));
}

main().catch((error) => { console.error(error.message); process.exit(1); });
