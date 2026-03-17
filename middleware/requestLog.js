// Log API requests and errors with timestamps for debugging (e.g. "load more then disappeared")
function log(msg, level = "info") {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${level.toUpperCase()}: ${msg}`;
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

function requestLog(req, res, next) {
  const start = Date.now();
  log(`${req.method} ${req.originalUrl}`);
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (res.statusCode >= 400) {
      log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`, "error");
    }
  });
  next();
}

module.exports = { requestLog, log };
