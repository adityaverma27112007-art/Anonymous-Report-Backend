const { describe, it, expect, beforeAll, afterAll } = require("vitest");
const request = require("supertest");
const fs = require("fs");
const path = require("path");

const testDb = path.join(__dirname, "test.db");
process.env.DATABASE_PATH = testDb;
process.env.CASE_CODE_SECRET = "test-case-code-secret-012345678901234567890";
process.env.JWT_SECRET = "test-jwt-secret-012345678901234567890";
process.env.MODERATOR_EMAIL = "mod@test.local";
process.env.MODERATOR_PASSWORD = "correct-horse-battery-staple";

let app;
let token;
let caseCode;
let reportId;

beforeAll(async () => {
  try { fs.unlinkSync(testDb); } catch {}
  const { bootstrapModerator } = require("../src/bootstrap");
  await bootstrapModerator();
  app = require("../src/app").app;
});

afterAll(() => {
  try {
    const { db } = require("../src/db");
    db.close();
  } catch {}
  try { fs.unlinkSync(testDb); } catch {}
});

describe("anonymous reporting API", () => {
  it("submits a report and returns a high-entropy case code", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({
        category: "Technical",
        description: "A reproducible technical issue was discovered.",
        evidenceUrl: "https://example.com/reference"
      });

    expect(res.status).toBe(201);
    expect(res.body.caseCode).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(res.body.status).toBe("SUBMITTED");
    caseCode = res.body.caseCode;
  });

  it("tracks a report without exposing reporter identity", async () => {
    const res = await request(app)
      .post("/api/reports/track")
      .send({ caseCode });

    expect(res.status).toBe(200);
    expect(res.body.caseStatus).toBe("SUBMITTED");
    expect(res.body).not.toHaveProperty("description");
    expect(res.body).not.toHaveProperty("reporter");
    expect(res.body).not.toHaveProperty("ip");
  });

  it("rejects invalid case codes", async () => {
    const res = await request(app)
      .post("/api/reports/track")
      .send({ caseCode: "too-short" });

    expect(res.status).toBe(400);
  });

  it("authenticates moderators", async () => {
    const res = await request(app)
      .post("/api/mod/auth/login")
      .send({ email: "mod@test.local", password: "correct-horse-battery-staple" });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    token = res.body.accessToken;
  });

  it("lists reports only for authenticated moderators", async () => {
    const denied = await request(app).get("/api/mod/reports");
    expect(denied.status).toBe(401);

    const res = await request(app)
      .get("/api/mod/reports")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    reportId = res.body.reports[0].id;
    expect(res.body.reports[0]).not.toHaveProperty("caseCode");
    expect(res.body.reports[0]).not.toHaveProperty("reporter");
  });

  it("enforces the workflow", async () => {
    const bad = await request(app)
      .patch(`/api/mod/reports/${reportId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "RESOLVED", message: "Skipped review." });

    expect(bad.status).toBe(409);

    const reviewing = await request(app)
      .patch(`/api/mod/reports/${reportId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "UNDER_REVIEW", message: "A moderator is reviewing this report." });

    expect(reviewing.status).toBe(200);

    const resolved = await request(app)
      .patch(`/api/mod/reports/${reportId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "RESOLVED", message: "The issue was investigated and resolved." });

    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe("RESOLVED");
  });
});
