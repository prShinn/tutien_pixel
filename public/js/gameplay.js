let ctx, canvas, cv;
const GameState = {

}
const Shop = {
	open(npc) {
		document.getElementById("shop-title").textContent = `🏪 ${npc.name}`;
		this.render();
		document.getElementById("shop-modal").classList.add("open");
	},
	close() {
		document.getElementById("shop-modal").classList.remove("open");
	},
	render() {
		document.getElementById("shop-xu").textContent = S.player.xu.toLocaleString();
		const buy = document.getElementById("shop-buy-list");
		buy.innerHTML = '<div class="shop-col-head">MUA VẬT PHẨM</div>';
		for (const id of CFG.SHOP_SELL) {
			const item = CFG.ITEMS[id];
			if (!item || !item.buyPrice) continue;
			const div = document.createElement("div");
			div.className = "shop-item";
			div.innerHTML = `<span class="si-emoji">${item.emoji}</span><div class="si-info"><div class="si-name">${item.name}</div><div class="si-desc">${item.desc || ""}</div></div><span class="si-price">${item.buyPrice}xu</span>`;
			const btn = document.createElement("button");
			btn.className = "sbtn";
			btn.textContent = "Mua";
			btn.onclick = () => Shop.buy(id);
			div.appendChild(btn);
			buy.appendChild(div);
		}
		const sell = document.getElementById("shop-sell-list");
		sell.innerHTML = '<div class="shop-col-head">BÁN VẬT PHẨM</div>';
		if (!S.inventory.length)
			sell.innerHTML +=
				'<div style="color:var(--text2);font-size:11px;padding:8px">Túi đồ trống</div>';
		S.inventory.forEach((item, idx) => {
			const div = document.createElement("div");
			div.className = "shop-item";
			div.innerHTML = `<span class="si-emoji">${item.emoji}</span><div class="si-info"><div class="si-name">${item.name} x${item.count}</div></div><span class="si-sell">${item.sell || 0}xu/cái</span>`;
			const btn = document.createElement("button");
			btn.className = "sbtn ssell";
			btn.textContent = "Bán";
			btn.onclick = () => {
				Shop.sell(idx);
			};
			div.appendChild(btn);
			sell.appendChild(div);
		});
	},
};
const DialogUI = {
	open(npc) {
		document.getElementById("dialog-npc-n").textContent = npc.name;
		document.getElementById("dialog-text").innerHTML = npc.dialog.replace(/\n/g, "<br>");
		document.getElementById("dialog-modal").classList.add("open");
	},
	close() {
		document.getElementById("dialog-modal").classList.remove("open");
	},
};
const Input = {
	keys: {},
	_lastMoveEmit: 0,
	init() {
		window.addEventListener("keydown", (e) => {
			Input.keys[e.code] = true;
			if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code))
				e.preventDefault();
			if (e.code === "KeyF") World.checkNpcInteract();
			if (e.code === "Escape") {
				Shop.close();
				DialogUI.close();
			}
			if (e.code === "Enter") {
				const ci = document.getElementById("chat-inp");
				ci.focus();
			}
		});
		window.addEventListener("keyup", (e) => (Input.keys[e.code] = false));
		document.getElementById("game-canvas").addEventListener("click", Input.onClick);
		document.getElementById("chat-inp").addEventListener("keydown", (e) => {
			if (e.code === "Enter") {
				// Net.sendChat();
				e.preventDefault();
			}
		});
	},
	onClick(e) {
		if (document.getElementById("shop-modal").classList.contains("open")) return;
		if (document.getElementById("dialog-modal").classList.contains("open")) return;
		const r = canvas.getBoundingClientRect();
		const wx = e.clientX - r.left + GamePlay.cam.x,
			wy = e.clientY - r.top + GamePlay.cam.y;
		for (const m of GamePlay.map.monsters || [])
			if (!m.dead && dist(m.px, m.py, wx, wy) < 26) {
				Combat.attack(m);
				return;
			}
		for (const npc of GamePlay.map.npcs)
			if (dist(npc.px, npc.py, wx, wy) < 26) {
				if (npc.type === "shop") Shop.open(npc);
				else if (npc.type === "chest") Chest.open(npc);
				else DialogUI.open(npc);
				return;
			}
	},
};
function setupCanvas() {
	canvas = document.getElementById("game-canvas");
	const area = document.getElementById("canvas-area");
	cW = area.clientWidth;
	cH = area.clientHeight;
	canvas.width = cW;
	canvas.height = cH;
	ctx = canvas.getContext("2d");
	ctx.imageSmoothingEnabled = false;
	window.addEventListener("resize", () => {
		cW = area.clientWidth;
		cH = area.clientHeight;
		canvas.width = cW;
		canvas.height = cH;
		ctx.imageSmoothingEnabled = false;
	});
}
function randInt(a, b) {
	return a + Math.floor(Math.random() * (b - a + 1));
}
function lerp(a, b, t) {
	return a + (b - a) * t;
}
function dist(ax, ay, bx, by) {
	return Math.hypot(ax - bx, ay - by);
}
function showTab(mode) {
	document.getElementById("tab-login").className =
		"auth-tab" + (mode === "login" ? " active" : "");
	document.getElementById("tab-reg").className =
		"auth-tab" + (mode === "register" ? " active" : "");
	document.getElementById("auth-btn").textContent = mode === "login" ? "ĐĂNG NHẬP" : "ĐĂNG KÝ";
	document.getElementById("auth-alt").innerHTML =
		mode === "login"
			? "Chưa có tài khoản? <a onclick=\"showTab('register')\">Đăng ký ngay</a>"
			: "Đã có tài khoản? <a onclick=\"showTab('login')\">Đăng nhập</a>";
}
function update(dt) {
	const p = PLAYER;
	if (!p) return;

	if (PLAYER.attackCD > 0) PLAYER.attackCD -= dt / 16;

	UI.update();
}
function loop(ts) {
	const dt = Math.min(ts - GamePlay.lastTs, 50);
	GamePlay.lastTs = ts;
	update(dt);
	Render.frame();
	requestAnimationFrame(loop);
}
function showScreen(name) {
	document.getElementById("screen-auth").classList.add("hidden");
	document.getElementById("screen-create").classList.add("hidden");
	document.getElementById("screen-game").style.display = "none";
	if (name === "auth") document.getElementById("screen-auth").classList.remove("hidden");
	else if (name === "create") document.getElementById("screen-create").classList.remove("hidden");
	else if (name === "game") document.getElementById("screen-game").style.display = "grid";
}
showScreen("auth");
function startGame() {
	showScreen("game");
	setupCanvas();

	Input.init();
	UI.buildInv();
	UI.update();
	UI.log("Tu tiên hành trình bắt đầu...", "system");
	UI.log("💡 Đánh quái → rơi xu/đồ. Hấp thu linh thạch → tu vi tăng.", "system");
	UI.log("💡 Đủ tu vi → Phá cảnh giới. F → Tương tác NPC.", "system");
	requestAnimationFrame((ts) => {
		GamePlay.lastTs = ts;
		requestAnimationFrame(loop);
	});
}
// startGame();
console.log("gameplay");
