const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

function requiredSecret(name) {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} must be set and contain at least 32 characters`);
  }
  return value;
}

function generateCaseCode() {
  // 192 bits of entropy, URL-safe, no sequential component.
  return crypto.randomBytes(24).toString("base64url");
}

function hashCaseCode(code) {
  return crypto
    .createHmac("sha256", requiredSecret("CASE_CODE_SECRET"))
    .update(code, "utf8")
    .digest("hex");
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function issueModeratorToken(mod) {
  return jwt.sign(
    { sub: mod.id, role: "moderator", email: mod.email },
    requiredSecret("JWT_SECRET"),
    { expiresIn: "8h", issuer: "confidential-reporting-api", audience: "moderators" }
  );
}

function verifyModeratorToken(token) {
  return jwt.verify(token, requiredSecret("JWT_SECRET"), {
    issuer: "confidential-reporting-api",
    audience: "moderators"
  });
}

module.exports = {
  generateCaseCode,
  hashCaseCode,
  hashPassword,
  verifyPassword,
  issueModeratorToken,
  verifyModeratorToken
};
