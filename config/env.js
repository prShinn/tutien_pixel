require("dotenv").config();

const DEFAULT_JWT_SECRET = "tu-tien-dev-secret-change-in-production";
const isProduction = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
const adminMapKey = process.env.ADMIN_MAP_KEY || "demo-admin";
const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);

if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error("TRUST_PROXY_HOPS must be a non-negative integer");
}
if (isProduction && corsOrigins.includes("*")) {
  throw new Error("CORS_ORIGINS must list exact origins in production; wildcard is not allowed");
}

function requireProductionSecret(name, value, knownPlaceholder) {
  if (
    !value ||
    Buffer.byteLength(value, "utf8") < 32 ||
    value === knownPlaceholder ||
    /^(replace|change|demo|your[-_])/i.test(value)
  ) {
    throw new Error(`${name} must be configured with at least 32 random bytes in production`);
  }
}

if (isProduction) {
  requireProductionSecret("JWT_SECRET", process.env.JWT_SECRET, DEFAULT_JWT_SECRET);
  requireProductionSecret("ADMIN_MAP_KEY", process.env.ADMIN_MAP_KEY, "demo-admin");
}

const ENV = Object.freeze({
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  jwtSecret,
  adminMapKey,
  corsOrigins: Object.freeze(corsOrigins),
  trustProxyHops,
  authBackend: process.env.AUTH_BACKEND || "http://localhost:8090",
  isProduction,
});

module.exports = ENV;
