const { db, now, randomId } = require("./db");
const { hashPassword } = require("./security");

async function bootstrapModerator() {
  const email = (process.env.MODERATOR_EMAIL || "").trim().toLowerCase();
  const password = process.env.MODERATOR_PASSWORD || "";

  if (!email || !password) {
    throw new Error("MODERATOR_EMAIL and MODERATOR_PASSWORD are required");
  }
  if (password.length < 12) {
    throw new Error("MODERATOR_PASSWORD must be at least 12 characters");
  }

  const existing = db.prepare("SELECT id FROM moderators WHERE email = ?").get(email);
  if (!existing) {
    const passwordHash = await hashPassword(password);
    db.prepare(`
      INSERT INTO moderators (id, email, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run(randomId(), email, passwordHash, now());
  }
}

module.exports = { bootstrapModerator };
