// Hợp đồng endpoint dùng chung cho browser client.
function resolveApiBase() {
  const config = window.TuTienConfig;
  if (config?.dataMode !== "real" || !config.apiBase) {
    throw new Error("Thiếu cấu hình BE thật. Khởi động FE bằng npm start và kiểm tra BACKEND_URL.");
  }
  const target = new URL(config.apiBase);
  if (!["http:", "https:"].includes(target.protocol) || target.username || target.password
      || target.pathname !== "/" || target.search || target.hash) {
    throw new Error("BACKEND_URL phải là HTTP(S) origin hợp lệ.");
  }
  return target.origin;
}
const API_BASE = resolveApiBase();

async function assertPersistentStorage() {
  let health;
  let readiness;
  try {
    const healthResponse = await fetch(`${API_BASE}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    health = await healthResponse.json();
    if (!healthResponse.ok || health?.service !== "tu-tien-pixel-be") {
      throw new Error("API hiện tại không xác nhận đúng dịch vụ BE của project.");
    }

    const readinessResponse = await fetch(`${API_BASE}/api/health/ready`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    readiness = await readinessResponse.json();
    if (!readinessResponse.ok || readiness?.dependencies?.mysql !== "ready") {
      throw new Error("MySQL chưa sẵn sàng. Dữ liệu chưa được ghi; hãy khởi động Backend và kiểm tra kết nối cơ sở dữ liệu.");
    }
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Không kết nối được Backend/MySQL. Dữ liệu chưa được ghi và sẽ không chuyển sang lưu RAM.");
    }
    if (error instanceof SyntaxError) {
      throw new Error("Backend trả phản hồi không hợp lệ. Thao tác ghi bị chặn để tránh lưu ngoài MySQL.");
    }
    throw error;
  }
  return true;
}

const API = Object.freeze({
  BASE: API_BASE,
  REAL_BACKEND_ONLY: true,
  assertPersistentStorage,
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
      mail: "/api/admin/mail/send",
      linkPortal: "/api/admin/portals/link",
      portal: (code, id) => `/api/admin/worlds/${encodeURIComponent(code)}/portals/${encodeURIComponent(id)}`,
    },
    data: { realms: "/api/canh-gioi", roots: "/api/linh-can", items: "/api/items", skills: "/api/skills", skillCatalog: "/api/skills/catalog", skillVfx: "/api/skill-vfx", monsters: "/api/monsters", balance: "/api/balance" },
    player: {
      create: "/api/player", me: "/api/player/me", state: "/api/player/state", byUser: (id) => `/api/player/by-user/${encodeURIComponent(id)}`,
      power: "/api/player/power", walletLedger: "/api/player/wallet/ledger", update: (id) => `/api/player/${encodeURIComponent(id)}`,
      allocateStats: "/api/player/stats/allocate", respawn: "/api/player/respawn", absorb: "/api/player/cultivation/absorb", breakthrough: "/api/player/cultivation/breakthrough",
      useItem: "/api/player/inventory/use", buy: "/api/player/shop/buy", sell: "/api/player/shop/sell",
      learnSkill: "/api/player/skills/learn", equipSkills: "/api/player/skills/equip", equipItem: "/api/player/equipment/equip", unequipItem: "/api/player/equipment/unequip",
    },
    shop: {
      premium: "/api/shop/premium",
      buy: "/api/player/shop/buy",
      sell: "/api/player/shop/sell",
    },
    alchemy: {
      recipes: "/api/alchemy/recipes",
      history: "/api/alchemy/history",
      brew: "/api/player/alchemy/brew",
    },
    enhance: {
      config: "/api/player/enhance/config",
      attempt: "/api/player/equipment/enhance",
    },
    mail: {
      list: "/api/mail",
      claim: (id) => `/api/mail/${encodeURIComponent(id)}/claim`,
    },
    retention: {
      status: "/api/retention/status",
      checkinClaim: "/api/retention/checkin/claim",
    },
    quests: {
      list: "/api/quests",
      accept: (id) => `/api/quests/${encodeURIComponent(id)}/accept`,
      track: (id) => `/api/quests/${encodeURIComponent(id)}/track`,
      claim: (id) => `/api/quests/${encodeURIComponent(id)}/claim`,
    },
  }),
});
