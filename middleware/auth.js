const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.session.userRole === "admin") return next();
  return res.status(403).json({ error: "Admin only" });
};

module.exports = requireAuth;
module.exports.requireAdmin = requireAdmin;
