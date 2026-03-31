const { Schema, model } = require("mongoose");

// Tracks whether we already sent the "daily match feedback" notification for a given day.
// Helps ensure we only notify once per day even if many rows are updated.
const MatchFeedbackDailyNotificationSchema = new Schema(
  {
    dateKey: { type: String, index: true, unique: true }, // YYYY-MM-DD (UTC)
    sentAt: { type: Date, default: null },
    totalNoMatch: { type: Number, default: 0 },
    totalPartialMatch: { type: Number, default: 0 },
    totalNotes: { type: Number, default: 0 },
  },
  { strict: true }
);

module.exports = model("MatchFeedbackDailyNotification", MatchFeedbackDailyNotificationSchema);

