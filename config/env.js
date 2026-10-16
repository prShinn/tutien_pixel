require("dotenv").config();

const DEFAULT_JWT_SECRET = "tu-tien-dev-secret-change-in-production";
const ENV = Object.freeze({
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
  adminMapKey: process.env.ADMIN_MAP_KEY || "demo-admin",
  authBackend: process.env.AUTH_BACKEND || "http://localhost:8090",
  isProduction: process.env.NODE_ENV === "production",
});

if (ENV.isProduction && ENV.jwtSecret === DEFAULT_JWT_SECRET) console.warn("CẢNH BÁO: JWT_SECRET đang dùng giá trị dev mặc định trong production!");
if (ENV.isProduction && ENV.adminMapKey === "demo-admin") console.warn("CẢNH BÁO: ADMIN_MAP_KEY đang dùng giá trị dev mặc định trong production!");

module.exports = ENV;
