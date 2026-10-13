// api-service.js
const API = {
  BASE: `http://localhost:${process.env.PORT || 3000}/api/`,
};
const ApiService = {
  async get(path, authToken = "") {
    try {
      const response = await fetch(API.BASE + path, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      return { data: await response.json(), status: response.status };
    } catch (error) {
      console.error("API error:", error.message);
      return { data: null };
    }
  },
};

module.exports = { ApiService };
