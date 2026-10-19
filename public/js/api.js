// Hợp đồng endpoint dùng chung cho browser client.
const API = Object.freeze({
  BASE: window.location.origin,
  SOCKET_URL: window.location.origin,
  AUTO_SAVE_MS: 30000,
  PATHS: Object.freeze({
    auth: { register: "/api/auth/register", login: "/api/auth/login", demo: "/api/auth/demo", me: "/api/auth/me" },
    worlds: { list: "/api/worlds", structure: "/api/world-structure", default: "/api/worlds/default", byCode: (code) => `/api/worlds/by-code?code=${encodeURIComponent(code)}` },
    admin: {
      worlds: "/api/admin/worlds",
      world: (code) => `/api/admin/worlds/${encodeURIComponent(code)}`,
      linkPortal: "/api/admin/portals/link",
      portal: (code, id) => `/api/admin/worlds/${encodeURIComponent(code)}/portals/${encodeURIComponent(id)}`,
    },
    data: { realms: "/api/canh-gioi", roots: "/api/linh-can", items: "/api/items", skills: "/api/skills", skillCatalog: "/api/skills/catalog", monsters: "/api/monsters", balance: "/api/balance" },
    player: {
      create: "/api/player", me: "/api/player/me", state: "/api/player/state", byUser: (id) => `/api/player/by-user/${encodeURIComponent(id)}`,
      power: "/api/player/power", update: (id) => `/api/player/${encodeURIComponent(id)}`,
      allocateStats: "/api/player/stats/allocate", absorb: "/api/player/cultivation/absorb", breakthrough: "/api/player/cultivation/breakthrough",
      useItem: "/api/player/inventory/use", buy: "/api/player/shop/buy", sell: "/api/player/shop/sell",
      learnSkill: "/api/player/skills/learn", equipSkills: "/api/player/skills/equip", equipItem: "/api/player/equipment/equip", unequipItem: "/api/player/equipment/unequip",
    },
  }),
});
