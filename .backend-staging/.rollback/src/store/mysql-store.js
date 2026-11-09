const mysql = require('mysql2/promise');
const crypto = require('node:crypto');
const { DomainError, publicPlayer } = require('../domain');
const { combatPower, deriveStats } = require('../data/balance');
const { items: itemCatalog } = require('../data/mock-data');

function createMysqlStore(config) {
  const pool = mysql.createPool({ ...config, timezone: 'Z', waitForConnections: true, queueLimit: config.queueLimit ?? 100, decimalNumbers: true });
  async function init() { const connection = await pool.getConnection(); connection.release(); }
  async function healthCheck() { await pool.query('SELECT 1'); return true; }
  async function findUserByUsername(username) {
    const [rows] = await pool.execute('SELECT id, username, password_hash AS passwordHash, role, status, created_at AS createdAt FROM users WHERE username = ? LIMIT 1', [username]);
    return rows[0] || null;
  }
  async function findUserById(id) {
    const [rows] = await pool.execute('SELECT id, username, password_hash AS passwordHash, role, status, created_at AS createdAt FROM users WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  }
  async function insertUser(user) {
    try {
      await pool.execute('INSERT INTO users (id, username, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)', [user.id, user.username, user.passwordHash, user.role, user.status, user.createdAt]);
      return user;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw new DomainError('USERNAME_TAKEN', 'Username đã tồn tại', 409);
      throw error;
    }
  }
  async function saveRefreshToken(userId, tokenHash, expiresAt) {
    await pool.execute(
      'INSERT INTO auth_refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [`rft_${crypto.randomUUID()}`, userId, tokenHash, expiresAt],
    );
  }
  async function rotateRefreshToken(tokenHash, nextTokenHash, nextExpiresAt) {
    return withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const [[token]] = await connection.query(
          'SELECT token.id, token.user_id AS userId, token.expires_at AS expiresAt, token.revoked_at AS revokedAt, user.username, user.role, user.status FROM auth_refresh_tokens AS token JOIN users AS user ON user.id = token.user_id WHERE token.token_hash = ? FOR UPDATE',
          [tokenHash],
        );
        if (!token) { await connection.commit(); return null; }
        const expired = new Date(token.expiresAt).getTime() <= Date.now();
        if (token.revokedAt || expired || token.status !== 'ACTIVE') {
          if (token.revokedAt) {
            await connection.execute('UPDATE auth_refresh_tokens SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP(3)) WHERE user_id = ? AND revoked_at IS NULL', [token.userId]);
          } else {
            await connection.execute('UPDATE auth_refresh_tokens SET revoked_at = UTC_TIMESTAMP(3) WHERE id = ?', [token.id]);
          }
          await connection.commit();
          return null;
        }
        await connection.execute(
          'UPDATE auth_refresh_tokens SET revoked_at = UTC_TIMESTAMP(3), replaced_by_hash = ? WHERE id = ? AND revoked_at IS NULL',
          [nextTokenHash, token.id],
        );
        await connection.execute(
          'INSERT INTO auth_refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
          [`rft_${crypto.randomUUID()}`, token.userId, nextTokenHash, nextExpiresAt],
        );
        await connection.commit();
        return { id: token.userId, username: token.username, role: token.role, status: token.status };
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });
  }
  async function revokeRefreshToken(tokenHash) {
    const [result] = await pool.execute(
      'UPDATE auth_refresh_tokens SET revoked_at = UTC_TIMESTAMP(3) WHERE token_hash = ? AND revoked_at IS NULL',
      [tokenHash],
    );
    return result.affectedRows > 0;
  }
  async function withConnection(work) { const connection = await pool.getConnection(); try { return await work(connection); } finally { connection.release(); } }
  function decodeJson(value) { return typeof value === 'string' ? JSON.parse(value) : value; }

  async function writeAudit(connection, actorId, action, resource, before, after, requestId = null) {
    await connection.execute(
      'INSERT INTO admin_audit_logs (id, actor_id, action, resource, before_json, after_json, request_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [`aud_${crypto.randomUUID()}`, actorId, action, resource, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), requestId],
    );
  }

  async function listAdminWorlds() {
    const [rows] = await pool.query('SELECT code, status, version, document_json AS documentJson FROM admin_worlds ORDER BY code');
    return rows.map((row) => ({ ...decodeJson(row.documentJson), code: row.code, status: row.status, version: row.version }));
  }

  async function saveAdminWorlds(actorId, documents, action, requestId = null) {
    return withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const savedDocuments = [];
        for (const document of documents) {
          const [[prior]] = await connection.query('SELECT status, version, document_json AS documentJson FROM admin_worlds WHERE code = ? FOR UPDATE', [document.code]);
          const before = prior ? { ...decodeJson(prior.documentJson), status: prior.status, version: prior.version } : null;
          const status = String(document.status || 'DRAFT').toUpperCase() === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
          const version = Number(prior?.version || 0) + 1;
          const stored = { ...document, status, version };
          await connection.execute(
            'INSERT INTO admin_worlds (code, status, version, document_json, updated_by) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), version = VALUES(version), document_json = VALUES(document_json), updated_by = VALUES(updated_by)',
            [document.code, status, version, JSON.stringify(stored), actorId],
          );
          await writeAudit(connection, actorId, action, `world:${document.code}`, before, stored, requestId);
          savedDocuments.push(stored);
        }
        await connection.commit();
        return savedDocuments;
      } catch (error) { await connection.rollback(); throw error; }
    });
  }

  async function deleteAdminWorld(actorId, code, requestId = null) {
    return withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const [[prior]] = await connection.query('SELECT status, version, document_json AS documentJson FROM admin_worlds WHERE code = ? FOR UPDATE', [code]);
        if (!prior) throw new DomainError('WORLD_NOT_FOUND', 'Bản đồ không tồn tại', 404);
        const before = { ...decodeJson(prior.documentJson), status: prior.status, version: prior.version };
        const deleted = { ...before, status: 'DELETED', version: Number(prior.version || 0) + 1 };
        await connection.execute('UPDATE admin_worlds SET status = ?, version = ?, document_json = ?, updated_by = ? WHERE code = ?', ['DELETED', deleted.version, JSON.stringify(deleted), actorId, code]);
        await writeAudit(connection, actorId, 'WORLD_DELETE', `world:${code}`, before, deleted, requestId);
        await connection.commit();
        return before;
      } catch (error) { await connection.rollback(); throw error; }
    });
  }

  async function listAdminContentRecords(collection) {
    const [rows] = await pool.execute('SELECT record_id AS recordId, document_json AS documentJson, is_deleted AS isDeleted, version FROM admin_content_records WHERE collection_name = ? ORDER BY record_id', [collection]);
    return rows.map((row) => ({ id: row.recordId, data: decodeJson(row.documentJson), deleted: Boolean(row.isDeleted), version: row.version }));
  }

  async function pageAdminCatalog(collection, seeds, { q, ids, limit, offset }) {
    const sql = [
      "WITH seed AS (SELECT CONVERT(record_id USING utf8mb4) COLLATE utf8mb4_unicode_ci AS record_id, CONVERT(name USING utf8mb4) COLLATE utf8mb4_unicode_ci AS name, CONVERT(code USING utf8mb4) COLLATE utf8mb4_unicode_ci AS code FROM JSON_TABLE(?, '$[*]' COLUMNS (record_id VARCHAR(96) PATH '$.id', name VARCHAR(512) PATH '$.name', code VARCHAR(96) PATH '$.code')) AS seed_rows),",
      "effective AS (",
      " SELECT record_id, JSON_UNQUOTE(COALESCE(JSON_EXTRACT(document_json, '$.tenDo'), JSON_EXTRACT(document_json, '$.name'))) COLLATE utf8mb4_unicode_ci AS name,",
      " JSON_UNQUOTE(COALESCE(JSON_EXTRACT(document_json, '$.maDo'), JSON_EXTRACT(document_json, '$.code'))) COLLATE utf8mb4_unicode_ci AS code, TRUE AS isOverride",
      " FROM admin_content_records WHERE collection_name = ? AND is_deleted = FALSE",
      " UNION ALL SELECT seed.record_id, seed.name, seed.code, FALSE FROM seed",
      " WHERE NOT EXISTS (SELECT 1 FROM admin_content_records r WHERE r.collection_name = ? AND r.record_id = seed.record_id)",
      "), filtered AS (SELECT record_id, isOverride FROM effective",
      " WHERE (? = '' OR LOCATE(LOWER(?), LOWER(CONCAT_WS(' ', record_id, name, code))) > 0)",
      " AND (? = 0 OR record_id IN (SELECT CONVERT(id USING utf8mb4) COLLATE utf8mb4_unicode_ci FROM JSON_TABLE(?, '$[*]' COLUMNS (id VARCHAR(96) PATH '$')) AS ids)",
      " OR code IN (SELECT CONVERT(id USING utf8mb4) COLLATE utf8mb4_unicode_ci FROM JSON_TABLE(?, '$[*]' COLUMNS (id VARCHAR(96) PATH '$')) AS codes))),",
      " paged AS (SELECT record_id, isOverride FROM filtered ORDER BY record_id LIMIT ? OFFSET ?)",
      " SELECT paged.record_id AS id, r.document_json AS documentJson, totals.total FROM (SELECT COUNT(*) AS total FROM filtered) AS totals",
      " LEFT JOIN paged ON TRUE LEFT JOIN admin_content_records r ON paged.isOverride AND r.collection_name = ? AND r.record_id = paged.record_id",
      " ORDER BY paged.record_id",
    ].join("\n");
    const idsJson = JSON.stringify(ids);
    const [rows] = await pool.execute(sql, [JSON.stringify(seeds), collection, collection, q, q, ids.length, idsJson, idsJson, limit, offset, collection]);
    return { total: Number(rows[0]?.total || 0), rows: rows.filter((row) => row.id !== null).map((row) => ({
      id: row.id, data: row.documentJson == null ? null : decodeJson(row.documentJson),
    })) };
  }

  async function getAdminContentRecord(collection, id) {
    const [[row]] = await pool.execute("SELECT document_json AS documentJson, is_deleted AS isDeleted, version FROM admin_content_records WHERE collection_name = ? AND record_id = ?", [collection, id]);
    return row ? { data: decodeJson(row.documentJson), deleted: Boolean(row.isDeleted), version: row.version } : null;
  }

  async function listAdminAccounts() {
    const [rows] = await pool.query('SELECT id, username, role, status, created_at AS createdAt FROM users ORDER BY created_at DESC');
    return rows;
  }

  async function mutateAdminContent(actorId, collection, recordId, document, remove = false, requestId = null, createOnly = false, expectedVersion) {
    return withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const [[prior]] = await connection.query('SELECT document_json AS documentJson, is_deleted AS isDeleted, version FROM admin_content_records WHERE collection_name = ? AND record_id = ? FOR UPDATE', [collection, recordId]);
        if (expectedVersion !== undefined && Number(prior?.version || 0) !== Number(expectedVersion)) {
          throw new DomainError("CONTENT_CONFLICT", "Bản ghi vừa thay đổi. Tải lại trước khi lưu.", 409);
        }
        if (createOnly && prior && !prior.isDeleted) throw new DomainError('CONTENT_EXISTS', 'Bản ghi đã tồn tại', 409);
        const before = prior ? { data: decodeJson(prior.documentJson), deleted: Boolean(prior.isDeleted), version: prior.version } : null;
        const stored = document || (prior ? decodeJson(prior.documentJson) : { id: recordId });
        const version = Number(prior?.version || 0) + 1;
        const upsert = createOnly && !prior ? '' : ' ON DUPLICATE KEY UPDATE document_json = VALUES(document_json), is_deleted = VALUES(is_deleted), version = VALUES(version), updated_by = VALUES(updated_by)';
        await connection.execute(
          'INSERT INTO admin_content_records (collection_name, record_id, document_json, is_deleted, version, updated_by) VALUES (?, ?, ?, ?, ?, ?)' + upsert,
          [collection, recordId, JSON.stringify(stored), remove ? 1 : 0, version, actorId],
        );
        await writeAudit(connection, actorId, remove ? 'CONTENT_DELETE' : prior ? 'CONTENT_UPDATE' : 'CONTENT_CREATE', `content:${collection}:${recordId}`, before, { data: stored, deleted: remove, version }, requestId);
        await connection.commit();
        return { data: stored, deleted: remove, version };
      } catch (error) { await connection.rollback(); throw error; }
    });
  }

  async function listAdminSkillVfx() {
    const [rows] = await pool.query('SELECT skill_code AS skillCode, profile_json AS profileJson FROM skill_vfx_profiles ORDER BY skill_code');
    return Object.fromEntries(rows.map((row) => [row.skillCode, decodeJson(row.profileJson)]));
  }

  async function mutateSkillVfx(actorId, skillCode, profile, remove = false, requestId = null) {
    return withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const [[prior]] = await connection.query('SELECT profile_json AS profileJson FROM skill_vfx_profiles WHERE skill_code = ? FOR UPDATE', [skillCode]);
        const before = prior ? decodeJson(prior.profileJson) : null;
        if (remove) await connection.execute('DELETE FROM skill_vfx_profiles WHERE skill_code = ?', [skillCode]);
        else await connection.execute(
          'INSERT INTO skill_vfx_profiles (skill_code, profile_json, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE profile_json = VALUES(profile_json), updated_by = VALUES(updated_by)',
          [skillCode, JSON.stringify(profile), actorId],
        );
        await writeAudit(connection, actorId, remove ? 'SKILL_VFX_DELETE' : prior ? 'SKILL_VFX_UPDATE' : 'SKILL_VFX_CREATE', `skill-vfx:${skillCode}`, before, remove ? null : profile, requestId);
        await connection.commit();
        return remove ? null : profile;
      } catch (error) { await connection.rollback(); throw error; }
    });
  }

  function replayIdempotentResult(row, operation, itemCode, count) {
    const stored = typeof row.resultJson === 'string' ? JSON.parse(row.resultJson) : row.resultJson;
    if (stored && stored.__idempotency) {
      const intent = stored.__idempotency;
      if (intent.operation !== operation || intent.itemCode !== itemCode || intent.count !== count) {
        throw new DomainError('IDEMPOTENCY_CONFLICT', 'requestId đã được dùng cho một yêu cầu khác', 409);
      }
      return stored.player;
    }
    if (operation === 'BUY_ITEM') return stored;
    throw new DomainError('IDEMPOTENCY_CONFLICT', 'requestId đã được dùng trước khi hỗ trợ bán hàng idempotent', 409);
  }

  function idempotencyEnvelope(operation, itemCode, count, player) {
    return JSON.stringify({ __idempotency: { operation, itemCode, count }, player });
  }

  function replayMutation(row, intent) {
    const stored = typeof row.resultJson === 'string' ? JSON.parse(row.resultJson) : row.resultJson;
    const priorIntent = stored?.__idempotency;
    if (!priorIntent || Object.entries(intent).some(([key, value]) => JSON.stringify(priorIntent[key]) !== JSON.stringify(value))) {
      throw new DomainError('IDEMPOTENCY_CONFLICT', 'requestId đã được dùng cho một yêu cầu khác', 409);
    }
    return { player: stored.player, result: stored.result };
  }

  function playerState(row) {
    return {
      tuVi: row.tuVi, tuViLinhCan: row.tuViLinhCan, hp: row.hp, maxHp: row.maxHp,
      mp: row.mp, maxMp: row.maxMp, realmCode: row.realmCode, realmStage: row.realmStage,
      stats: { str: row.str, agi: row.agi, vit: row.vit, ene: row.ene },
    };
  }

  async function saveAction(connection, playerId, action, requestId, payload, before, after) {
    await connection.execute(
      'INSERT INTO player_action_ledger (id, player_id, action, idempotency_key, payload_json, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [`act_${crypto.randomUUID()}`, playerId, action, requestId, JSON.stringify(payload), JSON.stringify(before), JSON.stringify(after)],
    );
  }

  async function playerMutation(userId, requestId, intent, action, { includeSnapshot = true, afterState } = {}) {
    return withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const [[player]] = await connection.query(
          'SELECT id, gender, linh_can AS linhCan, realm_code AS realmCode, realm_stage AS realmStage, tu_vi AS tuVi, tu_vi_linh_can AS tuViLinhCan, hp, max_hp AS maxHp, mp, max_mp AS maxMp, str_stat AS str, agi_stat AS agi, vit_stat AS vit, ene_stat AS ene, unspent_points AS unspentPoints FROM players WHERE user_id = ? FOR UPDATE',
          [userId],
        );
        if (!player) throw new DomainError('PLAYER_NOT_FOUND', 'Chưa tạo nhân vật', 404);
        const [dedup] = await connection.execute('SELECT result_json AS resultJson FROM idempotency_keys WHERE user_id = ? AND request_id = ? FOR UPDATE', [userId, requestId]);
        if (dedup.length) {
          const replay = replayMutation(dedup[0], intent);
          await connection.commit();
          return replay;
        }
        const before = playerState(player);
        const result = await action(connection, player);
        await connection.execute('UPDATE players SET version = version + 1 WHERE id = ?', [player.id]);
        const updatedPlayer = includeSnapshot ? await snapshotWith(connection, userId) : null;
        const finalState = afterState
          ? { ...player, ...afterState(result, player) }
          : { ...player, ...(await currentPlayerState(connection, player.id)) };
        const after = playerState(finalState);
        await saveAction(connection, player.id, intent.operation, requestId, intent, before, after);
        await connection.execute('INSERT INTO idempotency_keys (user_id, request_id, result_json) VALUES (?, ?, ?)', [userId, requestId, JSON.stringify({ __idempotency: intent, player: updatedPlayer, result })]);
        await connection.commit();
        return { player: updatedPlayer, result };
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });
  }

  async function currentPlayerState(connection, playerId) {
    const [[row]] = await connection.query(
      'SELECT realm_code AS realmCode, realm_stage AS realmStage, tu_vi AS tuVi, tu_vi_linh_can AS tuViLinhCan, hp, max_hp AS maxHp, mp, max_mp AS maxMp, str_stat AS str, agi_stat AS agi, vit_stat AS vit, ene_stat AS ene FROM players WHERE id = ? LIMIT 1',
      [playerId],
    );
    return row;
  }

  async function ensureQuestState(connection, playerId, definitions) {
    for (const quest of definitions) {
      await connection.execute(
        'INSERT IGNORE INTO player_quests (player_id, quest_id, status, progress) VALUES (?, ?, ?, ?)',
        [playerId, quest.id, quest.initialStatus, quest.initialProgress],
      );
    }
    await connection.execute('INSERT IGNORE INTO player_quest_meta (player_id, revision, tracked_id) VALUES (?, 0, ?)', [playerId, definitions.find((quest) => quest.initialStatus === 'active')?.id || null]);
  }

  async function questSnapshotWith(connection, playerId, definitions) {
    await ensureQuestState(connection, playerId, definitions);
    const [[meta]] = await connection.query('SELECT revision, tracked_id AS trackedId FROM player_quest_meta WHERE player_id = ? LIMIT 1', [playerId]);
    const [states] = await connection.execute('SELECT quest_id AS questId, status, progress FROM player_quests WHERE player_id = ?', [playerId]);
    const { makeSnapshot } = require('../quests/quest-catalog');
    return makeSnapshot(meta, states, definitions);
  }

  async function questSnapshot(userId, definitions) {
    return withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const [[player]] = await connection.query('SELECT id FROM players WHERE user_id = ? LIMIT 1', [userId]);
        if (!player) throw new DomainError('PLAYER_NOT_FOUND', 'Chưa tạo nhân vật', 404);
        const snapshot = await questSnapshotWith(connection, player.id, definitions);
        await connection.commit();
        return snapshot;
      } catch (error) { await connection.rollback(); throw error; }
    });
  }

  async function grantQuestItems(connection, playerId, rewards, items) {
    const grantedItems = [];
    for (const reward of rewards.filter((entry) => entry.type === 'item')) {
      const item = items.find((entry) => entry.id === reward.itemId);
      if (!item) throw new DomainError('QUEST_REWARD_INVALID', 'Phần thưởng nhiệm vụ chưa được cấu hình', 409);
      const [[existing]] = await connection.query('SELECT id, quantity FROM inventory_items WHERE player_id = ? AND item_code = ? FOR UPDATE', [playerId, item.id]);
      if (existing) {
        if (existing.quantity + reward.amount > 99) throw new DomainError('INVENTORY_FULL', 'Túi đồ không đủ chỗ nhận phần thưởng', 409);
        await connection.execute('UPDATE inventory_items SET quantity = quantity + ?, version = version + 1 WHERE id = ?', [reward.amount, existing.id]);
      } else {
        const [[count]] = await connection.query('SELECT COUNT(*) AS count FROM inventory_items WHERE player_id = ?', [playerId]);
        if (count.count >= 40 || reward.amount > 99) throw new DomainError('INVENTORY_FULL', 'Túi đồ không đủ chỗ nhận phần thưởng', 409);
        const [[slot]] = await connection.query('SELECT COALESCE(MAX(slot), -1) + 1 AS nextSlot FROM inventory_items WHERE player_id = ?', [playerId]);
        await connection.execute('INSERT INTO inventory_items (id, player_id, item_code, quantity, slot, version) VALUES (?, ?, ?, ?, ?, 1)', [`inv_${crypto.randomUUID()}`, playerId, item.id, reward.amount, slot.nextSlot]);
      }
      grantedItems.push({ itemId: item.id, name: item.name || item.tenDo || item.id, count: reward.amount });
    }
    return grantedItems;
  }

  async function questAction(userId, requestId, questId, action, definitions, items) {
    const intent = { operation: `QUEST_${action.toUpperCase()}`, questId };
    return playerMutation(userId, requestId, intent, async (connection, player) => {
      const definition = definitions.find((quest) => quest.id === questId);
      if (!definition) throw new DomainError('QUEST_NOT_FOUND', 'Nhiệm vụ không tồn tại', 404);
      await ensureQuestState(connection, player.id, definitions);
      const [[quest]] = await connection.query('SELECT status, progress FROM player_quests WHERE player_id = ? AND quest_id = ? FOR UPDATE', [player.id, questId]);
      const [[meta]] = await connection.query('SELECT revision, tracked_id AS trackedId FROM player_quest_meta WHERE player_id = ? FOR UPDATE', [player.id]);
      let rewards = [];
      let grantedItems = [];

      if (action === 'accept') {
        if (quest.status !== 'available') throw new DomainError('QUEST_NOT_AVAILABLE', 'Nhiệm vụ này không thể nhận', 409);
        const status = definition.target === 0 ? 'ready' : 'active';
        await connection.execute('UPDATE player_quests SET status = ?, version = version + 1 WHERE player_id = ? AND quest_id = ?', [status, player.id, questId]);
        if (!meta.trackedId && status === 'active') meta.trackedId = questId;
      } else if (action === 'track') {
        if (quest.status !== 'active') throw new DomainError('QUEST_NOT_ACTIVE', 'Chỉ có thể theo dõi nhiệm vụ đang làm', 409);
        meta.trackedId = meta.trackedId === questId ? null : questId;
      } else if (action === 'claim') {
        if (quest.status !== 'ready') throw new DomainError('QUEST_NOT_READY', 'Chưa đủ điều kiện nhận thưởng', 409);
        rewards = definition.rewards.map((reward) => ({ ...reward }));
        grantedItems = await grantQuestItems(connection, player.id, rewards, items);
        const xu = rewards.filter((reward) => reward.type === 'xu').reduce((sum, reward) => sum + reward.amount, 0);
        const tuVi = rewards.filter((reward) => reward.type === 'tuVi').reduce((sum, reward) => sum + reward.amount, 0);
        if (xu > 0) {
          const [[wallet]] = await connection.query('SELECT xu FROM wallets WHERE player_id = ? FOR UPDATE', [player.id]);
          const balanceAfter = wallet.xu + xu;
          await connection.execute('UPDATE wallets SET xu = ?, version = version + 1 WHERE player_id = ?', [balanceAfter, player.id]);
          await connection.execute('INSERT INTO currency_ledger (id, player_id, reason, amount, balance_after, idempotency_key) VALUES (?, ?, ?, ?, ?, ?)', [`led_${crypto.randomUUID()}`, player.id, 'QUEST_REWARD', xu, balanceAfter, requestId]);
        }
        if (tuVi > 0) await connection.execute('UPDATE players SET tu_vi = tu_vi + ? WHERE id = ?', [tuVi, player.id]);
        await connection.execute('UPDATE player_quests SET status = ?, version = version + 1 WHERE player_id = ? AND quest_id = ?', ['completed', player.id, questId]);
        if (meta.trackedId === questId) {
          const [[next]] = await connection.query('SELECT quest_id AS questId FROM player_quests WHERE player_id = ? AND status = ? AND quest_id <> ? ORDER BY quest_id LIMIT 1', [player.id, 'active', questId]);
          meta.trackedId = next?.questId || null;
        }
      } else {
        throw new DomainError('INVALID_QUEST_ACTION', 'Thao tác nhiệm vụ không hợp lệ');
      }

      await connection.execute('UPDATE player_quest_meta SET revision = revision + 1, tracked_id = ? WHERE player_id = ?', [meta.trackedId, player.id]);
      const snapshot = await questSnapshotWith(connection, player.id, definitions);
      if (action !== 'claim') return { ok: true, ...snapshot };
      const [[wallet]] = await connection.query('SELECT xu FROM wallets WHERE player_id = ? LIMIT 1', [player.id]);
      const [inventory] = await connection.execute('SELECT item_code AS itemCode, quantity AS count, slot FROM inventory_items WHERE player_id = ? ORDER BY slot', [player.id]);
      const [[progression]] = await connection.query('SELECT tu_vi AS tuVi FROM players WHERE id = ? LIMIT 1', [player.id]);
      return {
        ok: true,
        rewards: rewards.map(({ type, itemId, amount, label }) => ({ type, itemId, amount, label })),
        grantedItems,
        ...snapshot,
        player: { xu: wallet.xu, tuViHienTai: progression.tuVi, inventory: inventory.map((entry) => ({ id: entry.itemCode, itemCode: entry.itemCode, count: entry.count, quantity: entry.count, slot: entry.slot })) },
      };
    });
  }

  async function applyQuestEvent(userId, eventId, event, definitions) {
    const intent = { operation: 'QUEST_EVENT', eventId };
    return playerMutation(userId, eventId, intent, async (connection, player) => {
      await ensureQuestState(connection, player.id, definitions);
      const [[meta]] = await connection.query('SELECT revision, tracked_id AS trackedId FROM player_quest_meta WHERE player_id = ? FOR UPDATE', [player.id]);
      const amount = Math.max(1, Math.min(99, Math.floor(Number(event.count) || 1)));
      let changed = false;
      for (const definition of definitions) {
        if (definition.eventType !== event.type || (definition.targetItemId && definition.targetItemId !== String(event.itemId || ''))) continue;
        const [[quest]] = await connection.query('SELECT status, progress FROM player_quests WHERE player_id = ? AND quest_id = ? FOR UPDATE', [player.id, definition.id]);
        if (quest.status !== 'active') continue;
        const progress = Math.min(definition.target, quest.progress + amount);
        const status = progress >= definition.target ? 'ready' : 'active';
        await connection.execute('UPDATE player_quests SET progress = ?, status = ?, version = version + 1 WHERE player_id = ? AND quest_id = ?', [progress, status, player.id, definition.id]);
        if (status === 'ready' && meta.trackedId === definition.id) {
          const [[next]] = await connection.query('SELECT quest_id AS questId FROM player_quests WHERE player_id = ? AND status = ? AND quest_id <> ? ORDER BY quest_id LIMIT 1', [player.id, 'active', definition.id]);
          meta.trackedId = next?.questId || null;
        }
        changed = true;
      }
      if (changed) await connection.execute('UPDATE player_quest_meta SET revision = revision + 1, tracked_id = ? WHERE player_id = ?', [meta.trackedId, player.id]);
      return changed ? { changed: true, ...(await questSnapshotWith(connection, player.id, definitions)) } : { changed: false, ...(await questSnapshotWith(connection, player.id, definitions)) };
    });
  }

  async function snapshotWith(connection, userId) {
    const [players] = await connection.execute('SELECT id, user_id AS userId, name, gender, linh_can AS linhCan, realm_code AS realmCode, realm_stage AS realmStage, tu_vi AS tuVi, tu_vi_linh_can AS tuViLinhCan, hp, max_hp AS maxHp, mp, max_mp AS maxMp, map_code AS mapCode, x, y, version, str_stat AS str, agi_stat AS agi, vit_stat AS vit, ene_stat AS ene, unspent_points AS unspentPoints FROM players WHERE user_id = ? LIMIT 1', [userId]);
    const player = players[0];
    if (!player) throw new DomainError('PLAYER_NOT_FOUND', 'Chưa tạo nhân vật', 404);
    const [[wallet]] = await connection.query('SELECT xu, linh_thach AS linhThach FROM wallets WHERE player_id = ? LIMIT 1', [player.id]);
    const [inventory] = await connection.execute('SELECT id, item_code AS itemCode, quantity, slot FROM inventory_items WHERE player_id = ? ORDER BY slot, id', [player.id]);
    const [equipmentRows] = await connection.execute('SELECT slot, item_code AS itemCode FROM player_equipment WHERE player_id = ? ORDER BY slot', [player.id]);
    const [learnedRows] = await connection.execute('SELECT skill_code AS skillCode FROM player_skills WHERE player_id = ? ORDER BY learned_at, skill_code', [player.id]);
    const [equippedRows] = await connection.execute('SELECT skill_code AS skillCode FROM player_equipped_skills WHERE player_id = ? ORDER BY slot', [player.id]);
    const stats = { str: player.str, agi: player.agi, vit: player.vit, ene: player.ene, unspentPoints: player.unspentPoints };
    const equipment = Object.fromEntries(equipmentRows.map((row) => [row.slot, { id: row.itemCode, itemCode: row.itemCode }]));
    const learnedSkills = learnedRows.map((row) => row.skillCode);
    const equippedSkills = equippedRows.map((row) => row.skillCode);
    return publicPlayer({
      ...player,
      stats,
      derivedStats: deriveStats(stats, equipment),
      skills: [],
      combatPower: combatPower({ ...player, realm: 1, tangTuVi: player.realmStage, tuViHienTai: player.tuVi, tuViLenCap: 1, stats, equipment, learnedSkills }),
    }, wallet, inventory, equipment, learnedSkills, equippedSkills);
  }
  async function playerSnapshot(userId) { return withConnection((connection) => snapshotWith(connection, userId)); }

  async function createPlayer(userId, player) {
    return withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const [[user]] = await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
        if (!user) throw new DomainError('UNAUTHORIZED', 'Tài khoản không tồn tại', 401);
        const [existing] = await connection.execute('SELECT id FROM players WHERE user_id = ? FOR UPDATE', [userId]);
        if (existing.length) { const result = await snapshotWith(connection, userId); await connection.commit(); return result; }
        const stats = player.stats || { str: 5, agi: 5, vit: 5, ene: 5 };
        await connection.execute('INSERT INTO players (id, user_id, name, gender, linh_can, realm_code, realm_stage, tu_vi, tu_vi_linh_can, hp, max_hp, mp, max_mp, map_code, x, y, version, str_stat, agi_stat, vit_stat, ene_stat, unspent_points) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [player.id, userId, player.name, player.gender, player.linhCan, player.realmCode, player.realmStage, player.tuVi, player.tuViLinhCan, player.hp, player.maxHp, player.mp, player.maxMp, player.mapCode, player.x, player.y, player.version, stats.str, stats.agi, stats.vit, stats.ene, 0]);
        await connection.execute('INSERT INTO wallets (player_id, xu, linh_thach, version) VALUES (?, 50, 0, 1)', [player.id]);
        await connection.execute('INSERT INTO currency_ledger (id, player_id, reason, amount, balance_after, idempotency_key) VALUES (?, ?, ?, ?, ?, ?)', [`led_${crypto.randomUUID()}`, player.id, 'REWARD', 50, 50, 'PLAYER_CREATE']);
        for (const skillCode of player.initialLearnedSkills || []) {
          await connection.execute('INSERT INTO player_skills (player_id, skill_code) VALUES (?, ?)', [player.id, skillCode]);
        }
        for (const [index, skillCode] of (player.initialEquippedSkills || []).entries()) {
          await connection.execute('INSERT INTO player_equipped_skills (player_id, slot, skill_code) VALUES (?, ?, ?)', [player.id, index + 1, skillCode]);
        }
        const result = await snapshotWith(connection, userId); await connection.commit(); return result;
      } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') throw new DomainError('PLAYER_CONFLICT', 'Tên nhân vật hoặc hồ sơ đã tồn tại', 409);
        throw error;
      }
    });
  }

  async function buyItem(userId, requestId, itemCode, count, item) {
    return withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const [[player]] = await connection.query('SELECT id FROM players WHERE user_id = ? FOR UPDATE', [userId]);
        if (!player) throw new DomainError('PLAYER_NOT_FOUND', 'Chưa tạo nhân vật', 404);
        const [dedup] = await connection.execute('SELECT result_json AS resultJson FROM idempotency_keys WHERE user_id = ? AND request_id = ? FOR UPDATE', [userId, requestId]);
        if (dedup.length) { const replay = replayIdempotentResult(dedup[0], 'BUY_ITEM', itemCode, count); await connection.commit(); return replay; }
        const [[wallet]] = await connection.query('SELECT xu FROM wallets WHERE player_id = ? FOR UPDATE', [player.id]);
        const total = item.price * count;
        if (!wallet || wallet.xu < total) throw new DomainError('INSUFFICIENT_FUNDS', 'Không đủ xu', 409);
        await connection.execute('UPDATE wallets SET xu = xu - ?, version = version + 1 WHERE player_id = ?', [total, player.id]);
        const [[existingItem]] = await connection.query('SELECT id, quantity FROM inventory_items WHERE player_id = ? AND item_code = ? FOR UPDATE', [player.id, itemCode]);
        if (existingItem) {
          if (existingItem.quantity + count > 99) throw new DomainError('INVENTORY_STACK_LIMIT', 'Số lượng vật phẩm vượt giới hạn túi đồ', 409);
          await connection.execute('UPDATE inventory_items SET quantity = quantity + ?, version = version + 1 WHERE id = ?', [count, existingItem.id]);
        } else {
          const [[inventoryCount]] = await connection.query('SELECT COUNT(*) AS count FROM inventory_items WHERE player_id = ?', [player.id]);
          if (inventoryCount.count >= 40) throw new DomainError('INVENTORY_FULL', 'Túi đồ đã đầy', 409);
          const [[slot]] = await connection.query('SELECT COALESCE(MAX(slot), -1) + 1 AS nextSlot FROM inventory_items WHERE player_id = ?', [player.id]);
          await connection.execute('INSERT INTO inventory_items (id, player_id, item_code, quantity, slot, version) VALUES (?, ?, ?, ?, ?, 1)', [`inv_${crypto.randomUUID()}`, player.id, itemCode, count, slot.nextSlot]);
        }
        await connection.execute('INSERT INTO currency_ledger (id, player_id, reason, amount, balance_after, idempotency_key) VALUES (?, ?, ?, ?, ?, ?)', [`led_${crypto.randomUUID()}`, player.id, 'BUY_ITEM', -total, wallet.xu - total, requestId]);
        const result = await snapshotWith(connection, userId);
        await connection.execute('INSERT INTO idempotency_keys (user_id, request_id, result_json) VALUES (?, ?, ?)', [userId, requestId, idempotencyEnvelope('BUY_ITEM', itemCode, count, result)]);
        await connection.commit(); return result;
      } catch (error) { await connection.rollback(); throw error; }
    });
  }

  async function sellItem(userId, requestId, itemCode, count, item) {
    return withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const [[player]] = await connection.query('SELECT id FROM players WHERE user_id = ? FOR UPDATE', [userId]);
        if (!player) throw new DomainError('PLAYER_NOT_FOUND', 'Chưa tạo nhân vật', 404);
        const [dedup] = await connection.execute('SELECT result_json AS resultJson FROM idempotency_keys WHERE user_id = ? AND request_id = ? FOR UPDATE', [userId, requestId]);
        if (dedup.length) { const replay = replayIdempotentResult(dedup[0], 'SELL_ITEM', itemCode, count); await connection.commit(); return replay; }
        const [[wallet]] = await connection.query('SELECT xu FROM wallets WHERE player_id = ? FOR UPDATE', [player.id]);
        const [[inventoryItem]] = await connection.execute('SELECT id, quantity FROM inventory_items WHERE player_id = ? AND item_code = ? FOR UPDATE', [player.id, itemCode]);
        if (!wallet || !inventoryItem || inventoryItem.quantity < count) throw new DomainError('INSUFFICIENT_ITEM', 'Không đủ vật phẩm để bán', 409);
        const total = item.sellPrice * count;
        if (inventoryItem.quantity === count) {
          await connection.execute('DELETE FROM inventory_items WHERE id = ?', [inventoryItem.id]);
        } else {
          await connection.execute('UPDATE inventory_items SET quantity = quantity - ?, version = version + 1 WHERE id = ?', [count, inventoryItem.id]);
        }
        await connection.execute('UPDATE wallets SET xu = xu + ?, version = version + 1 WHERE player_id = ?', [total, player.id]);
        const balanceAfter = wallet.xu + total;
        await connection.execute('INSERT INTO currency_ledger (id, player_id, reason, amount, balance_after, idempotency_key) VALUES (?, ?, ?, ?, ?, ?)', [`led_${crypto.randomUUID()}`, player.id, 'SELL_ITEM', total, balanceAfter, requestId]);
        const result = await snapshotWith(connection, userId);
        await connection.execute('INSERT INTO idempotency_keys (user_id, request_id, result_json) VALUES (?, ?, ?)', [userId, requestId, idempotencyEnvelope('SELL_ITEM', itemCode, count, result)]);
        await connection.commit(); return result;
      } catch (error) { await connection.rollback(); throw error; }
    });
  }

  async function useInventoryItem(userId, requestId, itemCode, operation, effect) {
    return withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const [[player]] = await connection.query(
          'SELECT id, realm_code AS realmCode, realm_stage AS realmStage, tu_vi AS tuVi, tu_vi_linh_can AS tuViLinhCan, hp, max_hp AS maxHp, mp, max_mp AS maxMp, str_stat AS str, agi_stat AS agi, vit_stat AS vit, ene_stat AS ene, unspent_points AS unspentPoints FROM players WHERE user_id = ? FOR UPDATE',
          [userId],
        );
        if (!player) throw new DomainError('PLAYER_NOT_FOUND', 'Chưa tạo nhân vật', 404);
        const intent = { operation, itemCode, quantity: 1 };
        const [dedup] = await connection.execute('SELECT result_json AS resultJson FROM idempotency_keys WHERE user_id = ? AND request_id = ? FOR UPDATE', [userId, requestId]);
        if (dedup.length) {
          const replay = replayMutation(dedup[0], intent);
          await connection.commit();
          return replay;
        }

        const [[inventoryItem]] = await connection.query(
          'SELECT id, quantity FROM inventory_items WHERE player_id = ? AND item_code = ? FOR UPDATE',
          [player.id, itemCode],
        );
        if (!inventoryItem || inventoryItem.quantity < 1) throw new DomainError('ITEM_NOT_IN_INVENTORY', 'Vật phẩm không có trong túi đồ', 404);

        const before = playerState(player);
        const next = { ...player };
        let result;
        if (effect.kind === 'cultivation') {
          next.tuVi += effect.amount;
          result = { type: 'cultivation_absorbed', itemId: itemCode, amount: effect.amount, hp: 0, mp: 0, stat: null };
        } else if (effect.kind === 'root_cultivation') {
          const gain = Math.min(effect.amount, Math.max(0, effect.cap - next.tuViLinhCan));
          if (gain <= 0) throw new DomainError('ROOT_CULTIVATION_CAPPED', 'Tu vi linh căn đã đạt giới hạn vật phẩm', 409);
          next.tuViLinhCan += gain;
          result = { type: 'root_cultivation', itemId: itemCode, gain, hp: 0, mp: 0, stat: null };
        } else if (effect.kind === 'potion') {
          const hpBefore = next.hp;
          const mpBefore = next.mp;
          next.hp = Math.min(next.maxHp, next.hp + effect.healHp);
          next.mp = Math.min(next.maxMp, next.mp + effect.healMp);
          let stat = null;
          if (effect.statBoost > 0) {
            const statColumn = { str: 'str', agi: 'agi', vit: 'vit', ene: 'ene' }[effect.statKey];
            if (!statColumn) throw new DomainError('INVALID_ITEM_EFFECT', 'Hiệu ứng chỉ số vật phẩm không hợp lệ', 500);
            next[statColumn] += effect.statBoost;
            if (statColumn === 'vit') next.maxHp = 100 + next.vit * 12;
            if (statColumn === 'ene') next.maxMp = 50 + next.ene * 8;
            next.hp = Math.min(next.hp, next.maxHp);
            next.mp = Math.min(next.mp, next.maxMp);
            stat = { key: statColumn, amount: effect.statBoost };
          }
          result = { type: 'item_used', itemId: itemCode, hp: next.hp - hpBefore, mp: next.mp - mpBefore, stat };
          if (result.hp === 0 && result.mp === 0 && !result.stat) throw new DomainError('ITEM_HAS_NO_EFFECT', 'Vật phẩm hiện không có hiệu quả', 409);
        } else {
          throw new DomainError('ITEM_USE_NOT_SUPPORTED', 'Vật phẩm này chưa hỗ trợ sử dụng', 409);
        }

        if (inventoryItem.quantity === 1) {
          await connection.execute('DELETE FROM inventory_items WHERE id = ?', [inventoryItem.id]);
        } else {
          await connection.execute('UPDATE inventory_items SET quantity = quantity - 1, version = version + 1 WHERE id = ?', [inventoryItem.id]);
        }
        await connection.execute(
          'UPDATE players SET tu_vi = ?, tu_vi_linh_can = ?, hp = ?, max_hp = ?, mp = ?, max_mp = ?, str_stat = ?, agi_stat = ?, vit_stat = ?, ene_stat = ?, version = version + 1 WHERE id = ?',
          [next.tuVi, next.tuViLinhCan, next.hp, next.maxHp, next.mp, next.maxMp, next.str, next.agi, next.vit, next.ene, player.id],
        );
        const after = playerState(next);
        await saveAction(connection, player.id, operation, requestId, { itemCode, effect }, before, after);
        const updatedPlayer = await snapshotWith(connection, userId);
        await connection.execute('INSERT INTO idempotency_keys (user_id, request_id, result_json) VALUES (?, ?, ?)', [userId, requestId, JSON.stringify({ __idempotency: intent, player: updatedPlayer, result })]);
        await connection.commit();
        return { player: updatedPlayer, result };
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });
  }

  async function allocateStats(userId, requestId, stat, amount) {
    return withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const [[player]] = await connection.query(
          'SELECT id, realm_code AS realmCode, realm_stage AS realmStage, tu_vi AS tuVi, tu_vi_linh_can AS tuViLinhCan, hp, max_hp AS maxHp, mp, max_mp AS maxMp, str_stat AS str, agi_stat AS agi, vit_stat AS vit, ene_stat AS ene, unspent_points AS unspentPoints FROM players WHERE user_id = ? FOR UPDATE',
          [userId],
        );
        if (!player) throw new DomainError('PLAYER_NOT_FOUND', 'Chưa tạo nhân vật', 404);
        const intent = { operation: 'ALLOCATE_STAT', stat, amount };
        const [dedup] = await connection.execute('SELECT result_json AS resultJson FROM idempotency_keys WHERE user_id = ? AND request_id = ? FOR UPDATE', [userId, requestId]);
        if (dedup.length) {
          const replay = replayMutation(dedup[0], intent);
          await connection.commit();
          return replay;
        }
        if (player.unspentPoints < amount) throw new DomainError('INSUFFICIENT_STAT_POINTS', 'Không đủ điểm thuộc tính', 409);
        const before = playerState(player);
        const next = { ...player, unspentPoints: player.unspentPoints - amount };
        next[stat] += amount;
        if (stat === 'vit') {
          next.maxHp = 100 + next.vit * 12;
          next.hp = Math.min(next.hp, next.maxHp);
        }
        if (stat === 'ene') {
          next.maxMp = 50 + next.ene * 8;
          next.mp = Math.min(next.mp, next.maxMp);
        }
        await connection.execute(
          'UPDATE players SET str_stat = ?, agi_stat = ?, vit_stat = ?, ene_stat = ?, unspent_points = ?, hp = ?, max_hp = ?, mp = ?, max_mp = ?, version = version + 1 WHERE id = ?',
          [next.str, next.agi, next.vit, next.ene, next.unspentPoints, next.hp, next.maxHp, next.mp, next.maxMp, player.id],
        );
        const after = playerState(next);
        await saveAction(connection, player.id, 'ALLOCATE_STAT', requestId, { stat, amount }, before, after);
        const updatedPlayer = await snapshotWith(connection, userId);
        const result = { stats: { str: next.str, agi: next.agi, vit: next.vit, ene: next.ene }, unspentStatPoints: next.unspentPoints, derivedStats: deriveStats({ str: next.str, agi: next.agi, vit: next.vit, ene: next.ene }) };
        await connection.execute('INSERT INTO idempotency_keys (user_id, request_id, result_json) VALUES (?, ?, ?)', [userId, requestId, JSON.stringify({ __idempotency: intent, player: updatedPlayer, result })]);
        await connection.commit();
        return { player: updatedPlayer, result };
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });
  }

  async function updatePlayerName(userId, playerId, name) {
    return withConnection(async (connection) => {
      const [[owned]] = await connection.query('SELECT id FROM players WHERE id = ? AND user_id = ? LIMIT 1', [playerId, userId]);
      if (!owned) {
        const [[exists]] = await connection.query('SELECT id FROM players WHERE id = ? LIMIT 1', [playerId]);
        throw new DomainError(exists ? 'FORBIDDEN' : 'PLAYER_NOT_FOUND', exists ? 'Không được phép cập nhật nhân vật này' : 'Chưa tạo nhân vật', exists ? 403 : 404);
      }
      try {
        await connection.execute('UPDATE players SET name = ?, version = version + 1 WHERE id = ?', [name, playerId]);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw new DomainError('PLAYER_CONFLICT', 'Tên nhân vật đã tồn tại', 409);
        throw error;
      }
      return snapshotWith(connection, userId);
    });
  }

  async function savePlayerPosition(userId, mapCode, x, y, { includeSnapshot = true } = {}) {
    return withConnection(async (connection) => {
      const [result] = await connection.execute('UPDATE players SET map_code = ?, x = ?, y = ?, version = version + 1 WHERE user_id = ?', [mapCode, x, y, userId]);
      if (!result.affectedRows) throw new DomainError('PLAYER_NOT_FOUND', 'Chưa tạo nhân vật', 404);
      if (!includeSnapshot) return { saved: true };
      return snapshotWith(connection, userId);
    });
  }

  async function updateVitals(userId, requestId, action, changes) {
    const intent = { operation: action, hp: changes.hp || 0, mp: changes.mp || 0, mpCost: changes.mpCost || 0 };
    return playerMutation(userId, requestId, intent, async (connection, player) => {
      if (player.mp < intent.mpCost) throw new DomainError('INSUFFICIENT_MP', 'Không đủ linh lực', 409);
      const hp = Math.max(0, Math.min(player.maxHp, player.hp + intent.hp));
      const mp = Math.max(0, Math.min(player.maxMp, player.mp - intent.mpCost + intent.mp));
      await connection.execute('UPDATE players SET hp = ?, mp = ? WHERE id = ?', [hp, mp, player.id]);
      return { hp, maxHp: player.maxHp, mp, maxMp: player.maxMp };
    }, { includeSnapshot: false, afterState: (result) => ({ hp: result.hp, mp: result.mp }) });
  }

  async function pickupGroundItem(userId, requestId, dropId, itemCode, quantity) {
    const intent = { operation: 'LOOT_PICKUP', dropId, itemCode, quantity };
    return playerMutation(userId, requestId, intent, async (connection, player) => {
      try {
        await connection.execute('INSERT INTO loot_pickups (drop_id, player_id, item_code, quantity) VALUES (?, ?, ?, ?)', [dropId, player.id, itemCode, quantity]);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw new DomainError('LOOT_ALREADY_CLAIMED', 'Vật phẩm rơi đã được nhặt', 409);
        throw error;
      }
      const [[existing]] = await connection.query('SELECT id, quantity FROM inventory_items WHERE player_id = ? AND item_code = ? FOR UPDATE', [player.id, itemCode]);
      if (existing) {
        if (existing.quantity + quantity > 99) throw new DomainError('INVENTORY_STACK_LIMIT', 'Số lượng vật phẩm vượt giới hạn túi đồ', 409);
        await connection.execute('UPDATE inventory_items SET quantity = quantity + ?, version = version + 1 WHERE id = ?', [quantity, existing.id]);
      } else {
        const [[count]] = await connection.query('SELECT COUNT(*) AS count FROM inventory_items WHERE player_id = ?', [player.id]);
        if (count.count >= 40 || quantity > 99) throw new DomainError('INVENTORY_FULL', 'Túi đồ đã đầy', 409);
        const [[slot]] = await connection.query('SELECT COALESCE(MAX(slot), -1) + 1 AS nextSlot FROM inventory_items WHERE player_id = ?', [player.id]);
        await connection.execute('INSERT INTO inventory_items (id, player_id, item_code, quantity, slot, version) VALUES (?, ?, ?, ?, ?, 1)', [`inv_${crypto.randomUUID()}`, player.id, itemCode, quantity, slot.nextSlot]);
      }
      return { accepted: true, dropId, itemCode, quantity };
    });
  }

  async function takeInventoryItem(connection, playerId, itemCode) {
    const [[item]] = await connection.query('SELECT id, quantity FROM inventory_items WHERE player_id = ? AND item_code = ? FOR UPDATE', [playerId, itemCode]);
    if (!item || item.quantity < 1) throw new DomainError('ITEM_NOT_IN_INVENTORY', 'Vật phẩm không có trong túi đồ', 404);
    if (item.quantity === 1) await connection.execute('DELETE FROM inventory_items WHERE id = ?', [item.id]);
    else await connection.execute('UPDATE inventory_items SET quantity = quantity - 1, version = version + 1 WHERE id = ?', [item.id]);
  }

  async function giveInventoryItem(connection, playerId, itemCode) {
    const [[existing]] = await connection.query('SELECT id, quantity FROM inventory_items WHERE player_id = ? AND item_code = ? FOR UPDATE', [playerId, itemCode]);
    if (existing) {
      if (existing.quantity >= 99) throw new DomainError('INVENTORY_STACK_LIMIT', 'Số lượng vật phẩm vượt giới hạn túi đồ', 409);
      await connection.execute('UPDATE inventory_items SET quantity = quantity + 1, version = version + 1 WHERE id = ?', [existing.id]);
      return;
    }
    const [[inventoryCount]] = await connection.query('SELECT COUNT(*) AS count FROM inventory_items WHERE player_id = ?', [playerId]);
    if (inventoryCount.count >= 40) throw new DomainError('INVENTORY_FULL', 'Túi đồ đã đầy', 409);
    const [[slot]] = await connection.query('SELECT COALESCE(MAX(slot), -1) + 1 AS nextSlot FROM inventory_items WHERE player_id = ?', [playerId]);
    await connection.execute('INSERT INTO inventory_items (id, player_id, item_code, quantity, slot, version) VALUES (?, ?, ?, 1, ?, 1)', [`inv_${crypto.randomUUID()}`, playerId, itemCode, slot.nextSlot]);
  }

  async function equipItem(userId, requestId, itemCode, slot, expectedRealmCode, playerRealmStt, requiredRealmStt) {
    const intent = { operation: 'EQUIP_ITEM', itemCode, slot };
    return playerMutation(userId, requestId, intent, async (connection, player) => {
      if (player.realmCode !== expectedRealmCode) throw new DomainError('PLAYER_STATE_CHANGED', 'Nhân vật đã thay đổi trạng thái, hãy tải lại rồi thử lại', 409);
      const [realmRows] = await connection.execute('SELECT realm_code AS realmCode FROM players WHERE id = ? LIMIT 1', [player.id]);
      if (realmRows[0]?.realmCode !== expectedRealmCode) throw new DomainError('PLAYER_STATE_CHANGED', 'Nhân vật đã thay đổi trạng thái, hãy tải lại rồi thử lại', 409);
      if (playerRealmStt < requiredRealmStt) throw new DomainError('REALM_TOO_LOW', 'Cảnh giới chưa đủ để trang bị', 409);
      const [[alreadyEquipped]] = await connection.query('SELECT slot FROM player_equipment WHERE player_id = ? AND item_code = ? FOR UPDATE', [player.id, itemCode]);
      if (alreadyEquipped) throw new DomainError('ITEM_ALREADY_EQUIPPED', 'Trang bị này đang được trang bị', 409);
      const [[previous]] = await connection.query('SELECT item_code AS itemCode FROM player_equipment WHERE player_id = ? AND slot = ? FOR UPDATE', [player.id, slot]);
      await takeInventoryItem(connection, player.id, itemCode);
      if (previous) await giveInventoryItem(connection, player.id, previous.itemCode);
      await connection.execute(
        'INSERT INTO player_equipment (player_id, slot, item_code, version) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE item_code = VALUES(item_code), version = version + 1',
        [player.id, slot, itemCode],
      );
      return { type: 'equipment_equipped', slot, itemId: itemCode };
    });
  }

  async function unequipItem(userId, requestId, slot) {
    const intent = { operation: 'UNEQUIP_ITEM', slot };
    return playerMutation(userId, requestId, intent, async (connection, player) => {
      const [[equipped]] = await connection.query('SELECT item_code AS itemCode FROM player_equipment WHERE player_id = ? AND slot = ? FOR UPDATE', [player.id, slot]);
      if (!equipped) throw new DomainError('EQUIPMENT_NOT_FOUND', 'Không có trang bị ở vị trí này', 404);
      await giveInventoryItem(connection, player.id, equipped.itemCode);
      await connection.execute('DELETE FROM player_equipment WHERE player_id = ? AND slot = ?', [player.id, slot]);
      return { type: 'equipment_unequipped', slot, itemId: equipped.itemCode };
    });
  }

  async function learnSkill(userId, requestId, skillCode, expectedRealmCode, expectedRoot, playerRealmStt, requiredRealmStt) {
    const intent = { operation: 'LEARN_SKILL', skillCode };
    return playerMutation(userId, requestId, intent, async (connection, player) => {
      if (player.realmCode !== expectedRealmCode) throw new DomainError('PLAYER_STATE_CHANGED', 'Nhân vật đã thay đổi trạng thái, hãy tải lại rồi thử lại', 409);
      const [realmRows] = await connection.execute('SELECT realm_code AS realmCode, realm_stage AS realmStage FROM players WHERE id = ? LIMIT 1', [player.id]);
      if (realmRows[0]?.realmCode !== expectedRealmCode) throw new DomainError('PLAYER_STATE_CHANGED', 'Nhân vật đã thay đổi trạng thái, hãy tải lại rồi thử lại', 409);
      if (playerRealmStt < requiredRealmStt) throw new DomainError('REALM_TOO_LOW', 'Cảnh giới chưa đủ để lĩnh hội kỹ năng', 409);
      if (player.linhCan !== expectedRoot) throw new DomainError('PLAYER_STATE_CHANGED', 'Linh căn nhân vật đã thay đổi, hãy tải lại rồi thử lại', 409);
      await connection.execute('INSERT IGNORE INTO player_skills (player_id, skill_code) VALUES (?, ?)', [player.id, skillCode]);
      const [learned] = await connection.execute('SELECT skill_code AS skillCode FROM player_skills WHERE player_id = ? ORDER BY learned_at, skill_code', [player.id]);
      return { learnedSkills: learned.map((row) => row.skillCode) };
    });
  }

  async function equipSkills(userId, requestId, skillCodes) {
    const intent = { operation: 'EQUIP_SKILLS', skillCodes };
    return playerMutation(userId, requestId, intent, async (connection, player) => {
      const [learnedRows] = await connection.execute('SELECT skill_code AS skillCode FROM player_skills WHERE player_id = ? FOR UPDATE', [player.id]);
      const learned = new Set(learnedRows.map((row) => row.skillCode));
      if (skillCodes.some((code) => !learned.has(code))) throw new DomainError('SKILL_NOT_LEARNED', 'Chỉ được trang bị kỹ năng đã học', 409);
      await connection.execute('DELETE FROM player_equipped_skills WHERE player_id = ?', [player.id]);
      for (const [index, code] of skillCodes.entries()) {
        await connection.execute('INSERT INTO player_equipped_skills (player_id, slot, skill_code) VALUES (?, ?, ?)', [player.id, index + 1, code]);
      }
      return { equippedSkills: skillCodes };
    });
  }

  async function replayBreakthrough(userId, requestId) {
    const [[row]] = await pool.execute(
      'SELECT result_json AS resultJson FROM idempotency_keys WHERE user_id = ? AND request_id = ?',
      [userId, requestId],
    );
    return row ? replayMutation(row, { operation: 'BREAKTHROUGH' }) : null;
  }

  async function breakthrough(userId, requestId, progression) {
    return withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const [[player]] = await connection.query(
          'SELECT id, realm_code AS realmCode, realm_stage AS realmStage, tu_vi AS tuVi, tu_vi_linh_can AS tuViLinhCan, hp, max_hp AS maxHp, mp, max_mp AS maxMp, str_stat AS str, agi_stat AS agi, vit_stat AS vit, ene_stat AS ene, unspent_points AS unspentPoints FROM players WHERE user_id = ? FOR UPDATE',
          [userId],
        );
        if (!player) throw new DomainError('PLAYER_NOT_FOUND', 'Chưa tạo nhân vật', 404);
        const intent = { operation: 'BREAKTHROUGH' };
        const [dedup] = await connection.execute('SELECT result_json AS resultJson FROM idempotency_keys WHERE user_id = ? AND request_id = ? FOR UPDATE', [userId, requestId]);
        if (dedup.length) {
          const replay = replayMutation(dedup[0], intent);
          await connection.commit();
          return { ...replay, replayed: true };
        }
        if (player.realmCode !== progression.realm.code || player.realmStage !== progression.stage) {
          throw new DomainError('PLAYER_STATE_CHANGED', 'Nhân vật đã thay đổi trạng thái, hãy tải lại rồi thử lại', 409);
        }
        if (player.tuVi < progression.threshold) throw new DomainError('INSUFFICIENT_TUVI', 'Tu vi chưa đủ điều kiện đột phá', 409);
        const [equipmentRows] = await connection.execute('SELECT slot, item_code AS itemCode FROM player_equipment WHERE player_id = ?', [player.id]);
        const [learnedRows] = await connection.execute('SELECT skill_code AS skillCode FROM player_skills WHERE player_id = ?', [player.id]);
        const equipment = Object.fromEntries(equipmentRows.map((row) => [row.slot, (progression.itemCatalog || itemCatalog).find((item) => item.id === row.itemCode) || null]));
        const power = combatPower({
          realm: progression.realm.stt,
          canhGioi: progression.realm,
          tangTuVi: player.realmStage,
          tuViHienTai: player.tuVi,
          tuViLenCap: progression.threshold,
          tuViLinhCan: player.tuViLinhCan,
          stats: { str: player.str, agi: player.agi, vit: player.vit, ene: player.ene },
          equipment,
          learnedSkills: learnedRows.map((row) => row.skillCode),
        });
        if (power < progression.requiredOvr) throw new DomainError('INSUFFICIENT_COMBAT_POWER', 'OVR chưa đủ điều kiện đột phá', 409);

        let pill = null;
        if (progression.major && progression.realm.danPhaCanh) {
          [[pill]] = await connection.query(
            'SELECT id, quantity FROM inventory_items WHERE player_id = ? AND item_code = ? FOR UPDATE',
            [player.id, progression.realm.danPhaCanh],
          );
          if (!pill || pill.quantity < 1) throw new DomainError('BREAKTHROUGH_PILL_REQUIRED', `Cần ${progression.realm.danPhaCanh} để phá đại cảnh giới`, 409);
        }

        const before = playerState(player);
        const stats = {
          str: player.str + progression.gain.str,
          agi: player.agi + progression.gain.agi,
          vit: player.vit + progression.gain.vit,
          ene: player.ene + progression.gain.ene,
        };
        const realmCode = progression.major ? progression.nextRealm.code : player.realmCode;
        const realmStage = progression.major ? 1 : player.realmStage + 1;
        const tuVi = Math.max(0, player.tuVi - progression.threshold);
        const unspentPoints = player.unspentPoints + Object.values(progression.gain).reduce((sum, value) => sum + Number(value || 0), 0);
        const maxHp = 100 + stats.vit * 12;
        const maxMp = 50 + stats.ene * 8;
        const hp = Math.min(maxHp, player.hp + progression.gain.vit * 12);
        const mp = Math.min(maxMp, player.mp + progression.gain.ene * 8);
        const next = { ...player, ...stats, realmCode, realmStage, tuVi, hp, maxHp, mp, maxMp, unspentPoints };

        if (pill) {
          if (pill.quantity === 1) await connection.execute('DELETE FROM inventory_items WHERE id = ?', [pill.id]);
          else await connection.execute('UPDATE inventory_items SET quantity = quantity - 1, version = version + 1 WHERE id = ?', [pill.id]);
        }
        await connection.execute(
          'UPDATE players SET realm_code = ?, realm_stage = ?, tu_vi = ?, hp = ?, max_hp = ?, mp = ?, max_mp = ?, str_stat = ?, agi_stat = ?, vit_stat = ?, ene_stat = ?, unspent_points = ?, version = version + 1 WHERE id = ?',
          [realmCode, realmStage, tuVi, hp, maxHp, mp, maxMp, stats.str, stats.agi, stats.vit, stats.ene, unspentPoints, player.id],
        );
        const result = { type: progression.major ? 'realm_breakthrough' : 'stage_breakthrough', gain: progression.gain, major: progression.major };
        const after = playerState(next);
        await saveAction(connection, player.id, 'BREAKTHROUGH', requestId, { realmCode: progression.realm.code, stage: progression.stage, threshold: progression.threshold, major: progression.major }, before, after);
        const updatedPlayer = await snapshotWith(connection, userId);
        await connection.execute('INSERT INTO idempotency_keys (user_id, request_id, result_json) VALUES (?, ?, ?)', [userId, requestId, JSON.stringify({ __idempotency: intent, player: updatedPlayer, result })]);
        await connection.commit();
        return { player: updatedPlayer, result };
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });
  }

  return { init, healthCheck, findUserByUsername, findUserById, insertUser, saveRefreshToken, rotateRefreshToken, revokeRefreshToken, playerSnapshot, createPlayer, buyItem, sellItem, useInventoryItem, allocateStats, updatePlayerName, savePlayerPosition, updateVitals, pickupGroundItem, equipItem, unequipItem, learnSkill, equipSkills, replayBreakthrough, breakthrough, questSnapshot, questAction, applyQuestEvent, listAdminWorlds, saveAdminWorlds, deleteAdminWorld, listAdminContentRecords, pageAdminCatalog, getAdminContentRecord, listAdminAccounts, mutateAdminContent, listAdminSkillVfx, mutateSkillVfx, close: () => pool.end() };
}

module.exports = { createMysqlStore };
