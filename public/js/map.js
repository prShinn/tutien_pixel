const MAPS = {};
const T = {
  GRASS: 0,
  STONE: 1,
  WATER: 2,
  WALL: 3,
  FLOOR: 4,
  TREE: 5,
  MTN: 6,
  PLAZA: 7,
};
const TC = {
  [T.GRASS]: ["#2a5a28", "#3a7a38"],
  [T.STONE]: ["#5a5a68", "#7a7a88"],
  [T.WATER]: ["#1a3a6a", "#2a5a9a"],
  [T.WALL]: ["#181010", "#2a1818"],
  [T.FLOOR]: ["#3a3020", "#4a4028"],
  [T.TREE]: ["#141a10", "#2a3818"],
  [T.MTN]: ["#404050", "#606070"],
  [T.PLAZA]: ["#4a4030", "#5a5040"],
};
function loadMap() {
  const res = ApiService.get("/worlds/by-code?code=town");
  res.then((e) => {
    if (e) {
      MAPS[e.code] = e;
      MAPS[e.code].npcs = [];
      MAPS[e.code].monster = [];
      GamePlay.mapW = e.w;
      GamePlay.mapH = e.h;
      GamePlay.mapId = e.id;
      GamePlay.map = MAPS[e.code];
    }
    console.log("MAPS: ", MAPS);
  });
}
