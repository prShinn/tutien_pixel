require("dotenv").config();

const port = Number(process.env.PORT || 3000);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer from 1 to 65535");
}
if ((process.env.DATA_MODE || "real") !== "real") {
  throw new Error("DATA_MODE must be real. Configure the backend and its MySQL database.");
}
const backend = new URL(process.env.BACKEND_URL || "http://localhost:3800");
if (!["http:", "https:"].includes(backend.protocol) || backend.username || backend.password
    || backend.pathname !== "/" || backend.search || backend.hash) {
  throw new Error("BACKEND_URL must be an HTTP(S) origin without credentials, path, query, or fragment");
}
const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(backend.hostname);
if (loopback && Number(backend.port || (backend.protocol === "https:" ? 443 : 80)) === port) {
  throw new Error("BACKEND_URL must point to the separate backend, not the frontend port");
}

module.exports = Object.freeze({ port, backendUrl: backend.origin, dataMode: "real" });
