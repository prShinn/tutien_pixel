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
};

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
  editor.monsterSpawns = [];
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
  setStatus("Đã sinh địa hình mới", "ok");
}

function resizeCanvas() {
  editor.zoom = Number($("zoom").value);
  canvas.width = editor.width * editor.zoom;
  canvas.height = editor.height * editor.zoom;
  $("map-info").textContent = `${editor.width} × ${editor.height}`;
  $("stage-name").textContent = $("map-name").value || "Map chưa đặt tên";
  drawMap();
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
let previewCanvas = null;
let scheduledDraw = 0;

function buildPreviewCache() {
  if (!previewCanvas) previewCanvas = document.createElement("canvas");
  previewCanvas.width = editor.width;
  previewCanvas.height = editor.height;
  const preview = previewCanvas.getContext("2d");
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
    host.innerHTML = `<p class="hint">${editor.layer === "portal" ? "Nhấp vào bản đồ để đặt portal nguồn." : "Nhấp vào bản đồ để đặt điểm xuất hiện."}</p>`;
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
  if (editor.layer === "monster") {
    $("monster-center-x").value = x;
    $("monster-center-y").value = y;
    const selected = editor.monsterSpawns.find((pack) => pack.packId === editor.selectedMonsterPackId);
    if (selected) { selected.centerX = x; selected.centerY = y; }
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

function adminHeaders(json = false) {
  return { "x-admin-key": $("admin-key").value, ...(json ? { "content-type": "application/json" } : {}) };
}

function refreshPortalTargets(selected = "") {
  const sourceCode = $("map-code").value.trim().toLowerCase();
  const maps = [...editor.mapCatalog.values()].filter((map) => map.code !== sourceCode);
  $("portal-target-map").innerHTML = '<option value="">Chọn map đích</option>'
    + maps.map((map) => `<option value="${map.code}">${map.tenMap} · ${map.w}×${map.h}</option>`).join("");
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
    button.textContent = `(${portal.x},${portal.y}) → ${target?.tenMap || portal.tenMapDen || portal.denMap}`;
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
  const response = await fetch(API.BASE + API.PATHS.admin.linkPortal, {
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
  const response = await fetch(API.BASE + API.PATHS.admin.portal(editor.currentCode, editor.selectedPortalId), {
    method: "DELETE",
    headers: adminHeaders(),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không xóa được portal");
  await loadMap();
  resetPortalForm();
  setStatus(`Đã xóa portal ${data.removed}`, "ok");
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
  $("monster-template").value = pack.templateId; $("monster-pack-id").value = pack.packId;
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
  const centerX = Number($("monster-center-x").value), centerY = Number($("monster-center-y").value);
  if (!templateId) throw new Error("Chưa chọn loại quái");
  if (![centerX, centerY].every(Number.isFinite)) throw new Error("Chọn bút Bãi quái và đặt tâm đàn trên map");
  const generatedId = `PACK_${templateId}_${editor.monsterSpawns.length + 1}`;
  const packId = ($("monster-pack-id").value.trim() || generatedId).toUpperCase().replace(/[^A-Z0-9_-]+/g, "_");
  const pack = { packId, templateId, centerX, centerY, count: Number($("monster-count").value), radius: Number($("monster-radius").value), aggroRange: Number($("monster-aggro").value), leashDistance: Number($("monster-leash").value), chaseDurationMs: Number($("monster-chase").value) };
  const oldId = editor.selectedMonsterPackId;
  if (editor.monsterSpawns.some((item) => item.packId === packId && item.packId !== oldId)) throw new Error("Mã đàn quái đã tồn tại");
  const index = editor.monsterSpawns.findIndex((item) => item.packId === oldId);
  if (index >= 0) editor.monsterSpawns[index] = pack; else editor.monsterSpawns.push(pack);
  editor.selectedMonsterPackId = packId; selectMonsterPack(packId);
  setStatus(`Đã cập nhật bãi quái ${packId}`, "ok");
}

function deleteMonsterPack() {
  editor.monsterSpawns = editor.monsterSpawns.filter((item) => item.packId !== editor.selectedMonsterPackId);
  resetMonsterPackForm();
}

async function refreshMonsterCatalog() {
  const response = await fetch(API.BASE + API.PATHS.data.monsters); const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không tải được ngân hàng quái");
  editor.monsterCatalog = Array.isArray(data) ? data : [];
  $("monster-template").innerHTML = editor.monsterCatalog.map((monster) => `<option value="${monster.id}">${monster.name} · cấp ${monster.level}</option>`).join("");
  renderMonsterPackList();
}

function renderValidation(validation) {
  const host = $("validation-result"), errors = validation?.errors || [], warnings = validation?.warnings || [];
  host.className = `validation-result hint ${errors.length ? "error" : "ok"}`;
  host.textContent = [...errors.map((text) => `Lỗi: ${text}`), ...warnings.map((text) => `Cảnh báo: ${text}`)].join("\n") || "Map hợp lệ, có thể xuất bản.";
}

async function validateMap() {
  if (!editor.currentCode) await saveMap();
  const response = await fetch(API.BASE + API.PATHS.admin.validateWorld(editor.currentCode), { headers: adminHeaders() });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "Không kiểm tra được map");
  renderValidation(data); return data;
}

async function publishMap() {
  await saveMap();
  const response = await fetch(API.BASE + API.PATHS.admin.publishWorld(editor.currentCode), { method: "POST", headers: adminHeaders() });
  const data = await response.json();
  if (!response.ok) { renderValidation(data.validation); throw new Error(data.error || "Không xuất bản được map"); }
  editor.status = "PUBLISHED"; $("publish-status").textContent = editor.status; $("publish-status").classList.add("published");
  renderValidation(data.validation); await refreshMapList(editor.currentCode); setStatus(`Đã xuất bản ${editor.currentCode}`, "ok");
}

async function refreshMapList(selected = "") {
  const response = await fetch(API.BASE + API.PATHS.admin.worlds, { headers: adminHeaders() });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không tải được danh sách map");
  editor.knownMaps = new Set(data.map((map) => map.code));
  editor.mapCatalog = new Map(data.map((map) => [map.code, map]));
  $("map-list").innerHTML = '<option value="">Map mới</option>' + data.map((map) => `<option value="${map.code}">[${map.status}] ${map.tenMap} · ${map.w}×${map.h}</option>`).join("");
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
  const code = $("map-list").value;
  if (!code) { generateMap(); return; }
  setStatus("Đang tải map…");
  const response = await fetch(API.BASE + API.PATHS.admin.world(code), { headers: adminHeaders() });
  const world = await response.json();
  if (!response.ok) throw new Error(world.error || "Không tải được map");
  editor.width = Number(world.w); editor.height = Number(world.h);
  editor.spawnX = Number(world.spawnX || 1); editor.spawnY = Number(world.spawnY || 1);
  editor.portals = world.portals || []; editor.monsters = world.monsters || [];
  editor.selectedPortalId = null;
  editor.monsterSpawns = world.monsterSpawns || []; editor.npcs = world.npcs || []; editor.rules = world.rules || {};
  editor.status = world.status || "PUBLISHED";
  editor.selectedMonsterPackId = null;
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
  renderMonsterPackList();
  renderValidation(world.validation);
  setStatus(`Đã mở ${world.tenMap || world.code}`, "ok");
}

async function saveMap() {
  const payload = mapPayload();
  const exists = editor.knownMaps.has(payload.code);
  const url = exists ? API.BASE + API.PATHS.admin.world(payload.code) : API.BASE + API.PATHS.admin.worlds;
  setStatus("Đang lưu lên server…");
  const response = await fetch(url, { method: exists ? "PUT" : "POST", headers: adminHeaders(true), body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không lưu được map");
  editor.currentCode = data.code;
  editor.status = data.status || editor.status;
  $("publish-status").textContent = editor.status;
  $("publish-status").classList.toggle("published", editor.status === "PUBLISHED");
  await refreshMapList(data.code);
  setStatus(`Đã lưu ${data.tenMap} · phiên bản ${data.version}`, "ok");
}

for (const id of ["tree-density", "mountain-density", "river-width", "brush-size"]) {
  $(id).addEventListener("input", () => { editor.brush = Number($("brush-size").value); updateRangeLabels(); });
}
$("zoom").addEventListener("input", resizeCanvas);
$("show-grid").addEventListener("change", drawMap);
$("map-name").addEventListener("input", () => { $("stage-name").textContent = $("map-name").value; });
$("generate-map").addEventListener("click", generateMap);
$("load-map").addEventListener("click", () => loadMap().catch((error) => setStatus(error.message, "error")));
$("save-map").addEventListener("click", () => saveMap().catch((error) => setStatus(error.message, "error")));
$("new-portal").addEventListener("click", resetPortalForm);
$("save-portal").addEventListener("click", () => savePortalLink().catch((error) => setStatus(error.message, "error")));
$("delete-portal").addEventListener("click", () => deletePortal().catch((error) => setStatus(error.message, "error")));
$("new-monster-pack").addEventListener("click", resetMonsterPackForm);
$("save-monster-pack").addEventListener("click", () => { try { saveMonsterPack(); } catch (error) { setStatus(error.message, "error"); } });
$("delete-monster-pack").addEventListener("click", deleteMonsterPack);
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
});
canvas.addEventListener("pointerdown", (event) => { editor.painting = true; canvas.setPointerCapture(event.pointerId); const tile = pointerTile(event); paintAt(tile.x, tile.y); });
canvas.addEventListener("pointermove", (event) => {
  const tile = pointerTile(event);
  $("cursor-info").textContent = `x: ${tile.x} · y: ${tile.y}`;
  if (editor.painting && tile.x >= 0 && tile.y >= 0 && tile.x < editor.width && tile.y < editor.height) paintAt(tile.x, tile.y);
});
canvas.addEventListener("pointerup", () => { editor.painting = false; });
canvas.addEventListener("pointercancel", () => { editor.painting = false; });

updateRangeLabels();
renderPalette();
generateMap();
refreshMapList().then(() => {
  if (new URLSearchParams(window.location.search).get("map")) return loadMap();
}).catch((error) => setStatus(`${error.message} · dùng key demo-admin`, "error"));
refreshMonsterCatalog().catch((error) => setStatus(error.message, "error"));
