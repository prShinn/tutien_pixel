"use strict";

const express = require("express");
const { checkEquipmentRealm } = require("../game/equipment-rules");

function createPlayerRouter({
  authenticate,
  playerFor,
  players,
  playersByUserId,
  createPlayerId,
  readInventory,
  writeInventory,
  combatPower,
  realms,
  breakthroughThreshold,
  minimumBreakthroughOvr,
  breakthroughGain,
  items,
  BALANCE,
  roots,
  worlds,
  isWorldPublished,
  nearestWalkablePoint,
  deriveStats,
  calcTuViNeeded,
  skills,
  emptyEquipment,
  normalizeEquipment,
  EQUIPMENT_SLOTS,
  gameStateStore,
  storePlayer,
  users,
}) {
  const router = express.Router();
  router.post("/cultivation/absorb", authenticate, (req, res) => {
    const player = playerFor(req.userId);
    if (!player) return res.status(404).json({ error: "Player not found" });

    let amount = 0;
    if (req.body?.itemId) {
      const inventory = readInventory(player);
      const index = inventory.findIndex((item) => String(item.id) === String(req.body.itemId));
      if (index < 0) return res.status(404).json({ error: "Không tìm thấy linh thạch trong túi đồ" });
      const item = inventory[index];
      const catalogItem = items.find((entry) => String(entry.id) === String(item.id));
      const type = String(catalogItem?.type || catalogItem?.loai || "").toUpperCase();
      if (!catalogItem || !["STONE", "ELEMSTONE"].includes(type)) {
        return res.status(400).json({ error: "Vật phẩm không phải linh thạch hợp lệ trong danh mục" });
      }
      amount = Math.floor(Number(catalogItem.giaTriTuVi || 0));
      const count = Number(item.count ?? 1);
      if (!Number.isSafeInteger(amount) || amount <= 0) return res.status(400).json({ error: "Giá trị vật phẩm tu vi không hợp lệ" });
      if (!Number.isSafeInteger(count) || count < 1) return res.status(400).json({ error: "Số lượng vật phẩm không hợp lệ" });
      item.count = Number(item.count || 1) - 1;
      if (item.count <= 0) inventory.splice(index, 1);
      writeInventory(player, inventory);
    } else {
      return res.status(400).json({ error: "Chỉ được hấp thụ từ vật phẩm tu vi trong túi" });
    }

    player.tuViHienTai = Math.max(0, Number(player.tuViHienTai || 0) + amount);
    player.combatPower = combatPower(player);
    players.set(player.id, player);
    res.json({ player, result: { type: "cultivation_absorbed", amount } });
  });

  router.post("/cultivation/breakthrough", authenticate, (req, res) => {
    const player = playerFor(req.userId);
    if (!player) return res.status(404).json({ error: "Player not found" });
    const realm = realms.find((item) => item.code === player.maCanhGioi) || realms.find((item) => item.stt === Number(player.realm || 1)) || realms[0];
    const stage = Number(player.tangTuVi || player.stage || 1);
    const major = stage >= Number(realm.soTang || 9);
    const next = major ? realms.find((item) => item.stt === Number(realm.stt) + 1) : null;
    if (major && !next) return res.status(400).json({ error: "Đã đạt cảnh giới tối cao" });
    const threshold = breakthroughThreshold(realm, stage);
    if (Number(player.tuViHienTai || 0) < threshold) return res.status(400).json({ error: "Tu vi chưa đủ", required: threshold, current: player.tuViHienTai || 0 });
    const currentPower = combatPower(player);
    const requiredPower = minimumBreakthroughOvr(realm, stage, major);
    if (currentPower < requiredPower) return res.status(400).json({ error: "OVR chưa đủ điều kiện đột phá", requiredOvr: requiredPower, currentOvr: currentPower });
    if (major && realm.danPhaCanh) {
      const inventory = readInventory(player);
      const pillIndex = inventory.findIndex((item) => item.id === realm.danPhaCanh && Number(item.count || 0) > 0);
      if (pillIndex < 0) return res.status(400).json({ error: `Cần ${realm.danPhaCanh} để phá đại cảnh giới` });
      inventory[pillIndex].count -= 1;
      if (inventory[pillIndex].count <= 0) inventory.splice(pillIndex, 1);
      writeInventory(player, inventory);
    }
    const gain = breakthroughGain(realm, stage, major);
    player.tuViHienTai = Math.max(0, Number(player.tuViHienTai || 0) - threshold);
    player.stats = { ...(player.stats || {}), str: (player.stats?.str || 0) + gain.str, agi: (player.stats?.agi || 0) + gain.agi, vit: (player.stats?.vit || 0) + gain.vit, ene: (player.stats?.ene || 0) + gain.ene };
    if (major) {
      player.maCanhGioi = next.code; player.canhGioi = next; player.tenCanhGioi = next.tenCanhGioi; player.realm = next.stt;
      player.tangTuVi = 1;
    } else {
      player.tangTuVi = stage + 1;
    }
    const currentRealm = player.canhGioi || realm;
    player.tuViLenCap = breakthroughThreshold(currentRealm, player.tangTuVi);
    player.maxHp = 100 + player.stats.vit * 12;
    player.maxMp = 50 + player.stats.ene * 8;
    player.hp = Math.min(Number(player.hp || player.maxHp) + gain.vit * 12, player.maxHp);
    player.mp = Math.min(Number(player.mp || player.maxMp) + gain.ene * 8, player.maxMp);
    player.combatPower = combatPower(player);
    players.set(player.id, player);
    res.json({ player, result: { type: major ? "realm_breakthrough" : "stage_breakthrough", gain, major } });
  });

  router.get("/me", authenticate, (req, res) => {
    const player = playerFor(req.userId);
    if (!player) return res.status(404).json({ error: "Player not found" });
    res.json(player);
  });
  router.get("/state", authenticate, (req, res) => {
    const player = playerFor(req.userId);
    if (!player) return res.status(404).json({ error: "Player not found" });
    res.json(player);
  });

  router.get("/by-user/:userId", authenticate, (req, res) => {
    if (Number(req.params.userId) !== req.userId) return res.status(403).json({ error: "Không được phép" });
    const player = playerFor(req.userId);
    if (!player) return res.status(404).json({ error: "Player not found" });
    res.json(player);
  });
  router.post("/inventory/use", authenticate, (req, res) => {
    const player = playerFor(req.userId);
    if (!player) return res.status(404).json({ error: "Player not found" });
    let inventory = [];
    try { inventory = typeof player.jsonIventory === "string" ? JSON.parse(player.jsonIventory || "[]") : (player.inventory || []); } catch { inventory = []; }
    const index = Number.isInteger(req.body?.index) ? req.body.index : inventory.findIndex((item) => item.id === req.body?.itemId);
    const item = inventory[index];
    if (!item) return res.status(404).json({ error: "Item not found" });
    const catalogItem = items.find((entry) => String(entry.id) === String(item.id));
    if (!catalogItem) return res.status(400).json({ error: "Vật phẩm không còn trong danh mục sử dụng" });
    const count = Number(item.count ?? 1);
    if (!Number.isSafeInteger(count) || count < 1) return res.status(400).json({ error: "Số lượng vật phẩm không hợp lệ" });
    const type = String(catalogItem.type || catalogItem.loai || "").toUpperCase();
    const result = { type: "item_used", itemId: catalogItem.id, hp: 0, mp: 0, stat: null };
    if (type === "STONE" || type === "ELEMSTONE") {
      const amount = Math.floor(Number(catalogItem.giaTriTuVi || 0));
      if (!Number.isSafeInteger(amount) || amount <= 0) return res.status(400).json({ error: "Giá trị vật phẩm tu vi không hợp lệ" });
      player.tuViHienTai = Number(player.tuViHienTai || 0) + amount;
      result.amount = amount;
      result.type = "cultivation_absorbed";
    } else if (type === "LINDAN") {
      const cap = BALANCE.progression.linhCan.itemCap;
      const current = Math.max(0, Number(player.tuViLinhCan || 0));
      const gain = Math.min(Math.max(0, Number(catalogItem.tuViLinhCanVal || 0)), cap - current);
      if (gain <= 0) return res.status(400).json({ error: "Tu vi linh căn đã đạt giới hạn vật phẩm" });
      player.tuViLinhCan = current + gain;
      result.gain = gain;
      result.type = "root_cultivation";
    } else if (type === "POTION" || type === "CONSUME") {
      const healHp = Math.floor(Number(catalogItem.healHp || 0));
      const healMp = Math.floor(Number(catalogItem.healMp || 0));
      const statBoost = Math.floor(Number(catalogItem.statBoost || 0));
      const stat = String(catalogItem.statKey || "str");
      if (![healHp, healMp, statBoost].every(Number.isSafeInteger) || healHp < 0 || healMp < 0 || statBoost < 0) {
        return res.status(400).json({ error: "Hiệu ứng vật phẩm không hợp lệ" });
      }
      if (statBoost > 0 && !["str", "agi", "vit", "ene"].includes(stat)) {
        return res.status(400).json({ error: "Hiệu ứng chỉ số của vật phẩm không hợp lệ" });
      }
      result.hp = healHp;
      result.mp = healMp;
      player.hp = Math.min(Number(player.maxHp || 100), Number(player.hp || 0) + result.hp);
      player.mp = Math.min(Number(player.maxMp || 50), Number(player.mp || 0) + result.mp);
      if (statBoost > 0) {
        player.stats = { ...(player.stats || {}), [stat]: Number(player.stats?.[stat] || 0) + statBoost };
        result.stat = { key: stat, amount: statBoost };
      }
    } else return res.status(400).json({ error: "Item chưa có logic sử dụng" });
    item.count = count - 1;
    if (item.count <= 0) inventory.splice(index, 1);
    player.inventory = inventory;
    player.jsonIventory = JSON.stringify(inventory);
    player.combatPower = combatPower(player);
    players.set(player.id, player);
    res.json({ player, result });
  });

  router.post("/shop/buy", authenticate, (req, res) => {
    const player = playerFor(req.userId);
    const item = items.find((entry) => entry.id === req.body?.itemId);
    if (!player || !item) return res.status(404).json({ error: "Item not found" });
    const price = Math.max(0, Math.floor(Number(item.giaMua) || 0));
    if (Number(player.xu || 0) < price) return res.status(400).json({ error: "Không đủ xu" });
    const inventory = readInventory(player);
    const existing = inventory.find((entry) => entry.id === item.id);
    if (existing) existing.count = Math.min(99, Number(existing.count || 0) + 1);
    else if (inventory.length < 40) inventory.push({ ...item, count: 1 });
    else return res.status(400).json({ error: "Túi đồ đầy" });
    player.xu -= price;
    writeInventory(player, inventory);
    players.set(player.id, player);
    res.json({ player, result: { type: "bought", itemId: item.id } });
  });

  router.post("/shop/sell", authenticate, (req, res) => {
    const player = playerFor(req.userId);
    if (!player) return res.status(404).json({ error: "Player not found" });
    const inventory = readInventory(player);
    const index = Number(req.body?.index);
    if (!Number.isInteger(index) || index < 0 || index >= inventory.length) {
      return res.status(400).json({ error: "Vị trí vật phẩm không hợp lệ" });
    }
    const item = inventory[index];
    if (!item) return res.status(404).json({ error: "Item not found" });
    const catalogItem = items.find((entry) => String(entry.id) === String(item.id));
    if (!catalogItem) return res.status(400).json({ error: "Vật phẩm không còn trong danh mục bán" });
    const count = Number(item.count ?? 1);
    if (!Number.isSafeInteger(count) || count < 1) return res.status(400).json({ error: "Số lượng vật phẩm không hợp lệ" });
    const price = Math.max(0, Math.floor(Number(catalogItem.giaBan) || 0));
    if (price <= 0) return res.status(400).json({ error: "Vật phẩm này không thể bán" });
    player.xu = Number(player.xu || 0) + price;
    item.count = Number(item.count || 1) - 1;
    if (item.count <= 0) inventory.splice(index, 1);
    writeInventory(player, inventory);
    players.set(player.id, player);
    res.json({ player, result: { type: "sold", itemId: catalogItem.id, price } });
  });

  router.post("/", authenticate, async (req, res) => {
    // Owner is derived from the authenticated session; never require or trust a body userId.
    const existing = playerFor(req.userId);
    if (existing) return res.status(409).json(existing);
    const inputStats = req.body?.stats || {};
    const stats = Object.fromEntries(["str", "agi", "vit", "ene"].map((key) => [key, Math.floor(Number(inputStats[key]) || 0)]));
    const statTotal = Object.values(stats).reduce((sum, value) => sum + value, 0);
    if (Object.values(stats).some((value) => value < BALANCE.creation.minStat) || statTotal !== (BALANCE.creation.minStat * 4 + BALANCE.creation.bonusPoints)) {
      return res.status(400).json({ error: `Phân bổ thuộc tính phải đủ ${BALANCE.creation.bonusPoints} điểm, mỗi chỉ số tối thiểu ${BALANCE.creation.minStat}.` });
    }

    const name = String(req.body?.name || "").trim().slice(0, 24) || `TuSĩ_${req.userId}`;
    const gender = ["FEMALE", "female", "nu"].includes(req.body?.gender) ? "FEMALE" : "MALE";
    const validRoot = roots.find((r) => r.id === req.body?.linhCan || r.code === req.body?.linhCan);
    const linhCan = validRoot ? validRoot.id : "KIM";
    const defaultRealm = realms.find((r) => r.stt === 1) || realms[0];
    const requestedMap = String(req.body?.mapCode || req.body?.mapId || "").trim().toLowerCase();
    const defaultWorld = worlds.find((world) => world.isDefault && isWorldPublished(world)) || worlds.find(isWorldPublished);
    const demoWorld = users.get(req.userId)?.isDemo
      ? worlds.find((world) => world.code === "binh_nguyen" && isWorldPublished(world))
      : null;
    const selectedWorld = demoWorld && requestedMap === demoWorld.code ? demoWorld : defaultWorld;
    if (!selectedWorld) return res.status(503).json({ error: "Chưa có bản đồ khởi đầu khả dụng" });
    const spawn = nearestWalkablePoint(
      selectedWorld,
      selectedWorld.spawnX ?? Math.floor(Number(selectedWorld.w || 600) / 2),
      selectedWorld.spawnY ?? Math.floor(Number(selectedWorld.h || 400) / 2),
    );
    if (!spawn) return res.status(503).json({ error: "Bản đồ khởi đầu chưa có điểm sinh hợp lệ" });
    const derived = deriveStats(stats, {});

    const rootSkills = skills.filter((skill) => skill.linhCan === linhCan && skill.category !== "PASSIVE");
    const isAttack = (skill) => Number(skill.satThuong || 0) > 0 && skill.effect !== "heal" && !String(skill.effect || "").startsWith("buff_");
    const singleAttack = rootSkills.find((skill) => isAttack(skill) && Number(skill.dienRong || 0) <= 0);
    const areaAttack = rootSkills.find((skill) => isAttack(skill) && Number(skill.dienRong || 0) > 0);
    const initialSkills = [singleAttack, areaAttack, ...rootSkills.filter((skill) => skill !== singleAttack && skill !== areaAttack)].filter(Boolean).slice(0, 4);

    const player = {
      id: createPlayerId(),
      userId: req.userId,
      name,
      gender,
      img: gender === "FEMALE" ? "./assets/char_female_anim-source.png" : "./assets/char_male_anim-source.png",
      linhCan,
      stats,
      derivedStats: derived,
      hp: derived.maxHp,
      maxHp: derived.maxHp,
      mp: derived.maxMp,
      maxMp: derived.maxMp,
      xu: 50,
      tuViHienTai: 0,
      tuViLenCap: calcTuViNeeded(defaultRealm, 1),
      tuViLinhCan: 0,
      tangTuVi: 1,
      maCanhGioi: defaultRealm.code,
      tenCanhGioi: defaultRealm.tenCanhGioi || defaultRealm.name || "Luyện Khí",
      canhGioi: defaultRealm,
      mapCode: selectedWorld.code,
      mapId: selectedWorld.code,
      x: spawn.x,
      y: spawn.y,
      learnedSkills: [...skills.filter((skill) => skill.linhCan === "COMMON"), ...rootSkills.slice(0, 2), ...skills.filter((skill) => skill.linhCan === linhCan && skill.category === "PASSIVE")].map((skill) => skill.code),
      equippedSkills: initialSkills.map((skill) => skill.code),
      skills: initialSkills,
      equipment: emptyEquipment(),
      inventory: [
        { id: "WEAPON_KIEM_GO", maDo: "WEAPON_KIEM_GO", name: "Kiếm Gỗ Tân Thủ", tenDo: "Kiếm Gỗ Tân Thủ", icon: "🗡️", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "weapon", requiredRealmStt: 1, count: 1, stats: { pAtk: 5 }, giaMua: 30, giaBan: 15 },
        { id: "ARMOR_AO_VAI", maDo: "ARMOR_AO_VAI", name: "Áo Vải Thô Sơ", tenDo: "Áo Vải Thô Sơ", icon: "🥋", loai: "EQUIPMENT", type: "EQUIPMENT", slot: "armor", requiredRealmStt: 1, count: 1, stats: { pDef: 5, maxHp: 35 }, giaMua: 40, giaBan: 20 },
        { id: "POTION_TIEU_HOAN", maDo: "POTION_TIEU_HOAN", name: "Tiểu Hoàn Đan", tenDo: "Tiểu Hoàn Đan", icon: "💊", loai: "POTION", type: "POTION", healHp: 120, count: 5, giaMua: 25, giaBan: 12 },
        { id: "POTION_TU_KHI", maDo: "POTION_TU_KHI", name: "Tụ Khí Đan", tenDo: "Tụ Khí Đan", icon: "🧪", loai: "POTION", type: "POTION", healMp: 70, count: 5, giaMua: 30, giaBan: 15 },
        { id: "STONE_LINH_NHO", maDo: "STONE_LINH_NHO", name: "Linh Thạch Nhỏ", tenDo: "Linh Thạch Nhỏ", icon: "💎", loai: "STONE", type: "STONE", giaTriTuVi: 120, count: 3, giaMua: 20, giaBan: 10 },
      ],
      unspentStatPoints: 0,
    };
    player.jsonIventory = JSON.stringify(player.inventory);
    player.combatPower = combatPower(player);
    storePlayer(player);
    try {
      await gameStateStore.flush();
      res.json(player);
    } catch (error) {
      players.delete(player.id);
      playersByUserId.delete(req.userId);
      console.error("Character persistence failed");
      res.status(503).json({ error: "Chưa thể lưu nhân vật, vui lòng thử lại" });
    }
  });

  router.post("/stats/allocate", authenticate, (req, res) => {
    const player = playerFor(req.userId);
    const stat = String(req.body?.stat || "");
    const amount = Math.max(1, Math.floor(Number(req.body?.amount) || 1));
    if (!player) return res.status(404).json({ error: "Player not found" });
    if (!Object.prototype.hasOwnProperty.call(BALANCE.stats, stat)) return res.status(400).json({ error: "Stat không hợp lệ" });
    if ((player.unspentStatPoints || 0) < amount) return res.status(400).json({ error: "Không đủ điểm thuộc tính" });
    player.stats = { ...(player.stats || {}), [stat]: (player.stats?.[stat] || 0) + amount };
    player.unspentStatPoints -= amount;
    player.derivedStats = deriveStats(player.stats, player.equipment || {});
    players.set(player.id, player);
    res.json({ stats: player.stats, unspentStatPoints: player.unspentStatPoints, derivedStats: player.derivedStats });
  });

  router.put("/:id", authenticate, (req, res) => {
    const id = Number(req.params.id);
    const current = players.get(id);
    if (!current) return res.status(404).json({ error: "Player not found" });
    if (current.userId !== req.userId) return res.status(403).json({ error: "Không được phép" });
    const player = { ...current, id, userId: req.userId };
    for (const key of ["name", "gender", "img"]) {
      if (req.body?.[key] !== undefined) player[key] = req.body[key];
    }
    player.combatPower = combatPower(player);
    storePlayer(player);
    res.json(player);
  });

  router.get("/power", authenticate, (req, res) => {
    const player = playerFor(req.userId);
    if (!player) return res.status(404).json({ error: "Player not found" });
    res.json({ combatPower: combatPower(player) });
  });

  router.post("/skills/learn", authenticate, (req, res) => {
    const player = playerFor(req.userId);
    const code = String(req.body?.skillCode || "");
    const skill = skills.find((item) => item.code === code);
    if (!player || !skill) return res.status(404).json({ error: "Skill not found" });
    if (skill.linhCan !== "COMMON" && skill.linhCan !== player.linhCan) return res.status(403).json({ error: "Skill không thuộc linh căn" });
    const playerRealm = Number(player.canhGioi?.stt || player.realm || 1);
    if (Number(skill.tier || 1) > playerRealm) {
      return res.status(400).json({ error: `Yêu cầu cảnh giới tầng ${skill.tier} trở lên để lĩnh hội thần thông này` });
    }
    player.learnedSkills = Array.from(new Set([...(player.learnedSkills || []), code]));
    player.combatPower = combatPower(player);
    players.set(player.id, player);
    res.json({ learnedSkills: player.learnedSkills, skill, combatPower: player.combatPower });
  });

  router.put("/skills/equip", authenticate, (req, res) => {
    const player = playerFor(req.userId);
    const codes = Array.from(new Set(Array.isArray(req.body?.skillCodes) ? req.body.skillCodes : [])).slice(0, 4);
    if (!player) return res.status(404).json({ error: "Player not found" });
    const learned = new Set(player.learnedSkills || []);
    if (codes.some((code) => !learned.has(code))) return res.status(400).json({ error: "Chỉ được trang bị skill đã học" });
    const selectedSkills = codes.map((code) => skills.find((skill) => skill.code === code)).filter(Boolean);
    if (selectedSkills.some((skill) => String(skill.category || "ACTIVE").toUpperCase() === "PASSIVE")) {
      return res.status(400).json({ error: "Skill bị động tự động hoạt động, không cần đưa vào ô kỹ năng" });
    }
    player.equippedSkills = codes;
    player.skills = selectedSkills;
    players.set(player.id, player);
    res.json({ equippedSkills: player.equippedSkills, skills: player.skills });
  });

  router.post("/equipment/equip", authenticate, (req, res) => {
    const player = playerFor(req.userId);
    if (!player) return res.status(404).json({ error: "Player not found" });
    const inventory = readInventory(player);
    const index = Number.isInteger(req.body?.index) ? req.body.index : inventory.findIndex((item) => item.id === req.body?.itemId);
    const item = inventory[index];
    if (!item || (item.type || item.loai) !== "EQUIPMENT") return res.status(400).json({ error: "Vật phẩm không thể trang bị" });
    const catalogItem = items.find((entry) => String(entry.id) === String(item.id));
    if (!catalogItem || (catalogItem.type || catalogItem.loai) !== "EQUIPMENT") {
      return res.status(400).json({ error: "Trang bị không còn trong danh mục vật phẩm" });
    }
    const realmCheck = checkEquipmentRealm(catalogItem, player.canhGioi?.stt ?? player.realm ?? 1);
    if (!realmCheck.valid) return res.status(400).json({ error: "Dữ liệu cảnh giới hoặc yêu cầu trang bị không hợp lệ" });
    if (!realmCheck.eligible) {
      return res.status(400).json({
        code: "REALM_TOO_LOW",
        error: `Cần cảnh giới ${realmCheck.requiredRealmStt} trở lên để trang bị (hiện tại: ${realmCheck.currentRealmStt})`,
      });
    }
    const slot = String(req.body?.slot || item.slot || "weapon");
    if (!EQUIPMENT_SLOTS.includes(slot)) return res.status(400).json({ error: "Ô trang bị không hợp lệ" });
    const equipment = normalizeEquipment(player.equipment);
    const previous = equipment[slot];
    equipment[slot] = { ...item, equipped: true };
    inventory.splice(index, 1);
    if (previous) inventory.push({ ...previous, equipped: false });
    player.equipment = equipment;
    writeInventory(player, inventory);
    player.combatPower = combatPower(player);
    players.set(player.id, player);
    res.json({ player, result: { type: "equipment_equipped", slot, itemId: item.id } });
  });

  router.post("/equipment/unequip", authenticate, (req, res) => {
    const player = playerFor(req.userId);
    const slot = String(req.body?.slot || "");
    if (!player) return res.status(404).json({ error: "Player not found" });
    if (!EQUIPMENT_SLOTS.includes(slot)) return res.status(400).json({ error: "Ô trang bị không hợp lệ" });
    const equipment = normalizeEquipment(player.equipment);
    const item = equipment[slot];
    if (!item) return res.status(404).json({ error: "Ô trang bị đang trống" });
    const inventory = readInventory(player);
    if (inventory.length >= 40) return res.status(400).json({ error: "Túi đồ đầy" });
    equipment[slot] = null;
    inventory.push({ ...item, equipped: false });
    player.equipment = equipment;
    writeInventory(player, inventory);
    player.combatPower = combatPower(player);
    players.set(player.id, player);
    res.json({ player, result: { type: "equipment_unequipped", slot, itemId: item.id } });
  });


  return router;
}

module.exports = createPlayerRouter;
