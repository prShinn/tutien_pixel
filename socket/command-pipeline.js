const COMMAND_TYPES = Object.freeze([
  "world.join",
  "movement.intent",
  "map.change",
  "combat.attack",
  "combat.skill",
  "loot.pickup",
  "chat.send",
  "world.resync",
]);

const COMMAND_ALIASES = Object.freeze({
  join_world: "world.join",
  move: "movement.intent",
  map_change: "map.change",
  attack_request: "combat.attack",
  skill_request: "combat.skill",
  pickup_ground_item: "loot.pickup",
  chat: "chat.send",
  monster_sync: "world.resync",
});

function validatePayload(command, payload) {
  const finite = (value) => Number.isFinite(Number(value));
  const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
  const valid = {
    "world.join": nonEmpty(payload.mapCode),
    "movement.intent": finite(payload.x) && finite(payload.y),
    "map.change": nonEmpty(payload.mapCode || payload.mapId),
    "combat.attack": nonEmpty(payload.targetId),
    "combat.skill": nonEmpty(payload.skillCode),
    "loot.pickup": nonEmpty(payload.itemId),
    "chat.send": typeof payload.message === "string" && payload.message.trim().length > 0 && payload.message.length <= 100,
    "world.resync": true,
  };
  return valid[command] ? null : { code: "INVALID_PAYLOAD", message: `Payload ${command} không hợp lệ` };
}

function createCommandPipeline({ handlers, onAlias } = {}) {
  const recent = new Map();
  const maxAgeMs = 30_000;

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of recent) {
      if (now - entry.createdAt > maxAgeMs) recent.delete(key);
    }
  }, maxAgeMs);
  if (cleanup.unref) cleanup.unref();

  function response(requestId, command, result) {
    return { ok: true, requestId, command, serverTime: Date.now(), result: result ?? {} };
  }

  function failure(requestId, command, code, message) {
    return { ok: false, requestId, command, serverTime: Date.now(), error: { code, message } };
  }

  async function dispatch(socket, envelope, ack) {
    const safeAck = typeof ack === "function" ? ack : () => {};
    const requestId = String(envelope?.requestId || "").trim();
    const command = String(envelope?.type || "").trim();
    if (!requestId) return safeAck(failure("", command || "unknown", "INVALID_REQUEST_ID", "Thiếu requestId"));
    if (!COMMAND_TYPES.includes(command)) return safeAck(failure(requestId, command || "unknown", "UNKNOWN_COMMAND", "Command không được hỗ trợ"));
    if (!envelope || !envelope.payload || typeof envelope.payload !== "object" || Array.isArray(envelope.payload)) {
      return safeAck(failure(requestId, command, "INVALID_PAYLOAD", "Payload command không hợp lệ"));
    }
    const payloadError = validatePayload(command, envelope.payload);
    if (payloadError) return safeAck(failure(requestId, command, payloadError.code, payloadError.message));

    const key = `${socket.id}:${requestId}`;
    const previous = recent.get(key);
    if (previous && previous.command === command) return safeAck(previous.result);

    const handler = handlers?.[command];
    if (typeof handler !== "function") return safeAck(failure(requestId, command, "COMMAND_NOT_IMPLEMENTED", "Command chưa được đăng ký"));

    const ctx = {
      requestId,
      command,
      fail(code, message, legacyAction = command) {
        return { __commandError: { code, message } };
      },
    };

    try {
      const result = await handler(envelope.payload, ctx);
      const commandResult = result?.__commandError
        ? failure(requestId, command, result.__commandError.code, result.__commandError.message)
        : response(requestId, command, result);
      recent.set(key, { command, result: commandResult, createdAt: Date.now() });
      return safeAck(commandResult);
    } catch (error) {
      console.error(`[Command] ${command} failed:`, error);
      const commandResult = failure(requestId, command, "INTERNAL_COMMAND_ERROR", "Không thể xử lý command");
      recent.set(key, { command, result: commandResult, createdAt: Date.now() });
      return safeAck(commandResult);
    }
  }

  function alias(socket, event, payload) {
    const command = COMMAND_ALIASES[event];
    if (!command) return;
    onAlias?.(event, command, socket);
    return dispatch(socket, { requestId: `legacy:${event}:${Date.now()}:${Math.random().toString(16).slice(2)}`, type: command, payload: payload || {} });
  }

  return { dispatch, alias, COMMAND_TYPES, COMMAND_ALIASES };
}

module.exports = { COMMAND_TYPES, COMMAND_ALIASES, createCommandPipeline };
