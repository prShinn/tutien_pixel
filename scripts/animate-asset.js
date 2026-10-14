"use strict";

// Local asset animation service: copy one image into the game asset tree and
// emit the metadata Render.monster/Render.player can consume automatically.
// No native image dependency is required; a single image is animated by the
// canvas renderer, while a 4x4 sheet can use grid mode.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "public", "assets", "generated");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function readArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    args[key] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return args;
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function safeName(value) {
  return String(value || "asset")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "asset";
}

function main() {
  const args = readArgs(process.argv.slice(2));
  if (!args.input) throw new Error('Thiếu --input "C:\\path\\image.png"');
  const sourcePath = path.resolve(String(args.input));
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) throw new Error(`Không tìm thấy ảnh: ${sourcePath}`);
  const extension = path.extname(sourcePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) throw new Error("Chỉ hỗ trợ PNG, JPG, JPEG hoặc WEBP");

  const name = safeName(args.name || path.basename(sourcePath, extension));
  const kind = String(args.kind || "procedural").toLowerCase() === "grid" ? "grid" : "procedural";
  const outputName = `${name}${extension}`;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.copyFileSync(sourcePath, path.join(OUTPUT_DIR, outputName));

  const animation = kind === "grid"
    ? { kind, cols: positiveInt(args.cols, 4), rows: positiveInt(args.rows, 4), width: positiveInt(args.width, 20), height: positiveInt(args.height, 20) }
    : { kind, width: positiveInt(args.width, 20), height: positiveInt(args.height, 20), actions: ["idle", "walk", "attack", "hit"] };
  const manifest = {
    sourcePath,
    assetPath: `/assets/generated/${outputName}`,
    animation,
    generatedAt: new Date().toISOString(),
  };
  const manifestPath = path.join(OUTPUT_DIR, `${name}.animation.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ...manifest, manifestPath })}\n`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
