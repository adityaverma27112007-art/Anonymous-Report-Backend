require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

const { db, now, randomId } = require("./db");
const {
  generateCaseCode,
  hashCaseCode,
  hashPassword,
  verifyPassword,
  issueModeratorToken
} = require("./security");
const { reportSchema, trackSchema, statusSchema } = require("./validation");
const { moderatorAuth } = require("./auth");

const app = express();

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "32kb" }));

const origins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: origins.length ? origins : false,
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Deliberately do not log request bodies, headers, IPs, or case codes.
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "TooManyRequests", message: "Too many submissions. Please try again later." }
});

const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "TooManyRequests", message: "Too many tracking requests. Please try again later." }
});

const modLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

function publicReport(report, updates = []) {
  return {
    caseStatus: report.status,
    category: report.category,
    submittedAt: report.created_at,
    updatedAt: report.updated_at,
    updates: updates.map(u => ({
      status: u.status,
      message: u.message,
      createdAt: u.created_at
    }))
  };
}

function moderatorReport(report, updates = []) {
  return {
    id: report.id,
    category: report.category,
    description: report.description,
    evidenceUrl: report.evidence_url || null,
    status: report.status,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    updates: updates.map(u => ({
      id: u.id,
      status: u.status,
      message: u.message,
      createdAt: u.created_at
    }))
  };
}

function getUpdates(reportId) {
  return db.prepare(`
    SELECT id, status, message, created_at
    FROM status_updates
    WHERE report_id = ?
    ORDER BY created_at ASC
  `).all(reportId);
}

function isValidTransition(from, to) {
  return (
    (from === "SUBMITTED" && to === "UNDER_REVIEW") ||
    (from === "UNDER_REVIEW" && (to === "RESOLVED" || to === "DISMISSED"))
  );
}

function errorResponse(res, status, error, message, details) {
  return res.status(status).json({
    error,
    message,
    ...(details ? { details } : {})
  });
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/reports", submitLimiter, (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 400, "ValidationError", "Invalid report data.", parsed.error.flatten());
  }

  const { category, description, evidenceUrl } = parsed.data;
  let caseCode;
  let codeHash;

  // Collision probability is negligible; still enforce uniqueness.
  do {
    caseCode = generateCaseCode();
    codeHash = hashCaseCode(caseCode);
  } while (db.prepare("SELECT 1 FROM case_codes WHERE code_hash = ?").get(codeHash));

  const reportId = randomId();
  const timestamp = now();

  const create = db.transaction(() => {
    db.prepare(`
      INSERT INTO reports (id, category, description, evidence_url, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'SUBMITTED', ?, ?)
    `).run(reportId, category, description, evidenceUrl || null, timestamp, timestamp);

    db.prepare(`
      INSERT INTO case_codes (report_id, code_hash)
      VALUES (?, ?)
    `).run(reportId, codeHash);

    db.prepare(`
      INSERT INTO status_updates (id, report_id, status, message, created_at)
      VALUES (?, ?, 'SUBMITTED', ?, ?)
    `).run(randomId(), reportId, "Report received.", timestamp);
  });

  create();

  // The only time the plaintext case code is returned is immediately after submission.
  return res.status(201).json({
    message: "Report submitted successfully.",
    caseCode,
    status: "SUBMITTED"
  });
});

app.post("/api/reports/track", trackLimiter, (req, res) => {
  const parsed = trackSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 400, "ValidationError", "Invalid case code format.");
  }

  const codeHash = hashCaseCode(parsed.data.caseCode);
  const report = db.prepare(`
    SELECT r.id, r.category, r.status, r.created_at, r.updated_at
    FROM case_codes c
    JOIN reports r ON r.id = c.report_id
    WHERE c.code_hash = ?
  `).get(codeHash);

  // Do not distinguish malformed, unknown, or expired case codes.
  if (!report) {
    return errorResponse(res, 404, "NotFound", "No report was found for that case code.");
  }

  return res.json(publicReport(report, getUpdates(report.id)));
});

app.post("/api/mod/auth/login", modLimiter, async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!email || !password || email.length > 320 || password.length > 200) {
    return errorResponse(res, 401, "Unauthorized", "Invalid moderator credentials.");
  }

  const moderator = db.prepare("SELECT id, email, password_hash FROM moderators WHERE email = ?").get(email);
  const valid = moderator ? await verifyPassword(password, moderator.password_hash) : false;

  if (!valid) {
    return errorResponse(res, 401, "Unauthorized", "Invalid moderator credentials.");
  }

  return res.json({
    tokenType: "Bearer",
    accessToken: issueModeratorToken(moderator),
    expiresIn: "8h"
  });
});

app.use("/api/mod", moderatorAuth);

app.get("/api/mod/reports", modLimiter, (req, res) => {
  const allowedCategories = new Set(["Security", "Harassment", "Corruption", "Technical", "Other"]);
  const allowedStatuses = new Set(["SUBMITTED", "UNDER_REVIEW", "RESOLVED", "DISMISSED"]);

  const category = req.query.category;
  const status = req.query.status;

  if (category && !allowedCategories.has(category)) {
    return errorResponse(res, 400, "ValidationError", "Invalid category filter.");
  }
  if (status && !allowedStatuses.has(status)) {
    return errorResponse(res, 400, "ValidationError", "Invalid status filter.");
  }

  const clauses = [];
  const params = [];
  if (category) { clauses.push("category = ?"); params.push(category); }
  if (status) { clauses.push("status = ?"); params.push(status); }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const reports = db.prepare(`
    SELECT id, category, description, evidence_url, status, created_at, updated_at
    FROM reports
    ${where}
    ORDER BY created_at DESC
    LIMIT 200
  `).all(...params);

  return res.json({
    reports: reports.map(r => moderatorReport(r)),
    count: reports.length
  });
});

app.get("/api/mod/reports/:id", modLimiter, (req, res) => {
  const report = db.prepare(`
    SELECT id, category, description, evidence_url, status, created_at, updated_at
    FROM reports WHERE id = ?
  `).get(req.params.id);

  if (!report) return errorResponse(res, 404, "NotFound", "Report not found.");

  return res.json(moderatorReport(report, getUpdates(report.id)));
});

app.patch("/api/mod/reports/:id/status", modLimiter, (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 400, "ValidationError", "Invalid status update.", parsed.error.flatten());
  }

  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(req.params.id);
  if (!report) return errorResponse(res, 404, "NotFound", "Report not found.");

  const { status, message } = parsed.data;

  if (!isValidTransition(report.status, status)) {
    return errorResponse(
      res,
      409,
      "InvalidStatusTransition",
      `Cannot change status from ${report.status} to ${status}.`
    );
  }

  const timestamp = now();
  const update = db.transaction(() => {
    db.prepare("UPDATE reports SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, timestamp, report.id);

    db.prepare(`
      INSERT INTO status_updates (id, report_id, status, message, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomId(), report.id, status, message, timestamp);
  });
  update();

  const refreshed = db.prepare(`
    SELECT id, category, description, evidence_url, status, created_at, updated_at
    FROM reports WHERE id = ?
  `).get(report.id);

  return res.json(moderatorReport(refreshed, getUpdates(refreshed.id)));
});

app.use((req, res) => {
  errorResponse(res, 404, "NotFound", "Endpoint not found.");
});

app.use((err, _req, res, _next) => {
  if (err?.type === "entity.parse.failed") {
    return errorResponse(res, 400, "InvalidJson", "Request body contains invalid JSON.");
  }
  console.error("Unhandled server error:", err?.message || err);
  return errorResponse(res, 500, "InternalServerError", "An unexpected server error occurred.");
});

module.exports = { app };
