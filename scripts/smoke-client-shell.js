const BASE = process.env.DEMO_URL || "http://localhost:3000";

function assetPaths(html) {
  const matches = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)];
  return [...new Set(matches
    .map((match) => match[1])
    .filter((path) => !path.startsWith("//") && !path.startsWith("http"))
    .map((path) => new URL(path, `${BASE}/`).pathname))];
}

async function main() {
  const response = await fetch(`${BASE}/`);
  if (!response.ok) throw new Error(`game shell failed: ${response.status}`);
  const html = await response.text();
  const requiredMarkers = ["id=\"game-canvas\"", "id=\"canvas-area\"", "id=\"screen-auth\"", "id=\"screen-create\""];
  const missing = requiredMarkers.filter((marker) => !html.includes(marker));
  if (missing.length) throw new Error(`game shell missing: ${missing.join(", ")}`);

  const paths = assetPaths(html).filter((path) => /\.(?:js|css)$/i.test(path));
  const results = await Promise.all(paths.map(async (path) => {
    const asset = await fetch(`${BASE}${path}`);
    return { path, ok: asset.ok, type: asset.headers.get("content-type") || "" };
  }));
  const failed = results.filter((result) => !result.ok);
  if (failed.length) throw new Error(`client assets failed: ${failed.map((result) => result.path).join(", ")}`);
  console.log(JSON.stringify({ shell: true, assets: results.length, valid: true }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
