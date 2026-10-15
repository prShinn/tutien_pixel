// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: middleware/rate-limit.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Middleware giới hạn tần suất gửi request (Rate Limiter): Sử dụng cơ chế trượt cửa sổ thời gian
//      (sliding window) lưu trữ in-memory dựa trên IP của client.
// 2. CẤU HÌNH LIÊN QUAN:
//    - windowMs (mặc định 60s), max (số request tối đa trong cửa sổ, ví dụ 30 req/phút cho Auth).
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Chống spam brute-force mật khẩu tại /api/auth/login, chống spam tạo nhân vật hoặc spam API tu luyện.
//    - Tự động dọn dẹp bộ nhớ định kỳ (timer.unref) để tránh rò rỉ RAM (memory leak).
// ════════════════════════════════════════════════════════════════════════════════════════

function createRateLimiter({ windowMs = 60000, max = 60, message = "Quá nhiều yêu cầu, vui lòng thử lại sau" } = {}) {
  const hits = new Map();

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of hits.entries()) {
      const active = timestamps.filter((t) => now - t < windowMs);
      if (active.length === 0) hits.delete(key);
      else hits.set(key, active);
    }
  }, 120000);
  if (timer.unref) timer.unref();

  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || "global";
    const now = Date.now();
    const timestamps = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (timestamps.length >= max) {
      const retryAfter = Math.max(1, Math.ceil((timestamps[0] + windowMs - now) / 1000));
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ error: message, retryAfter });
    }
    timestamps.push(now);
    hits.set(key, timestamps);
    next();
  };
}

module.exports = { createRateLimiter };
