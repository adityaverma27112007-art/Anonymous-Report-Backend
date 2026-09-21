const { verifyModeratorToken } = require("./security");

function moderatorAuth(req, res, next) {
  const header = req.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized", message: "Moderator authentication is required." });
  }

  try {
    const payload = verifyModeratorToken(header.slice(7));
    if (payload.role !== "moderator") throw new Error("Invalid role");
    req.moderator = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized", message: "Invalid or expired moderator token." });
  }
}

module.exports = { moderatorAuth };
