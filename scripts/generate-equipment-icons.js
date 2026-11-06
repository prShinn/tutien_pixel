"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ── CRC32 & PNG Chunk Helpers ─────────────────────────────────────────────
function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, pixelMatrix) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const ihdrChunk = makeChunk("IHDR", ihdr);

  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelMatrix[y][x] || [0, 0, 0, 0];
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const idatData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk("IDAT", idatData);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

// ── Color Utilities ───────────────────────────────────────────────────────
function parseHex(hex, alpha = 255) {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  if (clean.length === 6) {
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255, alpha];
  } else if (clean.length === 8) {
    return [(num >> 24) & 255, (num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  return [0, 0, 0, alpha];
}

function blend(c1, c2, factor) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * factor),
    Math.round(c1[1] + (c2[1] - c1[1]) * factor),
    Math.round(c1[2] + (c2[2] - c1[2]) * factor),
    Math.round(c1[3] + (c2[3] - c1[3]) * factor),
  ];
}

// ── Drawing Buffer ────────────────────────────────────────────────────────
class PixelCanvas {
  constructor(w = 32, h = 32) {
    this.w = w;
    this.h = h;
    this.grid = Array.from({ length: h }, () => Array.from({ length: w }, () => [0, 0, 0, 0]));
  }
  set(x, y, color) {
    if (x >= 0 && x < this.w && y >= 0 && y < this.h) {
      if (color[3] === 255) {
        this.grid[y][x] = color;
      } else if (color[3] > 0) {
        const dst = this.grid[y][x];
        const a = color[3] / 255;
        this.grid[y][x] = [
          Math.round(color[0] * a + dst[0] * (1 - a)),
          Math.round(color[1] * a + dst[1] * (1 - a)),
          Math.round(color[2] * a + dst[2] * (1 - a)),
          Math.min(255, Math.round(dst[3] + color[3] * (1 - dst[3] / 255))),
        ];
      }
    }
  }
  rect(x, y, w, h, color) {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.set(x + dx, y + dy, color);
  }
  line(x0, y0, x1, y1, color) {
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    while (true) {
      this.set(x, y, color);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  circle(cx, cy, r, color, fill = true) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y);
        if (fill ? d <= r : Math.abs(d - r) < 0.8) this.set(cx + x, cy + y, color);
      }
    }
  }
  toBuffer() {
    return encodePng(this.w, this.h, this.grid);
  }
}

// ── Palette Configurations per Root ───────────────────────────────────────
const PALETTES = {
  KIM: {
    outline: parseHex("#1a1e24"),
    base: parseHex("#d5dde5"),
    highlight: parseHex("#ffffff"),
    shadow: parseHex("#717b88"),
    accent: parseHex("#facc15"), // Gold accent
    aura: parseHex("#fef08a", 80),
  },
  MOC: {
    outline: parseHex("#142416"),
    base: parseHex("#34d399"),
    highlight: parseHex("#a7f3d0"),
    shadow: parseHex("#065f46"),
    accent: parseHex("#bbf7d0"),
    wood: parseHex("#854d0e"),
    aura: parseHex("#4ade80", 80),
  },
  THUY: {
    outline: parseHex("#0f1d33"),
    base: parseHex("#38bdf8"),
    highlight: parseHex("#e0f2fe"),
    shadow: parseHex("#0369a1"),
    accent: parseHex("#bae6fd"),
    ice: parseHex("#cffafe"),
    aura: parseHex("#38bdf8", 85),
  },
  HOA: {
    outline: parseHex("#2b0e0e"),
    base: parseHex("#f97316"),
    highlight: parseHex("#fef08a"),
    shadow: parseHex("#991b1b"),
    accent: parseHex("#ef4444"),
    aura: parseHex("#f97316", 90),
  },
  THO: {
    outline: parseHex("#241c14"),
    base: parseHex("#b45309"),
    highlight: parseHex("#fef3c7"),
    shadow: parseHex("#593108"),
    accent: parseHex("#d97706"),
    stone: parseHex("#78716c"),
    aura: parseHex("#d97706", 80),
  },
  QUANG: {
    outline: parseHex("#262208"),
    base: parseHex("#eab308"),
    highlight: parseHex("#ffffff"),
    shadow: parseHex("#854d0e"),
    accent: parseHex("#fef9c3"),
    aura: parseHex("#fde047", 100),
  },
  AM: {
    outline: parseHex("#170924"),
    base: parseHex("#7c3aed"),
    highlight: parseHex("#e9d5ff"),
    shadow: parseHex("#3b0764"),
    accent: parseHex("#c084fc"),
    aura: parseHex("#9333ea", 90),
  },
  PHONG: {
    outline: parseHex("#0a2622"),
    base: parseHex("#2dd4bf"),
    highlight: parseHex("#ccfbf1"),
    shadow: parseHex("#115e59"),
    accent: parseHex("#5eead4"),
    aura: parseHex("#14b8a6", 80),
  },
  LOI: {
    outline: parseHex("#1a153b"),
    base: parseHex("#818cf8"),
    highlight: parseHex("#ffffff"),
    shadow: parseHex("#3730a3"),
    accent: parseHex("#38bdf8"),
    spark: parseHex("#fde047"),
    aura: parseHex("#6366f1", 95),
  },
  COMMON: {
    outline: parseHex("#1f242d"),
    base: parseHex("#94a3b8"),
    highlight: parseHex("#f8fafc"),
    shadow: parseHex("#475569"),
    accent: parseHex("#60a5fa"),
    leather: parseHex("#78350f"),
    aura: parseHex("#cbd5e1", 60),
  },
  WOOD: {
    outline: parseHex("#22150c"),
    base: parseHex("#b45309"),
    highlight: parseHex("#fed7aa"),
    shadow: parseHex("#7c2d12"),
    accent: parseHex("#d97706"),
    aura: parseHex("#fdba74", 50),
  },
  IRON: {
    outline: parseHex("#111827"),
    base: parseHex("#6b7280"),
    highlight: parseHex("#f3f4f6"),
    shadow: parseHex("#374151"),
    accent: parseHex("#9ca3af"),
    leather: parseHex("#78350f"),
    aura: parseHex("#9ca3af", 50),
  },
};

// ── Pixel Art Generators for Item Types ────────────────────────────────────

function drawSword(pal) {
  const c = new PixelCanvas(32, 32);
  // Aura glow
  c.line(10, 22, 22, 10, pal.aura);
  c.line(9, 21, 21, 9, pal.aura);
  c.line(11, 23, 23, 11, pal.aura);

  // Blade edge & tip
  c.set(24, 7, pal.outline);
  c.set(25, 6, pal.highlight); // Sharp tip
  c.set(24, 6, pal.outline);
  c.set(25, 7, pal.outline);

  // Blade body (diagonal from top-right 23,8 down to 13,18)
  for (let i = 0; i <= 10; i++) {
    const x = 23 - i;
    const y = 8 + i;
    c.set(x + 1, y, pal.outline);
    c.set(x, y - 1, pal.outline);
    c.set(x, y, pal.highlight); // Center ridge highlight
    c.set(x - 1, y, pal.base);
    c.set(x, y + 1, pal.shadow);
    c.set(x - 1, y + 1, pal.outline);
  }

  // Crossguard (perpendicular to blade at 12,19)
  const gOutline = pal.outline;
  const gColor = pal.accent || pal.base;
  c.rect(8, 17, 3, 2, gOutline);
  c.set(9, 18, gColor);
  c.rect(13, 22, 2, 3, gOutline);
  c.set(14, 23, gColor);
  c.rect(10, 19, 4, 4, gOutline);
  c.rect(11, 20, 2, 2, pal.accent || pal.highlight); // Guard center gem

  // Hilt / Handle (10,21 down to 7,24)
  for (let i = 1; i <= 3; i++) {
    const hx = 11 - i;
    const hy = 20 + i;
    c.set(hx + 1, hy, gOutline);
    c.set(hx, hy, pal.wood || pal.shadow);
    c.set(hx - 1, hy, gOutline);
  }

  // Pommel
  c.rect(6, 24, 3, 3, gOutline);
  c.set(7, 25, pal.accent || pal.highlight);
  return c.toBuffer();
}

function drawBlade(pal) {
  const c = new PixelCanvas(32, 32);
  // Curved Dao / Blade
  c.line(10, 22, 21, 11, pal.aura);
  // Curve back spine
  for (let i = 0; i <= 12; i++) {
    const x = 24 - Math.floor(i * 1.1);
    const y = 6 + i;
    c.set(x, y, pal.outline);
    c.set(x - 1, y, pal.shadow);
    c.set(x - 2, y, pal.base);
    c.set(x - 3, y, pal.highlight); // Sharp curved cutting edge
    c.set(x - 4, y, pal.outline);
  }
  // Dao Tip curve
  c.rect(22, 5, 3, 2, pal.outline);
  c.set(23, 6, pal.highlight);

  // Guard
  c.rect(10, 18, 5, 3, pal.outline);
  c.set(12, 19, pal.accent || pal.highlight);

  // Grip
  c.line(10, 21, 7, 24, pal.shadow);
  c.line(11, 21, 8, 24, pal.wood || pal.base);
  c.line(9, 21, 6, 24, pal.outline);
  c.line(12, 21, 9, 24, pal.outline);

  // Red tassel / ring
  c.circle(6, 26, 2, pal.accent || pal.outline, false);
  c.set(5, 27, pal.accent || pal.highlight);
  return c.toBuffer();
}

function drawStaff(pal) {
  const c = new PixelCanvas(32, 32);
  // Shaft diagonal
  for (let i = 0; i < 20; i++) {
    const x = 20 - i;
    const y = 10 + i;
    c.set(x - 1, y, pal.outline);
    c.set(x, y, pal.wood || pal.shadow);
    c.set(x + 1, y, pal.outline);
  }
  // Metallic bands on shaft
  c.set(16, 14, pal.accent);
  c.set(12, 18, pal.accent);
  c.set(8, 22, pal.accent);

  // Orb / Crystal head
  const ox = 22, oy = 8;
  c.circle(ox, oy, 6, pal.aura);
  c.circle(ox, oy, 4, pal.outline, false);
  c.circle(ox, oy, 3, pal.base, true);
  c.circle(ox - 1, oy - 1, 1, pal.highlight, true);

  // Lotus prongs / Crown holding the crystal
  c.set(ox - 3, oy + 2, pal.outline);
  c.set(ox - 2, oy + 3, pal.accent);
  c.set(ox + 3, oy - 2, pal.outline);
  c.set(ox + 2, oy - 3, pal.accent);
  c.set(ox - 1, oy + 4, pal.accent);
  return c.toBuffer();
}

function drawMace(pal) {
  const c = new PixelCanvas(32, 32);
  // Handle
  for (let i = 0; i < 16; i++) {
    const x = 18 - i;
    const y = 14 + i;
    c.set(x - 1, y, pal.outline);
    c.set(x, y, pal.shadow);
    c.set(x + 1, y, pal.outline);
  }
  // Mace head (heavy stone/iron block at 21,11)
  const hx = 21, hy = 11;
  c.circle(hx, hy, 6, pal.aura);
  c.rect(hx - 4, hy - 4, 9, 9, pal.outline);
  c.rect(hx - 3, hy - 3, 7, 7, pal.stone || pal.shadow);
  c.rect(hx - 2, hy - 2, 5, 5, pal.base);
  c.set(hx - 1, hy - 1, pal.highlight);
  // Spikes
  c.set(hx, hy - 5, pal.accent);
  c.set(hx + 5, hy, pal.accent);
  c.set(hx, hy + 5, pal.accent);
  c.set(hx - 5, hy, pal.accent);
  return c.toBuffer();
}

function drawArmor(pal) {
  const c = new PixelCanvas(32, 32);
  // Aura
  c.rect(7, 7, 18, 18, pal.aura);

  // Shoulders / Pauldrons
  c.rect(6, 9, 6, 5, pal.outline);
  c.rect(7, 10, 4, 3, pal.shadow);
  c.set(8, 10, pal.highlight);

  c.rect(20, 9, 6, 5, pal.outline);
  c.rect(21, 10, 4, 3, pal.shadow);
  c.set(22, 10, pal.highlight);

  // Neck collar
  c.rect(13, 8, 6, 3, pal.outline);
  c.set(15, 9, pal.accent);
  c.set(16, 9, pal.accent);

  // Chest plate body
  c.rect(9, 11, 14, 11, pal.outline);
  c.rect(10, 12, 12, 9, pal.base);

  // Core Crest / Elemental Core Gem
  c.circle(16, 15, 2, pal.accent);
  c.set(15, 14, pal.highlight);

  // Abdominal rib plates
  c.line(11, 18, 20, 18, pal.shadow);
  c.line(11, 20, 20, 20, pal.shadow);

  // Belt / Fauld bottom
  c.rect(10, 21, 12, 4, pal.outline);
  c.rect(11, 22, 10, 2, pal.accent);
  c.set(15, 22, pal.highlight);
  c.set(16, 22, pal.highlight);

  // Robe trim/skirt
  c.rect(11, 24, 10, 3, pal.shadow);
  c.rect(10, 26, 12, 1, pal.outline);
  return c.toBuffer();
}

function drawHat(pal) {
  const c = new PixelCanvas(32, 32);
  // Helmet / Crown / Hat
  c.rect(8, 9, 16, 16, pal.aura);

  // Plume or crest top
  c.rect(14, 7, 4, 3, pal.outline);
  c.set(15, 8, pal.accent);
  c.set(16, 8, pal.highlight);

  // Dome / Crown
  c.rect(10, 10, 12, 7, pal.outline);
  c.rect(11, 11, 10, 5, pal.base);
  c.rect(12, 11, 4, 2, pal.highlight);

  // Center crest gem
  c.rect(14, 13, 4, 4, pal.outline);
  c.set(15, 14, pal.accent);
  c.set(16, 14, pal.highlight);

  // Brim / Cheek guards
  c.rect(8, 17, 16, 3, pal.outline);
  c.rect(9, 18, 14, 1, pal.shadow);
  c.rect(9, 19, 3, 5, pal.outline);
  c.rect(10, 19, 2, 4, pal.base);
  c.rect(20, 19, 3, 5, pal.outline);
  c.rect(20, 19, 2, 4, pal.base);
  return c.toBuffer();
}

function drawRing(pal) {
  const c = new PixelCanvas(32, 32);
  // Aura around the ring
  c.circle(16, 16, 10, pal.aura);

  // Ring band (golden / metal loop)
  c.circle(16, 17, 7, pal.outline, false);
  c.circle(16, 17, 6, pal.base, false);
  c.circle(16, 17, 5, pal.shadow, false);
  c.circle(16, 17, 4, pal.outline, false);
  // Clear ring inside hole
  for (let y = 14; y <= 20; y++) {
    for (let x = 13; x <= 19; x++) {
      if (Math.hypot(x - 16, y - 17) < 3.8) c.set(x, y, [0, 0, 0, 0]);
    }
  }

  // Gem setting on top (center 16, 10)
  c.rect(12, 8, 8, 8, pal.outline);
  c.rect(13, 9, 6, 6, pal.accent);
  c.rect(14, 10, 4, 4, pal.highlight);
  c.set(15, 11, [255, 255, 255, 255]); // Sparkle glint
  // Setting prongs
  c.set(12, 8, pal.outline);
  c.set(19, 8, pal.outline);
  c.set(12, 15, pal.outline);
  c.set(19, 15, pal.outline);
  return c.toBuffer();
}

function drawBoots(pal) {
  const c = new PixelCanvas(32, 32);
  c.rect(7, 8, 18, 18, pal.aura);

  // Left boot
  c.rect(8, 10, 6, 9, pal.outline);
  c.rect(9, 11, 4, 7, pal.base);
  c.set(10, 11, pal.highlight);
  // Left foot forward
  c.rect(6, 19, 9, 5, pal.outline);
  c.rect(7, 20, 7, 3, pal.shadow);
  c.rect(5, 22, 9, 2, pal.accent); // Sole

  // Right boot
  c.rect(17, 10, 6, 9, pal.outline);
  c.rect(18, 11, 4, 7, pal.base);
  c.set(19, 11, pal.highlight);
  // Right foot forward
  c.rect(17, 19, 9, 5, pal.outline);
  c.rect(18, 20, 7, 3, pal.shadow);
  c.rect(17, 22, 9, 2, pal.accent); // Sole

  // Wings / trim on side
  c.set(7, 12, pal.highlight);
  c.set(6, 13, pal.highlight);
  c.set(24, 12, pal.highlight);
  c.set(25, 13, pal.highlight);
  return c.toBuffer();
}

function drawBelt(pal) {
  const c = new PixelCanvas(32, 32);
  c.rect(5, 11, 22, 10, pal.aura);

  // Belt strap horizontal
  c.rect(5, 13, 22, 6, pal.outline);
  c.rect(6, 14, 20, 4, pal.leather || pal.shadow);
  c.line(6, 14, 25, 14, pal.highlight);

  // Center buckle
  c.rect(12, 11, 8, 10, pal.outline);
  c.rect(13, 12, 6, 8, pal.accent);
  c.rect(14, 13, 4, 6, pal.base);
  c.set(15, 15, pal.highlight);
  c.set(16, 15, pal.highlight);

  // Hanging strap / sash
  c.rect(14, 20, 4, 7, pal.outline);
  c.rect(15, 20, 2, 6, pal.accent);
  c.set(15, 26, pal.highlight);
  return c.toBuffer();
}

function drawAmulet(pal) {
  const c = new PixelCanvas(32, 32);
  c.circle(16, 18, 9, pal.aura);

  // Cord / Chain hanging from top
  c.line(10, 6, 15, 14, pal.outline);
  c.line(21, 6, 16, 14, pal.outline);
  c.line(11, 6, 15, 13, pal.highlight);
  c.line(20, 6, 16, 13, pal.highlight);

  // Medallion outer frame
  c.circle(16, 18, 6, pal.outline, false);
  c.circle(16, 18, 5, pal.accent, true);
  // Center carved jade / elemental symbol
  c.circle(16, 18, 3, pal.base, true);
  c.set(15, 17, pal.highlight);

  // Tassel bottom
  c.rect(15, 24, 2, 4, pal.outline);
  c.set(15, 25, pal.accent);
  c.set(16, 26, pal.accent);
  c.set(15, 27, pal.highlight);
  return c.toBuffer();
}

function drawPants(pal) {
  const c = new PixelCanvas(32, 32);
  c.rect(8, 8, 16, 18, pal.aura);

  // Waistband
  c.rect(9, 8, 14, 3, pal.outline);
  c.rect(10, 9, 12, 1, pal.accent);

  // Upper hip
  c.rect(9, 11, 14, 5, pal.outline);
  c.rect(10, 12, 12, 3, pal.base);

  // Left leg
  c.rect(9, 16, 6, 10, pal.outline);
  c.rect(10, 16, 4, 9, pal.shadow);
  c.line(10, 16, 10, 24, pal.highlight);

  // Right leg
  c.rect(17, 16, 6, 10, pal.outline);
  c.rect(18, 16, 4, 9, pal.shadow);
  c.line(18, 16, 18, 24, pal.highlight);

  // Knee guards
  c.rect(10, 19, 4, 3, pal.accent);
  c.rect(18, 19, 4, 3, pal.accent);
  return c.toBuffer();
}

// ── Item Definitions Mapping ───────────────────────────────────────────────
const ICONS_CONFIG = [
  // ── KIM ──
  { file: "kim_thiet_kiem.png", gen: () => drawSword(PALETTES.KIM) },
  { file: "kim_bach_kim_kiem.png", gen: () => drawSword({ ...PALETTES.KIM, base: parseHex("#ffffff"), accent: parseHex("#38bdf8") }) },
  { file: "kim_thiet_giap.png", gen: () => drawArmor(PALETTES.KIM) },
  { file: "kim_bach_kim_giap.png", gen: () => drawArmor({ ...PALETTES.KIM, base: parseHex("#ffffff"), accent: parseHex("#60a5fa") }) },
  { file: "kim_thiet_mu.png", gen: () => drawHat(PALETTES.KIM) },
  { file: "kim_kim_nhan.png", gen: () => drawRing(PALETTES.KIM) },
  { file: "kim_kim_hai.png", gen: () => drawBoots(PALETTES.KIM) },

  // ── MOC ──
  { file: "moc_con_mu_linh.png", gen: () => drawStaff({ ...PALETTES.MOC, wood: parseHex("#78350f") }) },
  { file: "moc_ngoc_truc_truong.png", gen: () => drawStaff(PALETTES.MOC) },
  { file: "moc_linh_moc_ao.png", gen: () => drawArmor(PALETTES.MOC) },
  { file: "moc_sinh_moc_bao.png", gen: () => drawArmor({ ...PALETTES.MOC, base: parseHex("#10b981"), accent: parseHex("#facc15") }) },
  { file: "moc_lien_hoa_mu.png", gen: () => drawHat(PALETTES.MOC) },
  { file: "moc_re_linh_nhan.png", gen: () => drawRing(PALETTES.MOC) },
  { file: "moc_co_linh_dai.png", gen: () => drawBelt(PALETTES.MOC) },

  // ── THUY ──
  { file: "thuy_thuy_long_truong.png", gen: () => drawStaff(PALETTES.THUY) },
  { file: "thuy_hai_trieu_kiem.png", gen: () => drawSword(PALETTES.THUY) },
  { file: "thuy_bang_ha_ao.png", gen: () => drawArmor(PALETTES.THUY) },
  { file: "thuy_hai_vuong_bao.png", gen: () => drawArmor({ ...PALETTES.THUY, base: parseHex("#0284c7"), accent: parseHex("#e0f2fe") }) },
  { file: "thuy_bang_tinh_mu.png", gen: () => drawHat(PALETTES.THUY) },
  { file: "thuy_thuy_ngoc_nhan.png", gen: () => drawRing(PALETTES.THUY) },
  { file: "thuy_bang_linh_boi.png", gen: () => drawAmulet(PALETTES.THUY) },

  // ── HOA ──
  { file: "hoa_hoa_linh_truong.png", gen: () => drawStaff(PALETTES.HOA) },
  { file: "hoa_thien_viem_kiem.png", gen: () => drawSword(PALETTES.HOA) },
  { file: "hoa_hoa_linh_ao.png", gen: () => drawArmor(PALETTES.HOA) },
  { file: "hoa_thien_yem_bao.png", gen: () => drawArmor({ ...PALETTES.HOA, base: parseHex("#dc2626"), accent: parseHex("#fef08a") }) },
  { file: "hoa_liet_hoa_mu.png", gen: () => drawHat(PALETTES.HOA) },
  { file: "hoa_hoa_tam_nhan.png", gen: () => drawRing(PALETTES.HOA) },
  { file: "hoa_hoa_linh_quan.png", gen: () => drawPants(PALETTES.HOA) },

  // ── THO ──
  { file: "tho_dia_cui_thuong.png", gen: () => drawMace(PALETTES.THO) },
  { file: "tho_son_ha_truc_kiem.png", gen: () => drawSword(PALETTES.THO) },
  { file: "tho_dia_mach_giap.png", gen: () => drawArmor(PALETTES.THO) },
  { file: "tho_cu_thach_giap.png", gen: () => drawArmor({ ...PALETTES.THO, base: parseHex("#78716c"), accent: parseHex("#d97706") }) },
  { file: "tho_tho_than_mu.png", gen: () => drawHat(PALETTES.THO) },
  { file: "tho_dai_dia_nhan.png", gen: () => drawRing(PALETTES.THO) },
  { file: "tho_cu_thach_dai.png", gen: () => drawBelt(PALETTES.THO) },

  // ── QUANG ──
  { file: "quang_quang_minh_truong.png", gen: () => drawStaff(PALETTES.QUANG) },
  { file: "quang_thien_quang_kiem.png", gen: () => drawSword(PALETTES.QUANG) },
  { file: "quang_anh_duong_ao.png", gen: () => drawArmor(PALETTES.QUANG) },
  { file: "quang_quang_mien.png", gen: () => drawHat(PALETTES.QUANG) },
  { file: "quang_anh_sang_nhan.png", gen: () => drawRing(PALETTES.QUANG) },
  { file: "quang_quang_minh_boi.png", gen: () => drawAmulet(PALETTES.QUANG) },

  // ── AM ──
  { file: "am_am_da_dao.png", gen: () => drawBlade(PALETTES.AM) },
  { file: "am_u_minh_kiem.png", gen: () => drawSword(PALETTES.AM) },
  { file: "am_am_linh_ao.png", gen: () => drawArmor(PALETTES.AM) },
  { file: "am_am_da_mu.png", gen: () => drawHat(PALETTES.AM) },
  { file: "am_am_hon_nhan.png", gen: () => drawRing(PALETTES.AM) },
  { file: "am_am_hanh_hai.png", gen: () => drawBoots(PALETTES.AM) },

  // ── PHONG ──
  { file: "phong_thanh_phong_kiem.png", gen: () => drawSword(PALETTES.PHONG) },
  { file: "phong_cuong_phong_kiem.png", gen: () => drawSword({ ...PALETTES.PHONG, base: parseHex("#0d9488"), accent: parseHex("#f0fdf4") }) },
  { file: "phong_phong_linh_ao.png", gen: () => drawArmor(PALETTES.PHONG) },
  { file: "phong_thanh_phong_mu.png", gen: () => drawHat(PALETTES.PHONG) },
  { file: "phong_phong_hanh_nhan.png", gen: () => drawRing(PALETTES.PHONG) },
  { file: "phong_phong_hanh_hai.png", gen: () => drawBoots(PALETTES.PHONG) },

  // ── LOI ──
  { file: "loi_thien_loi_truong.png", gen: () => drawStaff(PALETTES.LOI) },
  { file: "loi_thien_loi_kiem.png", gen: () => drawSword(PALETTES.LOI) },
  { file: "loi_loi_linh_ao.png", gen: () => drawArmor(PALETTES.LOI) },
  { file: "loi_loi_dien_mu.png", gen: () => drawHat(PALETTES.LOI) },
  { file: "loi_loi_hanh_nhan.png", gen: () => drawRing(PALETTES.LOI) },
  { file: "loi_loi_linh_quan.png", gen: () => drawPants(PALETTES.LOI) },

  // ── COMMON & STARTER ──
  { file: "com_bach_tinh_kiem.png", gen: () => drawSword(PALETTES.COMMON) },
  { file: "com_nguy_nguyen_kiem.png", gen: () => drawSword({ ...PALETTES.COMMON, base: parseHex("#6366f1"), accent: parseHex("#ec4899") }) },
  { file: "com_linh_khi_ao.png", gen: () => drawArmor(PALETTES.COMMON) },
  { file: "com_linh_can_mu.png", gen: () => drawHat(PALETTES.COMMON) },
  { file: "com_linh_ngoc_nhan.png", gen: () => drawRing(PALETTES.COMMON) },
  { file: "com_ho_the_boi.png", gen: () => drawAmulet(PALETTES.COMMON) },
  { file: "com_linh_cuong_dai.png", gen: () => drawBelt(PALETTES.COMMON) },
  { file: "com_linh_van_quan.png", gen: () => drawPants(PALETTES.COMMON) },
  { file: "com_van_hanh_hai.png", gen: () => drawBoots(PALETTES.COMMON) },

  // Sơ khai / Phổ thông
  { file: "weapon_kiem_go.png", gen: () => drawSword(PALETTES.WOOD) },
  { file: "weapon_dao_sat.png", gen: () => drawBlade(PALETTES.IRON) },
  { file: "weapon_truc_kiem.png", gen: () => drawSword(PALETTES.MOC) },
  { file: "sword_bao_khi_1.png", gen: () => drawSword({ ...PALETTES.KIM, accent: parseHex("#38bdf8") }) },
  { file: "hat_non_la.png", gen: () => drawHat(PALETTES.WOOD) },
  { file: "hat_khan_cot_da.png", gen: () => drawHat({ ...PALETTES.COMMON, base: parseHex("#78350f") }) },
  { file: "armor_ao_vai.png", gen: () => drawArmor({ ...PALETTES.COMMON, base: parseHex("#e2e8f0") }) },
  { file: "armor_dao_bao_thanh_van.png", gen: () => drawArmor({ ...PALETTES.THUY, base: parseHex("#0284c7") }) },
  { file: "pants_quan_vai.png", gen: () => drawPants(PALETTES.COMMON) },
  { file: "pants_quan_da_thu.png", gen: () => drawPants({ ...PALETTES.COMMON, base: parseHex("#78350f") }) },
  { file: "boots_giay_co.png", gen: () => drawBoots(PALETTES.WOOD) },
  { file: "boots_giay_da_soi.png", gen: () => drawBoots({ ...PALETTES.COMMON, base: parseHex("#4b5563") }) },
  { file: "ring_dong_tram.png", gen: () => drawRing({ ...PALETTES.COMMON, base: parseHex("#b45309") }) },
  { file: "ring_thach_anh.png", gen: () => drawRing({ ...PALETTES.COMMON, base: parseHex("#e879f9") }) },
  { file: "amulet_ngoc_boi.png", gen: () => drawAmulet(PALETTES.MOC) },
  { file: "belt_da_tho.png", gen: () => drawBelt({ ...PALETTES.COMMON, leather: parseHex("#92400e") }) },
];

function main() {
  const outDir = path.resolve(__dirname, "../public/assets/items/equipment");
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Bắt đầu sinh ảnh cho ${ICONS_CONFIG.length} trang bị...`);
  let count = 0;
  for (const item of ICONS_CONFIG) {
    const filePath = path.join(outDir, item.file);
    const buf = item.gen();
    fs.writeFileSync(filePath, buf);
    count++;
  }
  console.log(`-> [HOÀN TẤT] Đã tạo thành công ${count} file ảnh PNG tại: ${outDir}`);
}

main();

