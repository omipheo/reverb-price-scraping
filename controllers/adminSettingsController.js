const User = require("../model/user.mdl");
const Calculation = require("../model/calculation.mdl");
const MatchFeedbackLog = require("../model/match-feedback-log.mdl");
const PriceAudit = require("../model/price-audit.mdl");
const UserPedal = require("../model/user-pedal.mdl");

const countAdmins = async () => {
  return await User.countDocuments({ role: "admin" });
};

// POST /api/admin/settings/unlock
const unlockSettings = async (req, res) => {
  try {
    const { settingsPassword } = req.body;
    if (!settingsPassword) {
      return res.status(400).json({ error: "settingsPassword is required" });
    }

    const user = await User.findById(req.session.userId);
    if (!user) return res.status(401).json({ error: "User not found" });
    if (user.role !== "admin") return res.status(403).json({ error: "Admin only" });

    const ok = await user.compareSettingsPassword(settingsPassword);
    if (!ok) return res.status(401).json({ error: "Invalid settings password" });

    // Mark unlocked for current session
    req.session.settingsUnlockedFor = String(user._id);
    req.session.settingsUnlockedAt = Date.now();

    // If this was an older admin with missing hash, set it now so future checks are hashed.
    if (!user.settingsPassword) {
      user.settingsPassword = settingsPassword;
      await user.save();
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error in /api/admin/settings/unlock:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// POST /api/admin/settings/password
const changeSettingsPassword = async (req, res) => {
  try {
    const { newSettingsPassword } = req.body;
    if (!newSettingsPassword || typeof newSettingsPassword !== "string") {
      return res.status(400).json({ error: "newSettingsPassword is required" });
    }

    const user = await User.findById(req.session.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.role !== "admin") return res.status(403).json({ error: "Admin only" });

    user.settingsPassword = newSettingsPassword;
    await user.save();

    // Keep unlocked in current session
    res.json({ success: true });
  } catch (error) {
    console.error("Error in /api/admin/settings/password:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /api/admin/users
const listUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select("_id email name role createdAt")
      .sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (error) {
    console.error("Error in /api/admin/users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// POST /api/admin/users
const createUser = async (req, res) => {
  try {
    const { email, password, name, role, settingsPassword } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: "email, password, and name are required" });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ error: "User already exists" });

    const newRole = role === "admin" ? "admin" : "user";
    const user = new User({
      email: email.toLowerCase().trim(),
      password,
      name,
      role: newRole,
      settingsPassword: newRole === "admin" ? (settingsPassword || "1234") : null,
    });
    await user.save();
    res.json({
      success: true,
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    console.error("Error in POST /api/admin/users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// PATCH /api/admin/users/:id
const updateUser = async (req, res) => {
  try {
    const targetId = req.params.id;
    const { name, password, role, settingsPassword } = req.body;

    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ error: "User not found" });

    // Admin can change login password for all users including self,
    // but not other admins.
    if (password != null) {
      if (target.role === "admin" && String(target._id) !== String(req.session.userId)) {
        return res.status(403).json({ error: "Cannot change other admin passwords" });
      }
      target.password = password;
    }

    if (name != null) target.name = name;
    if (role === "admin" || role === "user") {
      target.role = role;
      // If demoting to user, keep settingsPassword field as-is (optional).
      // If promoting to admin and settingsPassword hash is missing, we will still
      // accept default "1234" on unlock until it is set.
      if (role !== "admin") {
        target.settingsPassword = null;
      }
    }

    // Optional: allow setting settings password for self only (safer)
    if (settingsPassword != null) {
      if (String(target._id) !== String(req.session.userId)) {
        return res.status(403).json({ error: "Can only change your own settings password" });
      }
      target.settingsPassword = settingsPassword;
    }

    await target.save();
    res.json({ success: true });
  } catch (error) {
    console.error("Error in PATCH /api/admin/users/:id:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// DELETE /api/admin/users/:id
const deleteUser = async (req, res) => {
  try {
    const targetId = req.params.id;
    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ error: "User not found" });

    // Prevent deleting last admin (lockout protection)
    if (target.role === "admin") {
      const admins = await countAdmins();
      if (admins <= 1) {
        return res.status(400).json({ error: "Cannot delete the last admin" });
      }
    }

    // Cascade delete user data
    await Calculation.deleteMany({ userId: target._id });
    await MatchFeedbackLog.deleteMany({ userId: target._id });
    await PriceAudit.deleteMany({ userId: target._id });
    await UserPedal.deleteMany({ userId: target._id });

    await User.deleteOne({ _id: target._id });
    res.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/admin/users/:id:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  unlockSettings,
  changeSettingsPassword,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
};

