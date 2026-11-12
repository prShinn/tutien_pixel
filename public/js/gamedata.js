// ════════════════════════════════════════════════════════════════════════════════════════
// FILE: public/js/gamedata.js
// 1. DÙNG ĐỂ LÀM GÌ:
//    - Nạp danh mục dữ liệu tĩnh khi khởi động (Data Bootloader): Tải dữ liệu Cảnh giới (/api/canh-gioi),
//      Linh căn (/api/linh-can), Thần thông (/api/skills), Vật phẩm (/api/items) từ server về client.
// 2. CẤU HÌNH LIÊN QUAN:
//    - API.BASE, AbortSignal.timeout(8000).
//    - Phụ thuộc: CFG.
// 3. XỬ LÝ VẤN ĐỀ NÀO:
//    - Nạp catalog từ BE thật và báo lỗi khi dữ liệu hoặc kết nối không hợp lệ.
// ════════════════════════════════════════════════════════════════════════════════════════

const GameData = {
	itemRecords: new Map(),
	// ── Fetch helper (không cần auth token) ──
	async _get(path) {
		const response = await fetch(API.BASE + path, { signal: AbortSignal.timeout(8000) });
		if (!response.ok) throw new Error("BE không tải được catalog " + path + " (HTTP " + response.status + ")");
		return response.json();
	},

  // ════ REALMS ════
	// GET /api/canh-gioi → [{ stt, code, tenCanhGioi, tuViTienCap, ... }]
	async loadRealms() {
		const data = await this._get(API.PATHS.data.realms);
		if (!Array.isArray(data) || data.length === 0) {
			throw new Error("BE trả catalog cảnh giới không hợp lệ.");
		}
		// Sắp xếp theo stt
		data.sort((a, b) => (a.stt ?? 0) - (b.stt ?? 0));
		CFG.REALMS = data;
		console.info(`[GameData] REALMS: ${data.length} cảnh giới đã tải.`);
	},

	// ════ ROOTS (Linh Căn) ════
	// GET /api/linh-can → [{ maLinhCan, tenLinhCan, emoji, mauSac, background }]
	async loadRoots() {
		const data = await this._get(API.PATHS.data.roots);
		if (Array.isArray(data) && data.length > 0) {
			CFG.ROOTS = data.map((r) => ({
				...r,
				id: r.maLinhCan || r.id,
				name: r.tenLinhCan || r.name,
				emoji: r.emoji || "✨",
				color: r.mauSac || r.color || "#ffffff",
				bg: r.background || r.bg || "#202030",
			}));
			Linh_CAN = {};
			for (const r of CFG.ROOTS) Linh_CAN[r.id] = { emoji: r.emoji, color: r.color, bg: r.bg };
			console.info(`[GameData] ROOTS: ${CFG.ROOTS.length} linh căn đã tải.`);
			return;
		}
		throw new Error("BE trả catalog linh căn không hợp lệ.");
	},

  // ════ ITEMS ════
	// GET /api/items → [{ maDo/id, tenDo/name, icon, loai/type, ... }]
	normalizeItem(item) {
		const id = item.maDo || item.id;
		return {
			id,
			recordId: item.id || id,
			name: item.tenDo || item.name,
			icon: item.icon || item.emoji || "📦",
			img: item.img || "",
			type: item.type || item.loai,
			// Tu vi stones
			giaTriTuVi: item.giaTriTuVi || item.tuVal || item.tuVi || 0,
			// Elem stones
			giaTriTang: item.giaTriTang || item.statVal || 0,
			statKey: item.statKey || null,
			str: item.str || false,
			agi: item.agi || false,
			vit: item.vit || false,
			ene: item.ene || false,
			// Linh Đan
			linhCan: item.linhCan || null,
			tuViLinhCanVal: item.tuViLinhCanVal || 0,
			// Consumable
			healHp: item.healHp || item.hpHoi || 0,
			healMp: item.healMp || item.mpHoi || 0,
			statBoost: item.statBoost || 0,
			// Economy
			currency: String(item.currency || "XU").toUpperCase() === "LINH_THACH" ? "LINH_THACH" : "XU",
			shopTab: item.shopTab || null,
			bagSlots: Number(item.bagSlots || 0),
			xuAmount: Number(item.xuAmount || 0),
			giaMua: item.giaMua ?? item.buyPrice ?? 0,
			giaBan: item.giaBan ?? item.sell ?? 0,
			buyPrice: item.giaMua ?? item.buyPrice ?? 0,
			sell: item.giaBan ?? item.sell ?? 0,
			// Equipment
			slot: item.slot || (item.loai === "EQUIPMENT" || item.type === "EQUIPMENT" ? (item.equipSlot || "weapon") : null),
			stats: item.stats || {},
			equipmentInfo: item.equipmentInfo || null,
			basicAttack: item.basicAttack || null,
			rarity: item.rarity || "",
			itemLevel: Math.max(1, Math.floor(Number(item.itemLevel || ((Number(item.requiredRealmStt || 1)) * 10)))),
			weaponKind: item.weaponKind || null,
			gemTier: item.gemTier ? String(item.gemTier).trim().toUpperCase() : null,
			hasLuck: Boolean(item.hasLuck),
			sparkle: item.sparkle || (item.sparklePreset ? { preset: item.sparklePreset, color: item.sparkleColor || "", intensity: Number(item.sparkleIntensity ?? 1) } : null),
			quality: item.quality || "",
			qualityTier: Number(item.qualityTier || 0),
			qualityLabel: item.qualityLabel || "",
			pillGroup: item.pillGroup || "",
			breakthroughRate: item.breakthroughRate != null ? Number(item.breakthroughRate) : null,
			shopCategory: item.shopCategory || "",
			requiredRealmStt: Number(item.requiredRealmStt || 1),
			// Desc
			desc: item.moTa || item.desc || item.description || "",
			description: item.moTa || item.desc || item.description || "",
		};
	},

	updateItemCatalog({ id, item }) {
		if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,96}$/.test(id)) return;
		const previous = this.itemRecords.get(id);
		if (previous && CFG.ITEMS[previous.id] === previous) delete CFG.ITEMS[previous.id];
		this.itemRecords.delete(id);
		if (item) {
			const normalized = this.normalizeItem(item);
			if (typeof normalized.id === "string" && /^[A-Za-z0-9_-]{1,96}$/.test(normalized.id)) {
				CFG.ITEMS[normalized.id] = normalized;
				this.itemRecords.set(id, normalized);
			}
		}
		this.refreshShopCatalog();
	},

	refreshShopCatalog() {
		CFG.SHOP_SELL = Object.values(CFG.ITEMS)
			.filter((item) => item.giaMua > 0 && item.currency !== "LINH_THACH")
			.map((item) => item.id);
	},

	itemWithCurrentDetails(entry) {
		const id = entry?.itemCode || entry?.id;
		if (!id) return entry;
		const current = this.itemRecords.get(id) || (Object.hasOwn(CFG.ITEMS, id) ? CFG.ITEMS[id] : null);
		if (!current) return entry;
		const { id: _catalogCode, recordId: _recordId, equipmentInfo: catalogEquipInfo, ...details } = current;
		const merged = {
			...entry,
			...details,
			...(entry.equipmentInfo ? { equipmentInfo: entry.equipmentInfo } : catalogEquipInfo ? { equipmentInfo: catalogEquipInfo } : {}),
			...(entry.instanceId !== undefined ? { instanceId: entry.instanceId } : {}),
			...(entry.isInstance !== undefined ? { isInstance: Boolean(entry.isInstance) } : {}),
			...(entry.rarity ? { rarity: entry.rarity } : {}),
			...(entry.enhanceLevel !== undefined ? { enhanceLevel: Number(entry.enhanceLevel || 0) } : {}),
			...(entry.hasLuck !== undefined ? { hasLuck: Boolean(entry.hasLuck) } : {}),
			...(Array.isArray(entry.exlOptions) ? { exlOptions: entry.exlOptions } : {}),
		};
		if (String(merged.type || merged.loai || "").toUpperCase() === "EQUIPMENT"
			&& typeof GAME_BALANCE !== "undefined"
			&& typeof GAME_BALANCE?.describeEquipment === "function") {
			merged.equipmentInfo = GAME_BALANCE.describeEquipment(merged);
		}
		return merged;
	},

	async loadItems(isCurrent = () => true) {
		const data = await this._get(API.PATHS.data.items);
		if (!isCurrent()) return false;
		if (!Array.isArray(data)) {
			console.warn("[GameData] Không load được ITEMS từ API.");
			return;
		}
		CFG.ITEMS = Object.create(null);
		this.itemRecords.clear();
		for (const item of data) {
			const normalized = this.normalizeItem(item);
			const id = normalized.id;
			CFG.ITEMS[id] = normalized;
			this.itemRecords.set(normalized.recordId, normalized);
		}
		this.refreshShopCatalog();
		return true;
	},

	// ════ MONSTERS ════
	// GET /api/monsters → danh mục mẫu quái dùng chung với Admin và Map Editor.
	async loadMonsters() {
		const data = await this._get(API.PATHS.data.monsters);
		if (!Array.isArray(data) || data.length === 0) {
			console.warn("[GameData] Không load được MONSTERS từ API.");
			return;
		}
		CFG.MONSTERS = data.filter((monster) => monster && typeof monster === "object"
			&& String(monster.id || monster.code || "").trim()
			&& String(monster.name || "").trim()
			&& Number.isFinite(Number(monster.hp)) && Number(monster.hp) > 0)
			.map((monster) => ({
				...monster,
				id: monster.id || monster.code,
				code: monster.code || monster.id,
				maxHp: Number(monster.maxHp || monster.hp),
				hp: Number(monster.hp),
				level: Number(monster.level || 1),
				atk: Number(monster.atk || 1),
				def: Number(monster.def || 0),
				speed: Number(monster.speed || 1),
				respawnMs: Number(monster.respawnMs || CFG.MON_RESPAWN * 1000),
			}));
		if (CFG.MONSTERS.length) console.info(`[GameData] MONSTERS: ${CFG.MONSTERS.length} mẫu quái đã tải.`);
	},

	// ════ SKILLS ════
	// GET /api/skills → [{id, code, name, icon, tier, linhCan, range, aoe, aoeR,
	//                    mpTieuHao, hoiChieu, satThuong, dienRong, thoiGianBuff,
	//                    type (PHYS|MAGIC), sfx_code, description}]
	//
	// Quy ước FE:
	//   damageType : "PHYS" | "MAGIC"  — loại sát thương (từ sk.type)
	//   satThuong  : number            — hệ số nhân (1.5 = 150% pAtk/mAtk)
	//   effect     : string | null     — debuff/buff code (burn, slow, root...)
	//   effectDur  : number            — ticks (frames) hiệu ứng tồn tại
	//   effectVal  : number            — giá trị hiệu ứng (DoT, slow%...)
	async loadSkills() {
		const data = await this._get(API.PATHS.data.skills);
		if (!Array.isArray(data) || data.length === 0) {
			console.warn("[GameData] Không load được SKILLS từ API.");
			return;
		}
		// Build nested: CFG.SKILLS[linhCan][tierIndex] = [skill, ...]
		const grouped = {};
		for (const sk of data) {
			const lc = sk.linhCan || sk.maLinhCan;
			const tier = sk.tier || sk.capDo || 1;
			if (!lc) continue;
			if (!grouped[lc]) grouped[lc] = {};
			if (!grouped[lc][tier]) grouped[lc][tier] = [];

			// sk.type từ BE là "PHYS" hoặc "MAGIC" — đây là damageType
			// sk.sfx_code (nếu có) hoặc sk.effect là debuff/buff effect
			const damageType = (sk.type === "PHYS" || sk.type === "MAGIC")
				? sk.type
				: "PHYS"; // default
			// effect riêng: lấy sk.sfx_code hoặc sk.effect (nếu không phải PHYS/MAGIC)
			const effectCode = sk.sfx_code && sk.sfx_code !== "string"
				? sk.sfx_code
				: (sk.effect && sk.effect !== "PHYS" && sk.effect !== "MAGIC" ? sk.effect : null);
			const categoryCode = String(sk.category || sk.loai || sk.loaiNangLuc || "").trim().toUpperCase();
			const isPassive = categoryCode === "PASSIVE" || categoryCode === "BI_DONG"
				|| String(sk.effect || sk.sfx_code || "").toLowerCase() === "passive"
				|| /_TAM_PHAP$/i.test(String(sk.code || sk.maNangLuc || ""));

			grouped[lc][tier].push({
				id: sk.code || sk.maNangLuc || String(sk.id),
				name: sk.name || sk.tenNangLuc,
				icon: sk.icon || (damageType === "MAGIC" ? "✨" : "⚔️"),
				img: sk.img || "",
				vfxForm: sk.vfxForm || "",
				requiresLineOfSight: Boolean(sk.requiresLineOfSight),
				weaponKinds: Array.isArray(sk.weaponKinds) ? sk.weaponKinds : [],
				linhCan: lc,
				tier,
				category: isPassive ? "PASSIVE" : "ACTIVE",
				damageType,                          // "PHYS" | "MAGIC"
				satThuong: sk.satThuong ?? 1,        // hệ số nhân sát thương
				mpCost: sk.mpTieuHao ?? sk.mpCost ?? 0,
				cd: (sk.hoiChieu ?? sk.cd ?? 60) * 60, // BE gửi giây → đổi sang ticks (60fps)
				range: sk.range ?? sk.tamDanh ?? 5,
				aoe: (sk.dienRong ?? sk.aoeR ?? 0) > 0 || sk.aoe || false,
				aoeR: sk.dienRong ?? sk.aoeR ?? 0,
				effect: effectCode,                  // debuff/buff code
				effectDur: (sk.thoiGianBuff ?? sk.effectDur ?? 0) * 60, // giây → ticks
				effectVal: sk.effectVal ?? 0,        // giá trị effect (không phải satThuong)
				passiveModifiers: sk.passiveModifiers || {},
				desc: sk.description ?? sk.moTa ?? sk.desc ?? "",
				_beId: sk.id || null,
			});
		}
		// Convert grouped object to sorted tier arrays
		CFG.SKILLS = {};
		for (const lc of Object.keys(grouped)) {
			const tierMap = grouped[lc];
			const maxTier = Math.max(...Object.keys(tierMap).map(Number));
			CFG.SKILLS[lc] = [];
			for (let t = 1; t <= maxTier; t++) {
				CFG.SKILLS[lc].push(tierMap[t] || []);
			}
		}
		const total = data.length;
		const lcs = Object.keys(CFG.SKILLS).length;
		console.info(`[GameData] SKILLS: ${total} kỹ năng cho ${lcs} linh căn đã tải.`);
	},

	async loadBalance() {
		const data = await this._get(API.PATHS.data.balance);
		if (data && typeof data === "object") CFG.BALANCE = data;
		return data;
	},

	// ════ Load tất cả song song ════
	async load() {
		console.info("[GameData] Đang tải dữ liệu game từ server...");
		await Promise.all([
			this.loadRealms(),
			this.loadRoots(),
			this.loadItems(),
			this.loadSkills(),
			this.loadMonsters(),
			this.loadBalance(),
		]);
		console.info("[GameData] Hoàn tất tải dữ liệu.");
	},
};
