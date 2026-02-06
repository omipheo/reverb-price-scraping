const session = require("express-session");
const MongoStore = require("connect-mongo");

const configureSession = (mongoUri, sessionSecret) => {
  return session({
    secret: sessionSecret || "your-secret-key-change-this",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: mongoUri,
      touchAfter: 24 * 3600, // Lazy session update (24 hours)
    }),
    cookie: {
      secure: false, // Set to true if using HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  });
};

module.exports = configureSession;
