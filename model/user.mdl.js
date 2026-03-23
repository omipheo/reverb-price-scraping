const { Schema, model } = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: String,
    enum: ["admin", "user"],
    default: "user",
  },
  // Protected by per-admin "settings password" (hashed).
  // If missing (older admins), we treat it as default "1234" during verification.
  settingsPassword: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
UserSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  if (this.isModified("settingsPassword") && this.settingsPassword) {
    this.settingsPassword = await bcrypt.hash(this.settingsPassword, 10);
  }
  next();
});

// Compare password method
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Compare settings password method
// If settingsPassword is missing (older admins), treat default as "1234".
UserSchema.methods.compareSettingsPassword = async function (candidateSettingsPassword) {
  if (!this.settingsPassword) {
    return candidateSettingsPassword === "1234";
  }
  return await bcrypt.compare(candidateSettingsPassword, this.settingsPassword);
};

module.exports = model("User", UserSchema);
