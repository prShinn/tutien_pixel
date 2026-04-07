// ════════════════════════════════════════════════════════════
// §0 · API CONFIG  ← Đổi URL này khi deploy server
// ════════════════════════════════════════════════════════════
const API = {
  BASE: "http://localhost:8090/api", // ← server URL
  SOCKET_URL: "http://localhost:3000", // ← socket URL (thường cùng server)
  AUTO_SAVE_MS: 30_000, // auto-save mỗi 30 giây
};
const ApiService = {
  async get(path) {
    const res = await fetch(API.BASE + path, {
      headers: { Authorization: "Bearer " + authToken },
    });
    return res.json();
  },
};
