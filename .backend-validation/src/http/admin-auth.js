const { DomainError } = require('../domain');

function createAdminAuth({ auth }) {
  return async function authenticateAdmin(req, _res, next) {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    try {
      if (!token) throw new DomainError('UNAUTHORIZED', 'Cần đăng nhập bằng tài khoản quản trị', 401);
      const identity = await auth.authenticateToken(token);
      if (!['GM', 'ADMIN'].includes(identity.role)) throw new DomainError('FORBIDDEN', 'Tài khoản không có quyền quản trị', 403);
      req.auth = identity;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { createAdminAuth };
