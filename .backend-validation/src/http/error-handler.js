const { DomainError } = require('../domain');

function errorHandler(error, req, res, _next) {
  const malformedJson = error?.type === 'entity.parse.failed';
  const payloadTooLarge = error?.type === 'entity.too.large';
  const poolSaturated = error?.message === 'Queue limit reached.';
  const status = error instanceof DomainError ? error.status : poolSaturated ? 503 : malformedJson ? 400 : payloadTooLarge ? 413 : 500;
  const code = error instanceof DomainError ? error.code : poolSaturated ? 'SERVICE_BUSY' : malformedJson ? 'INVALID_JSON' : payloadTooLarge ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR';
  const message = poolSaturated ? 'Máy chủ đang quá tải, vui lòng thử lại sau' : status >= 500 ? 'Lỗi máy chủ' : error instanceof DomainError ? error.message : malformedJson ? 'JSON không hợp lệ' : 'Payload vượt giới hạn cho phép';
  const candidateRequestId = req.requestId || req.get('x-request-id') || req.body?.requestId;
  const requestId = typeof candidateRequestId === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(candidateRequestId)
    ? candidateRequestId
    : undefined;
  const body = { ok: false, error: message, code, message };
  if (error instanceof DomainError && error.details !== undefined) body.details = error.details;
  if (requestId) body.requestId = requestId;
  return res.status(status).json(body);
}

module.exports = { errorHandler };
