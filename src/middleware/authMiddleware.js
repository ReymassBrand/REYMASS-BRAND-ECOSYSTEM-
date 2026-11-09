const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authentication token provided.'
    });
  }

  const token = authHeader.split(' ')[1];

  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret || !jwtSecret.trim()) {
    return res.status(500).json({
      success: false,
      message: 'Authentication service is not configured.'
    });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret, {
      algorithms: ['HS256']
    });

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token.'
    });
  }
};

const hasPermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user || !Array.isArray(req.user.permissions)) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied. User identity unverified.'
      });
    }

    // Allow the super administrator or an explicit wildcard permission.
    if (
      req.user.role === 'SUPER_ADMIN' ||
      req.user.permissions.includes('*')
    ) {
      return next();
    }

    if (!req.user.permissions.includes(requiredPermission)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. Required permission: [${requiredPermission}] missing.`
      });
    }

    return next();
  };
};

module.exports = { verifyToken, hasPermission };