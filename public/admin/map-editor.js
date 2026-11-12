"use strict";

const TILE = { GRASS: 0, STONE: 1, WATER: 2, WALL: 3, FLOOR: 4, TREE: 5, MOUNTAIN: 6, PLAZA: 7, EMPTY: -1 };
const SOLID = new Set([TILE.WATER, TILE.WALL, TILE.TREE, TILE.MOUNTAIN]);
const COLORS = {
  0: "#426f3f", 1: "#716f67", 2: "#315f79", 3: "#332d2a",
  4: "#756448", 5: "#315d39", 6: "#777369", 7: "#927b51", [-1]: "#202820",
};
const PALETTES = {
  ground: [[0, "Cỏ"], [1, "Đá"], [2, "Nước"], [4, "Đường đất"], [7, "Sân lát"]],
  objects: [[-1, "Xóa vật thể"], [3, "Tường"], [5, "Cây"], [6, "Núi"]],
  elevation: [[0, "Thấp"], [1, "Thoải"], [2, "Cao"], [3, "Đỉnh"]],
  npc: [],
};

const $ = (id) => document.getElementById(id);
const canvas = $("map-canvas");
const ctx = canvas.getContext("2d");
const editor = {
  width: 600,
  height: 400,
  zoom: 2,
  layer: "ground",
  brush: 8,
  selected: 0,
  painting: false,
  currentCode: null,
  knownMaps: new Set(),
  mapCatalog: new Map(),
  selectedPortalId: null,
  selectedMonsterPackId: null,
  selectedNpcId: null,
  monsterCatalog: [],
  status: "DRAFT",
  ground: [],
  objects: [],
  elevation: [],
  spawnX: 108,
  spawnY: 200,
  portals: [],
  monsters: [],
  monsterSpawns: [],
  npcs: [],
  rules: {},
  dirty: false,
};
const SAMPLE_MAP_TEMPLATES = [
  { code: "sample_dao_hoa_thon", name: "Đào Hoa Thôn", type: "VILLAGE", biome: "CITY", tier: 1, realmMin: 1, realmMax: 3, safeZone: true, noMonsters: true, tags: "mẫu, thôn làng, khu an toàn" },
  { code: "sample_bich_lam_linh_coc", name: "Bích Lâm Linh Cốc", type: "PLAIN", biome: "FOREST", tier: 1, realmMin: 1, realmMax: 5, tags: "mẫu, rừng, tân thủ" },
  { code: "sample_luu_thuy_co_dao", name: "Lưu Thủy Cổ Đạo", type: "PLAIN", biome: "RIVER_VALLEY", tier: 2, realmMin: 2, realmMax: 7, tags: "mẫu, sông, đường cổ" },
  { code: "sample_tinh_sa_nguyen", name: "Tinh Sa Nguyên", type: "PLAIN", biome: "PLAINS", tier: 2, realmMin: 2, realmMax: 8, tags: "mẫu, thảo nguyên" },
  { code: "sample_van_moc_yen", name: "Vạn Mộc Uyên", type: "VILLAGE", biome: "FOREST", tier: 3, realmMin: 3, realmMax: 10, tags: "mẫu, rừng cổ, linh dược" },
  { code: "sample_bach_van_son", name: "Bạch Vân Sơn", type: "PLATEAU", biome: "MOUNTAINS", tier: 3, realmMin: 4, realmMax: 12, tags: "mẫu, núi, tu luyện" },
  { code: "sample_han_phong_tuyet_linh", name: "Hàn Phong Tuyết Lĩnh", type: "ICE_MOUNTAIN", biome: "MOUNTAINS", tier: 4, realmMin: 5, realmMax: 13, tags: "mẫu, núi tuyết, hiểm địa" },
  { code: "sample_xich_viem_hoa_coc", name: "Xích Viêm Hỏa Cốc", type: "VOLCANO", biome: "MOUNTAINS", tier: 5, realmMin: 6, realmMax: 13, tags: "mẫu, núi lửa, hỏa linh" },
  { code: "sample_huyen_linh_thanh", name: "Huyền Linh Thành", type: "CITY", biome: "CITY", tier: 3, realmMin: 3, realmMax: 9, safeZone: true, noMonsters: true, tags: "mẫu, thành trì, khu an toàn" },
  { code: "sample_tham_u_co_canh", name: "Thâm U Cổ Cảnh", type: "DUNGEON", biome: "RIVER_VALLEY", tier: 6, realmMin: 7, realmMax: 13, tags: "mẫu, bí cảnh, thám hiểm" },
];
const SAMPLE_NPC_ROSTER = [
  { name: "Trưởng Thôn", role: "GUIDE", type: "dialog", gender: "MALE", color: "#d7bd78", dialog: "Đường tu tiên dài rộng. Hãy chuẩn bị hành trang trước khi rời làng." },
  { name: "Chủ Tiệm", role: "MERCHANT", type: "shop", gender: "FEMALE", color: "#8fc7bd", dialog: "Cửa tiệm có linh vật và vật dụng cần thiết cho chuyến đi." },
  { name: "Dược Sư", role: "HEALER", type: "dialog", gender: "FEMALE", color: "#87b981", dialog: "Thu thập linh thảo quanh vùng, ta sẽ chỉ cách dùng chúng." },
  { name: "Chấp Sự", role: "QUEST_GIVER", type: "dialog", gender: "MALE", color: "#9daed0", dialog: "Khu vực này có nhiều cơ duyên. Hãy xem nhiệm vụ trước khi lên đường." },
  { name: "Thợ Rèn", role: "CRAFTSMAN", type: "dialog", gender: "MALE", color: "#c58a65", dialog: "Trang bị tốt giúp tu sĩ vững bước. Quặng và gỗ đều có thể hữu dụng." },
  { name: "Lữ Khách", role: "TRAVELER", type: "dialog", gender: "FEMALE", color: "#b399d0", dialog: "Ta vừa đi qua con đường phía trước. Hãy cẩn thận với địa hình hiểm trở." },
  { name: "Đệ Tử Tuần Sơn", role: "SCOUT", type: "dialog", gender: "MALE", color: "#8bbaa8", dialog: "Ta đang canh giữ lối vào. Quái vật thường xuất hiện xa điểm sinh." },
  { name: "Cổ Tu Sĩ", role: "ELDER", type: "dialog", gender: "FEMALE", color: "#d6a66d", dialog: "Linh căn mỗi người một khác. Hãy chọn con đường hợp với mình." },
];
const mapPackState = { configs: [], busy: false, previewing: false, needsPreview: false, outcome: "", completed: 0, total: 0, savedCodes: new Set(), failedCodes: new Set(), conflictedCodes: new Set() };
const mapPackControlState = new Map();

function makeGrid(width, height, fill) {
  return Array.from({ length: height }, () => Array(width).fill(fill));
}

function hashSeed(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function randomAt(x, y, seed) {
  let value = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 1442695041, 2246822519) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function smooth(value) { return value * value * (3 - 2 * value); }
function mix(a, b, amount) { return a + (b - a) * amount; }

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = smooth(x - x0), ty = smooth(y - y0);
  const top = mix(randomAt(x0, y0, seed), randomAt(x0 + 1, y0, seed), tx);
  const bottom = mix(randomAt(x0, y0 + 1, seed), randomAt(x0 + 1, y0 + 1, seed), tx);
  return mix(top, bottom, ty);
}

function fbm(x, y, seed) {
  let total = 0, amplitude = .55, frequency = 1, weight = 0;
  for (let octave = 0; octave < 4; octave += 1) {
    total += valueNoise(x * frequency, y * frequency, seed + octave * 971) * amplitude;
    weight += amplitude;
    amplitude *= .5;
    frequency *= 2;
  }
  return total / weight;
}

function updateRangeLabels() {
  $("tree-out").textContent = `${$("tree-density").value}%`;
  $("mountain-out").textContent = `${$("mountain-density").value}%`;
  $("river-out").textContent = `${$("river-width").value} px`;
  $("brush-out").textContent = `${$("brush-size").value} px`;
}

function setStatus(message, kind = "") {
  const target = $("editor-status");
  target.textContent = message;
  target.className = kind;
}

function clearSpawn(radius = 3) {
  for (let y = editor.spawnY - radius; y <= editor.spawnY + radius; y += 1) {
    for (let x = editor.spawnX - radius; x <= editor.spawnX + radius; x += 1) {
      if (editor.ground[y]?.[x] === undefined || !editor.objects[y]) continue;
      if (Math.hypot(x - editor.spawnX, y - editor.spawnY) > radius) continue;
      editor.ground[y][x] = $("map-biome").value === "CITY" ? TILE.FLOOR : TILE.GRASS;
      editor.objects[y][x] = TILE.EMPTY;
      editor.elevation[y][x] = Math.min(1, editor.elevation[y][x]);
    }
  }
}

function generateMap() {
  editor.width = Math.max(320, Math.min(1024, Number($("map-width").value) || 600));
  editor.height = Math.max(240, Math.min(1024, Number($("map-height").value) || 400));
  const biome = $("map-biome").value;
  const seed = hashSeed($("map-seed").value || $("map-code").value);
  const treeDensity = Number($("tree-density").value) / 100;
  const mountainDensity = Number($("mountain-density").value) / 100;
  const riverWidth = Number($("river-width").value);
  editor.ground = makeGrid(editor.width, editor.height, TILE.GRASS);
  editor.objects = makeGrid(editor.width, editor.height, TILE.EMPTY);
  editor.elevation = makeGrid(editor.width, editor.height, 0);
  editor.portals = [];
  editor.monsters = [];
  editor.monsterSpawns = [];
  editor.npcs = [];
  editor.selectedNpcId = null;
  editor.selectedPortalId = null;
  editor.selectedMonsterPackId = null;
  editor.status = "DRAFT";
  $("publish-status").textContent = editor.status;
  $("publish-status").classList.remove("published");
  $("validation-result").className = "validation-result hint";
  $("validation-result").textContent = "Lưu map để bắt đầu kiểm tra.";

  for (let y = 0; y < editor.height; y += 1) {
    for (let x = 0; x < editor.width; x += 1) {
      const scale = Math.max(editor.width, editor.height);
      const elevation = fbm(x / scale * 5.2, y / scale * 5.2, seed);
      const moisture = fbm(x / scale * 6.5 + 12, y / scale * 6.5 - 9, seed ^ 0x9e3779b9);
      const detail = randomAt(x, y, seed ^ 0x85ebca6b);
      editor.elevation[y][x] = elevation > .72 ? 3 : elevation > .6 ? 2 : elevation > .47 ? 1 : 0;

      if (biome === "CITY") {
        editor.ground[y][x] = (x % 12 === 0 || y % 12 === 0) ? TILE.PLAZA : TILE.FLOOR;
        if ((x < 2 || y < 2 || x > editor.width - 3 || y > editor.height - 3) && detail > .12) editor.objects[y][x] = TILE.WALL;
        continue;
      }

      const mountainThreshold = .79 - mountainDensity * .24;
      if (elevation > mountainThreshold) {
        editor.ground[y][x] = TILE.STONE;
        editor.objects[y][x] = TILE.MOUNTAIN;
      } else if (elevation > mountainThreshold - .09) {
        editor.ground[y][x] = TILE.STONE;
      }

      const forestBias = biome === "FOREST" ? .14 : biome === "MOUNTAINS" ? -.08 : 0;
      const treeThreshold = .77 - treeDensity * .42 - forestBias;
      if (editor.objects[y][x] === TILE.EMPTY && moisture > treeThreshold && detail > .18) editor.objects[y][x] = TILE.TREE;
    }
  }

  if (["RIVER_VALLEY", "PLAINS", "FOREST"].includes(biome)) {
    const phase = randomAt(1, 1, seed) * Math.PI * 2;
    for (let y = 0; y < editor.height; y += 1) {
      const bend = Math.sin(y * .105 + phase) * editor.width * .10;
      const drift = (valueNoise(y * .075, 4.7, seed ^ 0x27d4eb2d) - .5) * editor.width * .22;
      const center = editor.width * .5 + bend + drift;
      const localWidth = riverWidth + Math.round(valueNoise(y * .12, 9.2, seed) * 2);
      for (let x = Math.floor(center - localWidth); x <= Math.ceil(center + localWidth); x += 1) {
        if (editor.ground[y]?.[x] === undefined) continue;
        editor.ground[y][x] = TILE.WATER;
        editor.objects[y][x] = TILE.EMPTY;
        editor.elevation[y][x] = 0;
      }
    }
  }

  editor.spawnX = Math.max(4, Math.min(editor.width - 5, Math.floor(editor.width * .18)));
  editor.spawnY = Math.floor(editor.height * .5);
  clearSpawn(16);
  editor.currentCode = null;
  resizeCanvas();
  renderPortalList();
  resetMonsterPackForm();
  setStatus("Đã sinh địa hình mới", "ok");
  editor.dirty = true;
}

function resizeCanvas() {
  canvas.width = editor.width * editor.zoom;
  canvas.height = editor.height * editor.zoom;
  $("map-info").textContent = `${editor.width} × ${editor.height}`;
  $("stage-name").textContent = $("map-name").value || "Map chưa đặt tên";
  layoutCanvas();
  drawMap();
}

function layoutCanvas() {
  const viewport = $("canvas-scroll");
  const padding = getComputedStyle(viewport);
  const width = viewport.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight);
  const height = viewport.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom);
  if (width <= 0 || height <= 0) return;
  const zoom = Number($("zoom").value);
  const fit = Math.min(width / editor.width, height / editor.height, 1);
  canvas.style.width = `${editor.width * fit * zoom}px`;
  canvas.style.height = `${editor.height * fit * zoom}px`;
  $("zoom").setAttribute("aria-valuetext", `${zoom} lần kích thước vừa khung`);
}

function neighbor(layer, x, y, fallback) {
  return layer[y]?.[x] ?? fallback;
}

function drawGround(tile, x, y, px, py, size) {
  ctx.fillStyle = COLORS[tile] || COLORS[0];
  ctx.fillRect(px, py, size, size);
  const shade = editor.elevation[y][x] * .055;
  if (shade) {
    ctx.fillStyle = `rgba(235,225,190,${shade})`;
    ctx.fillRect(px, py, size, size);
  }
  const grain = randomAt(x, y, 1337);
  if (tile === TILE.GRASS && grain > .72) {
    ctx.fillStyle = grain > .9 ? "#7f9254" : "#56804a";
    ctx.fillRect(px + size * .25, py + size * .62, Math.max(1, size * .12), Math.max(1, size * .2));
  } else if (tile === TILE.STONE && grain > .55) {
    ctx.fillStyle = "rgba(220,215,190,.16)";
    ctx.fillRect(px + size * .2, py + size * .28, size * .45, Math.max(1, size * .1));
  } else if (tile === TILE.WATER) {
    ctx.fillStyle = "rgba(158,205,218,.22)";
    ctx.fillRect(px + (grain > .5 ? size * .2 : 0), py + size * .45, size * .65, Math.max(1, size * .1));
  }

  const edge = Math.max(1, Math.round(size * .16));
  const sand = "rgba(192,174,111,.75)";
  if (tile !== TILE.WATER) {
    ctx.fillStyle = sand;
    if (neighbor(editor.ground, x, y - 1, tile) === TILE.WATER) ctx.fillRect(px, py, size, edge);
    if (neighbor(editor.ground, x, y + 1, tile) === TILE.WATER) ctx.fillRect(px, py + size - edge, size, edge);
    if (neighbor(editor.ground, x - 1, y, tile) === TILE.WATER) ctx.fillRect(px, py, edge, size);
    if (neighbor(editor.ground, x + 1, y, tile) === TILE.WATER) ctx.fillRect(px + size - edge, py, edge, size);
  }
}

function drawObject(tile, x, y, px, py, size) {
  if (tile === TILE.EMPTY) return;
  if (tile === TILE.TREE) {
    ctx.fillStyle = "#503b25";
    ctx.fillRect(px + size * .43, py + size * .48, Math.max(1, size * .18), size * .45);
    ctx.fillStyle = randomAt(x, y, 71) > .5 ? "#285132" : "#315f38";
    ctx.beginPath(); ctx.arc(px + size * .5, py + size * .37, size * .4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(151,186,100,.22)";
    ctx.fillRect(px + size * .28, py + size * .18, size * .28, size * .12);
  } else if (tile === TILE.MOUNTAIN) {
    ctx.fillStyle = "#625f59";
    ctx.beginPath(); ctx.moveTo(px, py + size); ctx.lineTo(px + size * .53, py + size * .08); ctx.lineTo(px + size, py + size); ctx.fill();
    ctx.fillStyle = "#aaa492";
    ctx.beginPath(); ctx.moveTo(px + size * .35, py + size * .42); ctx.lineTo(px + size * .53, py + size * .08); ctx.lineTo(px + size * .68, py + size * .45); ctx.fill();
  } else if (tile === TILE.WALL) {
    ctx.fillStyle = COLORS[TILE.WALL]; ctx.fillRect(px, py, size, size);
    ctx.strokeStyle = "#5b5048"; ctx.strokeRect(px + .5, py + .5, size - 1, size - 1);
  }
}

const PREVIEW_RGB = {
  0: [66, 111, 63], 1: [113, 111, 103], 2: [49, 95, 121], 3: [51, 45, 42],
  4: [117, 100, 72], 5: [43, 91, 53], 6: [107, 104, 96], 7: [146, 123, 81],
};
const PREVIEW_AUTOTILE_SIZE = 8;
const PREVIEW_AUTOTILE_VARIANTS = 4;
const PREVIEW_AUTOTILE_TYPES = [0, 1, 2, 4, 7];
const PREVIEW_AUTOTILE_DIRECTIONS = [
  { bit: 1, dx: 0, dy: -1 }, { bit: 2, dx: 1, dy: 0 },
  { bit: 4, dx: 0, dy: 1 }, { bit: 8, dx: -1, dy: 0 },
  { bit: 16, dx: 1, dy: -1 }, { bit: 32, dx: 1, dy: 1 },
  { bit: 64, dx: -1, dy: 1 }, { bit: 128, dx: -1, dy: -1 },
];
function normalizePreviewMask(mask) {
  const north = Boolean(mask & 1), east = Boolean(mask & 2);
  const south = Boolean(mask & 4), west = Boolean(mask & 8);
  if (!(north && east)) mask &= ~16;
  if (!(east && south)) mask &= ~32;
  if (!(south && west)) mask &= ~64;
  if (!(west && north)) mask &= ~128;
  return mask;
}
const PREVIEW_AUTOTILE_MASKS = Array.from({ length: 256 }, (_, mask) => mask)
  .filter((mask) => normalizePreviewMask(mask) === mask);
const PREVIEW_AUTOTILE_MASK_INDEX = new Map(PREVIEW_AUTOTILE_MASKS.map((mask, index) => [mask, index]));
const PREVIEW_AUTOTILE_URL = "/assets/tilesets/temperate-47.svg";
let previewCanvas = null;
let previewAutotileAtlas = null;
let previewAutotileLoading = false;
let scheduledDraw = 0;

function loadPreviewAutotileAtlas() {
  if (previewAutotileAtlas || previewAutotileLoading || typeof Image === "undefined") return;
  previewAutotileLoading = true;
  const image = new Image();
  image.onload = () => {
    previewAutotileLoading = false;
    if (image.naturalWidth !== PREVIEW_AUTOTILE_MASKS.length * PREVIEW_AUTOTILE_VARIANTS * PREVIEW_AUTOTILE_SIZE
      || image.naturalHeight !== PREVIEW_AUTOTILE_TYPES.length * PREVIEW_AUTOTILE_SIZE) return;
    previewAutotileAtlas = image;
    requestDraw();
  };
  image.onerror = () => { previewAutotileLoading = false; };
  image.src = PREVIEW_AUTOTILE_URL;
}

function previewHash(x, y, seed = 0) {
  return (Math.imul(x + 31, 73856093) ^ Math.imul(y + 17, 19349663) ^ Math.imul(seed + 7, 83492791)) >>> 0;
}

function drawAutotiledPreview(preview) {
  const cellSize = PREVIEW_AUTOTILE_SIZE;
  const columns = Math.ceil(editor.width / cellSize);
  const rows = Math.ceil(editor.height / cellSize);
  const kinds = Array.from({ length: rows }, () => Array(columns).fill(TILE.GRASS));
  const groundAt = (x, y) => {
    const type = Number(editor.ground[y]?.[x] ?? TILE.GRASS);
    return PREVIEW_AUTOTILE_TYPES.includes(type) ? type : TILE.GRASS;
  };

  for (let cellY = 0; cellY < rows; cellY += 1) {
    for (let cellX = 0; cellX < columns; cellX += 1) {
      const counts = Array(8).fill(0);
      const endY = Math.min(editor.height, (cellY + 1) * cellSize);
      const endX = Math.min(editor.width, (cellX + 1) * cellSize);
      for (let y = cellY * cellSize; y < endY; y += 1) {
        for (let x = cellX * cellSize; x < endX; x += 1) {
          const type = groundAt(x, y);
          counts[type] += 1;
        }
      }
      let dominant = TILE.GRASS, dominantCount = -1;
      for (const type of PREVIEW_AUTOTILE_TYPES) {
        if (counts[type] > dominantCount) { dominant = type; dominantCount = counts[type]; }
      }
      kinds[cellY][cellX] = dominant;
    }
  }

  preview.imageSmoothingEnabled = false;
  const typeRows = new Map(PREVIEW_AUTOTILE_TYPES.map((type, index) => [type, index]));
  for (let cellY = 0; cellY < rows; cellY += 1) {
    for (let cellX = 0; cellX < columns; cellX += 1) {
      const type = kinds[cellY][cellX];
      let mask = 0;
      for (const direction of PREVIEW_AUTOTILE_DIRECTIONS) {
        if (kinds[cellY + direction.dy]?.[cellX + direction.dx] === type) mask |= direction.bit;
      }
      mask = normalizePreviewMask(mask);
      const maskIndex = PREVIEW_AUTOTILE_MASK_INDEX.get(mask) ?? 0;
      const variant = previewHash(cellX, cellY, type) % PREVIEW_AUTOTILE_VARIANTS;
      const sourceX = (maskIndex * PREVIEW_AUTOTILE_VARIANTS + variant) * cellSize;
      const sourceY = typeRows.get(type) * cellSize;
      preview.drawImage(previewAutotileAtlas, sourceX, sourceY, cellSize, cellSize,
        cellX * cellSize, cellY * cellSize, cellSize, cellSize);
    }
  }
}

function drawPreviewObjectsAndElevation(preview) {
  const overlay = preview.createImageData(editor.width, editor.height);
  for (let y = 0; y < editor.height; y += 1) {
    for (let x = 0; x < editor.width; x += 1) {
      const object = Number(editor.objects[y]?.[x] ?? TILE.EMPTY);
      const elevation = Math.max(0, Number(editor.elevation[y]?.[x] || 0));
      const index = (y * editor.width + x) * 4;
      if (object >= 0) {
        const base = PREVIEW_RGB[object] || PREVIEW_RGB[TILE.GRASS];
        const variation = (randomAt(x, y, 1337) - .5) * 9;
        overlay.data[index] = Math.max(0, Math.min(255, Math.round(base[0] + variation)));
        overlay.data[index + 1] = Math.max(0, Math.min(255, Math.round(base[1] + variation)));
        overlay.data[index + 2] = Math.max(0, Math.min(255, Math.round(base[2] + variation)));
        overlay.data[index + 3] = 255;
      } else if (elevation) {
        overlay.data[index] = 235;
        overlay.data[index + 1] = 225;
        overlay.data[index + 2] = 190;
        overlay.data[index + 3] = Math.min(72, Math.round(elevation * 18));
      }
    }
  }
  preview.putImageData(overlay, 0, 0);
}

function buildPreviewCache() {
  if (!previewCanvas) previewCanvas = document.createElement("canvas");
  previewCanvas.width = editor.width;
  previewCanvas.height = editor.height;
  const preview = previewCanvas.getContext("2d");
  if (previewAutotileAtlas) {
    drawAutotiledPreview(preview);
    drawPreviewObjectsAndElevation(preview);
    return;
  }
  const image = preview.createImageData(editor.width, editor.height);
  for (let y = 0; y < editor.height; y += 1) {
    for (let x = 0; x < editor.width; x += 1) {
      const object = editor.objects[y][x];
      const tile = object >= 0 ? object : editor.ground[y][x];
      const base = PREVIEW_RGB[tile] || PREVIEW_RGB[0];
      const variation = (randomAt(x, y, 1337) - .5) * (tile === TILE.WATER ? 12 : 9);
      const lift = Number(editor.elevation[y][x] || 0) * 6;
      const index = (y * editor.width + x) * 4;
      image.data[index] = Math.max(0, Math.min(255, base[0] + variation + lift));
      image.data[index + 1] = Math.max(0, Math.min(255, base[1] + variation + lift));
      image.data[index + 2] = Math.max(0, Math.min(255, base[2] + variation + lift));
      image.data[index + 3] = 255;
      if (editor.ground[y][x] !== TILE.WATER) {
        const nearWater = editor.ground[y - 1]?.[x] === TILE.WATER || editor.ground[y + 1]?.[x] === TILE.WATER
          || editor.ground[y]?.[x - 1] === TILE.WATER || editor.ground[y]?.[x + 1] === TILE.WATER;
        if (nearWater && object < 0) {
          image.data[index] = 176; image.data[index + 1] = 158; image.data[index + 2] = 94;
        }
      }
    }
  }
  preview.putImageData(image, 0, 0);
}

function drawMap() {
  if (!editor.ground.length) return;
  const size = editor.zoom;
  buildPreviewCache();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(previewCanvas, 0, 0, canvas.width, canvas.height);
  if ($("show-grid").checked && size >= 4) {
    ctx.strokeStyle = "rgba(10,15,11,.22)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= editor.width; x += 1) { ctx.beginPath(); ctx.moveTo(x * size + .5, 0); ctx.lineTo(x * size + .5, canvas.height); ctx.stroke(); }
    for (let y = 0; y <= editor.height; y += 1) { ctx.beginPath(); ctx.moveTo(0, y * size + .5); ctx.lineTo(canvas.width, y * size + .5); ctx.stroke(); }
  }
  ctx.strokeStyle = "#f3d46e";
  ctx.lineWidth = Math.max(2, size * .5);
  ctx.beginPath();
  ctx.arc((editor.spawnX + .5) * size, (editor.spawnY + .5) * size, Math.max(6, size * 5), 0, Math.PI * 2);
  ctx.stroke();
  const actorX = (editor.spawnX + .5) * size;
  const actorY = (editor.spawnY + .5) * size;
  const actorW = 20 * size;
  const actorH = 25 * size;
  ctx.fillStyle = "rgba(8,12,9,.42)";
  ctx.beginPath(); ctx.ellipse(actorX, actorY + actorH * .42, actorW * .42, actorH * .1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(209,177,91,.9)";
  ctx.beginPath();
  ctx.moveTo(actorX, actorY - actorH * .48);
  ctx.lineTo(actorX - actorW * .46, actorY + actorH * .42);
  ctx.lineTo(actorX + actorW * .46, actorY + actorH * .42);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#dbc49c";
  ctx.beginPath(); ctx.arc(actorX, actorY - actorH * .36, actorW * .22, 0, Math.PI * 2); ctx.fill();
  for (const pack of editor.monsterSpawns) {
    const px = (Number(pack.centerX) + .5) * size;
    const py = (Number(pack.centerY) + .5) * size;
    const radius = Math.max(5, Number(pack.radius || 18) * size);
    ctx.strokeStyle = pack.packId === editor.selectedMonsterPackId ? "#fff2a8" : "#d76b62";
    ctx.fillStyle = "rgba(160,48,48,.12)";
    ctx.lineWidth = Math.max(1, size * .6);
    ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ffe0d8";
    ctx.font = `${Math.max(9, size * 3)}px Segoe UI`;
    ctx.fillText(`${pack.templateId} ×${pack.count}`, px + 5, py - 5);
  }
  if (editor.layer === "monster") {
    const x = $("monster-center-x").valueAsNumber, y = $("monster-center-y").valueAsNumber;
    if (x >= 0 && x < editor.width && y >= 0 && y < editor.height) {
      ctx.strokeStyle = "#fff2a8";
      ctx.lineWidth = 2;
      ctx.strokeRect((x + .5) * size - 4, (y + .5) * size - 4, 8, 8);
    }
  }
  for (const portal of editor.portals) {
    const px = (Number(portal.x) + .5) * size;
    const py = (Number(portal.y) + .5) * size;
    const radius = Math.max(5, size * 4);
    ctx.strokeStyle = portal.id === editor.selectedPortalId ? "#fff2a8" : "#65d9df";
    ctx.fillStyle = "rgba(48,160,174,.3)";
    ctx.lineWidth = Math.max(2, size);
    ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (size >= 2) {
      ctx.fillStyle = "#e7ffff";
      ctx.font = `${Math.max(9, size * 4)}px Segoe UI`;
      ctx.fillText(portal.tenMapDen || portal.denMap || "Portal", px + radius + 3, py - radius);
    }
  }
  for (const npc of editor.npcs) {
    const px = (Number(npc.x) + .5) * size;
    const py = (Number(npc.y) + .5) * size;
    const shop = npc.type === "shop" || npc.loaiNpc === "SHOP";
    ctx.globalAlpha = npc.enabled === false ? 0.35 : 1;
    ctx.fillStyle = shop ? "#e3c878" : "#8fd0ad";
    ctx.strokeStyle = "#142018";
    ctx.lineWidth = Math.max(1, size * .45);
    ctx.beginPath();
    ctx.arc(px, py, Math.max(3, size * 2.1), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (size >= 2) {
      ctx.fillStyle = "#f3f1dc";
      ctx.font = `bold ${Math.max(9, size * 3)}px Segoe UI`;
      ctx.textAlign = "left";
      ctx.fillText(npc.name || "NPC", px + size * 2.8, py - size * 1.5);
    ctx.globalAlpha = 1;
    }
  }
  ctx.lineWidth = 1;
}

function requestDraw() {
  if (scheduledDraw) return;
  scheduledDraw = requestAnimationFrame(() => { scheduledDraw = 0; drawMap(); });
}

function renderPalette() {
  const host = $("tile-palette");
  host.innerHTML = "";
  const entries = PALETTES[editor.layer] || [];
  if (!entries.length) {
    const hints = { portal: "Nhấp vào bản đồ để đặt portal nguồn.", monster: "Nhấp vào bản đồ để đặt tâm bãi quái." };
    host.textContent = hints[editor.layer] || "Nhấp vào bản đồ để đặt điểm xuất hiện.";
    return;
  }
  if (!entries.some(([value]) => value === editor.selected)) editor.selected = entries[0][0];
  for (const [value, label] of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = value === editor.selected ? "active" : "";
    button.innerHTML = `<span class="swatch" style="background:${editor.layer === "elevation" ? `rgba(235,225,190,${.08 + value * .18})` : COLORS[value]}"></span>${label}`;
    button.addEventListener("click", () => { editor.selected = value; renderPalette(); });
    host.appendChild(button);
  }
}

function paintAt(x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= editor.width || y >= editor.height) return;
  if (editor.layer === "monster") {
    $("monster-center-x").value = x;
    $("monster-center-y").value = y;
    requestDraw();
    return;
  }
  if (editor.layer === "npc") {
    $("npc-x").value = x;
    $("npc-y").value = y;
    editor.dirty = true;
    requestDraw();
    return;
  }
  if (editor.layer === "portal") {
    $("portal-source-x").value = x;
    $("portal-source-y").value = y;
    for (let py = y - 4; py <= y + 4; py += 1) {
      for (let px = x - 4; px <= x + 4; px += 1) {
        if (editor.ground[py]?.[px] === undefined || Math.hypot(px - x, py - y) > 4) continue;
        editor.ground[py][px] = $("map-biome").value === "CITY" ? TILE.FLOOR : TILE.GRASS;
        editor.objects[py][px] = TILE.EMPTY;
      }
    }
    const selected = editor.portals.find((portal) => portal.id === editor.selectedPortalId);
    if (selected) { selected.x = x; selected.y = y; }
    requestDraw();
    return;
  }
  const radius = editor.layer === "spawn" ? 0 : Math.max(0, editor.brush - 1);
  editor.dirty = true;
  if (editor.layer === "spawn") {
    editor.spawnX = x; editor.spawnY = y; clearSpawn(10); requestDraw(); return;
  }
  for (let py = y - radius; py <= y + radius; py += 1) {
    for (let px = x - radius; px <= x + radius; px += 1) {
      if (!editor.ground[py]?.[px] && editor.ground[py]?.[px] !== 0) continue;
      if (Math.hypot(px - x, py - y) > radius + .25) continue;
      if (editor.layer === "ground") {
        editor.ground[py][px] = editor.selected;
        if (editor.selected === TILE.WATER) editor.objects[py][px] = TILE.EMPTY;
      } else if (editor.layer === "objects") {
        editor.objects[py][px] = editor.selected;
        if (editor.selected >= 0 && editor.ground[py][px] === TILE.WATER) editor.ground[py][px] = TILE.GRASS;
      } else if (editor.layer === "elevation") editor.elevation[py][px] = editor.selected;
    }
  }
  requestDraw();
}

function pointerTile(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.floor((event.clientX - rect.left) / rect.width * editor.width),
    y: Math.floor((event.clientY - rect.top) / rect.height * editor.height),
  };
}

function composeCollision() {
  return editor.ground.map((row, y) => row.map((tile, x) => editor.objects[y][x] >= 0 ? editor.objects[y][x] : tile));
}

function mapPayload() {
  const realmMin = Number($("realm-min").value || 1);
  const realmMax = Number($("realm-max").value || 13);
  return {
    code: $("map-code").value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
    tenMap: $("map-name").value.trim(),
    type: $("map-type").value,
    biome: $("map-biome").value,
    status: editor.status,
    regionId: $("map-region").value.trim(),
    tier: Number($("map-tier").value || 0),
    recommendedRealmMin: Math.min(realmMin, realmMax),
    recommendedRealmMax: Math.max(realmMin, realmMax),
    tags: $("map-tags").value.split(",").map((tag) => tag.trim()).filter(Boolean),
    seed: $("map-seed").value,
    w: editor.width,
    h: editor.height,
    spawnX: editor.spawnX,
    spawnY: editor.spawnY,
    layers: { ground: editor.ground, objects: editor.objects, elevation: editor.elevation },
    portals: editor.portals,
    monsters: editor.monsters,
    monsterSpawns: editor.monsterSpawns,
    npcs: editor.npcs,
    rules: {
      ...editor.rules,
      safeZone: $("rule-safe-zone").checked,
      noMonsters: $("rule-no-monsters").checked,
      allowRecall: $("rule-allow-recall").checked,
    },
  };
}

function adminHeaders(json = false) { return json ? { "content-type": "application/json" } : {}; }
function adminFetch(url, options = {}) { return AdminAuth.fetch(url, options); }

function refreshPortalTargets(selected = "") {
  const sourceCode = $("map-code").value.trim().toLowerCase();
  const maps = [...editor.mapCatalog.values()].filter((map) => map.code !== sourceCode);
  $("portal-target-map").innerHTML = '<option value="">Chọn map đích</option>'
    + maps.map((map) => `<option value="${mapPackEscape(map.code)}">${mapPackEscape(map.tenMap)} · ${Number(map.w) || 0}×${Number(map.h) || 0}</option>`).join("");
  $("portal-target-map").value = selected;
}

function resetPortalForm() {
  editor.selectedPortalId = null;
  $("portal-source-x").value = "";
  $("portal-source-y").value = "";
  $("portal-target-map").value = "";
  $("portal-target-x").value = 20;
  $("portal-target-y").value = 20;
  $("portal-label").value = "";
  $("portal-required-quest").value = "";
  $("portal-locked-message").value = "";
  $("portal-two-way").checked = true;
  $("delete-portal").disabled = true;
  renderPortalList();
  requestDraw();
}

function selectPortal(id) {
  const portal = editor.portals.find((item) => item.id === id);
  if (!portal) return resetPortalForm();
  editor.selectedPortalId = portal.id;
  $("portal-source-x").value = Number(portal.x);
  $("portal-source-y").value = Number(portal.y);
  refreshPortalTargets(portal.denMap || portal.toMap || "");
  $("portal-target-x").value = Number(portal.toX);
  $("portal-target-y").value = Number(portal.toY);
  $("portal-label").value = portal.tenMapDen || "";
  $("portal-required-quest").value = portal.requiredQuestId || "";
  $("portal-locked-message").value = portal.lockedMessage || "";
  $("portal-two-way").checked = Boolean(portal.bidirectional || portal.reverseId);
  $("delete-portal").disabled = false;
  renderPortalList();
  requestDraw();
}

function renderPortalList() {
  const host = $("portal-list");
  if (!host) return;
  if (!editor.portals.length) {
    host.innerHTML = '<p class="hint">Map chưa có portal.</p>';
    return;
  }
  host.innerHTML = "";
  for (const portal of editor.portals) {
    const target = editor.mapCatalog.get(portal.denMap || portal.toMap);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `portal-item${portal.id === editor.selectedPortalId ? " active" : ""}`;
    button.textContent = `(${portal.x},${portal.y}) → ${target?.tenMap || portal.tenMapDen || portal.denMap}${portal.requiredQuestId ? ` · khóa: ${portal.requiredQuestId}` : ""}`;
    button.addEventListener("click", () => selectPortal(portal.id));
    host.appendChild(button);
  }
}

async function savePortalLink() {
  const sourceCode = $("map-code").value.trim().toLowerCase();
  const targetCode = $("portal-target-map").value;
  const sourceX = Number($("portal-source-x").value);
  const sourceY = Number($("portal-source-y").value);
  const targetX = Number($("portal-target-x").value);
  const targetY = Number($("portal-target-y").value);
  if (!sourceCode || !editor.knownMaps.has(sourceCode)) throw new Error("Hãy lưu map nguồn trước khi nối portal");
  if (!targetCode) throw new Error("Chưa chọn map đích");
  if (![sourceX, sourceY, targetX, targetY].every(Number.isFinite)) throw new Error("Tọa độ portal chưa hợp lệ");

  await saveMap();
  const target = editor.mapCatalog.get(targetCode);
  const response = await adminFetch(API.BASE + API.PATHS.admin.linkPortal, {
    method: "POST",
    headers: adminHeaders(true),
    body: JSON.stringify({
      id: editor.selectedPortalId,
      sourceCode,
      targetCode,
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourceName: $("map-name").value.trim(),
      targetName: $("portal-label").value.trim() || target?.tenMap || targetCode,
      twoWay: $("portal-two-way").checked,
      // Luôn gửi cả khi rỗng: BE hiểu chuỗi rỗng là gỡ điều kiện khóa, thiếu khóa là giữ nguyên.
      requiredQuestId: $("portal-required-quest").value.trim(),
      lockedMessage: $("portal-locked-message").value.trim(),
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không nối được portal");
  editor.selectedPortalId = data.source.id;
  await loadMap();
  selectPortal(data.source.id);
  setStatus(`Đã nối ${sourceCode} ↔ ${targetCode} (${data.source.side} → ${data.source.targetSide})`, "ok");
}

async function deletePortal() {
  if (!editor.currentCode || !editor.selectedPortalId) return;
  const response = await adminFetch(API.BASE + API.PATHS.admin.portal(editor.currentCode, editor.selectedPortalId), {
    method: "DELETE",
    headers: adminHeaders(),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không xóa được portal");
  await loadMap();
  resetPortalForm();
  setStatus(`Đã xóa portal ${data.removed}`, "ok");
}

function resetNpcForm() {
  editor.selectedNpcId = null;
  const code = $("map-code").value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_") || "new_map";
  let ordinal = editor.npcs.length + 1;
  while (editor.npcs.some((npc) => npc.id === `npc_${code}_${ordinal}`)) ordinal++;
  $("npc-id").value = `npc_${code}_${ordinal}`;
  $("npc-name").value = "";
  $("npc-role").value = "GUIDE";
  $("npc-type").value = "dialog";
  $("npc-shop-category").value = "ALL";
  $("npc-shop-category").disabled = true;
  $("npc-gender").value = "MALE";
  $("npc-x").value = editor.spawnX;
  $("npc-y").value = editor.spawnY;
  $("npc-color").value = "#8fc7bd";
  $("npc-dialog").value = "";
  $("npc-enabled").checked = true;
  renderNpcList();
}

function syncNpcShopCategory() {
  $("npc-shop-category").disabled = $("npc-type").value !== "shop";
}

function selectNpc(id) {
  const npc = editor.npcs.find((item) => item.id === id);
  if (!npc) return resetNpcForm();
  editor.selectedNpcId = npc.id;
  $("npc-id").value = npc.id;
  $("npc-name").value = npc.name || "";
  $("npc-role").value = npc.role || "GUIDE";
  $("npc-type").value = npc.type || (npc.loaiNpc ? npc.loaiNpc.toLowerCase() : "dialog");
  $("npc-shop-category").value = String(npc.shopCategory || "ALL").toUpperCase();
  syncNpcShopCategory();
  $("npc-gender").value = String(npc.gender || "MALE").toUpperCase();
  $("npc-x").value = npc.x ?? 0;
  $("npc-y").value = npc.y ?? 0;
  $("npc-color").value = /^#[0-9a-f]{6}$/i.test(npc.color || "") ? npc.color : "#8fc7bd";
  $("npc-dialog").value = npc.dialog || "";
  $("npc-enabled").checked = npc.enabled !== false;
  renderNpcList();
  requestDraw();
}

function renderNpcList() {
  const host = $("npc-list");
  host.replaceChildren();
  if (!editor.npcs.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Map chưa có NPC.";
    host.appendChild(empty);
    return;
  }
  for (const npc of editor.npcs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `portal-item${npc.id === editor.selectedNpcId ? " active" : ""}`;
    button.textContent = `${npc.name || npc.id} · (${npc.x}, ${npc.y})${npc.enabled === false ? " · Đang ẩn" : ""}`;
    button.addEventListener("click", () => selectNpc(npc.id));
    host.appendChild(button);
  }
}

async function saveNpc() {
  const id = $("npc-id").value.trim();
  const name = $("npc-name").value.trim();
  const role = $("npc-role").value.trim();
  const x = $("npc-x").valueAsNumber, y = $("npc-y").valueAsNumber;
  const pattern = /^[A-Za-z0-9_-]{1,80}$/;
  if (!pattern.test(id) || !name || !role) throw new Error("Mã, tên và vai trò NPC là bắt buộc.");
  if (![x, y].every(Number.isInteger) || x < 0 || x >= editor.width || y < 0 || y >= editor.height) throw new Error("Tọa độ NPC phải nằm trong bản đồ.");
  if (SOLID.has(editor.ground[y]?.[x]) || SOLID.has(editor.objects[y]?.[x])) throw new Error("NPC phải đứng trên ô đi được.");
  if (editor.npcs.some((npc) => npc.id === id && npc.id !== editor.selectedNpcId)) throw new Error("Mã NPC này đã được dùng trên map.");
  const npcType = $("npc-type").value;
  const npc = {
    id, mapCode: $("map-code").value.trim(), name, role, type: npcType,
    ...(npcType === "shop" ? { shopCategory: $("npc-shop-category").value || "ALL" } : {}),
    gender: $("npc-gender").value, color: $("npc-color").value, x, y,
    dialog: $("npc-dialog").value.trim(), enabled: $("npc-enabled").checked,
  };
  const before = editor.npcs;
  const index = before.findIndex((item) => item.id === editor.selectedNpcId);
  editor.npcs = before.slice();
  if (index < 0) editor.npcs.push(npc);
  else editor.npcs[index] = npc;
  editor.selectedNpcId = id;
  renderNpcList();
  requestDraw();
  try {
    await saveMap();
    selectNpc(id);
    setStatus(`Đã lưu NPC ${name} vào dữ liệu map trong MySQL.`, "ok");
  } catch (error) {
    editor.npcs = before;
    renderNpcList();
    requestDraw();
    throw error;
  }
}

function resetMonsterPackForm() {
  editor.selectedMonsterPackId = null;
  $("monster-pack-id").value = "";
  $("monster-center-x").value = "";
  $("monster-center-y").value = "";
  $("monster-count").value = 4; $("monster-radius").value = 18;
  $("monster-aggro").value = 40; $("monster-leash").value = 72; $("monster-chase").value = 7000;
  $("delete-monster-pack").disabled = true;
  renderMonsterPackList(); requestDraw();
}

function selectMonsterPack(packId) {
  const pack = editor.monsterSpawns.find((item) => item.packId === packId);
  if (!pack) return resetMonsterPackForm();
  editor.selectedMonsterPackId = pack.packId;
  const select = $("monster-template");
  if (![...select.options].some((option) => option.value === pack.templateId)) {
    const local = editor.monsters.find((item) => item.id === pack.templateId || item.code === pack.templateId);
    if (local) select.add(new Option(`${local.name || pack.templateId} · mẫu trong map`, pack.templateId));
  }
  select.value = pack.templateId; $("monster-pack-id").value = pack.packId;
  $("monster-center-x").value = pack.centerX; $("monster-center-y").value = pack.centerY;
  $("monster-count").value = pack.count; $("monster-radius").value = pack.radius;
  $("monster-aggro").value = pack.aggroRange; $("monster-leash").value = pack.leashDistance;
  $("monster-chase").value = pack.chaseDurationMs;
  $("delete-monster-pack").disabled = false;
  renderMonsterPackList(); requestDraw();
}

function renderMonsterPackList() {
  const host = $("monster-pack-list");
  if (!editor.monsterSpawns.length) { host.innerHTML = '<p class="hint">Map chưa có bãi quái.</p>'; return; }
  host.innerHTML = "";
  for (const pack of editor.monsterSpawns) {
    const monster = editor.monsterCatalog.find((item) => item.id === pack.templateId || item.code === pack.templateId);
    const button = document.createElement("button");
    button.type = "button"; button.className = `portal-item${pack.packId === editor.selectedMonsterPackId ? " active" : ""}`;
    button.textContent = `${monster?.name || pack.templateId} ×${pack.count} · (${pack.centerX},${pack.centerY})`;
    button.addEventListener("click", () => selectMonsterPack(pack.packId)); host.appendChild(button);
  }
}

function saveMonsterPack() {
  const templateId = $("monster-template").value;
  const definition = editor.monsterCatalog.find((item) => String(item.id) === templateId)
    || editor.monsters.find((item) => item.id === templateId || item.code === templateId);
  if (!definition) throw new Error("Chưa chọn loại quái");
  if ($("rule-no-monsters").checked || $("map-type").value === "CITY") throw new Error("Map đang ở chế độ không có quái.");
  const centerX = $("monster-center-x").valueAsNumber, centerY = $("monster-center-y").valueAsNumber;
  if (![centerX, centerY].every(Number.isInteger) || centerX < 0 || centerX >= editor.width || centerY < 0 || centerY >= editor.height) {
    throw new Error("Chọn tâm đàn hoặc nhập tọa độ nguyên trong bản đồ.");
  }
  const ground = editor.ground[centerY]?.[centerX], object = editor.objects[centerY]?.[centerX];
  const obstacles = [TILE.WATER, TILE.WALL, TILE.TREE, TILE.MOUNTAIN];
  if (ground === undefined || obstacles.includes(ground) || obstacles.includes(object)) throw new Error("Tâm đàn phải nằm trên ô đi được.");
  for (const id of ["monster-count", "monster-radius", "monster-aggro", "monster-leash", "monster-chase"]) {
    const input = $(id);
    if (!input.value || !input.reportValidity()) throw new Error("Kiểm tra số lượng, bán kính và thông số truy đuổi.");
  }
  let ordinal = editor.monsterSpawns.length + 1;
  while (editor.monsterSpawns.some((item) => item.packId === `PACK_${templateId}_${ordinal}`)) ordinal++;
  const generatedId = `PACK_${templateId}_${ordinal}`;
  const packId = ($("monster-pack-id").value.trim() || generatedId).toUpperCase().replace(/[^A-Z0-9_-]+/g, "_");
  const pack = { packId, templateId, centerX, centerY, count: Number($("monster-count").value), radius: Number($("monster-radius").value), aggroRange: Number($("monster-aggro").value), leashDistance: Number($("monster-leash").value), chaseDurationMs: Number($("monster-chase").value) };
  const oldId = editor.selectedMonsterPackId;
  if (editor.monsterSpawns.some((item) => item.packId === packId && item.packId !== oldId)) throw new Error("Mã đàn quái đã tồn tại");
  const index = editor.monsterSpawns.findIndex((item) => item.packId === oldId);
  if (index >= 0) editor.monsterSpawns[index] = pack; else editor.monsterSpawns.push(pack);
  const definitionIndex = editor.monsters.findIndex((item) => item.id === templateId || item.code === templateId);
  if (definitionIndex >= 0) editor.monsters[definitionIndex] = definition;
  else editor.monsters.push(definition);
  editor.rules.monsterPacksOnly = true;
  editor.selectedMonsterPackId = packId; selectMonsterPack(packId);
  editor.dirty = true;
  setStatus(`Đã cập nhật bãi quái ${packId}. Bấm Lưu map để ghi vào MySQL.`, "ok");
}

function deleteMonsterPack() {
  editor.monsterSpawns = editor.monsterSpawns.filter((item) => item.packId !== editor.selectedMonsterPackId);
  resetMonsterPackForm();
  editor.rules.monsterPacksOnly = true;
  editor.dirty = true;
  setStatus("Đã gỡ bãi quái khỏi bản đang sửa. Bấm Lưu map để ghi thay đổi.", "ok");
}

// Gợi ý mã nhiệm vụ cho ô "Nhiệm vụ yêu cầu" của portal; lỗi tải gợi ý không chặn việc chỉnh map.
async function refreshQuestOptions() {
  try {
    const response = await adminFetch(API.BASE + API.PATHS.admin.content("quests"), { headers: adminHeaders() });
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.data)) return;
    $("portal-quest-list").replaceChildren(...data.data.map((quest) => {
      const option = new Option(quest.title || quest.id, quest.id);
      return option;
    }));
  } catch { /* gợi ý là tùy chọn */ }
}

async function refreshMonsterCatalog() {
  const response = await fetch(API.BASE + API.PATHS.data.monsters, { cache: "no-store" }); const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không tải được ngân hàng quái");
  editor.monsterCatalog = Array.isArray(data) ? data : [];
  const select = $("monster-template");
  const selected = new URLSearchParams(window.location.search).get("monster") || select.value;
  select.replaceChildren(new Option("Chọn loại quái", ""), ...editor.monsterCatalog.map(
    (monster) => new Option(`${monster.name} · cấp ${monster.level}`, monster.id),
  ));
  select.value = selected;
  renderMonsterPackList();
}

function renderValidation(validation) {
  const host = $("validation-result"), errors = validation?.errors || [], warnings = validation?.warnings || [];
  host.className = `validation-result hint ${errors.length ? "error" : "ok"}`;
  host.textContent = [...errors.map((text) => `Lỗi: ${text}`), ...warnings.map((text) => `Cảnh báo: ${text}`)].join("\n") || "Map hợp lệ, có thể xuất bản.";
}

async function validateMap() {
  if (!editor.currentCode) await saveMap();
  const response = await adminFetch(API.BASE + API.PATHS.admin.validateWorld(editor.currentCode), { headers: adminHeaders() });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "Không kiểm tra được map");
  renderValidation(data); return data;
}

async function publishMap() {
  await saveMap();
  const response = await adminFetch(API.BASE + API.PATHS.admin.publishWorld(editor.currentCode), { method: "POST", headers: adminHeaders() });
  const data = await response.json();
  if (!response.ok) { renderValidation(data.validation); throw new Error(data.error || "Không xuất bản được map"); }
  editor.status = "PUBLISHED"; $("publish-status").textContent = editor.status; $("publish-status").classList.add("published");
  renderValidation(data.validation); await refreshMapList(editor.currentCode); setStatus(`Đã xuất bản ${editor.currentCode}`, "ok");
}

async function refreshMapList(selected = "") {
  const response = await adminFetch(API.BASE + API.PATHS.admin.worlds, { headers: adminHeaders() });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không tải được danh sách map");
  editor.knownMaps = new Set(data.map((map) => map.code));
  editor.mapCatalog = new Map(data.map((map) => [map.code, map]));
  $("map-list").innerHTML = '<option value="">Map mới</option>' + data.map((map) => `<option value="${mapPackEscape(map.code)}">[${mapPackEscape(map.status)}] ${mapPackEscape(map.tenMap)} · ${Number(map.w) || 0}×${Number(map.h) || 0}</option>`).join("");
  const queryMap = new URLSearchParams(window.location.search).get("map");
  $("map-list").value = selected || queryMap || "";
  refreshPortalTargets($("portal-target-map").value);
  renderPortalList();
}

function normalizeLoadedLayers(world) {
  const collision = Array.isArray(world.jsonMap) ? world.jsonMap : [];
  const source = world.layers || {};
  editor.ground = Array.isArray(source.ground) ? source.ground : collision.map((row) => row.map((tile) => [3, 5, 6].includes(tile) ? 0 : tile));
  editor.objects = Array.isArray(source.objects) ? source.objects : collision.map((row) => row.map((tile) => [3, 5, 6].includes(tile) ? tile : -1));
  editor.elevation = Array.isArray(source.elevation) ? source.elevation : makeGrid(world.w, world.h, 0);
}

async function loadMap() {
  if (editor.dirty && !window.confirm("Map đang có thay đổi chưa lưu. Mở map khác và bỏ phần chỉnh sửa này?")) {
    $("map-list").value = editor.currentCode || "";
    return;
  }
  const code = $("map-list").value;
  if (!code) { generateMap(); return; }
  setStatus("Đang tải map…");
  const response = await adminFetch(API.BASE + API.PATHS.admin.world(code), { headers: adminHeaders() });
  const world = await response.json();
  if (!response.ok) throw new Error(world.error || "Không tải được map");
  editor.width = Number(world.w); editor.height = Number(world.h);
  editor.spawnX = Number(world.spawnX || 1); editor.spawnY = Number(world.spawnY || 1);
  editor.portals = world.portals || []; editor.monsters = world.monsters || [];
  editor.selectedPortalId = null;
  editor.monsterSpawns = world.monsterSpawns || []; editor.npcs = world.npcs || []; editor.rules = world.rules || {};
  editor.status = world.status || "PUBLISHED";
  editor.selectedMonsterPackId = null;
  editor.selectedNpcId = null;
  editor.dirty = false;
  editor.currentCode = world.code;
  $("map-name").value = world.tenMap || world.name || world.code;
  $("map-code").value = world.code;
  $("map-type").value = world.type || "PLAIN";
  $("map-biome").value = world.biome || (world.type === "CITY" ? "CITY" : "PLAINS");
  $("map-width").value = editor.width; $("map-height").value = editor.height;
  $("map-seed").value = world.seed || world.code;
  $("map-region").value = world.regionId || "ADMIN_PUBLISHED";
  $("map-tier").value = Number(world.tier || 0);
  $("realm-min").value = Number(world.recommendedRealmMin || 1);
  $("realm-max").value = Number(world.recommendedRealmMax || 13);
  $("map-tags").value = (world.tags || []).join(", ");
  $("rule-safe-zone").checked = Boolean(editor.rules.safeZone);
  $("rule-no-monsters").checked = Boolean(editor.rules.noMonsters);
  $("rule-allow-recall").checked = editor.rules.allowRecall !== false;
  $("publish-status").textContent = editor.status;
  $("publish-status").classList.toggle("published", editor.status === "PUBLISHED");
  normalizeLoadedLayers(world);
  resizeCanvas();
  refreshPortalTargets();
  renderPortalList();
  resetMonsterPackForm();
  resetNpcForm();
  renderValidation(world.validation);
  setStatus(`Đã mở ${world.tenMap || world.code}`, "ok");
}

async function saveMap() {
  const payload = mapPayload();
  const exists = editor.knownMaps.has(payload.code);
  const url = exists ? API.BASE + API.PATHS.admin.world(payload.code) : API.BASE + API.PATHS.admin.worlds;
  setStatus("Đang xác minh MySQL và lưu map…");
  await API.assertPersistentStorage();
  const response = await adminFetch(url, { method: exists ? "PUT" : "POST", headers: adminHeaders(true), body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không lưu được map");
  editor.currentCode = data.code;
  editor.status = data.status || editor.status;
  editor.dirty = false;
  $("publish-status").textContent = editor.status;
  $("publish-status").classList.toggle("published", editor.status === "PUBLISHED");
  await refreshMapList(data.code);
  setStatus(`Đã lưu ${data.tenMap} vào MySQL · phiên bản ${data.version}`, "ok");
}

function mapPackEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function renderMapPackPreview() {
  $("sample-map-panel").setAttribute("aria-busy", String(mapPackState.busy || mapPackState.previewing));
  const host = $("map-pack-list");
  const pendingCount = mapPackState.configs.filter((config) => !editor.knownMaps.has(config.code)).length;
  const alreadyCount = mapPackState.configs.length - pendingCount;
  host.innerHTML = mapPackState.configs.map((config) => {
    const state = mapPackState.savedCodes.has(config.code)
      ? "Đã lưu nháp"
      : mapPackState.conflictedCodes.has(config.code)
        ? "Mã bị trùng"
        : editor.knownMaps.has(config.code)
          ? "Đã có · bỏ qua"
          : mapPackState.failedCodes.has(config.code)
            ? "Lưu lỗi · có thể thử lại"
            : "Sẽ tạo nháp";
    return `<div class="map-pack-row" role="listitem"><span><b>${mapPackEscape(config.name)}</b><small>${mapPackEscape(config.code)} · ${mapPackEscape(config.biome)} · 320×240 · ${config.npcCount} NPC</small></span><i>${state}</i></div>`;
  }).join("");
  const base = `${mapPackState.configs.length} map · 3–8 NPC mỗi map · ${pendingCount} map mới${alreadyCount ? ` · ${alreadyCount} mã đã có` : ""}.`;
  $("map-pack-status").textContent = mapPackState.outcome || base;
  $("map-pack-status").className = `validation-result hint${mapPackState.outcome && /lỗi/i.test(mapPackState.outcome) ? " error" : mapPackState.outcome ? " ok" : ""}`;
  const saveButton = $("save-map-pack");
  saveButton.disabled = mapPackState.busy || mapPackState.previewing || mapPackState.needsPreview || pendingCount === 0;
  saveButton.textContent = mapPackState.busy
    ? `Đang lưu ${mapPackState.completed}/${mapPackState.total}…`
    : mapPackState.needsPreview
      ? "Tạo lại bản xem trước để lưu"
    : pendingCount ? `Lưu ${pendingCount} map nháp vào MySQL` : "Không có map mới để lưu";
  $("preview-map-pack").disabled = mapPackState.busy || mapPackState.previewing;
  $("map-pack-count").disabled = mapPackState.busy || mapPackState.previewing;
}

async function previewMapPack() {
  if (mapPackState.busy || mapPackState.previewing) return;
  const requestedCount = Math.max(1, Math.min(SAMPLE_MAP_TEMPLATES.length, Math.trunc(Number($("map-pack-count").value) || 10)));
  $("map-pack-count").value = requestedCount;
  mapPackState.previewing = true;
  mapPackState.needsPreview = true;
  mapPackState.outcome = "Đang đọc các mã map hiện có…";
  $("map-pack-preview").hidden = false;
  renderMapPackPreview();
  try {
    await refreshMapList($("map-list").value);
  } finally {
    mapPackState.previewing = false;
  }
  mapPackState.configs = SAMPLE_MAP_TEMPLATES.slice(0, requestedCount).map((template, index) => ({
    ...template,
    npcCount: 3 + (index % 6),
    seed: `sample_world_seed_${String(index + 1).padStart(2, "0")}`,
  }));
  mapPackState.outcome = "";
  mapPackState.needsPreview = false;
  mapPackState.completed = 0;
  mapPackState.total = 0;
  mapPackState.savedCodes.clear();
  mapPackState.failedCodes.clear();
  mapPackState.conflictedCodes.clear();
  $("map-pack-preview").hidden = false;
  renderMapPackPreview();
}

function createSampleMapNpcs(config, spawnX, spawnY, width, height) {
  return Array.from({ length: config.npcCount }, (_, index) => {
    const archetype = SAMPLE_NPC_ROSTER[index];
    const angle = (index / config.npcCount) * Math.PI * 2 - Math.PI / 2;
    const radius = config.npcCount >= 7 ? 12 : 10;
    const x = Math.max(1, Math.min(width - 2, Math.round(spawnX + Math.cos(angle) * radius)));
    const y = Math.max(1, Math.min(height - 2, Math.round(spawnY + Math.sin(angle) * radius)));
    return {
      id: `npc_${config.code}_${index + 1}`,
      mapCode: config.code,
      name: archetype.name,
      role: archetype.role,
      type: archetype.type,
      gender: archetype.gender,
      color: archetype.color,
      x,
      y,
      dialog: archetype.dialog,
    };
  });
}

const MAP_PACK_FORM_IDS = ["map-name", "map-code", "map-type", "map-biome", "map-width", "map-height", "map-seed", "map-region", "map-tier", "realm-min", "realm-max", "map-tags", "rule-safe-zone", "rule-no-monsters", "rule-allow-recall"];

function captureMapPackEditorState() {
  const fields = Object.fromEntries(MAP_PACK_FORM_IDS.map((id) => {
    const field = $(id);
    return [id, field.type === "checkbox" ? field.checked : field.value];
  }));
  return {
    editor: { ...editor },
    fields,
    selectedMap: $("map-list").value,
    validationText: $("validation-result").textContent,
    validationClass: $("validation-result").className,
    statusText: $("editor-status").textContent,
    statusClass: $("editor-status").className,
  };
}

function lockMapEditorForBatch(locked) {
  const controls = document.querySelectorAll(".top-actions button, .top-actions select, .workspace input, .workspace select, .workspace button");
  if (locked) {
    for (const control of controls) {
      mapPackControlState.set(control, control.disabled);
      control.disabled = true;
    }
  } else {
    for (const [control, wasDisabled] of mapPackControlState) control.disabled = wasDisabled;
    mapPackControlState.clear();
  }
  $("canvas-scroll").style.pointerEvents = locked ? "none" : "";
}

function restoreMapPackEditorState(snapshot) {
  Object.assign(editor, snapshot.editor);
  for (const [id, value] of Object.entries(snapshot.fields)) {
    const field = $(id);
    if (field.type === "checkbox") field.checked = value;
    else field.value = value;
  }
  $("publish-status").textContent = editor.status;
  $("publish-status").classList.toggle("published", editor.status === "PUBLISHED");
  $("validation-result").textContent = snapshot.validationText;
  $("validation-result").className = snapshot.validationClass;
  updateRangeLabels();
  resizeCanvas();
  refreshPortalTargets($("portal-target-map").value);
  renderPortalList();
  renderMonsterPackList();
  $("editor-status").textContent = snapshot.statusText;
  $("editor-status").className = snapshot.statusClass;
}

function applySampleMapTemplate(config) {
  $("map-name").value = config.name;
  $("map-code").value = config.code;
  $("map-type").value = config.type;
  $("map-biome").value = config.biome;
  $("map-width").value = 320;
  $("map-height").value = 240;
  $("map-seed").value = config.seed;
  $("map-region").value = "SAMPLE_WORLD";
  $("map-tier").value = config.tier;
  $("realm-min").value = config.realmMin;
  $("realm-max").value = config.realmMax;
  $("map-tags").value = config.tags;
  $("rule-safe-zone").checked = Boolean(config.safeZone);
  $("rule-no-monsters").checked = Boolean(config.noMonsters);
  $("rule-allow-recall").checked = true;
  editor.rules = { safeZone: Boolean(config.safeZone), noMonsters: Boolean(config.noMonsters), allowRecall: true };
}

async function saveSampleMapPack() {
  if (mapPackState.busy || mapPackState.needsPreview || !mapPackState.configs.length) return;
  const pending = mapPackState.configs.filter((config) => !editor.knownMaps.has(config.code));
  if (!pending.length) return renderMapPackPreview();
  const snapshot = captureMapPackEditorState();
  mapPackState.busy = true;
  mapPackState.completed = 0;
  mapPackState.total = pending.length;
  mapPackState.outcome = "";
  mapPackState.failedCodes.clear();
  mapPackState.conflictedCodes.clear();
  lockMapEditorForBatch(true);
  renderMapPackPreview();
  let saved = 0;
  let skipped = 0;
  const failures = [];
  try {
    for (let index = 0; index < pending.length; index += 1) {
      const config = pending[index];
      mapPackState.completed = index + 1;
      renderMapPackPreview();
      setStatus(`Đang tạo map ${index + 1}/${pending.length} · ${config.name}`, "");
      await new Promise((resolve) => requestAnimationFrame(resolve));
      try {
        applySampleMapTemplate(config);
        generateMap();
        editor.npcs = createSampleMapNpcs(config, editor.spawnX, editor.spawnY, editor.width, editor.height);
        drawMap();
        const payload = mapPayload();
        const response = await adminFetch(API.BASE + API.PATHS.admin.worlds, {
          method: "POST",
          headers: adminHeaders(true),
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
          if (response.status === 409) {
            skipped += 1;
            mapPackState.conflictedCodes.add(config.code);
            editor.knownMaps.add(config.code);
            continue;
          }
          mapPackState.failedCodes.add(config.code);
          failures.push(`${config.name}: ${data.error || `HTTP ${response.status}`}`);
          if ([401, 403, 503].includes(response.status)) break;
          continue;
        }
        saved += 1;
        mapPackState.savedCodes.add(data.code || config.code);
        editor.knownMaps.add(data.code || config.code);
      } catch (error) {
        mapPackState.failedCodes.add(config.code);
        failures.push(`${config.name}: ${error.message || "không lưu được"}`);
      }
    }
  } finally {
    mapPackState.busy = false;
    try {
      restoreMapPackEditorState(snapshot);
    } finally {
      lockMapEditorForBatch(false);
    }
    try {
      await refreshMapList(snapshot.selectedMap);
    } catch (error) {
      failures.push(`Không tải lại được danh sách map: ${error.message || "lỗi kết nối"}`);
    }
  }
  mapPackState.completed = saved + skipped + mapPackState.failedCodes.size;
  const failureText = failures.length ? ` · ${failures.length} lỗi` : "";
  mapPackState.outcome = `Đã lưu ${saved} map nháp vào MySQL${skipped ? ` · bỏ qua ${skipped} mã trùng` : ""}${failureText}.`;
  renderMapPackPreview();
  setStatus(mapPackState.outcome, failures.length ? "error" : "ok");
}

for (const id of ["tree-density", "mountain-density", "river-width", "brush-size"]) {
  $(id).addEventListener("input", () => { editor.brush = Number($("brush-size").value); updateRangeLabels(); });
}
$("zoom").addEventListener("input", layoutCanvas);
$("fit-map").addEventListener("click", () => {
  $("zoom").value = "1";
  layoutCanvas();
  $("canvas-scroll").scrollTo(0, 0);
});
if (typeof ResizeObserver === "function") {
  const observer = new ResizeObserver(layoutCanvas);
  observer.observe($("canvas-scroll"));
} else {
  window.addEventListener("resize", layoutCanvas);
}
$("back-to-admin").addEventListener("click", (event) => {
  if (editor.dirty && !window.confirm("Map có thay đổi chưa lưu. Quay về trang quản lý Admin?")) event.preventDefault();
});
$("show-grid").addEventListener("change", drawMap);
$("map-name").addEventListener("input", () => { $("stage-name").textContent = $("map-name").value; });
$("generate-map").addEventListener("click", () => {
  const replacingSavedMap = Boolean(editor.currentCode);
  if ((!editor.dirty && !replacingSavedMap) || window.confirm("Sinh địa hình mới sẽ thay toàn bộ địa hình map đang mở. Tiếp tục?")) generateMap();
});
$("load-map").addEventListener("click", () => loadMap().catch((error) => setStatus(error.message, "error")));
$("save-map").addEventListener("click", () => saveMap().catch((error) => setStatus(error.message, "error")));
$("preview-map-pack").addEventListener("click", () => void previewMapPack().catch((error) => {
  mapPackState.configs = [];
  mapPackState.previewing = false;
  mapPackState.needsPreview = true;
  mapPackState.outcome = "";
  $("map-pack-preview").hidden = false;
  $("map-pack-status").textContent = error.message || "Không tạo được bản xem trước.";
  $("map-pack-status").className = "validation-result error";
  $("map-pack-list").innerHTML = "";
  $("save-map-pack").disabled = true;
  $("preview-map-pack").disabled = false;
  $("map-pack-count").disabled = false;
  $("sample-map-panel").setAttribute("aria-busy", "false");
}));
$("save-map-pack").addEventListener("click", () => void saveSampleMapPack().catch((error) => setStatus(error.message || "Không lưu được bộ map mẫu.", "error")));
$("map-pack-count").addEventListener("input", () => {
  if (mapPackState.busy || !mapPackState.configs.length) return;
  mapPackState.needsPreview = true;
  mapPackState.outcome = "Số lượng đã đổi. Hãy tạo lại bản xem trước trước khi lưu.";
  renderMapPackPreview();
});
$("new-portal").addEventListener("click", resetPortalForm);
$("save-portal").addEventListener("click", () => savePortalLink().catch((error) => setStatus(error.message, "error")));
$("delete-portal").addEventListener("click", () => deletePortal().catch((error) => setStatus(error.message, "error")));
$("new-monster-pack").addEventListener("click", resetMonsterPackForm);
for (const id of ["monster-center-x", "monster-center-y"]) $(id).addEventListener("input", () => { editor.dirty = true; requestDraw(); });
$("save-monster-pack").addEventListener("click", () => { try { saveMonsterPack(); } catch (error) { setStatus(error.message, "error"); } });
$("delete-monster-pack").addEventListener("click", deleteMonsterPack);
$("new-npc").addEventListener("click", () => {
  resetNpcForm();
  $("layer-tabs").querySelector('[data-layer="npc"]').click();
});
$("save-npc").addEventListener("click", () => { void saveNpc().catch((error) => setStatus(error.message, "error")); });
for (const id of ["npc-x", "npc-y"]) $(id).addEventListener("input", () => { editor.dirty = true; requestDraw(); });
$("npc-type").addEventListener("change", syncNpcShopCategory);
for (const id of ["npc-name", "npc-id", "npc-role", "npc-type", "npc-shop-category", "npc-gender", "npc-color", "npc-dialog", "npc-enabled"]) {
  $(id).addEventListener("input", () => { editor.dirty = true; });
  $(id).addEventListener("change", () => { editor.dirty = true; });
}
for (const id of ["map-name", "map-code", "map-type", "map-biome", "map-width", "map-height", "map-seed", "map-region", "map-tier", "realm-min", "realm-max", "map-tags", "rule-safe-zone", "rule-no-monsters", "rule-allow-recall"]) {
  $(id).addEventListener("input", () => { editor.dirty = true; });
  $(id).addEventListener("change", () => { editor.dirty = true; });
}
$("validate-map").addEventListener("click", () => validateMap().catch((error) => setStatus(error.message, "error")));
$("publish-map").addEventListener("click", () => publishMap().catch((error) => setStatus(error.message, "error")));
$("rule-safe-zone").addEventListener("change", () => { if ($("rule-safe-zone").checked) $("rule-no-monsters").checked = true; });
$("portal-target-map").addEventListener("change", () => {
  const target = editor.mapCatalog.get($("portal-target-map").value);
  if (!target) return;
  $("portal-target-x").value = Number(target.spawnX ?? Math.floor(target.w / 2));
  $("portal-target-y").value = Number(target.spawnY ?? Math.floor(target.h / 2));
  if (!$("portal-label").value) $("portal-label").value = target.tenMap || target.code;
});
$("layer-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-layer]");
  if (!button) return;
  editor.layer = button.dataset.layer;
  for (const item of $("layer-tabs").querySelectorAll("button")) item.classList.toggle("active", item === button);
  renderPalette();
  requestDraw();
  if (editor.layer === "npc") $("npc-panel").scrollIntoView({ block: "nearest" });
});
let touchTap = null;
canvas.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  canvas.setPointerCapture(event.pointerId);
  if (event.pointerType === "touch") {
    touchTap = { id: event.pointerId, x: event.clientX, y: event.clientY };
    return;
  }
  editor.painting = true;
  const tile = pointerTile(event);
  paintAt(tile.x, tile.y);
});
canvas.addEventListener("pointermove", (event) => {
  if (!event.isPrimary) return;
  if (touchTap?.id === event.pointerId && Math.hypot(event.clientX - touchTap.x, event.clientY - touchTap.y) > 8) touchTap = null;
  const tile = pointerTile(event);
  $("cursor-info").textContent = `x: ${tile.x} · y: ${tile.y}`;
  if (editor.painting && tile.x >= 0 && tile.y >= 0 && tile.x < editor.width && tile.y < editor.height) paintAt(tile.x, tile.y);
});
function stopPainting(event) {
  if (!event.isPrimary) return;
  editor.painting = false;
  touchTap = null;
}
canvas.addEventListener("pointerup", (event) => {
  if (touchTap?.id === event.pointerId && Math.hypot(event.clientX - touchTap.x, event.clientY - touchTap.y) <= 8) {
    const tile = pointerTile(event);
    paintAt(tile.x, tile.y);
  }
  stopPainting(event);
});
canvas.addEventListener("pointercancel", stopPainting);
canvas.addEventListener("lostpointercapture", stopPainting);

updateRangeLabels();
renderPalette();
loadPreviewAutotileAtlas();
generateMap();
editor.dirty = false;
async function initializeMapEditorData() {
  await refreshMapList();
  const query = new URLSearchParams(window.location.search);
  const focusPanel = ["#npc-panel", "#monster-panel"].includes(window.location.hash) ? window.location.hash : "";
  if (query.get("map")) await loadMap();
  else if ((focusPanel || query.has("monster")) && editor.mapCatalog.size) {
    $("map-list").value = editor.mapCatalog.keys().next().value;
    await loadMap();
  }
  await refreshMonsterCatalog();
  void refreshQuestOptions();
  if (new URLSearchParams(window.location.search).has("monster")) {
    $("layer-tabs").querySelector('[data-layer="monster"]').click();
    $("monster-template").scrollIntoView({ block: "nearest" });
  }
  if (focusPanel === "#npc-panel") $("npc-panel").scrollIntoView({ block: "start" });
  if (focusPanel === "#monster-panel") {
    $("layer-tabs").querySelector('[data-layer="monster"]').click();
    $("monster-panel").scrollIntoView({ block: "start" });
  }
}
function loadMapEditorAfterLogin() {
  void initializeMapEditorData().catch((error) => setStatus(`${error.message} · cần tài khoản GM/ADMIN`, "error"));
}
void AdminAuth.ready.then((authenticated) => { if (authenticated) loadMapEditorAfterLogin(); });
window.addEventListener("admin:authenticated", loadMapEditorAfterLogin);
