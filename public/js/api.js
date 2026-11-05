// Hợp đồng endpoint dùng chung cho browser client.
function resolveApiBase() {
  const queryApiBase = typeof URLSearchParams === "undefined"
    ? null
    : new URLSearchParams(window.location.search || "").get("apiBase");
  const trustedApiBase = window.TuTienConfig?.apiBase;
  let rememberedApiBase = null;
  try { rememberedApiBase = window.sessionStorage?.getItem("tu_tien_api_base"); } catch { /* session storage may be blocked */ }
  const localAdminPage = window.location.pathname?.startsWith("/admin")
    && /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(window.location.origin);
  // Do not inherit the game's remembered API origin on Admin pages. It can point
  // to an old FE port; Admin's documented local target is the BE port.
  const configured = trustedApiBase || queryApiBase || (localAdminPage ? null : rememberedApiBase);
  if (!configured) {
    if (localAdminPage) return "http://localhost:3800";
    return window.location.origin;
  }

  try {
    const target = new URL(configured, window.location.origin);
    const current = new URL(window.location.origin);
    const isLoopback = (host) => host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    const sameOrigin = target.origin === current.origin;
    const localDevelopment = isLoopback(target.hostname) && isLoopback(current.hostname);
    if (!["http:", "https:"].includes(target.protocol) || target.username || target.password || (!trustedApiBase && !sameOrigin && !localDevelopment)) {
      throw new Error("API base phải dùng http(s), không chứa thông tin đăng nhập; apiBase trên URL chỉ được trỏ cùng origin hoặc localhost.");
    }
    if (queryApiBase && !trustedApiBase) {
      try { window.sessionStorage?.setItem("tu_tien_api_base", target.origin); } catch { /* optional convenience */ }
    }
    return target.origin;
  } catch (error) {
    console.warn("[API] Bỏ qua apiBase không hợp lệ:", error.message);
    return window.location.origin;
  }
}

const API_BASE = resolveApiBase();
const API = Object.freeze({
  BASE: API_BASE,
  SOCKET_URL: API_BASE,
  AUTO_SAVE_MS: 30000,
  HEALTH: "/api/health",
  PATHS: Object.freeze({
    auth: { register: "/api/auth/register", login: "/api/auth/login", demo: "/api/auth/demo", me: "/api/auth/me", refresh: "/api/auth/refresh", logout: "/api/auth/logout" },
    worlds: { list: "/api/worlds", structure: "/api/world-structure", default: "/api/worlds/default", byCode: (code) => `/api/worlds/by-code?code=${encodeURIComponent(code)}` },
    admin: {
      worlds: "/api/admin/worlds",
      world: (code) => `/api/admin/worlds/${encodeURIComponent(code)}`,
      validateWorld: (code) => `/api/admin/worlds/${encodeURIComponent(code)}/validate`,
      publishWorld: (code) => `/api/admin/worlds/${encodeURIComponent(code)}/publish`,
      content: (collection) => `/api/admin/content/${encodeURIComponent(collection)}`,
      contentItem: (collection, id) => `/api/admin/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
      skillVfx: "/api/admin/skill-vfx",
      skillVfxItem: (skillCode) => `/api/admin/skill-vfx/${encodeURIComponent(skillCode)}`,
      linkPortal: "/api/admin/portals/link",
      portal: (code, id) => `/api/admin/worlds/${encodeURIComponent(code)}/portals/${encodeURIComponent(id)}`,
    },
    data: { realms: "/api/canh-gioi", roots: "/api/linh-can", items: "/api/items", skills: "/api/skills", skillCatalog: "/api/skills/catalog", skillVfx: "/api/skill-vfx", monsters: "/api/monsters", balance: "/api/balance" },
    player: {
      create: "/api/player", me: "/api/player/me", state: "/api/player/state", byUser: (id) => `/api/player/by-user/${encodeURIComponent(id)}`,
      power: "/api/player/power", update: (id) => `/api/player/${encodeURIComponent(id)}`,
      allocateStats: "/api/player/stats/allocate", absorb: "/api/player/cultivation/absorb", breakthrough: "/api/player/cultivation/breakthrough",
      useItem: "/api/player/inventory/use", buy: "/api/player/shop/buy", sell: "/api/player/shop/sell",
      learnSkill: "/api/player/skills/learn", equipSkills: "/api/player/skills/equip", equipItem: "/api/player/equipment/equip", unequipItem: "/api/player/equipment/unequip",
    },
    quests: {
      list: "/api/quests",
      accept: (id) => `/api/quests/${encodeURIComponent(id)}/accept`,
      track: (id) => `/api/quests/${encodeURIComponent(id)}/track`,
      claim: (id) => `/api/quests/${encodeURIComponent(id)}/claim`,
    },
  }),
});
