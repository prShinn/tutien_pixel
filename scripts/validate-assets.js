"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const assets = [
  ["public/assets/char_male_anim-source.png", 4, 4],
  ["public/assets/char_female_anim-source.png", 4, 4],
  ["public/assets/monsters/hoang_soi_sheet.png", 4, 4],
  ["public/assets/monsters/tho_heo_sheet.png", 4, 4],
  ["public/assets/monsters/doc_thao_sheet.png", 4, 4],
];
const errors = [];

for (const [relative, cols, rows] of assets) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    errors.push(`${relative}: missing`);
    continue;
  }
  const header = Buffer.alloc(24);
  const fd = fs.openSync(file, "r");
  fs.readSync(fd, header, 0, 24, 0);
  fs.closeSync(fd);
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (!width || !height || width < cols || height < rows) errors.push(`${relative}: ${width}x${height} is too small for ${cols}x${rows}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Assets valid: ${assets.length} character/monster sheets, 4x4 animation grid.`);
