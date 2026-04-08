// api-service.js
const API = {
  BASE: "http://localhost:8090/api/", // Base URL của API Server
  SOCKET_URL: "http://localhost:3000",
  AUTO_SAVE_MS: 30_000,
};
const axios = require("axios");
const ApiService = {
  async get(path, authToken = "3123123123") {
    try {
      const response = await axios.get(API.BASE + path, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      // Axios lưu dữ liệu trong thuộc tính .data
      return response;
    } catch (error) {
      console.error("Lỗi API:", error.message);
      return { data: null };
    }
  },
};

module.exports = { ApiService };
