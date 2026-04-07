let PLAYER = {};
function loadPLayer() {
  const res = ApiService.get("/player/by-user/1");
  res.then((e) => {
    if (e) {
      PLAYER = e;
    }
    console.log("Player: ", PLAYER);
    startGame();
  });
}
async function _afterLogin() {
  // Try to load existing character
  loadPLayer();
}
const Combat = {
  pAtk() {
    return 10 + PLAYER.stats.str * 2;
  },
  pDef() {
    return 2 + Math.floor(PLAYER.stats.vit * 0.5);
  },
  attack(m) {
    if (PLAYER.attackCD > 0 || m.dead) return;
    // const tmpl = CFG.MONSTERS[m.ti];
    // const dmg = Math.max(1, Combat.pAtk() - m.def + randInt(0, 6));
    // m.hp -= dmg;
    // S.atkCd = CFG.ATK_CD;
    // S.atkFx.push({ px: m.px, py: m.py, r: 14, life: 14 });
    // Render.floatDmg(m.px, m.py, -26, "-" + dmg, "#ff6666");
    // UI.log(`Tấn công ${tmpl.name} gây ${dmg} sát thương`, "combat");
    // // Notify other players (visual only)
    // if (socket?.connected)
    //   socket.emit("attack_effect", {
    //     targetId: null,
    //     damage: dmg,
    //     mapId: S.mapId,
    //   });
    // if (m.hp <= 0) {
    //   m.dead = true;
    //   m.respawnT = CFG.MON_RESPAWN;
    //   Combat.dropLoot(m);
    //   UI.log(`${tmpl.name} đã bị tiêu diệt!`, "combat");
    // }
  },
  dropLoot(m) {
    const tmpl = CFG.MONSTERS[m.ti];
    const xu = randInt(tmpl.xuR[0], tmpl.xuR[1]);
    S.player.xu += xu;
    UI.log(`Nhặt được ${xu} xu`, "loot");
    if (Math.random() < tmpl.iChance) {
      const id = tmpl.drops[randInt(0, tmpl.drops.length - 1)];
      const item = CFG.ITEMS[id];
      if (item) {
        Inventory.add(item);
        UI.log(`Rơi ra: ${item.emoji} ${item.name}`, "loot");
      }
    }
  },
};
const otherPlayers = new Map();
