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

const Render = {
  /**
   * Vẽ từng ô gạch chi tiết
   * @param {number} t - Loại gạch (0-7)
   * @param {number} sx - Tọa độ X trên Canvas (đã trừ camera)
   * @param {number} sy - Tọa độ Y trên Canvas (đã trừ camera)
   * @param {number} ts - Tile Size (Kích thước ô)
   */
  tile(ctx, t, sx, sy, ts) {
    const c = TC[t] || ["#333", "#444"];

    // Vẽ màu nền của ô
    ctx.fillStyle = c[0];
    ctx.fillRect(sx, sy, ts, ts);

    // Vẽ chi tiết Pixel Art cho từng loại địa hình
    ctx.fillStyle = c[1];

    if (t === T.GRASS) {
      // Vẽ các nhánh cỏ nhỏ
      const grassPoints = [
        [4, 5, 2, 6],
        [10, 7, 2, 5],
        [18, 4, 2, 6],
        [26, 8, 2, 4],
        [22, 19, 2, 5],
        [8, 21, 2, 4],
      ];
      grassPoints.forEach((p) =>
        ctx.fillRect(sx + p[0], sy + p[1], p[2], p[3]),
      );
    } else if (t === T.WATER) {
      // Vẽ sóng nước
      ctx.fillRect(sx + 2, sy + 7, ts - 4, 3);
      ctx.fillRect(sx + 5, sy + 17, ts - 10, 3);
      ctx.fillStyle = "#3a7acc"; // Màu nước sáng hơn
      ctx.fillRect(sx, sy + 12, ts, 3);
    } else if (t === T.WALL) {
      // Vẽ kết cấu gạch tường
      ctx.fillRect(sx, sy, ts, 4);
      ctx.fillRect(sx + 8, sy + 4, 3, 10);
      ctx.fillRect(sx + 22, sy + 4, 3, 10);
      ctx.fillStyle = "#3a2828";
      ctx.fillRect(sx, sy, ts, 2);
    } else if (t === T.TREE) {
      // Vẽ thân và tán lá
      ctx.fillStyle = "#1a1208"; // Thân
      ctx.fillRect(sx + 13, sy + 20, 6, 12);
      ctx.fillStyle = "#1e4a18"; // Tán dưới
      ctx.fillRect(sx + 6, sy + 8, 20, 16);
      ctx.fillStyle = "#2a6820"; // Tán trên
      ctx.fillRect(sx + 10, sy + 2, 12, 10);
    } else if (t === T.MTN) {
      // Vẽ hình chóp núi
      ctx.fillStyle = "#505060";
      ctx.fillRect(sx + 2, sy + 18, 28, 14);
      ctx.fillStyle = "#686878";
      for (let i = 0; i < 14; i++)
        ctx.fillRect(
          sx + 7 + i,
          sy + 18 - Math.min(i, 13 - i) * 1.5,
          2,
          Math.min(i, 13 - i) * 1.5 + 3,
        );
      ctx.fillStyle = "#dde8ff"; // Tuyết trên đỉnh
      ctx.fillRect(sx + 12, sy + 5, 8, 5);
    } else if (t === T.FLOOR || t === T.PLAZA) {
      // Vẽ đường ron gạch
      ctx.globalAlpha = 0.3;
      ctx.fillRect(sx, sy, ts, 1);
      ctx.fillRect(sx, sy, 1, ts);
      ctx.globalAlpha = 1;
    } else if (t === T.STONE) {
      // Vẽ các khối đá vụn
      ctx.fillRect(sx + 3, sy + 8, 10, 8);
      ctx.fillRect(sx + 18, sy + 14, 8, 7);
    }
  },
};
