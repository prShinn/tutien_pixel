const { DomainError } = require('../domain');

const commands = new Set([
  'world.join',
  'world.resync',
  'movement.intent',
  'map.change',
  'combat.attack',
  'combat.skill',
  'loot.pickup',
  'chat.send',
]);

function errorAck(requestId, command, code, message, details) {
  const response = {
    ok: false,
    requestId,
    command,
    serverTime: Date.now(),
    error: { code, message },
  };
  if (details !== undefined) response.error.details = details;
  return response;
}

function attachGameGateway(io, { auth, gameplay }) {
  io.use((socket, next) => {
    auth.authenticateToken(socket.handshake.auth?.token)
      .then((identity) => { socket.auth = identity; next(); })
      .catch(() => next(new Error('UNAUTHORIZED')));
  });

  io.on('connection', (socket) => {
    socket.on('game_command', async (envelope, ack) => {
      const safeAck = typeof ack === 'function' ? ack : () => {};
      const requestId = typeof envelope?.requestId === 'string' ? envelope.requestId.trim() : '';
      const command = typeof envelope?.type === 'string' ? envelope.type : '';
      if (!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) {
        return safeAck(errorAck(requestId, command, 'INVALID_REQUEST_ID', 'requestId không hợp lệ'));
      }
      if (!commands.has(command)) return safeAck(errorAck(requestId, command, 'INVALID_COMMAND', 'Command không được hỗ trợ'));

      try {
        const result = await gameplay.command(socket, envelope);
        safeAck({ ok: true, ...result, serverTime: Date.now() });
      } catch (error) {
        const failure = error instanceof DomainError
          ? errorAck(requestId, command, error.code, error.message, error.details)
          : errorAck(requestId, command, 'INTERNAL_ERROR', 'Lỗi máy chủ');
        safeAck(failure);
      }
    });
    socket.on('disconnect', () => { void gameplay.disconnect(socket); });
  });
}

module.exports = { attachGameGateway, commands, errorAck };
