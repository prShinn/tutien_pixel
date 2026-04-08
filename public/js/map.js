const MAPS = {};

/**
 * @param {HTMLCanvasElement} canvas - Element canvas từ DOM
 * @param {number[][]} mapData - Mảng 2 chiều chứa các chỉ số 0-7
 * @param {number} tileSize - Kích thước mỗi ô (ví dụ: 16 hoặc 32)
 */
function drawMap(canvas, mapData, tileSize = 20) {
  const ctx = canvas.getContext("2d");

  // 1. Định nghĩa lại bảng màu của bạn (để hàm hoạt động độc lập)
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

  // 2. Thiết lập kích thước canvas dựa trên mảng dữ liệu
  canvas.height = mapData.length * tileSize;
  canvas.width = mapData[0].length * tileSize;

  // 3. Lặp qua mảng 2 chiều để vẽ
  for (let y = 0; y < mapData.length; y++) {
    for (let x = 0; x < mapData[y].length; x++) {
      const tileType = mapData[y][x]; // Lấy giá trị (0, 1, 2...)
      const colors = TC[tileType]; // Lấy mảng màu tương ứng

      if (colors) {
        // Vẽ nền ô vuông (màu đầu tiên trong mảng)
        ctx.fillStyle = colors[0];
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);

        // Thêm hiệu ứng viền nhẹ hoặc chi tiết (màu thứ hai) nếu muốn
        // ctx.strokeStyle = colors[1];
        // ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }
  }
}
