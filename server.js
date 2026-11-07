const express = require("express");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const config = require("./config/frontend");

const app = express();
const backend = new URL(config.backendUrl);
const transport = backend.protocol === "https:" ? https : http;
app.disable("x-powered-by");

function proxyToBackend(req, res) {
  const upstream = transport.request({
    protocol: backend.protocol,
    hostname: backend.hostname.replace(/^\[|\]$/g, ""),
    port: backend.port || undefined,
    method: req.method,
    path: req.originalUrl,
    headers: { ...req.headers, host: backend.host },
  }, (response) => {
    res.writeHead(response.statusCode, response.headers);
    response.on("error", () => res.destroy());
    response.pipe(res);
  });
  upstream.setTimeout(15000, () => upstream.destroy(new Error("Backend request timed out")));
  upstream.on("error", () => {
    if (res.destroyed) return;
    if (res.headersSent) return res.destroy();
    res.status(503).json({
      ok: false,
      code: "BACKEND_UNAVAILABLE",
      error: "Không kết nối được BE. Hãy kiểm tra BACKEND_URL và MySQL của BE.",
    });
  });
  req.on("aborted", () => upstream.destroy());
  res.on("close", () => { if (!res.writableEnded) upstream.destroy(); });
  req.pipe(upstream);
}

app.get("/runtime-config.js", (_req, res) => {
  const clientConfig = JSON.stringify({ apiBase: config.backendUrl, dataMode: config.dataMode });
  res.set("Cache-Control", "no-store").type("application/javascript").send(
    'Object.defineProperty(window, "TuTienConfig", { value: Object.freeze(' + clientConfig
    + '), writable: false, configurable: false });'
  );
});
app.use(["/api", "/socket.io"], proxyToBackend);
app.use(["/mock-api", "/js/core/mock-backend.mjs"], (_req, res) => {
  res.status(410).json({ ok: false, code: "REAL_BACKEND_REQUIRED", error: "Project yêu cầu BE và MySQL thật." });
});
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res, file) {
    if (file.endsWith(".html")) res.setHeader("Cache-Control", "no-store");
  },
}));
const server = app.listen(config.port, () => {
  console.log("Tu Tien frontend listening on port " + config.port + ", backend " + config.backendUrl);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => server.close());
}
