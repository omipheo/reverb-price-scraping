const User = require("../model/user.mdl");

const register = async (req, res) => {
  try {
    if (req.session.userRole !== "admin") {
      return res.status(403).json({ error: "Only an admin can create new users" });
    }
    const { email, password, name, role } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "Email, password, and name are required" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    const newRole = role === "admin" ? "admin" : "user";
    const user = new User({ email, password, name, role: newRole });
    await user.save();

    // Admin stays logged in; do not set session to the new user
    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role || "user",
      },
    });
  } catch (error) {
    console.error("Error in /api/register:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Set session
    req.session.userId = user._id;
    req.session.userEmail = user.email;
    req.session.userName = user.name;
    req.session.userRole = user.role || "user";

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: req.session.userRole,
      },
    });
  } catch (error) {
    console.error("Error in /api/login:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Error logging out" });
    }
    res.json({ success: true });
  });
};

const getCurrentUser = async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (req.session.userRole === undefined) {
    const user = await User.findById(req.session.userId).select("role");
    req.session.userRole = user && user.role ? user.role : "user";
  }
  res.json({
    id: req.session.userId,
    email: req.session.userEmail,
    name: req.session.userName,
    role: req.session.userRole,
  });
};

module.exports = {
  register,
  login,
  logout,
  getCurrentUser,
};
