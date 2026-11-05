"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SIZE = 8;
const VARIANTS = 4;
const TYPES = [0, 1, 2, 4, 7];
const PALETTES = {
  0: { base: "#3a7135", shade: "#2e5a2a", light: "#568a48", edge: "#b39a61", transition: "#746341", detail: "#a3bd6e" },
  1: { base: "#70737d", shade: "#51545f", light: "#90939c", edge: "#454852", transition: "#626570", detail: "#b6b5aa" },
  2: { base: "#24527b", shade: "#1a4167", light: "#39769b", edge: "#9bd1c5", transition: "#367394", detail: "#73b4c0" },
  4: { base: "#665234", shade: "#4c3e29", light: "#806941", edge: "#a58b5c", transition: "#79613d", detail: "#c0aa77" },
  7: { base: "#77613b", shade: "#5d4d32", light: "#968052", edge: "#594932", transition: "#74603e", detail: "#c4ad78" },
};
const DIRECTIONS = [
  { bit: 1, side: "north" }, { bit: 2, side: "east" },
  { bit: 4, side: "south" }, { bit: 8, side: "west" },
];
const CORNERS = [
  { sides: 1 | 8, diagonal: 128, x: 0, y: 0, dx: 1, dy: 1 },
  { sides: 1 | 2, diagonal: 16, x: 7, y: 0, dx: -1, dy: 1 },
  { sides: 2 | 4, diagonal: 32, x: 7, y: 7, dx: -1, dy: -1 },
  { sides: 4 | 8, diagonal: 64, x: 0, y: 7, dx: 1, dy: -1 },
];
const TEXTURES = {
  0: [
    [[1, 2, "shade"], [2, 2, "shade"], [2, 3, "light"], [5, 4, "detail"], [6, 4, "detail"]],
    [[4, 1, "shade"], [5, 1, "shade"], [4, 2, "light"], [1, 5, "detail"], [2, 5, "detail"]],
    [[2, 4, "shade"], [3, 4, "shade"], [3, 5, "light"], [5, 2, "detail"]],
    [[5, 5, "shade"], [4, 5, "shade"], [4, 4, "light"], [1, 2, "detail"], [2, 2, "detail"]],
  ],
  1: [
    [[1, 2, "shade"], [2, 2, "shade"], [5, 5, "light"], [6, 5, "light"]],
    [[4, 1, "shade"], [5, 1, "shade"], [1, 5, "light"], [2, 5, "light"]],
    [[2, 4, "shade"], [3, 4, "shade"], [5, 2, "detail"]],
    [[5, 5, "shade"], [6, 5, "shade"], [2, 2, "light"], [3, 2, "light"]],
  ],
  2: [
    [[1, 2, "shade"], [2, 2, "shade"], [3, 2, "light"], [5, 5, "light"], [6, 5, "light"]],
    [[2, 1, "light"], [3, 1, "light"], [4, 1, "shade"], [1, 5, "shade"], [2, 5, "light"]],
    [[4, 3, "shade"], [5, 3, "light"], [6, 3, "light"], [1, 6, "shade"], [2, 6, "light"]],
    [[1, 3, "shade"], [2, 3, "light"], [3, 3, "light"], [5, 6, "shade"], [6, 6, "light"]],
  ],
  4: [
    [[1, 2, "shade"], [2, 2, "shade"], [3, 3, "light"], [5, 5, "detail"]],
    [[4, 1, "shade"], [5, 1, "shade"], [4, 2, "light"], [1, 5, "detail"]],
    [[2, 4, "shade"], [3, 4, "shade"], [3, 5, "light"], [6, 2, "detail"]],
    [[5, 5, "shade"], [6, 5, "shade"], [4, 4, "light"], [1, 2, "detail"]],
  ],
  7: [
    [[3, 1, "shade"], [3, 2, "shade"], [4, 2, "light"], [1, 5, "detail"]],
    [[1, 3, "shade"], [2, 3, "shade"], [2, 4, "light"], [6, 1, "detail"]],
    [[5, 4, "shade"], [5, 5, "shade"], [4, 5, "light"], [1, 1, "detail"]],
    [[2, 5, "shade"], [3, 5, "shade"], [3, 4, "light"], [6, 2, "detail"]],
  ],
};

function normalizeMask(mask) {
  const north = Boolean(mask & 1), east = Boolean(mask & 2);
  const south = Boolean(mask & 4), west = Boolean(mask & 8);
  if (!(north && east)) mask &= ~16;
  if (!(east && south)) mask &= ~32;
  if (!(south && west)) mask &= ~64;
  if (!(west && north)) mask &= ~128;
  return mask;
}

const MASKS = Array.from({ length: 256 }, (_, mask) => mask)
  .filter((mask) => normalizeMask(mask) === mask);
if (MASKS.length !== 47) throw new Error(`Expected 47 valid masks, received ${MASKS.length}`);

function hash(x, y, seed) {
  return (Math.imul(x + 31, 73856093) ^ Math.imul(y + 17, 19349663) ^ Math.imul(seed + 7, 83492791)) >>> 0;
}

function makeTile(type, mask, maskIndex, variant) {
  const colors = PALETTES[type];
  const pixels = Array.from({ length: SIZE }, () => Array(SIZE).fill(colors.base));
  const put = (x, y, color) => {
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) pixels[y][x] = colors[color] || color;
  };

  const texture = TEXTURES[type][variant];
  const shiftX = maskIndex % 3;
  const shiftY = Math.floor(maskIndex / 3) % 3;
  for (const [x, y, color] of texture) put(1 + ((x + shiftX) % 6), 1 + ((y + shiftY) % 6), color);

  for (const { bit, side } of DIRECTIONS) {
    if (mask & bit) continue;
    const phase = (maskIndex + variant * 3 + type) % 8;
    for (let i = 0; i < SIZE; i += 1) {
      const h = hash(i + phase, maskIndex + variant, type);
      const recess = h % 6 === 0 ? 1 : 0;
      let x = i, y = i;
      if (side === "north") y = recess;
      if (side === "east") x = SIZE - 1 - recess;
      if (side === "south") y = SIZE - 1 - recess;
      if (side === "west") x = recess;
      put(x, y, "edge");

      const innerDepth = type === 2 ? 1 : (h % 3 === 0 ? 2 : 1);
      if (side === "north") y = Math.min(SIZE - 1, recess + innerDepth);
      if (side === "east") x = Math.max(0, SIZE - 1 - recess - innerDepth);
      if (side === "south") y = Math.max(0, SIZE - 1 - recess - innerDepth);
      if (side === "west") x = Math.min(SIZE - 1, recess + innerDepth);
      if (type === 2 && (i + phase) % 4 === 0) put(x, y, "light");
      else if (type !== 2 && h % 4 === 0) put(x, y, "transition");
    }
  }

  for (const corner of CORNERS) {
    if ((mask & corner.sides) !== corner.sides || mask & corner.diagonal) continue;
    put(corner.x, corner.y, "edge");
    put(corner.x + corner.dx, corner.y, "transition");
    put(corner.x, corner.y + corner.dy, type === 2 ? "light" : "transition");
  }

  const runsByColor = new Map();
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE;) {
      const color = pixels[y][x];
      let end = x + 1;
      while (end < SIZE && pixels[y][end] === color) end += 1;
      if (color !== colors.base) {
        if (!runsByColor.has(color)) runsByColor.set(color, []);
        runsByColor.get(color).push(`M${x} ${y}h${end - x}v1h-${end - x}z`);
      }
      x = end;
    }
  }
  const paths = [...runsByColor]
    .map(([color, commands]) => `<path fill="${color}" d="${commands.join("")}"/>`)
    .join("");
  return `<rect width="${SIZE}" height="${SIZE}" fill="${colors.base}"/>${paths}`;
}

function generateSvg() {
  const columns = MASKS.length * VARIANTS;
  const width = columns * SIZE;
  const height = TYPES.length * SIZE;
  const sprites = [];
  for (let row = 0; row < TYPES.length; row += 1) {
    const type = TYPES[row];
    for (let maskIndex = 0; maskIndex < MASKS.length; maskIndex += 1) {
      for (let variant = 0; variant < VARIANTS; variant += 1) {
        const x = (maskIndex * VARIANTS + variant) * SIZE;
        const y = row * SIZE;
        sprites.push(`<g transform="translate(${x} ${y})">${makeTile(type, MASKS[maskIndex], maskIndex, variant)}</g>`);
      }
    }
  }
  return [
    `<!-- Generated by scripts/generate-autotile-atlas.js. Rows: ${TYPES.join(", ")}; ${MASKS.length} masks × ${VARIANTS} variants; 8px cells. -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`,
    sprites.join(""),
    "</svg>",
  ].join("\n");
}

const output = path.join(__dirname, "..", "public", "assets", "tilesets", "temperate-47.svg");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, generateSvg(), "utf8");
process.stdout.write(`Wrote ${output} (${MASKS.length} masks × ${VARIANTS} variants × ${TYPES.length} ground types).\n`);
