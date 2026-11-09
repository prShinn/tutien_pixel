const { backendUrl } = require("../config/frontend");
async function verifyBackend(base) {
  async function get(path) {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!response.ok) throw new Error(path + " returned HTTP " + response.status);
    return response.json();
  }
  const health = await get("/api/health");
  if (health?.service !== "tu-tien-pixel-be" || health.ok !== true) {
    throw new Error("The configured endpoint is not the actual project backend");
  }
  const readiness = await get("/api/health/ready");
  if (readiness.ok !== true || readiness.dependencies?.mysql !== "ready") {
    throw new Error("The backend has not confirmed actual MySQL readiness");
  }
  const world = await get("/api/worlds/default");
  if (typeof world?.code !== "string" || !world.code) {
    throw new Error("The backend did not return a published starting world");
  }
  console.log("Real BE HTTP, MySQL readiness and published world reads passed.");
}
verifyBackend(backendUrl).catch((error) => {
  console.error("Real backend verification failed. " + error.message);
  process.exitCode = 1;
});