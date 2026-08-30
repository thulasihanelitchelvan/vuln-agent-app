import app from "../server/app.js";

// Express apps are just (req, res[, next]) request handlers, so Vercel's
// Node.js runtime can invoke this one directly — no adapter needed.
// This file's [...path] catch-all name makes Vercel route every
// /api/* request here, and Express's own routes (defined with full
// "/api/..." paths in server/app.js) take it from there.
export default app;
