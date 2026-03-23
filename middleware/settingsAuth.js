const requireSettingsUnlocked = (req, res, next) => {
  if (!req.session.userId || !req.session.userRole) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.session.settingsUnlockedFor !== String(req.session.userId)) {
    return res.status(403).json({ error: "Settings unlock required" });
  }
  return next();
};

module.exports = {
  requireSettingsUnlocked,
};

