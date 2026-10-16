// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: middleware/auth.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Middleware xác thực người dùng (JWT Authentication): Ký token đăng nhập (signToken)
//      và xác minh tính hợp lệ của JWT token từ header Authorization (Bearer <token>).
// 2. CẤU HÌNH LIÊN QUAN:
//    - JWT_SECRET (từ .env hoặc fallback dev secret).
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Bảo vệ các REST API nhạy cảm của người chơi (thông tin tài khoản, tạo nhân vật,
//      tu luyện, thay đổi trang bị), giải mã userId và username gán vào request.
// ════════════════════════════════════════════════════════════════════════════════════════
const jwt = require('jsonwebtoken');
const ENV = require('../config/env');

const JWT_SECRET = ENV.jwtSecret;
if (ENV.isProduction && JWT_SECRET === 'tu-tien-dev-secret-change-in-production') {
  console.warn('CẢNH BÁO: JWT_SECRET đang sử dụng giá trị dev mặc định trong môi trường production!');
}

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'Thiếu token xác thực' });

  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId   = decoded.userId;
    req.username = decoded.username;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
  }
}

function signToken(userId, username) {
  return jwt.sign(
    { userId, username },
    JWT_SECRET,
    { expiresIn: '7d' }  // token sống 7 ngày
  );
}

module.exports = { authMiddleware, signToken, JWT_SECRET };
