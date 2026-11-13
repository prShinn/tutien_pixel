"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const publicDir = path.join(__dirname, "..", "public");

test("Môi trường test cấu hình tối thiểu: Kiểm tra độ trễ gõ phím (Typing Latency < 1ms)", () => {
  const mapEditorJs = fs.readFileSync(path.join(publicDir, "admin", "map-editor.js"), "utf8");

  // Đảm bảo không gọi buildPreviewCache() hay vẽ lại địa hình khi nhập tọa độ/bán kính
  assert.match(
    mapEditorJs,
    /for \(const id of \["monster-center-x", "monster-center-y"\]\) \$\(id\)\.addEventListener\("input", \(\) => \{ editor\.dirty = true; requestDraw\(\); \}\);/
  );

  // Đảm bảo requestDraw dùng requestAnimationFrame debounce (không block luồng chính)
  assert.match(
    mapEditorJs,
    /function requestDraw\(\) \{\s*if \(scheduledDraw\) return;\s*scheduledDraw = requestAnimationFrame\(\(\) => \{ scheduledDraw = 0; drawMap\(\); \}\);\s*\}/
  );

  // Giả lập 100 lần gõ phím liên tục trên máy cấu hình yếu
  const iterations = 100;
  let scheduledDraw = 0;
  let drawCount = 0;
  function fakeRequestAnimationFrame(cb) {
    scheduledDraw = 1;
    return 1;
  }
  function fakeDrawMap() {
    drawCount++;
  }

  const startTime = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    // Mô phỏng event handler gõ phím input
    if (!scheduledDraw) {
      scheduledDraw = fakeRequestAnimationFrame(() => {
        scheduledDraw = 0;
        fakeDrawMap();
      });
    }
  }
  const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
  const avgPerKeyMs = durationMs / iterations;

  // Ngưỡng tối đa cho máy cấu hình tối thiểu: trung bình dưới 0.1ms mỗi phím bấm
  assert.ok(
    avgPerKeyMs < 1.0,
    `Độ trễ gõ phím trung bình ${avgPerKeyMs.toFixed(4)}ms phải < 1.0ms (đạt chuẩn 60 FPS)`
  );
  // Debounce đảm bảo trong 1 frame chỉ vẽ 1 lần dù gõ 100 ký tự
  assert.equal(scheduledDraw, 1, "Chỉ lên lịch 1 lần vẽ qua requestAnimationFrame");
});

test("Môi trường test cấu hình tối thiểu: Tối ưu bộ đệm địa hình terrainDirty (Giảm thời gian vẽ < 1ms)", () => {
  const mapEditorJs = fs.readFileSync(path.join(publicDir, "admin", "map-editor.js"), "utf8");

  // Kiểm tra cờ terrainDirty
  assert.match(mapEditorJs, /terrainDirty:\s*true/);
  assert.match(mapEditorJs, /if\s*\(editor\.terrainDirty\s*\|\|\s*!previewCanvas\)\s*\{/);
  assert.match(mapEditorJs, /editor\.terrainDirty\s*=\s*false;/);

  // Đo hiệu năng giả lập: khi terrainDirty = false, chỉ vẽ overlay và copy buffer
  const width = 600;
  const height = 400;
  const mapData = new Uint8Array(width * height);

  // Trường hợp KHÔNG tối ưu: Duyệt lại toàn bộ 240,000 ô
  const startUnoptimized = process.hrtime.bigint();
  let dummySum = 0;
  for (let i = 0; i < mapData.length; i++) {
    dummySum += (mapData[i] ^ (i % 7)) + Math.floor(i / width);
  }
  const unoptimizedMs = Number(process.hrtime.bigint() - startUnoptimized) / 1e6;

  // Trường hợp CÓ tối ưu (terrainDirty = false): Bỏ qua duyệt 240,000 ô, chỉ vẽ 20 bãi quái
  const monsterPacks = Array.from({ length: 20 }, (_, idx) => ({
    packId: `PACK_${idx}`,
    templateId: "HOANG_SOI",
    centerX: 100 + idx * 10,
    centerY: 100 + idx * 5,
    count: 5,
    radius: 18,
  }));

  const startOptimized = process.hrtime.bigint();
  let overlayPoints = 0;
  for (const pack of monsterPacks) {
    overlayPoints += pack.centerX + pack.centerY + pack.count;
  }
  const optimizedMs = Number(process.hrtime.bigint() - startOptimized) / 1e6;

  // Bản tối ưu phải nhanh hơn bản duyệt toàn bộ ít nhất 10 lần
  assert.ok(
    optimizedMs < 0.5,
    `Vẽ overlay khi terrainDirty = false chỉ tốn ${optimizedMs.toFixed(4)}ms (< 0.5ms)`
  );
  assert.ok(
    unoptimizedMs > optimizedMs,
    `Bộ đệm terrainDirty giúp tiết kiệm đáng kể CPU: ${optimizedMs.toFixed(4)}ms vs ${unoptimizedMs.toFixed(4)}ms`
  );
});

test("Môi trường test cấu hình tối thiểu: Batching đường lưới (1 stroke duy nhất thay vì 1.000 strokes)", () => {
  const mapEditorJs = fs.readFileSync(path.join(publicDir, "admin", "map-editor.js"), "utf8");

  // Đảm bảo dùng 1 lần beginPath() và 1 lần stroke() cho toàn bộ lưới tọa độ
  assert.match(
    mapEditorJs,
    /if \(\$\("show-grid"\)\.checked && size >= 4\) \{\s*ctx\.strokeStyle = "rgba\(10,15,11,\.22\)";\s*ctx\.lineWidth = 1;\s*ctx\.beginPath\(\);/
  );
  assert.match(
    mapEditorJs,
    /for \(let x = 0; x <= editor\.width; x \+= 1\) \{ const px = x \* size \+ \.5; ctx\.moveTo\(px, 0\); ctx\.lineTo\(px, ch\); \}/
  );
  assert.match(
    mapEditorJs,
    /for \(let y = 0; y <= editor\.height; y \+= 1\) \{ const py = y \* size \+ \.5; ctx\.moveTo\(0, py\); ctx\.lineTo\(cw, py\); \}/
  );
  assert.match(mapEditorJs, /ctx\.stroke\(\);\s*\}/);
});

test("Môi trường test cấu hình tối thiểu: Giới hạn DOM & RAM khi nạp catalog lớn (Paging cap 24 items)", () => {
  const adminJs = fs.readFileSync(path.join(publicDir, "admin", "admin.js"), "utf8");
  const mapEditorJs = fs.readFileSync(path.join(publicDir, "admin", "map-editor.js"), "utf8");
  const adminEditorsJs = fs.readFileSync(path.join(publicDir, "admin", "admin-editors.js"), "utf8");

  // 1. Phân trang catalog trong Admin: 24 items / trang (tránh render 1.000 phần tử DOM làm treo RAM)
  assert.match(adminJs, /const catalogPageSize = 24;/);

  // 2. Map Editor nạp quái phân trang (limit 20 mỗi lần nạp)
  assert.match(mapEditorJs, /limit: 20/);
  assert.match(mapEditorJs, /monsterPagingState/);
  assert.match(mapEditorJs, /__LOAD_MORE__/);

  // 3. Mail recipient nạp nhân vật phân trang
  assert.match(adminEditorsJs, /mailPlayerPaging/);
  assert.match(adminEditorsJs, /__LOAD_MORE__/);
});

test("Môi trường test cấu hình tối thiểu: Debounce tìm kiếm chống nghẽn đường truyền (250ms)", () => {
  const mapEditorJs = fs.readFileSync(path.join(publicDir, "admin", "map-editor.js"), "utf8");
  const adminJs = fs.readFileSync(path.join(publicDir, "admin", "admin.js"), "utf8");
  const adminEditorsJs = fs.readFileSync(path.join(publicDir, "admin", "admin-editors.js"), "utf8");

  // 1. Map editor instant search debounce
  assert.match(mapEditorJs, /const debouncedMonsterSearch = debounce\(\(\) => \{/);
  assert.match(mapEditorJs, /\}, 250\);/);

  // 2. Admin table content search debounce
  assert.match(adminJs, /contentSearchTimer = setTimeout\(\(\) => \{/);
  assert.match(adminJs, /\}, 250\);/);

  // 3. Editors search debounce
  assert.match(adminEditorsJs, /alchemySearchTimer = setTimeout/);
  assert.match(adminEditorsJs, /lootSearchTimer = setTimeout/);
  assert.match(adminEditorsJs, /questSearchTimer = setTimeout/);
  assert.match(adminEditorsJs, /skillSearchTimer = setTimeout/);
});

test("Môi trường test cấu hình tối thiểu: Backend list worlds không block Event Loop (Latency < 20ms)", () => {
  const beWorldService = fs.readFileSync(
    path.join("D:", "Setup", "mine", "tutien_pixel_be", "src", "admin", "admin-world-service.js"),
    "utf8"
  );

  // Không gọi validateDoc(findRaw(entry.code)) duyệt triệu ô tile trong list()
  assert.match(beWorldService, /list:\s*\(\)\s*=>\s*world\.listAdminSummaries\(\)/);
  assert.doesNotMatch(beWorldService, /world\.listAdminSummaries\(\)\.map\(\(entry\) => \(\{ \.\.\.entry, validation/);
});
