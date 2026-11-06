function createRateLimiter({ windowMs, max, key = (request) => request.ip || 'unknown' }) {
  const entries = new Map();
  return function rateLimit(request, response, next) {
    const now = Date.now();
    const identity = String(key(request));
    let entry = entries.get(identity);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      entries.set(identity, entry);
    }
    entry.count += 1;
    if (entries.size > 10000) {
      for (const [id, value] of entries) if (value.resetAt <= now) entries.delete(id);
    }
    if (entry.count > max) {
      response.set('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      return response.status(429).json({ ok: false, error: 'Yêu cầu quá thường xuyên', code: 'RATE_LIMITED', message: 'Yêu cầu quá thường xuyên', requestId: request.requestId });
    }
    return next();
  };
}

module.exports = { createRateLimiter };
