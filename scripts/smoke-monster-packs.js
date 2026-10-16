const { io } = require("socket.io-client");
const { worlds } = require("../data/mock-data");

const BASE = process.env.DEMO_URL || "http://localhost:3000";

async function main() {
  const expectedWorld = worlds.find((world) => world.code === "binh_nguyen");
  const expectedPacks = expectedWorld?.monsterSpawns || [];
  const expectedCount = expectedPacks.reduce((sum, pack) => sum + Number(pack.count || 0), 0);
  const auth = await (await fetch(`${BASE}/api/auth/demo`, { method: "POST" })).json();
  const socket = io(BASE, { auth: { token: auth.token }, reconnection: false });
  const timer = setTimeout(() => { throw new Error("monster pack smoke timeout"); }, 7000);
  let snapshot = null;
  let checked = false;

  socket.on("connect", () => socket.emit("join_world", { mapCode: "binh_nguyen", x: 80, y: 200 }));
  socket.on("connect_error", (error) => { throw error; });
  socket.on("world_init", (payload) => {
    const monsters = payload.monsters || [];
    const groups = {};
    for (const monster of monsters) (groups[monster.packId] ||= []).push(monster);
    const packsValid = monsters.length === expectedCount
      && Object.keys(groups).length === expectedPacks.length
      && Object.values(groups).every((group) => {
        const expected = expectedPacks.find((pack) => pack.packId === group[0]?.packId);
        return group.length === Number(expected?.count || 0)
          && group.every((monster) => Number.isFinite(monster.packCenterX) && Number.isFinite(monster.packCenterY));
      });
    snapshot = { monsters, groups, packsValid };
  });
  socket.on("monster_update", (payload) => {
    if (checked || !snapshot) return;
    checked = true;
    clearTimeout(timer);
    const monsters = payload.monsters || [];
    const chasing = monsters.filter((monster) => monster.state === "chase" || monster.state === "attack");
    const chasingPacks = [...new Set(chasing.map((monster) => monster.packId))];
    const individualAggro = chasing.length > 0 && chasing.length < snapshot.monsters.length && chasingPacks.length === 1;
    const valid = snapshot.packsValid && individualAggro;
    console.log(JSON.stringify({ totalMonsters: snapshot.monsters.length, visibleMonsters: monsters.length, packs: Object.fromEntries(Object.entries(snapshot.groups).map(([id, group]) => [id, group.length])), chasing: chasing.length, chasingPacks, individualAggro, valid }));
    socket.disconnect();
    if (!valid) process.exitCode = 1;
  });
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
