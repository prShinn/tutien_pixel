const STORAGE_KEY = "tutien.mockBackend.v1";
const QUEST_EVENT_NAME = "mock-api:quest-state-changed";
const STAT_KEYS = ["str", "agi", "vit", "ene"];

function jsonClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function initialState() {
  return { nextPlayerId: 900001, users: {}, players: {} };
}

function hashUsername(value) {
  let hash = 2166136261;
  for (const char of String(value).trim().toLowerCase()) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return 10000 + ((hash >>> 0) % 1000000000);
}

export function mockBackendEnabled(search = "") {
  try { return new URLSearchParams(String(search || "")).get("mockBackend") === "1"; }
  catch { return false; }
}

export function installMockBackend({
  scope = globalThis,
  fetchImpl = scope.fetch?.bind(scope),
  storage = scope.localStorage,
  session = scope.sessionStorage,
  fixtureRoot,
  ResponseImpl = scope.Response || globalThis.Response,
  HeadersImpl = scope.Headers || globalThis.Headers,
} = {}) {
  const enabled = mockBackendEnabled(scope.location?.search);
  if (!enabled) return { enabled: false, ready: Promise.resolve(), recordQuestEvent() {} };
  if (typeof fetchImpl !== "function" || typeof ResponseImpl !== "function" || typeof HeadersImpl !== "function") {
    throw new Error("Mock API mode requires fetch, Response, and Headers support.");
  }

  const nativeFetch = fetchImpl;
  const base = fixtureRoot || new URL("/mock-api/", scope.location?.origin || "http://localhost").toString();
  let catalogPromise = null;
  let currentUserId = null;
  const worldPromises = new Map();

  function readState() {
    try {
      const saved = parseJson(storage?.getItem(STORAGE_KEY) || "", null);
      if (saved && saved.users && saved.players) {
        return {
          nextPlayerId: Number.isSafeInteger(saved.nextPlayerId) ? saved.nextPlayerId : 900001,
          users: saved.users,
          players: saved.players,
        };
      }
    } catch { /* use an in-memory default for blocked browser storage */ }
    return initialState();
  }

  function writeState(state) {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { /* the mock session remains usable until this tab closes */ }
  }

  function jsonResponse(value, status = 200) {
    return new ResponseImpl(JSON.stringify(value), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  function error(message, status = 400, code) {
    return jsonResponse({ error: message, ...(code ? { code } : {}) }, status);
  }

  async function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = nativeFetch(new URL("catalog.json", base).toString(), { cache: "force-cache" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Không tải được catalog mock API.");
          const catalog = await response.json();
          if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.realms) || !Array.isArray(catalog.worlds)) {
            throw new Error("Catalog mock API không đúng schema.");
          }
          return catalog;
        });
    }
    return catalogPromise;
  }

  async function loadWorld(code) {
    const normalized = String(code || "").trim().toLowerCase();
    if (!/^[a-z0-9_]{3,40}$/.test(normalized)) return null;
    if (!worldPromises.has(normalized)) {
      worldPromises.set(normalized, nativeFetch(new URL(`worlds/${normalized}.json`, base).toString(), { cache: "force-cache" })
        .then(async (response) => response.ok ? response.json() : null));
    }
    return worldPromises.get(normalized);
  }

  function requestUser(headers) {
    const authorization = headers.get("Authorization") || headers.get("authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    const match = /^mock-session-(\d+)$/.exec(token);
    if (!match) return null;
    const id = Number(match[1]);
    const state = readState();
    const user = state.users[String(id)];
    if (!user || Number(user.id) !== id) return null;
    currentUserId = id;
    return user;
  }

  function playerFor(state, userId) {
    return state.players[String(userId)] || null;
  }

  function getInventory(player) {
    if (Array.isArray(player?.inventory)) return player.inventory;
    return Array.isArray(parseJson(player?.jsonIventory, null)) ? parseJson(player.jsonIventory, []) : [];
  }

  function setInventory(player, inventory) {
    player.inventory = inventory;
    player.jsonIventory = JSON.stringify(inventory);
  }

  function savePlayer(state, player) {
    setInventory(player, getInventory(player));
    state.players[String(player.userId)] = jsonClone(player);
    writeState(state);
  }

  function playerError(user, state) {
    if (!user) return error("Thiếu hoặc sai phiên đăng nhập mock", 401);
    const player = playerFor(state, user.id);
    return player ? null : error("Player not found", 404);
  }

  function ensureQuestState(player, catalog) {
    if (!player.questState || player.questState.version !== 1 || !player.questState.quests) {
      player.questState = {
        version: 1,
        revision: 0,
        trackedId: catalog.quests.find((quest) => quest.initialStatus === "active")?.id || null,
        quests: Object.fromEntries(catalog.quests.map((quest) => [quest.id, {
          status: quest.initialStatus,
          progress: quest.initialProgress,
        }])),
      };
    }
    return player.questState;
  }

  function questSnapshot(player, catalog) {
    const state = ensureQuestState(player, catalog);
    return {
      revision: state.revision,
      quests: catalog.quests.map((definition) => {
        const progress = state.quests[definition.id] || { status: definition.initialStatus, progress: 0 };
        return {
          id: definition.id,
          category: definition.category,
          title: definition.title,
          giver: definition.giver,
          location: definition.location,
          summary: definition.summary,
          objective: definition.objective,
          progress: progress.progress,
          target: definition.target,
          status: progress.status,
          rewards: definition.rewards.map(({ icon, label }) => ({ icon, label })),
        };
      }),
      trackedId: state.trackedId,
    };
  }

  function updateQuestEvent(player, catalog, event) {
    const state = ensureQuestState(player, catalog);
    let changed = false;
    for (const definition of catalog.quests) {
      const quest = state.quests[definition.id];
      if (quest.status !== "active" || definition.eventType !== event.type) continue;
      if (definition.targetItemId && String(event.itemId || "") !== definition.targetItemId) continue;
      quest.progress = Math.min(Number(definition.target || 0), quest.progress + Math.max(1, Math.floor(Number(event.count) || 1)));
      if (quest.progress >= Number(definition.target || 0)) {
        quest.status = "ready";
        if (state.trackedId === definition.id) {
          state.trackedId = catalog.quests.find((next) => state.quests[next.id]?.status === "active")?.id || null;
        }
      }
      changed = true;
    }
    if (changed) state.revision += 1;
    return changed;
  }

  function deriveStats(stats = {}, equipment = {}) {
    const gear = Object.values(equipment || {}).reduce((total, item) => {
      for (const key of ["pAtk", "mAtk", "pDef", "mDef", "maxHP", "maxMP"]) total[key] += Number(item?.[key] || item?.stats?.[key] || 0);
      return total;
    }, { pAtk: 0, mAtk: 0, pDef: 0, mDef: 0, maxHP: 0, maxMP: 0 });
    return {
      pAtk: 8 + Number(stats.str || 0) * 4 + Number(stats.agi || 0) * 0.5 + gear.pAtk,
      mAtk: 8 + Number(stats.ene || 0) * 4 + Number(stats.agi || 0) * 0.5 + gear.mAtk,
      pDef: 3 + Number(stats.vit || 0) * 2 + Number(stats.agi || 0) * 0.25 + gear.pDef,
      mDef: 3 + Number(stats.ene || 0) * 1.5 + Number(stats.vit || 0) * 0.25 + gear.mDef,
      maxHp: 100 + Number(stats.vit || 0) * 12 + gear.maxHP,
      maxMp: 50 + Number(stats.ene || 0) * 8 + gear.maxMP,
    };
  }

  function combatPower(player) {
    const derived = deriveStats(player.stats, player.equipment);
    return Math.floor(1000 + Number(player.tangTuVi || 1) * 90 + derived.pAtk + derived.mAtk + derived.pDef + derived.mDef);
  }

  function createPlayer(user, body, catalog) {
    const stats = Object.fromEntries(STAT_KEYS.map((key) => [key, Math.floor(Number(body.stats?.[key]) || 0)]));
    const minimum = Number(catalog.balance?.creation?.minStat ?? 5);
    const bonus = Number(catalog.balance?.creation?.bonusPoints ?? 10);
    if (Object.values(stats).some((value) => value < minimum) || Object.values(stats).reduce((sum, value) => sum + value, 0) !== minimum * 4 + bonus) {
      return { error: `Phân bổ thuộc tính phải đủ ${bonus} điểm, mỗi chỉ số tối thiểu ${minimum}.`, status: 400 };
    }
    const root = catalog.roots.find((entry) => entry.id === body.linhCan || entry.code === body.linhCan) || catalog.roots.find((entry) => entry.id === "KIM");
    const realm = catalog.realms.find((entry) => Number(entry.stt) === 1) || catalog.realms[0];
    const requestedMap = String(body.mapCode || body.mapId || "").toLowerCase();
    const defaultWorld = catalog.worlds.find((world) => world.isDefault) || catalog.worlds[0];
    const selectedWorld = user.isDemo && requestedMap === "binh_nguyen"
      ? catalog.worlds.find((world) => world.code === "binh_nguyen") || defaultWorld
      : defaultWorld;
    const derived = deriveStats(stats, {});
    const rootSkills = catalog.skills.filter((skill) => skill.linhCan === root?.id && String(skill.category || "ACTIVE").toUpperCase() !== "PASSIVE");
    const isAttack = (skill) => Number(skill.satThuong || 0) > 0 && skill.effect !== "heal" && !String(skill.effect || "").startsWith("buff_");
    const singleAttack = rootSkills.find((skill) => isAttack(skill) && Number(skill.dienRong || 0) <= 0);
    const areaAttack = rootSkills.find((skill) => isAttack(skill) && Number(skill.dienRong || 0) > 0);
    const initialSkills = [singleAttack, areaAttack, ...rootSkills.filter((skill) => skill !== singleAttack && skill !== areaAttack)].filter(Boolean).slice(0, 4);
    const learnedSkills = [
      ...catalog.skills.filter((skill) => skill.linhCan === "COMMON"),
      ...rootSkills.slice(0, 2),
      ...catalog.skills.filter((skill) => skill.linhCan === root?.id && String(skill.category || "").toUpperCase() === "PASSIVE"),
    ].map((skill) => skill.code);
    const equipment = { weapon: null, armor: null, boots: null, hat: null, gloves: null, ring: null, amulet: null };
    const player = {
      id: 900001,
      userId: user.id,
      name: String(body.name || `TuSĩ_${user.id}`).trim().slice(0, 24),
      gender: body.gender === "FEMALE" ? "FEMALE" : "MALE",
      img: body.gender === "FEMALE" ? "./assets/char_female_anim-source.png" : "./assets/char_male_anim-source.png",
      linhCan: root?.id || "KIM",
      stats,
      derivedStats: derived,
      hp: derived.maxHp,
      maxHp: derived.maxHp,
      mp: derived.maxMp,
      maxMp: derived.maxMp,
      xu: 50,
      tuViHienTai: 0,
      tuViLenCap: Number(body.tuViLenCap || 100),
      tuViLinhCan: 0,
      tangTuVi: 1,
      maCanhGioi: realm.code,
      tenCanhGioi: realm.tenCanhGioi || realm.name,
      canhGioi: realm,
      mapCode: selectedWorld.code,
      mapId: selectedWorld.code,
      x: Number.isFinite(Number(body.x)) ? Number(body.x) : 20,
      y: Number.isFinite(Number(body.y)) ? Number(body.y) : 200,
      learnedSkills,
      equippedSkills: initialSkills.map((skill) => skill.code),
      skills: initialSkills,
      equipment,
      inventory: [],
      jsonIventory: "[]",
      unspentStatPoints: 0,
      combatPower: 0,
    };
    player.combatPower = combatPower(player);
    return { player };
  }

  function parseRequest(input, init) {
    const requestHeaders = new HeadersImpl(input?.headers || undefined);
    for (const [key, value] of new HeadersImpl(init?.headers || {})) requestHeaders.set(key, value);
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    return { method, headers: requestHeaders };
  }

  async function readBody(input, init) {
    let raw = init?.body;
    if (raw === undefined && typeof input?.clone === "function") raw = await input.clone().text();
    if (raw == null || raw === "") return {};
    if (typeof raw === "object" && !(raw instanceof String)) return raw;
    const body = parseJson(String(raw), null);
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  }

  async function handleApi(url, request, input, init) {
    const catalog = await loadCatalog();
    const { pathname } = url;
    const { method, headers } = request;
    const body = ["POST", "PUT", "PATCH"].includes(method) ? await readBody(input, init) : {};
    if (body === null) return error("JSON request không hợp lệ", 400);

    if (method === "POST" && ["/api/auth/demo", "/api/auth/login", "/api/auth/register"].includes(pathname)) {
      const demo = pathname === "/api/auth/demo";
      const username = demo ? "Tu sĩ Demo" : String(body.username || "").trim().slice(0, 20);
      if (!demo && (!username || !String(body.password || ""))) return error("Vui lòng nhập tài khoản và mật khẩu", 400);
      const state = readState();
      const id = demo ? 1 : hashUsername(username);
      const user = { id, username, isDemo: demo };
      state.users[String(id)] = user;
      writeState(state);
      currentUserId = id;
      return jsonResponse({ token: `mock-session-${id}`, user: { id, username } });
    }

    if (pathname === "/api/auth/me" && method === "GET") {
      const user = requestUser(headers);
      return user ? jsonResponse({ user: { id: user.id, username: user.username } }) : error("Token không hợp lệ hoặc đã hết hạn", 401);
    }

    if (method === "GET") {
      if (pathname === "/api/worlds") return jsonResponse(catalog.worlds);
      if (pathname === "/api/worlds/default") {
        const world = catalog.worlds.find((entry) => entry.isDefault) || catalog.worlds[0];
        return await loadWorld(world?.code).then((value) => value ? jsonResponse(value) : error("World not found", 404));
      }
      if (pathname === "/api/worlds/by-code") {
        const world = await loadWorld(url.searchParams.get("code"));
        return world ? jsonResponse(world) : error("World not found", 404);
      }
      if (pathname === "/api/world-structure") return jsonResponse(catalog.worldStructure);
      if (pathname === "/api/canh-gioi") return jsonResponse(catalog.realms);
      let match = /^\/api\/canh-gioi\/stt\/(\d+)$/.exec(pathname);
      if (match) {
        const realm = catalog.realms.find((entry) => Number(entry.stt) === Number(match[1]));
        return realm ? jsonResponse(realm) : error("Realm not found", 404);
      }
      match = /^\/api\/canh-gioi\/(\d+)$/.exec(pathname);
      if (match) {
        const realm = catalog.realms.find((entry) => Number(entry.id) === Number(match[1]));
        return realm ? jsonResponse(realm) : error("Realm not found", 404);
      }
      if (pathname === "/api/linh-can") return jsonResponse(catalog.roots);
      if (pathname === "/api/items") return jsonResponse(catalog.items);
      if (pathname === "/api/skills") return jsonResponse(catalog.skills);
      if (pathname === "/api/monsters") return jsonResponse(catalog.monsters);
      if (pathname === "/api/balance") return jsonResponse(catalog.balance);
      if (pathname === "/api/skill-vfx") return jsonResponse({ profiles: {} });
      if (pathname === "/api/health") return jsonResponse({ status: "mock", apiMode: "local" });
    }

    const user = requestUser(headers);
    const state = readState();
    if (pathname === "/api/skills/catalog" && method === "GET") {
      const missing = playerError(user, state);
      if (missing) return missing;
      const player = playerFor(state, user.id);
      return jsonResponse({ skills: catalog.skills, learnedSkills: player.learnedSkills || [], equippedSkills: player.equippedSkills || [] });
    }
    if (pathname.startsWith("/api/quests")) return handleQuestRoute(pathname, method, body, user, state, catalog);
    if (!pathname.startsWith("/api/player")) return error("Mock API endpoint chưa được cấu hình", 501, "MOCK_ENDPOINT_NOT_IMPLEMENTED");
    return handlePlayerRoute(pathname, method, body, user, state, catalog);
  }

  function handleQuestRoute(pathname, method, body, user, state, catalog) {
    const missing = playerError(user, state);
    if (missing) return missing;
    const player = playerFor(state, user.id);
    ensureQuestState(player, catalog);
    if (pathname === "/api/quests" && method === "GET") {
      savePlayer(state, player);
      return jsonResponse(questSnapshot(player, catalog));
    }
    const match = /^\/api\/quests\/([^/]+)\/(accept|track|claim)$/.exec(pathname);
    if (!match || method !== "POST") return error("Mock API endpoint chưa được cấu hình", 501, "MOCK_ENDPOINT_NOT_IMPLEMENTED");
    const questId = decodeURIComponent(match[1]);
    const action = match[2];
    const definition = catalog.quests.find((entry) => entry.id === questId);
    if (!definition) return error("Nhiệm vụ không tồn tại", 404, "QUEST_NOT_FOUND");
    const quest = player.questState.quests[questId];
    if (action === "accept") {
      if (quest.status !== "available") return error("Nhiệm vụ này không thể nhận", 409, "QUEST_NOT_AVAILABLE");
      quest.status = Number(definition.target || 0) === 0 ? "ready" : "active";
      if (!player.questState.trackedId && quest.status === "active") player.questState.trackedId = questId;
    } else if (action === "track") {
      if (quest.status !== "active") return error("Chỉ có thể theo dõi nhiệm vụ đang làm", 409, "QUEST_NOT_ACTIVE");
      player.questState.trackedId = player.questState.trackedId === questId ? null : questId;
    } else {
      if (quest.status !== "ready") return error("Chưa đủ điều kiện nhận thưởng", 409, "QUEST_NOT_READY");
      const inventory = jsonClone(getInventory(player));
      for (const reward of definition.rewards) {
        if (reward.type !== "item") continue;
        const item = catalog.items.find((entry) => entry.id === reward.itemId);
        if (!item) return error("Phần thưởng nhiệm vụ chưa được cấu hình", 400, "QUEST_REWARD_INVALID");
        const existing = inventory.find((entry) => entry.id === item.id);
        if (existing) {
          const count = Number(existing.count || 0) + Number(reward.amount || 0);
          if (count > 99) return error("Túi đồ không đủ chỗ nhận phần thưởng", 400, "INVENTORY_FULL");
          existing.count = count;
        } else {
          if (inventory.length >= 40) return error("Túi đồ không đủ chỗ nhận phần thưởng", 400, "INVENTORY_FULL");
          inventory.push({ ...item, count: Number(reward.amount || 1), equipped: false });
        }
      }
      for (const reward of definition.rewards) {
        if (reward.type === "xu") player.xu = Number(player.xu || 0) + Number(reward.amount || 0);
        if (reward.type === "tuVi") player.tuViHienTai = Number(player.tuViHienTai || 0) + Number(reward.amount || 0);
      }
      setInventory(player, inventory);
      quest.status = "completed";
      if (player.questState.trackedId === questId) {
        player.questState.trackedId = catalog.quests.find((next) => player.questState.quests[next.id]?.status === "active")?.id || null;
      }
      player.questState.revision += 1;
      savePlayer(state, player);
      return jsonResponse({
        ok: true,
        rewards: definition.rewards,
        grantedItems: definition.rewards.filter((reward) => reward.type === "item").map((reward) => ({ itemId: reward.itemId, name: catalog.items.find((item) => item.id === reward.itemId)?.name || reward.itemId, count: reward.amount })),
        ...questSnapshot(player, catalog),
        player: { xu: player.xu, tuViHienTai: player.tuViHienTai, inventory: getInventory(player) },
      });
    }
    player.questState.revision += 1;
    savePlayer(state, player);
    return jsonResponse({ ok: true, ...questSnapshot(player, catalog) });
  }

  async function handlePlayerRoute(pathname, method, body, user, state, catalog) {
    if (pathname === "/api/player" && method === "POST") {
      if (!user) return error("Thiếu hoặc sai phiên đăng nhập mock", 401);
      // Bind ownership to the authenticated mock session, matching the real API contract.
      if (playerFor(state, user.id)) return error("Player already exists", 409);
      const created = createPlayer(user, body, catalog);
      if (created.error) return error(created.error, created.status);
      created.player.id = state.nextPlayerId++;
      savePlayer(state, created.player);
      writeState(state);
      return jsonResponse(created.player);
    }

    const userForRequest = user;
    if (!userForRequest) return error("Thiếu hoặc sai phiên đăng nhập mock", 401);
    const player = playerFor(state, userForRequest.id);
    const routePlayer = pathname.match(/^\/api\/player\/by-user\/(\d+)$/);
    if (routePlayer && method === "GET") {
      if (Number(routePlayer[1]) !== Number(userForRequest.id)) return error("Không được phép", 403);
      return player ? jsonResponse(player) : error("Player not found", 404);
    }
    if (["/api/player/me", "/api/player/state"].includes(pathname) && method === "GET") {
      return player ? jsonResponse(player) : error("Player not found", 404);
    }
    if (pathname === "/api/player/power" && method === "GET") {
      return player ? jsonResponse({ combatPower: combatPower(player) }) : error("Player not found", 404);
    }
    if (!player) return error("Player not found", 404);

    const itemById = (id) => catalog.items.find((entry) => String(entry.id || entry.code) === String(id) || String(entry.code || "") === String(id));
    const save = () => { player.combatPower = combatPower(player); savePlayer(state, player); };
    const resultPlayer = (result) => jsonResponse({ player: jsonClone(player), result });
    let match;

    if (pathname === "/api/player/respawn" && method === "POST") {
      const world = await loadWorld(player.mapCode || player.mapId);
      const spawnX = Number(world?.spawnX);
      const spawnY = Number(world?.spawnY);
      player.x = Number.isFinite(spawnX) ? spawnX : Number(player.x || 0);
      player.y = Number.isFinite(spawnY) ? spawnY : Number(player.y || 0);
      player.mapCode = world?.code || player.mapCode || player.mapId;
      player.mapId = player.mapCode;
      player.hp = Math.max(1, Math.floor(Number(player.maxHp || player.derivedStats?.maxHp || 1) * 0.5));
      player.mp = Math.max(0, Math.floor(Number(player.maxMp || player.derivedStats?.maxMp || 0) * 0.5));
      player.dead = false;
      player.combatPower = combatPower(player);
      savePlayer(state, player);
      return resultPlayer({ type: "respawned", mapCode: player.mapCode, x: player.x, y: player.y, hp: player.hp, mp: player.mp });
    }

    if ((match = /^\/api\/player\/(\d+)$/.exec(pathname)) && method === "PUT") {
      if (Number(match[1]) !== Number(player.id)) return error("Không được phép", 403);
      for (const key of ["name", "gender", "img", "linhCan", "maCanhGioi", "tangTuVi", "tuViHienTai", "tuViLenCap", "tuViLinhCan", "stats", "hp", "maxHp", "mp", "maxMp", "xu", "x", "y", "mapCode", "mapId", "jsonIventory", "skills", "equipment", "equip_slot"]) {
        if (body[key] !== undefined) player[key] = body[key];
      }
      if (typeof player.jsonIventory === "string") setInventory(player, parseJson(player.jsonIventory, []));
      save();
      return jsonResponse(player);
    }

    if (pathname === "/api/player/inventory/use" && method === "POST") {
      const inventory = getInventory(player);
      const index = Number.isInteger(body.index) ? body.index : inventory.findIndex((entry) => entry.id === body.itemId);
      const item = inventory[index];
      if (!item) return error("Item not found", 404);
      const definition = itemById(item.id);
      if (!definition) return error("Vật phẩm không còn trong danh mục sử dụng", 400);
      const count = Number(item.count ?? 1);
      if (!Number.isSafeInteger(count) || count < 1) return error("Số lượng vật phẩm không hợp lệ", 400);
      const type = String(definition.type || definition.loai || "").toUpperCase();
      const result = { type: "item_used", itemId: definition.id, hp: 0, mp: 0, stat: null };
      if (["STONE", "ELEMSTONE"].includes(type)) {
        result.amount = Math.floor(Number(definition.giaTriTuVi || 0));
        if (!Number.isSafeInteger(result.amount) || result.amount <= 0) return error("Giá trị vật phẩm tu vi không hợp lệ", 400);
        player.tuViHienTai = Number(player.tuViHienTai || 0) + result.amount;
        result.type = "cultivation_absorbed";
      } else if (type === "LINDAN") {
        const cap = Number(catalog.balance?.progression?.linhCan?.itemCap || 1000);
        result.gain = Math.min(Math.max(0, Number(definition.tuViLinhCanVal || 0)), cap - Math.max(0, Number(player.tuViLinhCan || 0)));
        if (result.gain <= 0) return error("Tu vi linh căn đã đạt giới hạn vật phẩm", 400);
        player.tuViLinhCan = Number(player.tuViLinhCan || 0) + result.gain;
        result.type = "root_cultivation";
      } else if (["POTION", "CONSUME"].includes(type)) {
        result.hp = Math.floor(Number(definition.healHp || 0));
        result.mp = Math.floor(Number(definition.healMp || 0));
        const statBoost = Math.floor(Number(definition.statBoost || 0));
        const stat = String(definition.statKey || "str");
        if (![result.hp, result.mp, statBoost].every(Number.isSafeInteger) || result.hp < 0 || result.mp < 0 || statBoost < 0) return error("Hiệu ứng vật phẩm không hợp lệ", 400);
        if (statBoost > 0 && !STAT_KEYS.includes(stat)) return error("Hiệu ứng chỉ số của vật phẩm không hợp lệ", 400);
        player.hp = Math.min(Number(player.maxHp || 100), Number(player.hp || 0) + result.hp);
        player.mp = Math.min(Number(player.maxMp || 50), Number(player.mp || 0) + result.mp);
        if (statBoost > 0) {
          player.stats = { ...(player.stats || {}), [stat]: Number(player.stats?.[stat] || 0) + statBoost };
          result.stat = { key: stat, amount: statBoost };
        }
      } else return error("Item chưa có logic sử dụng", 400);
      item.count = count - 1;
      if (item.count <= 0) inventory.splice(index, 1);
      setInventory(player, inventory);
      save();
      return resultPlayer(result);
    }

    if (pathname === "/api/player/shop/buy" && method === "POST") {
      const item = itemById(body.itemCode);
      if (!item) return error("Item not found", 404);
      const quantity = Number(body.quantity);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) return error("Số lượng phải là số nguyên từ 1 đến 99", 400, "INVALID_QUANTITY");
      const unitPrice = Math.max(0, Math.floor(Number(item.giaMua) || 0));
      const price = unitPrice * quantity;
      if (Number(player.xu || 0) < price) return error("Không đủ xu", 400);
      const inventory = getInventory(player);
      const existing = inventory.find((entry) => String(entry.itemCode || entry.id) === String(item.id || item.code));
      if (existing) {
        const count = Number(existing.count ?? 1);
        if (count + quantity > 99) return error("Số lượng vật phẩm đã đạt giới hạn", 400);
        existing.count = count + quantity;
      } else if (inventory.length < 40) inventory.push({ ...item, itemCode: item.id || item.code, count: quantity, equipped: false });
      else return error("Túi đồ đầy", 400);
      player.xu = Number(player.xu || 0) - price;
      setInventory(player, inventory);
      save();
      return resultPlayer({ type: "bought", itemId: item.id, itemCode: item.id || item.code, quantity, price });
    }

    if (pathname === "/api/player/shop/sell" && method === "POST") {
      const inventory = getInventory(player);
      const itemCode = String(body.itemCode || "");
      const index = inventory.findIndex((entry) => String(entry.itemCode || entry.id) === itemCode);
      if (index < 0) return error("Vật phẩm không còn trong túi đồ", 400);
      const item = inventory[index];
      const definition = itemById(itemCode);
      if (!definition) return error("Vật phẩm không còn trong danh mục bán", 400);
      const quantity = Number(body.quantity);
      const count = Number(item.count ?? 1);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99 || quantity > count) return error("Số lượng bán không hợp lệ", 400, "INVALID_QUANTITY");
      const price = Math.max(0, Math.floor(Number(definition.giaBan) || 0)) * quantity;
      if (price <= 0) return error("Vật phẩm này không thể bán", 400);
      player.xu = Number(player.xu || 0) + price;
      item.count = Math.max(0, count - quantity);
      if (item.count <= 0) inventory.splice(index, 1);
      setInventory(player, inventory);
      save();
      return resultPlayer({ type: "sold", itemId: definition.id, itemCode: definition.id || definition.code, quantity, price });
    }

    if (pathname === "/api/player/cultivation/absorb" && method === "POST") {
      const inventory = getInventory(player);
      const index = inventory.findIndex((entry) => String(entry.id) === String(body.itemId));
      const item = inventory[index];
      const definition = item && itemById(item.id);
      if (!item || !definition || !["STONE", "ELEMSTONE"].includes(String(definition.type || definition.loai).toUpperCase())) return error("Không tìm thấy linh thạch trong túi đồ", 404);
      const amount = Math.floor(Number(definition.giaTriTuVi || 0));
      const count = Number(item.count ?? 1);
      if (!Number.isSafeInteger(amount) || amount <= 0) return error("Giá trị vật phẩm tu vi không hợp lệ", 400);
      if (!Number.isSafeInteger(count) || count < 1) return error("Số lượng vật phẩm không hợp lệ", 400);
      player.tuViHienTai = Number(player.tuViHienTai || 0) + amount;
      item.count = count - 1;
      if (item.count <= 0) inventory.splice(index, 1);
      setInventory(player, inventory);
      save();
      return resultPlayer({ type: "cultivation_absorbed", amount });
    }

    if (pathname === "/api/player/cultivation/breakthrough" && method === "POST") {
      const realm = catalog.realms.find((entry) => entry.code === player.maCanhGioi) || catalog.realms[0];
      const stage = Number(player.tangTuVi || 1);
      const rule = catalog.progressionRules.find((entry) => entry.realmCode === realm.code && entry.stage === stage);
      if (!rule) return error("Đã đạt cảnh giới tối cao", 400);
      if (Number(player.tuViHienTai || 0) < Number(rule.threshold)) return jsonResponse({ error: "Tu vi chưa đủ", required: rule.threshold, current: player.tuViHienTai || 0 }, 400);
      if (combatPower(player) < Number(rule.minimumOvr)) return jsonResponse({ error: "OVR chưa đủ điều kiện đột phá", requiredOvr: rule.minimumOvr, currentOvr: combatPower(player) }, 400);
      const major = stage >= Number(realm.soTang || 9);
      if (major && realm.danPhaCanh) {
        const inventory = getInventory(player);
        const index = inventory.findIndex((item) => item.id === realm.danPhaCanh && Number(item.count || 0) > 0);
        if (index < 0) return error(`Cần ${realm.danPhaCanh} để phá đại cảnh giới`, 400);
        inventory[index].count -= 1;
        if (inventory[index].count <= 0) inventory.splice(index, 1);
        setInventory(player, inventory);
      }
      player.tuViHienTai = 0;
      if (major) {
        const nextRealm = catalog.realms.find((entry) => Number(entry.stt) === Number(realm.stt) + 1);
        if (!nextRealm) return error("Đã đạt cảnh giới tối cao", 400);
        player.maCanhGioi = nextRealm.code;
        player.canhGioi = nextRealm;
        player.tenCanhGioi = nextRealm.tenCanhGioi || nextRealm.name;
        player.tangTuVi = 1;
      } else player.tangTuVi = stage + 1;
      for (const key of STAT_KEYS) player.stats[key] = Number(player.stats?.[key] || 0) + Number(rule.gain?.[key] || 0);
      player.unspentStatPoints = Number(player.unspentStatPoints || 0) + Object.values(rule.gain || {}).reduce((sum, value) => sum + Number(value || 0), 0);
      const derived = deriveStats(player.stats, player.equipment);
      player.maxHp = derived.maxHp;
      player.maxMp = derived.maxMp;
      player.hp = Math.min(Number(player.maxHp), Number(player.hp || 0) + Number(rule.gain?.vit || 0) * 12);
      player.mp = Math.min(Number(player.maxMp), Number(player.mp || 0) + Number(rule.gain?.ene || 0) * 8);
      player.tuViLenCap = rule.threshold;
      save();
      return resultPlayer({ type: major ? "realm_breakthrough" : "stage_breakthrough", gain: rule.gain, major });
    }

    if (pathname === "/api/player/stats/allocate" && method === "POST") {
      const stat = String(body.stat || "");
      const amount = body.amount == null ? 1 : Number(body.amount);
      if (!STAT_KEYS.includes(stat)) return error("Stat không hợp lệ", 400);
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000) return error("Số điểm phải là số nguyên từ 1 đến 1000", 400, "INVALID_AMOUNT");
      if (Number(player.unspentStatPoints || 0) < amount) return error("Không đủ điểm thuộc tính", 400);
      player.stats[stat] = Number(player.stats?.[stat] || 0) + amount;
      player.unspentStatPoints -= amount;
      player.derivedStats = deriveStats(player.stats, player.equipment);
      player.maxHp = player.derivedStats.maxHp;
      player.maxMp = player.derivedStats.maxMp;
      player.hp = Math.min(Number(player.hp || 0), player.maxHp);
      player.mp = Math.min(Number(player.mp || 0), player.maxMp);
      save();
      return jsonResponse({ stats: player.stats, unspentStatPoints: player.unspentStatPoints, derivedStats: player.derivedStats, player: jsonClone(player) });
    }

    if (pathname === "/api/player/skills/learn" && method === "POST") {
      const code = String(body.skillCode || "");
      const skill = catalog.skills.find((entry) => entry.code === code);
      if (!skill) return error("Skill not found", 404);
      if (skill.linhCan !== "COMMON" && skill.linhCan !== player.linhCan) return error("Skill không thuộc linh căn", 403);
      if (Number(skill.tier || 1) > Number(player.canhGioi?.stt || 1)) return error(`Yêu cầu cảnh giới tầng ${skill.tier} trở lên để lĩnh hội thần thông này`, 400);
      player.learnedSkills = Array.from(new Set([...(player.learnedSkills || []), code]));
      save();
      return jsonResponse({ learnedSkills: player.learnedSkills, skill, combatPower: player.combatPower });
    }

    if (pathname === "/api/player/skills/equip" && method === "PUT") {
      const codes = Array.from(new Set(Array.isArray(body.skillCodes) ? body.skillCodes : [])).slice(0, 4);
      if (codes.some((code) => !(player.learnedSkills || []).includes(code))) return error("Chỉ được trang bị skill đã học", 400);
      const skills = codes.map((code) => catalog.skills.find((entry) => entry.code === code)).filter((skill) => skill && String(skill.category || "ACTIVE").toUpperCase() !== "PASSIVE");
      player.equippedSkills = skills.map((skill) => skill.code);
      player.skills = skills;
      save();
      return jsonResponse({ equippedSkills: player.equippedSkills, skills: player.skills });
    }

    if (pathname === "/api/player/equipment/equip" && method === "POST") {
      const inventory = getInventory(player);
      const index = Number.isInteger(body.index) ? body.index : inventory.findIndex((item) => item.id === body.itemId);
      const item = inventory[index];
      const definition = item && itemById(item.id);
      if (!item || !definition || String(definition.type || definition.loai).toUpperCase() !== "EQUIPMENT") return error("Không tìm thấy trang bị", 404);
      const slot = String(body.slot || definition.slot || "weapon");
      const realm = Number(player.canhGioi?.stt || 1);
      if (realm < Number(definition.requiredRealmStt || 1)) return error("Cảnh giới chưa đủ để trang bị", 400, "REALM_TOO_LOW");
      player.equipment = { ...(player.equipment || {}), [slot]: { ...definition } };
      inventory.splice(index, 1);
      setInventory(player, inventory);
      save();
      return resultPlayer({ type: "equipment_equipped", slot, itemId: definition.id });
    }

    if (pathname === "/api/player/equipment/unequip" && method === "POST") {
      const slot = String(body.slot || "");
      const equipment = { ...(player.equipment || {}) };
      const item = equipment[slot];
      if (!item) return error("Không có trang bị ở vị trí này", 404);
      const inventory = getInventory(player);
      if (inventory.length >= 40) return error("Túi đồ đầy", 400);
      equipment[slot] = null;
      player.equipment = equipment;
      inventory.push({ ...item, equipped: false, count: 1 });
      setInventory(player, inventory);
      save();
      return resultPlayer({ type: "equipment_unequipped", slot, itemId: item.id });
    }

    return error("Mock API endpoint chưa được cấu hình", 501, "MOCK_ENDPOINT_NOT_IMPLEMENTED");
  }

  async function request(input, init = {}) {
    const url = new URL(typeof input === "string" ? input : (input?.url || String(input)), scope.location?.href || scope.location?.origin || "http://localhost");
    const { method, headers } = parseRequest(input, init);
    return handleApi(url, { method, headers }, input, init);
  }

  const backend = {
    enabled: true,
    ready: loadCatalog(),
    async recordQuestEvent(type, details = {}) {
      if (!currentUserId) {
        const token = session?.getItem("tu_tien_token") || "";
        const match = /^mock-session-(\d+)$/.exec(token);
        if (match) currentUserId = Number(match[1]);
      }
      if (!currentUserId) return false;
      const catalog = await loadCatalog();
      const state = readState();
      const player = playerFor(state, currentUserId);
      if (!player || !updateQuestEvent(player, catalog, { type, ...details })) return false;
      savePlayer(state, player);
      try { scope.dispatchEvent(new Event(QUEST_EVENT_NAME)); } catch { }
      return true;
    },
  };

  scope.fetch = (input, init) => {
    let url;
    try { url = new URL(typeof input === "string" ? input : (input?.url || String(input)), scope.location?.href || scope.location?.origin || "http://localhost"); }
    catch { return nativeFetch(input, init); }
    if (url.origin !== new URL(scope.location?.origin || url.origin).origin
      || !url.pathname.startsWith("/api/")
      || url.pathname.startsWith("/api/admin/")) {
      return nativeFetch(input, init);
    }
    return request(input, init || {});
  };

  return backend;
}
