const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function createFakeElement(tagName = 'div', id = '') {
  const attrs = new Map();
  const classes = new Set();
  const el = {
    tagName: tagName.toUpperCase(),
    id,
    children: [],
    style: {},
    dataset: {},
    disabled: false,
    hidden: false,
    value: '',
    onclick: null,
    _text: '',
    set textContent(v) {
      this._text = String(v ?? '');
      this.children = [];
    },
    get textContent() { return this._text; },
    set innerHTML(_v) {
      throw new Error('Unsafe innerHTML assignment detected in Hub/Ad test');
    },
    setAttribute(name, val) {
      attrs.set(name, String(val));
      if (name === 'class') {
        classes.clear();
        String(val).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
      }
    },
    getAttribute(name) {
      if (name === 'class') return [...classes].join(' ');
      return attrs.get(name) ?? null;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    append(...nodes) {
      for (const n of nodes) this.children.push(n);
    },
    replaceChildren(...nodes) {
      this.children = [...nodes];
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx >= 0) this.children.splice(idx, 1);
    },
    classList: {
      add(...names) { names.forEach((n) => classes.add(n)); },
      remove(...names) { names.forEach((n) => classes.delete(n)); },
      toggle(name, force) {
        if (force === undefined) {
          if (classes.has(name)) classes.delete(name);
          else classes.add(name);
          return classes.has(name);
        }
        if (force) classes.add(name);
        else classes.delete(name);
        return Boolean(force);
      },
      contains(name) { return classes.has(name); },
    },
  };
  return el;
}

function createFakeDocument(ids = []) {
  const byId = new Map();
  for (const id of ids) byId.set(id, createFakeElement('div', id));
  const queryElements = [];
  return {
    _byId: byId,
    _queryElements: queryElements,
    getElementById(id) { return byId.get(id) || null; },
    createElement(tag) { return createFakeElement(tag); },
    querySelectorAll(selector) {
      const attrMatch = selector.match(/^\[([a-zA-Z0-9_-]+)\]$/);
      if (!attrMatch) return [];
      const attr = attrMatch[1];
      return queryElements.filter((el) => el.getAttribute(attr) !== null);
    },
  };
}

function runScript(relPath, sandbox, exportName) {
  const filePath = path.join(ROOT, relPath);
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, sandbox, { filename: relPath });
  return exportName ? vm.runInContext(exportName, sandbox) : undefined;
}

function collectText(node) {
  if (!node) return '';
  if (node.children?.length) return node.children.map(collectText).join(' ');
  return node.textContent || '';
}

test('API paths, index.html modals, and bootstrap script load order include Economy/Mail/Retention', () => {
  const sandbox = vm.createContext({
    URL,
    AbortSignal,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    window: { TuTienConfig: { dataMode: 'real', apiBase: 'http://localhost:3800' } },
  });
  const API = runScript('public/js/api.js', sandbox, 'API');

  assert.equal(API.PATHS.player.walletLedger, '/api/player/wallet/ledger');
  assert.equal(API.PATHS.shop.premium, '/api/shop/premium');
  assert.equal(API.PATHS.mail.list, '/api/mail');
  assert.equal(API.PATHS.mail.claim('m_1'), '/api/mail/m_1/claim');
  assert.equal(API.PATHS.retention.status, '/api/retention/status');
  assert.equal(API.PATHS.retention.checkinClaim, '/api/retention/checkin/claim');
  assert.equal(API.PATHS.retention.offlineClaim, undefined);
  assert.equal(API.PATHS.retention.adStart, undefined);

  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  for (const requiredId of ['ui-linh-thach', 'mail-modal', 'hub-modal', 'checkin-grid', 'premium-shop-list', 'ledger-list']) {
    assert.ok(html.includes(`id="${requiredId}"`), `index.html missing #${requiredId}`);
  }
  assert.equal(html.includes('ad-preview-modal'), false);
  assert.equal(html.includes('offline-claim-normal-btn'), false);

  const bootstrap = fs.readFileSync(path.join(ROOT, 'public/js/bootstrap.js'), 'utf8');
  assert.equal(bootstrap.includes('js/ad-bridge.js'), false);
  assert.ok(bootstrap.includes('js/hub.js'));
  assert.ok(bootstrap.indexOf('js/hub.js') < bootstrap.indexOf('js/game.js'));
});

test('GameData.normalizeItem and refreshShopCatalog keep Ky Tran Cac isolated from NPC Xu shop', () => {
  const sandbox = vm.createContext({
    CFG: { ITEMS: {}, SHOP_BUY: [], SHOP_SELL: [], SKILLS: {}, REALMS: [], ROOTS: [], MONSTERS: [], BALANCE: {} },
    Linh_CAN: {},
    API: { BASE: 'http://localhost:3800', PATHS: { data: { realms: '/api/canh-gioi', roots: '/api/linh-can', items: '/api/items', skills: '/api/skills', monsters: '/api/monsters', balance: '/api/balance' } } },
    AbortSignal,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    console: { info() {} },
  });
  const GameData = runScript('public/js/gamedata.js', sandbox, 'GameData');

  const xuItem = GameData.normalizeItem({
    id: 'POTION_TIEU_HOAN',
    name: 'Tiểu Hoàn Đan',
    type: 'POTION',
    currency: 'XU',
    giaMua: 20,
    giaBan: 10,
  });
  const premiumItem = GameData.normalizeItem({
    id: 'TUI_CAN_KHON_10',
    name: 'Túi Càn Khôn (+10 Ô)',
    type: 'BAG_EXPAND',
    currency: 'LINH_THACH',
    shopTab: 'PREMIUM',
    bagSlots: 10,
    giaMua: 12,
    giaBan: 0,
  });
  assert.equal(premiumItem.currency, 'LINH_THACH');
  assert.equal(premiumItem.shopTab, 'PREMIUM');
  assert.equal(premiumItem.bagSlots, 10);

  sandbox.CFG.ITEMS = {
    [xuItem.id]: xuItem,
    [premiumItem.id]: premiumItem,
  };
  GameData.refreshShopCatalog();

  assert.deepEqual(structuredClone(sandbox.CFG.SHOP_SELL), ['POTION_TIEU_HOAN']);
});

test('UI.inventoryCapacity clamps [INV_BASE, INV_MAX], UI.itemTypeLabel handles MATERIAL, and UI.updateVitals updates #ui-linh-thach & #b-hp/#b-mp/#ui-tu/#b-tu', () => {
  const doc = createFakeDocument(['ui-linh-thach', 'ui-xu', 'ui-hp', 'b-hp', 'ui-mp', 'b-mp', 'ui-tu', 'b-tu']);
  const sandbox = vm.createContext({
    document: doc,
    window: {},
    localStorage: { getItem: () => null, setItem: () => {} },
    CFG: { INV_BASE: 40, INV_MAX: 80, ITEMS: {}, REALMS: [{ stt: 1, code: 'LUYEN_KHI', tenCanhGioi: 'Luyện Khí', tuViTienCap: 1000 }], ROOTS: {} },
    S: {
      player: {
        name: 'HanLap',
        realmCode: 'LUYEN_KHI',
        realmStage: 1,
        tuVi: 100,
        tuViHienTai: 100,
        tuViLenCap: 1000,
        hp: 80,
        maxHp: 100,
        mp: 25,
        maxMp: 50,
        xu: 500,
        linhThach: 42,
        inventoryCapacity: 50,
        stats: { str: 5, agi: 5, vit: 5, ene: 5 },
      },
      inventory: [],
      equipment: {},
      learnedSkills: [],
      equippedSkills: [],
      targets: {},
    },
    Auth: { isGmOrAdmin: () => false },
    Sound: { play() {} },
    SkillSystem: { loadBook() {}, canBreakthrough: () => false },
    Chat: { render() {} },
    calcTuViNeed: () => 1000,
    setTimeout,
    clearTimeout,
    console,
  });
  const UI = runScript('public/js/ui.js', sandbox, 'UI');

  assert.equal(UI.inventoryCapacity({}), 40);
  assert.equal(UI.inventoryCapacity({ inventoryCapacity: 10 }), 40);
  assert.equal(UI.inventoryCapacity({ inventoryCapacity: 60 }), 60);
  assert.equal(UI.inventoryCapacity({ inventoryCapacity: 120 }), 80);
  assert.equal(UI.itemTypeLabel({ type: 'MATERIAL' }), 'Nguyên liệu');

  UI.updateVitals(sandbox.S.player);
  assert.ok(doc.getElementById('ui-linh-thach').textContent.includes('42'));
  assert.ok(doc.getElementById('ui-xu').textContent.includes('500'));
  assert.equal(doc.getElementById('b-hp').style.width, '80%');
  assert.equal(doc.getElementById('b-mp').style.width, '50%');
  assert.ok(doc.getElementById('ui-tu').textContent.includes('100'));
  assert.equal(doc.getElementById('b-tu').style.width, '10%');
});

test('GameHub renders mail safely without innerHTML, claims daily check-in, and guards stale ledger requests', async () => {
  const doc = createFakeDocument([
    'mail-modal', 'mail-list', 'mail-load-more', 'mail-unclaimed-label', 'mail-badge',
    'hub-modal', 'hub-badge', 'checkin-grid', 'checkin-cycle-label', 'checkin-claim-btn',
    'premium-shop-list', 'premium-wallet-lt', 'ledger-list', 'ledger-load-more', 'ledger-wallet-summary',
  ]);

  const netCalls = [];
  let canClaimToday = true;
  const sandbox = vm.createContext({
    document: doc,
    authToken: 'jwt-token',
    URLSearchParams,
    S: { player: { linhThach: 20 } },
    CFG: { ITEMS: {} },
    API: {
      PATHS: {
        mail: { list: '/api/mail', claim: (id) => `/api/mail/${id}/claim` },
        retention: { status: '/api/retention/status', checkinClaim: '/api/retention/checkin/claim' },
        shop: { premium: '/api/shop/premium' },
        player: { buy: '/api/player/shop/buy', walletLedger: '/api/player/wallet/ledger' },
      },
    },
    Net: {
      async get(pathUrl) {
        netCalls.push({ method: 'GET', path: pathUrl });
        if (pathUrl.startsWith('/api/retention/status')) {
          return {
            ok: true,
            checkin: {
              cycleNo: 1,
              streakDay: canClaimToday ? 0 : 1,
              canClaimToday,
              nextDay: canClaimToday ? 1 : null,
              days: [{ day: 1, label: '80 Xu', claimed: !canClaimToday }],
            },
          };
        }
        if (pathUrl.startsWith('/api/player/wallet/ledger')) return { ok: true, items: [], wallet: { xu: 100, linhThach: 20 } };
        return { ok: true, items: [] };
      },
      async mutate(method, pathUrl, body) {
        netCalls.push({ method, path: pathUrl, body });
        canClaimToday = false;
        return {
          ok: true,
          player: { linhThach: 20 },
          result: { type: 'daily_checkin_claimed', day: 1 },
        };
      },
      applyPlayerSnapshot() {},
    },
    UI: {
      buildInv() {},
      update() {},
      log() {},
      notify() {},
    },
    Sound: { play() {} },
    setInterval,
    clearInterval,
  });
  const GameHub = runScript('public/js/hub.js', sandbox, 'GameHub');

  GameHub._mailItems = [{
    id: 'mail_xss',
    title: '<img src=x onerror=alert(1)>',
    body: '<script>evil()</script>',
    sourceType: 'SYSTEM',
    attachments: { xu: 100, linhThach: 5 },
    createdAt: '2026-11-12T00:00:00.000Z',
  }];
  GameHub._unclaimedMailCount = 1;
  GameHub.renderMail();

  const mailListText = collectText(doc.getElementById('mail-list'));
  assert.ok(mailListText.includes('<img src=x onerror=alert(1)>'));
  assert.ok(mailListText.includes('<script>evil()</script>'));

  await GameHub.loadRetention();
  assert.equal(doc.getElementById('hub-badge').hidden, false);
  assert.equal(doc.getElementById('checkin-claim-btn').disabled, false);

  await GameHub.claimCheckin();
  const postCalls = netCalls.filter((c) => c.method === 'POST');
  assert.equal(postCalls.length, 1);
  assert.equal(postCalls[0].path, '/api/retention/checkin/claim');
  assert.equal(doc.getElementById('hub-badge').hidden, true);
  assert.equal(doc.getElementById('checkin-claim-btn').disabled, true);

  // Stale loadLedger response does not override newer filter selection
  let resolveSlowLedger;
  const origGet = sandbox.Net.get;
  sandbox.Net.get = (pathUrl) => {
    netCalls.push({ method: 'GET', path: pathUrl });
    if (pathUrl.includes('currency=XU')) {
      return new Promise((resolve) => { resolveSlowLedger = resolve; });
    }
    if (pathUrl.includes('currency=LINH_THACH')) {
      return Promise.resolve({
        ok: true,
        items: [{ id: 'lt_1', reason: 'BUY_ITEM', currencyType: 'LINH_THACH', amount: -10, balanceAfter: 10 }],
        wallet: { xu: 100, linhThach: 10 },
      });
    }
    return origGet(pathUrl);
  };
  const slowLoad = GameHub.loadLedger(true, 'XU');
  const fastLoad = GameHub.loadLedger(true, 'LINH_THACH');
  await fastLoad;
  resolveSlowLedger({
    ok: true,
    items: [{ id: 'xu_stale', reason: 'BUY_ITEM', currencyType: 'XU', amount: -5, balanceAfter: 95 }],
    wallet: { xu: 95, linhThach: 20 },
  });
  await slowLoad;
  assert.equal(GameHub._ledgerItems.length, 1);
  assert.equal(GameHub._ledgerItems[0].id, 'lt_1');

  // Switching tab clears stale view state cleanly
  sandbox.Net.get = origGet;
  await GameHub.switchTab('ledger');
  assert.equal(GameHub._activeTab, 'ledger');
});

test('Input blocks gameplay hotkeys while Hub/Mail modals are open and handles Escape cleanly', () => {
  const windowListeners = new Map();
  const doc = createFakeDocument([
    'hub-modal', 'mail-modal', 'shop-modal', 'dialog-modal',
    'kpah-menu-modal', 'continent-modal', 'game-canvas', 'chat-inp', 'canvas-area',
  ]);
  doc.activeElement = null;
  doc.getElementById('canvas-area').clientWidth = 800;
  doc.getElementById('canvas-area').clientHeight = 600;
  for (const id of ['game-canvas', 'chat-inp']) {
    doc.getElementById(id).addEventListener = () => {};
  }
  const skillCalls = [];
  let hubClosed = 0;
  const sandbox = vm.createContext({
    document: doc,
    window: { addEventListener(ev, fn) { windowListeners.set(ev, fn); } },
    canvas: { width: 800, height: 600 },
    ctx: { imageSmoothingEnabled: true },
    cW: 800,
    cH: 600,
    S: { player: { px: 10, py: 10, isMoving: false }, monsters: [], npcs: [] },
    GameHub: {
      isMailOpen: () => doc.getElementById('mail-modal').style.display === 'flex',
      isHubOpen: () => doc.getElementById('hub-modal').style.display === 'flex',
      closeMail() { doc.getElementById('mail-modal').style.display = 'none'; hubClosed += 1; },
      closeHub() { doc.getElementById('hub-modal').style.display = 'none'; hubClosed += 1; },
      closeAll() {},
    },
    SkillSystem: { useSkill(idx) { skillCalls.push(idx); } },
    World: { clearPendingNpcInteraction() {}, cancelPlayerMove() {}, checkNpcInteract() { skillCalls.push('F'); } },
    QuestUI: { toggle() { skillCalls.push('Q'); }, close() {} },
    Shop: { close() {} },
    DialogUI: { close() {} },
    UI: { toggleKpahMenu() { skillCalls.push('B'); }, toggleHudSettings() {}, updateTargetHud() {} },
    Net: { emitMove() {}, sendChat() {} },
  });
  const Input = runScript('public/js/input.js', sandbox, 'Input');
  Input.init();
  const keydown = windowListeners.get('keydown');
  const mkEvent = (code, key) => ({ code, key, repeat: false, preventDefault() {} });

  doc.getElementById('hub-modal').style.display = 'flex';
  keydown(mkEvent('Digit1', '1'));
  keydown(mkEvent('KeyQ', 'q'));
  keydown(mkEvent('KeyW', 'w'));
  assert.equal(skillCalls.length, 0);
  assert.equal(Boolean(Input.keys.KeyW), false);

  keydown(mkEvent('Escape', 'Escape'));
  assert.equal(doc.getElementById('hub-modal').style.display, 'none');
  assert.ok(hubClosed >= 1);

  keydown(mkEvent('Digit1', '1'));
  assert.deepEqual(skillCalls, [0]);
});
