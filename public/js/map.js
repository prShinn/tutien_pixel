const MAPS = {};

function loadMap() {
  const res = Maps.get("/worlds/get?code=map1");
  res.then((e) => {
    if (e) {
      if (e.jsonMap) {
        e.jsonMap = JSON.parse(e.jsonMap);
      }
      MAPS[e.code] = e;
    }
    console.log("MAPS: ", MAPS);
  });
}
loadMap();
