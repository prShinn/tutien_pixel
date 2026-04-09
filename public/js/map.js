class SpatialGrid {
  constructor(cellSize) {
    this.cs = cellSize;
    this.cells = new Map();
  }
  _key(x, y) {
    return `${Math.floor(x / this.cs)},${Math.floor(y / this.cs)}`;
  }
  clear() {
    this.cells.clear();
  }
  insert(obj) {
    const k = this._key(obj.px, obj.py);
    if (!this.cells.has(k)) this.cells.set(k, []);
    this.cells.get(k).push(obj);
  }
  query(px, py, radius) {
    const out = [];
    const cx = Math.floor(px / this.cs),
      cy = Math.floor(py / this.cs);
    const cr = Math.ceil(radius / this.cs);
    for (let dx = -cr; dx <= cr; dx++)
      for (let dy = -cr; dy <= cr; dy++) {
        const k = `${cx + dx},${cy + dy}`;
        if (this.cells.has(k)) out.push(...this.cells.get(k));
      }
    return out;
  }
}
const monGrid = new SpatialGrid(96); // 3 tiles

function makeMon(monster, tx, ty, elite) {
  const hp = Math.floor(
    (monster.hp + ri(0, Math.floor(monster.hp * 0.2))) *
      monster.level *
      (monster.isBoos > 0 ? 13 : 1),
  );
  return {
    monster,
    hp,
    maxHp: hp,
    atk: monster.atk + ri(0, 3),
    def: monster.def,
    px: tx * GameState.TS + GameState.TS / 2,
    py: ty * GameState.TS + GameState.TS / 2,
    hx: tx * GameState.TS + GameState.TS / 2,
    hy: ty * GameState.TS + GameState.TS / 2,
    state: "idle",
    tpx: tx * GameState.TS + GameState.TS / 2,
    tpy: ty * GameState.TS + GameState.TS / 2,
    mvT: ri(60, 180),
    atkCd: 0,
    dead: false,
    respawnT: 0,
    isElite: elite || false,
    statusEffects: [],
  };
}

const WorldMap = {
  loadMap(map, toX, toY) {
    GameState.mapW = map.w;
    GameState.mapH = map.h;
    GameState.tiles = map.jsonMap;
    GameState.atkFx = [];
    GameState.gItems = [];
    if (GameState.player) {
      GameState.player.x = toX;
      GameState.player.y = toY;
      GameState.player.px =
        GameState.player.px || toX * GameState.TS + GameState.TS / 2;
      GameState.player.py =
        GameState.player.py || toY * GameState.TS + GameState.TS / 2;
    }
    GameState.portals = map.portals || [];
    GameState.npcs = map.npcs || [];
    GameState.monsters = map.monters || [];

    monGrid.clear();
    for (const m of GameState.monsters) if (!m.dead) monGrid.insert(makeMon(m));
    const ov = document.getElementById("mno");
    ov.textContent = map.tenMap;
    ov.classList.add("show");
    setTimeout(() => ov.classList.remove("show"), 2200);
    logSystem(`── ${map.tenMap} ──`, "lcs");
    GameState._mmDirty = true;
    // Reset dungeon if leaving
  },
  checkPortals() {
    const p = GameState.player;
    for (const portal of GameState.portals)
      if (
        p.x === portal.x &&
        p.y === portal.y &&
        portal.to &&
        portal.lb !== ""
      ) {
        WorldMod.loadMap(portal.to, portal.tx, portal.ty);
        return;
      }
  },
  checkNpc() {
    const p = GameState.player;
    for (const npc of GameState.npcs) {
      if (npc.used && npc.tp === "chest") continue;
      if (dist(p.px, p.py, npc.px, npc.py) < CFG.TS * 1.4) {
        G.openNpc(npc);
        return;
      }
    }
  },
};
